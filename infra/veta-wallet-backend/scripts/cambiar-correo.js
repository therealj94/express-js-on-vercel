/* Cambia el correo con el que alguien ENTRA, sin tocar nada mas.
 *
 *   node scripts/cambiar-correo.js --de=viejo@x.com --a=nuevo@y.com
 *   node scripts/cambiar-correo.js --de=... --a=... --de-verdad
 *
 * Ensayo por defecto. Sin `--de-verdad` no escribe una sola letra en la base.
 *
 * QUE SE TOCA, Y QUE NO SE TOCA NUNCA
 *
 * El correo vive en DOS campos del registro:
 *
 *   email     lo unico que mira el login. Es el que de verdad cambia el acceso.
 *   username  el que se ENSEÑA: en el perfil, en el padron y en el saludo de
 *             las cartas cuando no hay nombre.
 *
 * Hay un tercero, `user`, que el alta escribe (`user: email`, en
 * authController) pero que NO EXISTE EN EL ESQUEMA. Mongoose es estricto por
 * defecto, asi que lo descarta en silencio: no se ha guardado nunca, en ninguna
 * cuenta, desde que el proyecto existe. Se descubrio justo aqui, porque este
 * guion intentaba escribirlo y despues comprobaba releyendo si habia quedado.
 * Escribirlo no rompe nada, pero tampoco hace nada, asi que no se toca.
 *
 * Y lo que NO se toca, que es lo que importa de verdad:
 *
 *   address, privateKey, seed   el dinero. Ni se leen aqui.
 *   password                    se entra con la misma de siempre.
 *   isVerified, kycStatus       la verificacion no se pierde por mudarse.
 *   bienvenidaEn, sinAvisos     para que no le vuelva a llegar lo que ya leyo.
 *
 * Las sesiones abiertas NO se caen: el token lleva el id y la direccion, no el
 * correo. Quien este dentro sigue dentro; el correo nuevo es para la proxima vez.
 *
 * LO QUE HAY QUE COMPROBAR ANTES, Y NO ES OPCIONAL
 *
 * Que la direccion nueva RECIBA. Es el unico camino de vuelta si algun dia se
 * pierde la contrasenia. Cambiar el acceso a un buzon que no existe no es un
 * cambio de correo: es cerrarse la puerta desde fuera, en una cuenta con dinero
 * dentro. El guion avisa si el dominio de destino no tiene servidor de correo,
 * pero que el BUZON exista solo lo sabe quien lo abre.
 */

import mongoose from "mongoose";
import { promises as dns } from "dns";
import Users from "../models/Users.js";

const args = process.argv.slice(2);
const DE = (args.find((a) => a.startsWith("--de=")) || "").slice(5).trim().toLowerCase();
const A = (args.find((a) => a.startsWith("--a=")) || "").slice(4).trim().toLowerCase();
const DE_VERDAD = args.includes("--de-verdad");

if (!DE || !A) {
  console.error("Uso: --de=viejo@x.com --a=nuevo@y.com [--de-verdad]");
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(A)) {
  console.error(`La direccion nueva no tiene forma de correo: ${A}`);
  process.exit(1);
}

