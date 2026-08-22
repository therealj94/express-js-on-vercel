/* Manda la carta de bienvenida al ecosistema a quien ya tiene cuenta.
 *
 *   node scripts/enviar-bienvenida.js                    -> ENSAYO: no manda nada
 *   node scripts/enviar-bienvenida.js --a=vos@correo     -> manda UNA, a esa
 *   node scripts/enviar-bienvenida.js --de-verdad --tope=50
 *   node scripts/enviar-bienvenida.js --de-verdad        -> a todos los que falten
 *
 * A QUIEN
 *
 * A todo el que tiene cuenta en Veta Wallet con correo. NO a las identidades de
 * Genesis ID: esas viven en otra base, con otra conexion, y muchas son de gente
 * que se verifico para un tercero y nunca abrio una billetera con nosotros.
 *
 * POR QUE EL TOPE, Y POR QUE IMPORTA MAS QUE EL RESTO
 *
 * El dominio lleva unas decenas de correos enviados en toda su vida. Saltar de
 * ahi a cuatrocientos en una tarde es exactamente el patron que hace que Gmail
 * mire raro a un remitente nuevo.
 *
 * Y hay algo peor que la carta llegando a no deseado: Amazon suspende la cuenta
 * por encima del diez por ciento de rebotes, y avisa a partir del cinco. Lo que
 * se cae con la cuenta NO es esta carta. Es el correo de recuperar la
 * contrasena, que es el unico camino de vuelta que tiene alguien que perdio el
 * acceso a su dinero.
 *
 * Por eso: una tanda corta, se mira como fue, y se sigue. `--tope` para eso.
 * Como cada persona queda marcada al mandarle, la siguiente tanda arranca donde
 * quedo la anterior sin repetirle a nadie.
 *
 * LOS DOMINIOS DE LA CASA SE SALTAN, Y NO ES UN CAPRICHO
 *
 * De las 441 cuentas, 14 son @vetawallet.com y 6 @ordenexchange.com. Se
 * comprobo por DNS: ordenexchange.com no tiene servidor de correo, y en
 * vetawallet.com solo existen dos buzones, soporte@ y privacidad@. Escribirles
 * son veinte rebotes duros garantizados, que sobre 441 es un 4,5% de salida,
 * antes de contar un solo buzon cerrado de gente real. Son cuentas de prueba
 * nuestras, no clientes.
 *
 * Con `--incluir-internos` se mandan igual, por si alguna vez hace falta.
 */

import mongoose from "mongoose";
import Users from "../models/Users.js";
import { enviarCorreo } from "../lib/correo.js";
import { cartaBienvenida, ASUNTO } from "../lib/cartaBienvenida.js";

const args = process.argv.slice(2);
const DE_VERDAD = args.includes("--de-verdad");
const INTERNOS = args.includes("--incluir-internos");
const UNA = (args.find((a) => a.startsWith("--a=")) || "").slice(4).trim().toLowerCase();
const TOPE = Number((args.find((a) => a.startsWith("--tope=")) || "").slice(7)) || Infinity;
const PAUSA = 1100; // un envio por segundo, con margen sobre el limite de la cuenta

/* Dominios nuestros que no reciben correo de personas. Comprobado por DNS el
   22-ago-2026: ordenexchange.com sin MX; vetawallet.com con MX apuntando a SES,
   que solo acepta soporte@ y privacidad@. */
