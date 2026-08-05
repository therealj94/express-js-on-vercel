// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 2 — recifrar las llaves privadas y las frases semilla con la clave nueva
//
// Corre con babel-node dentro de un dyno one-off, igual que arranca la
// aplicacion, asi que usa el modulo `lib/cripto.js` REAL que esta desplegado —
// no una copia. Si el modulo desplegado tuviera algun problema, este script lo
// encuentra antes de escribir nada, no despues.
//
// QUE PROTEGE CADA COSA
//
// 1. Arranca en simulacro. Solo escribe si se le pasa MIGRAR=si. Sin eso
//    recorre los 403 registros, hace todas las comprobaciones y no toca la base.
//
// 2. Antes de sobrescribir guarda el cifrado original en el mismo documento
//    (`privateKeyRespaldo`, `seedRespaldo`). Nunca pisa un respaldo que ya
//    exista: si se corre dos veces, el respaldo sigue siendo el original de la
//    clave vieja, no el de la clave nueva.
//
// 3. No escribe hasta haber comprobado la vuelta completa: descifra con la
//    vieja, valida el formato, cifra con la nueva, vuelve a descifrar lo que
//    acaba de cifrar y compara caracter por caracter con el original. Si algo
//    no cuadra, ese registro se salta y queda como estaba.
//
// 4. Los dos campos de un usuario se escriben en una sola operacion. Un
//    documento nunca queda a medias.
//
// 5. Despues de escribir vuelve a leer el documento de la base y comprueba que
//    descifra al mismo texto. Si no, lo restaura del respaldo en el acto.
//
// 6. Los registros que ya estan en la clave nueva se saltan. Se puede correr
//    las veces que haga falta.
//
// 7. Los 2 campos que ya estaban corruptos ANTES de esta migracion (no se
//    descifran con ninguna clave) no se tocan. Se listan al final.
//
// Nada del texto en claro se imprime nunca.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from "mongoose";
import * as m from "/app/lib/cripto.js";

const ESCRIBIR = process.env.MIGRAR === "si";

const CAMPOS = [
  { campo: "privateKey", respaldo: "privateKeyRespaldo", valida: m.esLlavePrivada, nombre: "llave privada" },
  { campo: "seed",       respaldo: "seedRespaldo",       valida: m.esFraseSemilla, nombre: "frase semilla" },
];

(async () => {
  if (!process.env.PASS_ADM_NUEVA) throw new Error("PASS_ADM_NUEVA no esta configurada");
  if (!process.env.PASS_ADM) throw new Error("PASS_ADM no esta configurada — hace falta para leer lo viejo");

  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`
  );
  const col = mongoose.connection.db.collection("users");

  const cuenta = { total: 0, migrados: 0, yaNuevos: 0, corruptos: 0, fallos: 0, restaurados: 0 };
  const corruptos = [];
  const fallos = [];

  for await (const u of col.find({}, { projection: { address: 1, email: 1, seed: 1, privateKey: 1, seedRespaldo: 1, privateKeyRespaldo: 1 } })) {
    cuenta.total++;
    const set = {};
    const claros = {};

    for (const c of CAMPOS) {
      const original = u[c.campo];
      const clave = m.claveDe(original, c.valida);

      if (clave === "nueva") { cuenta.yaNuevos++; continue; }

      if (clave === null) {
        cuenta.corruptos++;
        corruptos.push(`${u.address} ${c.campo}`);
        continue;
      }

      // Esta en la clave vieja: hay que recifrarlo.
      const claro = m.descifrar(original, c.valida);
      if (!claro || !c.valida(claro)) {
        cuenta.fallos++;
        fallos.push(`${u.address} ${c.campo} descifrado-invalido`);
        continue;
      }

      const nuevo = m.cifrar(claro);
      // La vuelta completa: lo que acabo de cifrar, ¿se lee igual?
      const comprobado = m.descifrar(nuevo, c.valida);
      if (comprobado !== claro) {
        cuenta.fallos++;
        fallos.push(`${u.address} ${c.campo} ida-y-vuelta-no-coincide`);
        continue;
      }
      if (m.claveDe(nuevo, c.valida) !== "nueva") {
        cuenta.fallos++;
        fallos.push(`${u.address} ${c.campo} no-quedo-en-clave-nueva`);
        continue;
      }

      set[c.campo] = nuevo;
      // El respaldo solo se escribe la primera vez.
      if (!u[c.respaldo]) set[c.respaldo] = original;
      claros[c.campo] = claro;
    }

    if (!Object.keys(set).length) continue;

    if (!ESCRIBIR) {
      cuenta.migrados += Object.keys(claros).length;
      continue;
    }

    await col.updateOne({ _id: u._id }, { $set: set });

    // Releer de la base y comprobar que quedo bien de verdad.
    const rel = await col.findOne({ _id: u._id }, { projection: { seed: 1, privateKey: 1, seedRespaldo: 1, privateKeyRespaldo: 1 } });
    let ok = true;
    for (const c of CAMPOS) {
      if (!claros[c.campo]) continue;
      if (m.descifrar(rel[c.campo], c.valida) !== claros[c.campo]) ok = false;
    }

    if (ok) {
      cuenta.migrados += Object.keys(claros).length;
    } else {
      // Volver atras usando el respaldo del propio documento.
      const vuelta = {};
      for (const c of CAMPOS) {
        if (claros[c.campo] && rel[c.respaldo]) vuelta[c.campo] = rel[c.respaldo];
      }
      if (Object.keys(vuelta).length) await col.updateOne({ _id: u._id }, { $set: vuelta });
      cuenta.restaurados++;
      fallos.push(`${u.address} relectura-fallo-RESTAURADO`);
    }
  }

  console.log((ESCRIBIR ? "MIGRACION " : "SIMULACRO ") + JSON.stringify({
    ...cuenta,
    corruptos: corruptos.slice(0, 10),
    fallos: fallos.slice(0, 10),
  }));

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.log("ERR " + e.message); process.exit(1); });
