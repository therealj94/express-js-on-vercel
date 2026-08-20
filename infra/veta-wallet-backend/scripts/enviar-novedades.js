/* Manda la carta de novedades a quien abrió cuenta y no volvió.
 *
 *   node scripts/enviar-novedades.js                 -> ENSAYO: no manda nada
 *   node scripts/enviar-novedades.js --a=vos@correo  -> manda UNA, a esa
 *   node scripts/enviar-novedades.js --de-verdad     -> manda a todos
 *
 * POR QUE EL ENSAYO ES EL COMPORTAMIENTO POR DEFECTO
 *
 * Porque un correo mandado no se puede recoger. Correr el guion sin pensar
 * tiene que producir un informe, no cuatrocientos correos. Para que salgan de
 * verdad hay que escribir `--de-verdad`, que es una frase que nadie teclea
 * sin querer.
 *
 * LO QUE HACE QUE ESTO SEA REPETIBLE Y NO UN DESASTRE
 *
 *   · Se marca a cada persona en la base EN CUANTO se le manda. Si el guion
 *     se cae a la mitad, volver a correrlo sigue donde se quedó en vez de
 *     mandarle dos veces a los primeros. Un correo repetido es la forma más
 *     rápida de que alguien marque «esto es basura», y con eso se quema el
 *     dominio para TODO, incluido el correo de recuperar la contraseña.
 *   · Quien se dio de baja no recibe. Se comprueba aquí y no solo al armar la
 *     lista: entre que se arma y que se manda pueden pasar minutos.
 *   · Un envío por segundo, que es el límite de la cuenta. Ir más rápido no
 *     hace que lleguen antes: hace que SES rechace.
 *   · Si SES rechaza, se anota y se sigue. Un buzón muerto no puede parar la
 *     tanda entera.
 *
 * EL CAJON DE PRUEBAS
 *
 * Al 20/08/2026 la cuenta de SES está en el cajón de pruebas: solo deja
 * mandar a direcciones verificadas. Con eso puesto, este guion falla en la
 * primera persona y lo dice claro. Primero hay que pedir el acceso de
 * producción; hasta entonces `--a=` sirve para verlo con los ojos, mandándose
 * la carta a una dirección del propio dominio.
 */

import mongoose from "mongoose";
import Users from "../models/Users.js";
import { enviarCorreo } from "../lib/correo.js";
import { cartaNovedades, ASUNTO, sorteoVivo } from "../lib/cartaNovedades.js";

const args = process.argv.slice(2);
const DE_VERDAD = args.includes("--de-verdad");
const UNA = (args.find((a) => a.startsWith("--a=")) || "").slice(4).trim().toLowerCase();
const PAUSA = 1100; // un envío por segundo, con margen

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.MONGO_PASSWORD) {
    console.error("Falta MONGO_PASSWORD.");
    process.exit(1);
  }
  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`,
  );

  const filtro = UNA
    ? { email: UNA }
    : {
        email: { $exists: true, $nin: [null, ""] },
        sinAvisos: { $exists: false },
        novedadesEnviadaEn: { $exists: false },
      };

  const gente = await Users.find(filtro)
    .select("email name username kycStatus sinAvisos")
    .lean();

  const verificados = gente.filter((u) => u.kycStatus === "approved").length;

  console.log(`\n  Carta      : ${ASUNTO}`);
  console.log(`  Sorteo     : ${sorteoVivo() ? "vivo — el bloque va incluido" : "cerrado — el bloque NO va"}`);
  console.log(`  Destino    : ${gente.length} personas  (${verificados} ya verificadas)`);
  console.log(`  Modo       : ${UNA ? `UNA SOLA, a ${UNA}` : DE_VERDAD ? "DE VERDAD — salen los correos" : "ENSAYO — no sale ninguno"}\n`);

  if (!gente.length) {
    console.log("  No hay a quién escribirle. Nada que hacer.\n");
    await mongoose.disconnect();
    return;
  }

  if (!DE_VERDAD && !UNA) {
    const m = cartaNovedades({ nombre: gente[0].name || gente[0].username, correo: gente[0].email });
    console.log("  ── así empieza la versión de texto ──");
    console.log(m.texto.split("\n").slice(0, 12).map((l) => "  " + l).join("\n"));
    console.log(`\n  (${m.html.length} bytes de HTML, ${m.texto.length} de texto)`);
    console.log("\n  Para mandar de verdad: --de-verdad");
    console.log("  Para verla con los ojos primero: --a=alguien@ordenglobal.org\n");
    await mongoose.disconnect();
    return;
  }

  let salieron = 0;
  const fallos = [];

  for (const u of gente) {
    /* Se vuelve a mirar la baja justo antes de mandar. La lista se armó hace
       minutos y alguien pudo darse de baja desde otra carta en ese rato. */
    if (!UNA) {
      const ahora = await Users.findOne({ email: u.email })
        .select("sinAvisos novedadesEnviadaEn").lean();
      if (ahora?.sinAvisos || ahora?.novedadesEnviadaEn) continue;
    }

    const carta = cartaNovedades({ nombre: u.name || u.username, correo: u.email });
    const r = await enviarCorreo({
      para: u.email,
      asunto: carta.asunto,
      html: carta.html,
      texto: carta.texto,
    });

    if (r?.ok) {
      salieron++;
      /* Se marca INMEDIATAMENTE, no al final. Si el proceso muere en la
         persona 200, las 199 anteriores ya están marcadas y no se repiten. */
      if (!UNA) {
        await Users.updateOne({ email: u.email }, { $set: { novedadesEnviadaEn: new Date() } });
      }
      if (salieron % 25 === 0) console.log(`  ${salieron} / ${gente.length}`);
    } else {
      fallos.push({ correo: u.email, por: r?.motivo || "sin detalle" });
      // El primer fallo se enseña entero: casi siempre es el cajón de pruebas,
      // y verlo en el momento ahorra media hora de mirar el registro.
      if (fallos.length === 1) console.log(`\n  primer fallo: ${r?.motivo}\n`);
    }

    await dormir(PAUSA);
  }

  console.log(`\n  Salieron   : ${salieron}`);
  console.log(`  Fallaron   : ${fallos.length}`);
  for (const f of fallos.slice(0, 10)) console.log(`     · ${f.correo}: ${f.por}`);
  if (fallos.length > 10) console.log(`     · … y ${fallos.length - 10} más`);
  console.log("");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Se cayó:", e?.message || e);
  process.exit(1);
});
