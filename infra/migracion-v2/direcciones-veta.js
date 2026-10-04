// SOLO LECTURA. Saca de la base de Veta Wallet la lista de direcciones de las
// cuentas, para separar en tenedores.py lo que es de la gente con cuenta de lo
// que tienen «los demás». Lee solo el campo `address`: ni correo, ni llaves,
// ni frases semilla.
//
// Corre en un dyno one-off, como los scripts de veta-wallet-migracion
// (Atlas solo acepta conexiones desde Heroku):
//
//   python3 ../veta-wallet-migracion/dyno.py direcciones-veta.js MONGO_USER=<usuario de Atlas> > salida.txt
//   python3 -c "import re,json;t=open('salida.txt').read();print(json.dumps(sum((json.loads(x) for x in re.findall(r'DIRECCIONES (\[.*?\])',t)),[])))" > veta.json
//
// Comprobar que el número de veta.json coincide con «direcciones» del RESUMEN.
//
// veta.json queda fuera del repositorio: relaciona direcciones con cuentas.
import mongoose from "mongoose";

(async () => {
  // MONGO_URI si está; si no, la que arma el backend con MONGO_PASSWORD (así está en Heroku).
  const pw = process.env.MONGO_PASSWORD;
  const uri = process.env.MONGO_URI || (pw && process.env.MONGO_USER && `mongodb+srv://${process.env.MONGO_USER}:${encodeURIComponent(pw)}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`);
  if (!uri) throw new Error("Falta MONGO_URI, o MONGO_USER y MONGO_PASSWORD");
  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection("users");

  const direcciones = new Set();
  let sinDireccion = 0, invalidas = 0, total = 0;
  for await (const u of col.find({}, { projection: { _id: 0, address: 1 } })) {
    total++;
    const d = String(u.address || "").trim().toLowerCase();
    if (!d) { sinDireccion++; continue; }
    if (!/^0x[0-9a-f]{40}$/.test(d)) { invalidas++; continue; }
    direcciones.add(d);
  }

  console.log("RESUMEN " + JSON.stringify({ cuentas: total, direcciones: direcciones.size, sinDireccion, invalidas }));
  // De a 100 por línea: Heroku corta las líneas de log largas, y una lista
  // entera de una vez llegaría mutilada sin avisar.
  const lista = [...direcciones].sort();
  for (let i = 0; i < lista.length; i += 100) {
    console.log("DIRECCIONES " + JSON.stringify(lista.slice(i, i + 100)));
  }
  await mongoose.disconnect();
})().catch((e) => { console.error("ERROR " + e.message); process.exit(1); });