const DE_LA_CASA = ["vetawallet.com", "ordenexchange.com", "ordenglobal.org"];
const esDeLaCasa = (correo) => DE_LA_CASA.includes(String(correo).split("@")[1]?.toLowerCase());

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.MONGO_PASSWORD) {
    console.error("Falta MONGO_PASSWORD.");
    process.exit(1);
  }
  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`
  );

  const filtro = UNA
    ? { email: UNA }
    : {
        email: { $exists: true, $nin: [null, ""] },
        sinAvisos: { $exists: false },
        bienvenidaEn: { $exists: false },
      };

  const todos = await Users.find(filtro).select("email name username").lean();
  const saltados = UNA || INTERNOS ? [] : todos.filter((u) => esDeLaCasa(u.email));
  const gente = UNA || INTERNOS ? todos : todos.filter((u) => !esDeLaCasa(u.email));
  const tanda = gente.slice(0, TOPE);

  console.log(`\n  Carta            : ${ASUNTO}`);
  console.log(`  Pendientes       : ${gente.length} personas`);
  if (saltados.length) {
    console.log(`  De la casa       : ${saltados.length} saltadas (${DE_LA_CASA.join(", ")})`);
  }
  console.log(`  Esta tanda       : ${tanda.length}${TOPE === Infinity ? " (sin tope)" : ` (tope ${TOPE})`}`);
  console.log(`  Modo             : ${UNA ? `UNA SOLA, a ${UNA}` : DE_VERDAD ? "DE VERDAD" : "ENSAYO, no sale ninguno"}\n`);

  if (!tanda.length) {
    console.log("  No hay a quien escribirle. Nada que hacer.\n");
    await mongoose.disconnect();
    return;
  }

  if (!DE_VERDAD && !UNA) {
    const m = cartaBienvenida({ nombre: tanda[0].name || tanda[0].username, correo: tanda[0].email });
    console.log("  ── asi empieza la version de texto ──");
    console.log(m.texto.split("\n").slice(0, 10).map((l) => "  " + l).join("\n"));
    console.log(`\n  (${m.html.length} bytes de HTML, ${m.texto.length} de texto)`);
    console.log("\n  Para mandar de verdad, y en tanda corta: --de-verdad --tope=50\n");
    await mongoose.disconnect();
    return;
  }

  let salieron = 0;
  const fallos = [];

  for (const u of tanda) {
    /* Se vuelve a mirar justo antes de mandar. La lista se armo hace minutos y
       en ese rato alguien pudo darse de baja desde otra carta, o pudo correr
       otra tanda en paralelo. */
    if (!UNA) {
      const ahora = await Users.findOne({ email: u.email }).select("sinAvisos bienvenidaEn").lean();
      if (ahora?.sinAvisos || ahora?.bienvenidaEn) continue;
    }

    const carta = cartaBienvenida({ nombre: u.name || u.username, correo: u.email });
    const r = await enviarCorreo({
      para: u.email,
      asunto: carta.asunto,
      html: carta.html,
      texto: carta.texto,
    });

    if (r?.ok) {
      salieron++;
      // Se marca INMEDIATAMENTE. Si el proceso muere en la persona 30, las 29
      // anteriores ya estan marcadas y la siguiente tanda no les repite.
      if (!UNA) await Users.updateOne({ email: u.email }, { $set: { bienvenidaEn: new Date() } });
      if (salieron % 10 === 0) console.log(`  ${salieron} / ${tanda.length}`);
    } else {
      fallos.push({ correo: u.email, por: r?.motivo || "sin detalle" });
      if (fallos.length === 1) console.log(`\n  primer fallo: ${r?.motivo}\n`);
    }

    await dormir(PAUSA);
  }

  console.log(`\n  Salieron         : ${salieron}`);
  console.log(`  Fallaron         : ${fallos.length}`);
  for (const f of fallos.slice(0, 10)) console.log(`     · ${f.correo}: ${f.por}`);
  if (fallos.length > 10) console.log(`     · y ${fallos.length - 10} mas`);
  const quedan = gente.length - salieron;
  if (quedan > 0) {
    console.log(`\n  Quedan ${quedan} para la siguiente tanda.`);
    console.log("  MIRAR EL REBOTE ANTES DE SEGUIR. Sobre el 5% se para.\n");
  } else {
    console.log("\n  No queda nadie pendiente.\n");
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Se cayo:", e?.message || e);
  process.exit(1);
});
