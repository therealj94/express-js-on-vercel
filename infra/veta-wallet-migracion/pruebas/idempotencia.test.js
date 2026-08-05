// Correr la migracion DOS veces sobre los mismos datos. Lo que se comprueba es
// que la segunda pasada no toca nada y, sobre todo, que el respaldo sigue
// siendo el cifrado ORIGINAL de la clave vieja. Si la segunda pasada pisara el
// respaldo con el cifrado nuevo, se perderia la unica via de vuelta.
import CryptoJS from "crypto-js";
import mongoose from "mongoose";
import * as m from "./lib/cripto.js";

const store = mongoose.__store;
const PK = "0x" + "cd".repeat(32);
const SD = "abandon ability able about above absent absorb abstract absurd abuse access accident";
const viejo = (t) => CryptoJS.AES.encrypt(t, process.env.PASS_ADM).toString();

store.docs = [{ _id: "p1", address: "0xbbb1", privateKey: viejo(PK), seed: viejo(SD) }];
const original = { ...store.docs[0] };

const { pathToFileURL } = await import("node:url");
const correr = () => import(pathToFileURL("/tmp/mtest/migrar.js").href + "?v=" + Math.random());

// El script llama a process.exit al terminar; se neutraliza para poder correrlo
// dos veces en el mismo proceso.
const salirReal = process.exit.bind(process);
process.exit = () => {};

await correr();
await new Promise((r) => setTimeout(r, 300));
const tras1 = { ...store.docs[0] };

await correr();
await new Promise((r) => setTimeout(r, 300));
const tras2 = { ...store.docs[0] };

const fallos = [];
const ok = (c, msg) => { if (!c) fallos.push(msg); };

ok(tras1.privateKeyRespaldo === original.privateKey, "1a pasada: el respaldo no es el cifrado original");
ok(tras1.seedRespaldo === original.seed, "1a pasada: el respaldo de la seed no es el original");
ok(m.claveDe(tras1.privateKey, m.esLlavePrivada) === "nueva", "1a pasada: no quedo en clave nueva");

ok(tras2.privateKey === tras1.privateKey, "2a pasada: volvio a recifrar un registro ya migrado");
ok(tras2.seed === tras1.seed, "2a pasada: volvio a recifrar la seed");
ok(tras2.privateKeyRespaldo === original.privateKey, "2a pasada: PISO EL RESPALDO — se pierde la vuelta atras");
ok(tras2.seedRespaldo === original.seed, "2a pasada: piso el respaldo de la seed");

// La prueba de fuego: el respaldo se sigue leyendo con la clave vieja y da el
// texto original.
ok(CryptoJS.AES.decrypt(tras2.privateKeyRespaldo, process.env.PASS_ADM).toString(CryptoJS.enc.Utf8) === PK,
   "el respaldo ya no descifra con la clave vieja");

console.log(fallos.length ? "IDEMPOTENCIA FALLO:\n  " + fallos.join("\n  ")
                          : "IDEMPOTENCIA OK — 8 comprobaciones, el respaldo sobrevive intacto a la 2a pasada");
salirReal(fallos.length ? 1 : 0);
