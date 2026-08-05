// SOLO LECTURA. Comprueba que el modulo `lib/cripto.js` que esta DESPLEGADO
// descifra los 403 registros de produccion. No escribe nada en la base.
//
// Corre con babel-node desde /app, igual que arranca la aplicacion, asi que
// importa el modulo real y resuelve sus dependencias como lo hace en vivo.
import mongoose from "mongoose";
import { descifrarLlavePrivada, descifrarFraseSemilla, claveDe, esLlavePrivada, esFraseSemilla } from "/app/lib/cripto.js";

(async () => {
  console.log("CLAVES " + JSON.stringify({
    vieja: !!process.env.PASS_ADM,
    nueva: !!process.env.PASS_ADM_NUEVA,
    largoNueva: (process.env.PASS_ADM_NUEVA || "").length,
  }));

  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`
  );
  const col = mongoose.connection.db.collection("users");

  let pkOk = 0, pkMal = 0, sdOk = 0, sdMal = 0, conNueva = 0, conVieja = 0, conRespaldo = 0;
  const malos = [];

  for await (const u of col.find({}, { projection: { address: 1, seed: 1, privateKey: 1, seedRespaldo: 1, privateKeyRespaldo: 1 } })) {
    if (u.seedRespaldo || u.privateKeyRespaldo) conRespaldo++;

    const pk = descifrarLlavePrivada(u.privateKey);
    if (pk) {
      pkOk++;
      claveDe(u.privateKey, esLlavePrivada) === "nueva" ? conNueva++ : conVieja++;
    } else {
      pkMal++;
      malos.push(u.address + " privateKey");
    }

    const sd = descifrarFraseSemilla(u.seed);
    if (sd) sdOk++; else { sdMal++; malos.push(u.address + " seed"); }
  }

  console.log("VERIF " + JSON.stringify({ pkOk, pkMal, sdOk, sdMal, conNueva, conVieja, conRespaldo, malos: malos.slice(0, 5) }));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.log("ERR " + e.message); process.exit(1); });
