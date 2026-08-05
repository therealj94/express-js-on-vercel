// Ejercita el script de migracion REAL contra una coleccion en memoria.
// Cubre los casos que importan: lo normal, lo ya migrado, lo corrupto, y una
// escritura que sale mal para comprobar que se restaura sola.
import CryptoJS from "crypto-js";
import mongoose from "mongoose";
import * as m from "./lib/cripto.js";

const VIEJA = process.env.PASS_ADM;
const store = mongoose.__store;

const PK = "0x" + "ab".repeat(32);
const SD = "abandon ability able about above absent absorb abstract absurd abuse access accident";
const viejo = (t) => CryptoJS.AES.encrypt(t, VIEJA).toString();

store.docs = [
  // 1-3: usuarios normales, todo en la clave vieja
  { _id: "u1", address: "0xaaa1", privateKey: viejo(PK), seed: viejo(SD) },
  { _id: "u2", address: "0xaaa2", privateKey: viejo(PK), seed: viejo(SD) },
  { _id: "u3", address: "0xaaa3", privateKey: viejo(PK), seed: viejo(SD) },
  // 4: ya migrado — no debe tocarse ni contarse como migracion
  { _id: "u4", address: "0xaaa4", privateKey: m.cifrar(PK), seed: m.cifrar(SD) },
  // 5: corrupto de antes — no se descifra con ninguna clave
  { _id: "u5", address: "0xaaa5", privateKey: "U2FsdGVkX1+basura", seed: "U2FsdGVkX1+basura" },
  // 6: la relectura devolvera basura -> debe restaurarse del respaldo
  { _id: "u6", address: "0xaaa6", privateKey: viejo(PK), seed: viejo(SD) },
];
store.fallarRelectura.add("u6");

const antes = JSON.parse(JSON.stringify(store.docs));
await import("./migrar.js");

// El process.exit(0) del script corta aca, asi que las comprobaciones van en
// un hook de salida.
process.on("exit", () => {
  const d = Object.fromEntries(store.docs.map((x) => [x._id, x]));
  const a = Object.fromEntries(antes.map((x) => [x._id, x]));
  const fallos = [];
  const ok = (c, msg) => { if (!c) fallos.push(msg); };

  // En simulacro la unica exigencia es que la base haya quedado intacta.
  if (process.env.MIGRAR !== "si") {
    for (const id of Object.keys(a)) {
      ok(JSON.stringify(d[id]) === JSON.stringify(a[id]), `${id}: el simulacro modifico el documento`);
    }
    console.log(fallos.length
      ? "SIMULACRO FALLO:\n  " + fallos.join("\n  ")
      : "SIMULACRO OK — los 6 documentos quedaron exactamente como estaban");
    if (fallos.length) process.exitCode = 1;
    return;
  }

  for (const id of ["u1", "u2", "u3"]) {
    ok(m.claveDe(d[id].privateKey, m.esLlavePrivada) === "nueva", `${id}: pk no quedo en clave nueva`);
    ok(m.claveDe(d[id].seed, m.esFraseSemilla) === "nueva", `${id}: seed no quedo en clave nueva`);
    ok(m.descifrar(d[id].privateKey, m.esLlavePrivada) === PK, `${id}: pk no descifra al original`);
    ok(m.descifrar(d[id].seed, m.esFraseSemilla) === SD, `${id}: seed no descifra al original`);
    ok(d[id].privateKeyRespaldo === a[id].privateKey, `${id}: respaldo de pk no es el cifrado original`);
    ok(d[id].seedRespaldo === a[id].seed, `${id}: respaldo de seed no es el cifrado original`);
  }

  ok(d.u4.privateKey === a.u4.privateKey, "u4: se toco un registro ya migrado");
  ok(!d.u4.privateKeyRespaldo, "u4: se creo respaldo de un registro ya migrado");

  ok(d.u5.privateKey === a.u5.privateKey, "u5: se toco un registro corrupto");
  ok(d.u5.seed === a.u5.seed, "u5: se toco la seed corrupta");
  ok(!d.u5.privateKeyRespaldo, "u5: se creo respaldo de un corrupto");

  ok(d.u6.privateKey === a.u6.privateKey, "u6: no se restauro tras fallar la relectura");
  ok(m.descifrar(d.u6.privateKey, m.esLlavePrivada) === PK, "u6: tras restaurar ya no se descifra");

  if (fallos.length) {
    console.log("PRUEBA FALLO:\n  " + fallos.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log("PRUEBA OK — 20 comprobaciones, los 6 casos se comportan como deben");
  }
});