async function main() {
  if (!process.env.MONGO_PASSWORD) {
    console.error("Falta MONGO_PASSWORD.");
    process.exit(1);
  }
  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`
  );

  const u = await Users.findOne({ email: DE }).lean();
  if (!u) {
    console.error(`\n  No hay ninguna cuenta con ${DE}. No se toca nada.\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Que la direccion nueva no sea ya de otro. Sin esto quedarian dos cuentas
  // con el mismo correo y el login entraria a la que Mongo devuelva primero,
  // que es un desastre silencioso y dificil de deshacer.
  const ocupada = await Users.findOne({ email: A, _id: { $ne: u._id } }).lean();
  if (ocupada) {
    /* Decir solo «esta ocupada» deja al siguiente sin saber que hacer. Lo que
       hace falta para decidir es si esa cuenta esta VIVA: si tiene dinero, si
       se verifico, si alguien entro alguna vez. Una cuenta vacia que se creo
       para probar se puede liberar; una con fondos hay que mudarla, no
       pisarla. */
    console.error(`\n  ${A} YA ES DE OTRA CUENTA. No se toca nada.\n`);
    console.error(`  La que ocupa la direccion:`);
    console.error(`    id           : ${ocupada._id}`);
    console.error(`    nombre       : ${ocupada.name || "(sin nombre)"}`);
    console.error(`    creada       : ${ocupada.createdAt || "(sin fecha)"}`);
    console.error(`    verificada   : ${ocupada.isVerified ? "si" : "no"}   KYC: ${ocupada.kycStatus || "none"}`);
    console.error(`    en la cadena : ${ocupada.address}`);
    console.error(`    eliminada    : ${ocupada.deletedAt ? `si, el ${ocupada.deletedAt}` : "no"}`);
    console.error(`    recibio la bienvenida: ${ocupada.bienvenidaEn ? "si" : "no"}`);
    console.error(`\n  Y la que se queria mudar:`);
    console.error(`    id           : ${u._id}`);
    console.error(`    nombre       : ${u.name || "(sin nombre)"}`);
    console.error(`    creada       : ${u.createdAt || "(sin fecha)"}`);
    console.error(`    verificada   : ${u.isVerified ? "si" : "no"}   KYC: ${u.kycStatus || "none"}`);
    console.error(`    en la cadena : ${u.address}`);
    console.error(`\n  Mirar el saldo de las DOS direcciones antes de decidir nada.\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // El dominio de destino, al menos, tiene que poder recibir.
  const dominio = A.split("@")[1];
  let mx = [];
  try { mx = await dns.resolveMx(dominio); } catch { /* sin MX */ }

  const tapar = (s) => (s ? String(s).slice(0, 6) + "…(" + String(s).length + " car.)" : "(vacio)");

  console.log(`\n  Cuenta            : ${u._id}`);
  console.log(`  Nombre            : ${u.name || "(sin nombre)"}`);
  console.log(`  Verificada        : ${u.isVerified ? "si" : "no"}   KYC: ${u.kycStatus || "none"}`);
  console.log(`  Direccion en cadena: ${u.address}`);
  console.log(`  Llave y semilla   : ${tapar(u.privateKey)} / ${tapar(u.seed)}  (NO se tocan)`);
  console.log(`\n  CAMBIA:`);
  console.log(`    email    ${u.email}  ->  ${A}`);
  console.log(`    username ${u.username || "(vacio)"}  ->  ${A}`);
  console.log(`\n  NO CAMBIA: contrasenia, direccion, llave privada, semilla,`);
  console.log(`             verificacion, KYC, tarjetas, ni las marcas de correo.`);
  console.log(`\n  El dominio ${dominio} ${mx.length ? `tiene ${mx.length} servidor(es) de correo` : "NO TIENE SERVIDOR DE CORREO"}`);
  if (!mx.length) {
    console.log(`  >> Cambiar el acceso a un buzon que no recibe es quedarse fuera`);
    console.log(`     el dia que haga falta recuperar la contrasenia.`);
  }

  if (!DE_VERDAD) {
    console.log(`\n  ENSAYO. No se escribio nada. Para hacerlo: --de-verdad\n`);
    await mongoose.disconnect();
    return;
  }

  const r = await Users.updateOne(
    { _id: u._id },
    { $set: { email: A, username: A, correoCambiadoEn: new Date() } }
  );
  console.log(`\n  Hecho. Documentos modificados: ${r.modifiedCount}`);

  // Se relee para no cantar victoria sobre lo que se PIDIO, sino sobre lo que
  // quedo. Y se comprueba que el dinero sigue exactamente donde estaba.
  const v = await Users.findOne({ _id: u._id }).lean();
  const bien =
    v.email === A && v.username === A &&
    v.address === u.address && v.privateKey === u.privateKey &&
    v.seed === u.seed && v.password === u.password;
  console.log(`  Comprobado releyendo: ${bien ? "el acceso cambio y el resto esta intacto" : "ALGO NO CUADRA"}`);
  if (!bien) {
    console.log(`     email=${v.email} username=${v.username} address ${v.address === u.address ? "igual" : "DISTINTA"} ` +
      `llave ${v.privateKey === u.privateKey ? "igual" : "DISTINTA"} ` +
      `semilla ${v.seed === u.seed ? "igual" : "DISTINTA"} ` +
      `contrasenia ${v.password === u.password ? "igual" : "DISTINTA"}`);
    process.exitCode = 1;
  }
  console.log(`\n  Entrar ahora con: ${A}  y la contrasenia de siempre.\n`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Se cayo:", e?.message || e);
  process.exit(1);
});
