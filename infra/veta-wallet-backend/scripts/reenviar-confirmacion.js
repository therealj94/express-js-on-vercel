/* Vuelve a mandar el enlace de confirmación a las cuentas sin confirmar.
 *
 *   node scripts/reenviar-confirmacion.js                     -> ENSAYO: no manda nada
 *   node scripts/reenviar-confirmacion.js --a=vos@correo      -> UNA, a esa cuenta
 *   node scripts/reenviar-confirmacion.js --de-verdad --tope=30
 *   node scripts/reenviar-confirmacion.js --de-verdad --dias=90
 *
 * POR QUÉ
 *
 * El 27-sep-2026 había 477 cuentas sin confirmar de 481. Hasta agosto el enlace
 * apuntaba a un dominio que no existe y ni siquiera iba en el correo, así que
 * nadie pudo confirmar. Sin confirmar, el día que se encienda
 * GENESIS_PUENTE_EXIGE_CORREO_CONFIRMADO esa gente se queda sin SSO.
 *
 * A QUIÉN
 *
 * Cuentas con correo, sin confirmar y que se movieron en los últimos `--dias`
 * (30 por omisión; el 27-sep eran 92). No se escribe a:
 *   - quien pidió no recibir avisos (`sinAvisos`);
 *   - los dominios de la casa, que rebotan (ver enviar-bienvenida.js);
 *   - quien ya recibió una confirmación en los últimos 7 días, desde la app o
 *     desde una tanda anterior. Así se puede cortar y seguir sin repetir.
 *
 * EL TOPE IMPORTA
 *
 * Amazon avisa con un 5 % de rebotes y suspende con un 10 %, y con la cuenta se
 * cae la recuperación de contraseña. Las cuentas viejas tienen más buzones
 * muertos. Hay que mandar tandas cortas y mirar el rebote antes de seguir.
 *
 * ANTES DE CORRERLO
 *
 * Con la llave de SES en orden (el 27-sep, SES rechazaba la que había).
 * Probar primero con --a= y una cuenta propia sin confirmar.
 */

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import Users from "../models/Users.js";
import { enviarCorreo, correoEncendido, marco, botonCorreo } from "../lib/correo.js";
import { decidirReenvio, correoConfirmacion, correoTapado } from "../lib/reenvioConfirmacion.js";

const args = process.argv.slice(2);
const valor = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || "").slice(n.length + 3).trim();
const DE_VERDAD = args.includes("--de-verdad");
const UNA = valor("a").toLowerCase();
const TOPE = Number(valor("tope")) || Infinity;
const DIAS = Number(valor("dias")) || 30;
const PAUSA = 1100; // un envío por segundo, con margen
const NO_REPETIR_MS = 7 * 24 * 3600 * 1000;

const URL_BACKEND = (process.env.BACKEND_URL || "https://vetawallet-1a2e38ac52b1.herokuapp.com").replace(/\/$/, "");
const DE_LA_CASA = ["vetawallet.com", "ordenexchange.com", "ordenglobal.org"];
const esDeLaCasa = (c) => DE_LA_CASA.includes(String(c).split("@")[1]?.toLowerCase());
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.MONGO_PASSWORD) { console.error("Falta MONGO_PASSWORD."); process.exit(1); }
  if ((DE_VERDAD || UNA) && !correoEncendido()) { console.error("Falta SES_LLAVE / SES_SECRETO."); process.exit(1); }
  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`
  );

  const ahora = new Date();
  const filtro = UNA
    ? { email: UNA, isVerified: { $ne: true } }
    : {
        email: { $exists: true, $nin: [null, ""] },
        isVerified: { $ne: true },
        deletedAt: { $exists: false },
        sinAvisos: { $exists: false },
        updatedAt: { $gte: new Date(ahora.getTime() - DIAS * 864e5) },
        $or: [
          { confirmacionEnviadaEn: { $exists: false } },
          { confirmacionEnviadaEn: { $lt: new Date(ahora.getTime() - NO_REPETIR_MS) } },
        ],
      };

  const todos = await Users.find(filtro).select("_id email").sort({ updatedAt: -1 }).lean();
  const gente = UNA ? todos : todos.filter((u) => !esDeLaCasa(u.email));
  const tanda = gente.slice(0, TOPE);

  console.log(`\n  Sin confirmar    : ${gente.length} cuentas${UNA ? "" : ` (activas en ${DIAS} días)`}`);
  if (!UNA && todos.length !== gente.length) console.log(`  De la casa       : ${todos.length - gente.length} saltadas`);
  console.log(`  Esta tanda       : ${tanda.length}${TOPE === Infinity ? " (sin tope)" : ` (tope ${TOPE})`}`);
  console.log(`  Modo             : ${UNA ? `UNA SOLA, a ${correoTapado(UNA)}` : DE_VERDAD ? "DE VERDAD" : "ENSAYO, no sale ninguno"}\n`);

  if (!tanda.length) { console.log("  Nadie pendiente.\n"); await mongoose.disconnect(); return; }
  if (!DE_VERDAD && !UNA) {
    console.log("  Para mandar de verdad, en tanda corta: --de-verdad --tope=30\n");
    await mongoose.disconnect();
    return;
  }

  let salieron = 0;
  const fallos = [];
  for (const { _id } of tanda) {
    // Se relee justo antes: pudo confirmar o pedirlo desde la app en este rato.
    const user = await Users.findById(_id);
    if (!user) continue;
    const d = decidirReenvio(user, new Date());
    if (d.estado !== "enviar") continue;

    Object.assign(user, d.cambios);
    if (d.tokenNuevo) user.verificationToken = uuidv4();
    await user.save(); // marcado ANTES de mandar: si muere aquí, no se repite

    const enlace = `${URL_BACKEND}/auth/verifyMail?token=${user.verificationToken}`;
    const r = await enviarCorreo({ para: user.email, ...correoConfirmacion(enlace, { marco, botonCorreo }) });
    if (r?.ok) {
      salieron++;
      if (salieron % 10 === 0) console.log(`  ${salieron} / ${tanda.length}`);
    } else {
      fallos.push({ correo: correoTapado(user.email), por: r?.motivo || "sin detalle" });
      if (fallos.length === 1) console.log(`\n  primer fallo: ${r?.motivo}\n`);
      // Si SES rechaza la llave, los demás van a fallar igual: se para.
      if (fallos.length >= 3 && salieron === 0) { console.log("  Tres fallos seguidos sin ningún envío: se para."); break; }
    }
    await dormir(PAUSA);
  }

  console.log(`\n  Salieron         : ${salieron}`);
  console.log(`  Fallaron         : ${fallos.length}`);
  for (const f of fallos.slice(0, 10)) console.log(`     · ${f.correo}: ${f.por}`);
  console.log("\n  MIRAR EL REBOTE EN SES ANTES DE LA SIGUIENTE TANDA. Sobre el 5 % se para.\n");
  await mongoose.disconnect();
}

main().catch((e) => { console.error("Se cayó:", e?.message || e); process.exit(1); });
