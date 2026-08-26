/* Manda la carta del Genesis ID a toda la gente que tiene billetera.
 *
 *   node scripts/enviar-genesis.js                 -> ENSAYO: no manda nada
 *   node scripts/enviar-genesis.js --a=vos@correo  -> manda UNA, a esa
 *   node scripts/enviar-genesis.js --de-verdad     -> manda a todos
 *
 * POR QUE EL ENSAYO ES EL COMPORTAMIENTO POR DEFECTO
 *
 * Porque un correo mandado no se puede recoger. Correr el guion sin pensar
 * tiene que producir un informe, no cuatrocientos correos. Para que salgan de
 * verdad hay que escribir `--de-verdad`, que es una frase que nadie teclea sin
 * querer.
 *
 * LO QUE HACE QUE ESTO SEA REPETIBLE Y NO UN DESASTRE
 *
 *   · Se marca a cada persona EN CUANTO se le manda, con su propia marca
 *     (`genesisEnviadaEn`, distinta de la de la carta de novedades). Si el
 *     guion se cae a la mitad, volver a correrlo sigue donde se quedó en vez
 *     de mandarle dos veces a los primeros. Un correo repetido es la forma más
 *     rápida de que alguien marque «esto es basura», y con eso se quema el
 *     dominio para TODO, incluido el correo de recuperar la contraseña.
 *   · Quien se dio de baja no recibe, y se vuelve a comprobar JUSTO ANTES de
 *     mandar: entre que se arma la lista y que sale el correo pasan minutos, y
 *     en esos minutos alguien pudo darse de baja desde otra carta.
 *   · A quien YA tiene la identidad aprobada no se le escribe. Pedirle que
 *     haga algo que ya hizo es la manera más rápida de enseñarle que nuestros
 *     correos no miran quién es quien los recibe.
 *   · Un envío por segundo, que es el límite de la cuenta. Ir más rápido no
 *     hace que lleguen antes: hace que SES rechace.
 *   · Si SES rechaza a alguien, se anota y se sigue. Un buzón muerto no puede
 *     parar la tanda entera.
 *
 * SOBRE EL CAJON DE PRUEBAS
 *
 * El guion de novedades avisaba de que la cuenta de SES estaba en el cajón de
 * pruebas. Ya no lo está: al 26/08/2026 tiene acceso de producción, cincuenta
 * mil envíos por día, y rebota el 0,11 %. Se puede mandar a cualquier dirección.
 */

import mongoose from "mongoose";
import Users from "../models/Users.js";
import { enviarCorreo } from "../lib/correo.js";
import { cartaGenesis, ASUNTO } from "../lib/cartaGenesis.js";

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
        genesisEnviadaEn: { $exists: false },
        // A quien ya la tiene no se le pide que la haga.
        kycStatus: { $ne: "approved" },
      };

  const gente = await Users.find(filtro)
    .select("email name username kycStatus sinAvisos country")
    .lean();

  // Para que el informe diga a cuánta gente NO se le escribe y por qué: sin
  // esto, un filtro mal puesto se ve igual que una lista legítimamente corta.
  const total = await Users.countDocuments({ email: { $exists: true, $nin: [null, ""] } });
  const yaTienen = await Users.countDocuments({ kycStatus: "approved" });
  const deBaja = await Users.countDocuments({ sinAvisos: { $exists: true } });
  const yaRecibio = await Users.countDocuments({ genesisEnviadaEn: { $exists: true } });

  console.log(`\n  Carta        : ${ASUNTO}`);
  console.log(`  Cuentas      : ${total} con correo`);
  console.log(`    ya la tienen : ${yaTienen}  (no se les escribe)`);
  console.log(`    de baja      : ${deBaja}  (no se les escribe)`);
  console.log(`    ya recibió   : ${yaRecibio}  (no se repite)`);
  console.log(`  DESTINO      : ${gente.length} personas`);

  /* DE DONDE ES LA GENTE. No es curiosidad: la carta nombra ONDK, que es un
     valor negociable, y el propio documento de la preventa dice que NO se
     mercadea en Estados Unidos. Sin este desglose, «mandarla a todos» es
     mandarla a jurisdicciones que nadie miró. Que salga impreso obliga a
     mirarlo antes de escribir --de-verdad.

     `country` viene de lo que la persona declaró al abrir la cuenta: es una
     pista, no una prueba de residencia. Se dice así de claro para que nadie
     lo tome por más de lo que es. */
  const paises = {};
  for (const u of gente) paises[(u.country || "(sin declarar)").trim() || "(sin declarar)"] =
    (paises[(u.country || "(sin declarar)").trim() || "(sin declarar)"] || 0) + 1;
  const orden = Object.entries(paises).sort((a, b) => b[1] - a[1]);
  console.log(`  Países       : ${orden.slice(0, 8).map(([p, n]) => `${p} ${n}`).join(" · ")}`);
  if (orden.length > 8) console.log(`                 … y ${orden.length - 8} más`);
  const eeuu = orden.filter(([p]) => /^(US|USA|EEUU|Estados Unidos|United States)$/i.test(p))
    .reduce((s, [, n]) => s + n, 0);
  if (eeuu) {
    console.log(`\n  *** ${eeuu} de Estados Unidos. La carta nombra ONDK, y la preventa dice`);
    console.log(`      que ONDK no se mercadea allá. Decidilo ANTES de mandar. ***`);
  }
  console.log(`\n  Modo         : ${UNA ? `UNA SOLA, a ${UNA}` : DE_VERDAD ? "DE VERDAD — salen los correos" : "ENSAYO — no sale ninguno"}\n`);

  if (!gente.length) {
    console.log("  No hay a quién escribirle. Nada que hacer.\n");
    await mongoose.disconnect();
    return;
  }

  if (!DE_VERDAD && !UNA) {
    const m = cartaGenesis({ nombre: gente[0].name || gente[0].username, correo: gente[0].email });
    console.log("  ── así empieza la versión de texto ──");
    console.log(m.texto.split("\n").slice(0, 12).map((l) => "  " + l).join("\n"));
    console.log(`\n  (${m.html.length} bytes de HTML, ${m.texto.length} de texto)`);
    console.log(`\n  A este ritmo la tanda tarda ${Math.ceil((gente.length * PAUSA) / 60000)} minutos.`);
    console.log("\n  Para mandar de verdad: --de-verdad");
    console.log("  Para verla con los ojos primero: --a=alguien@ordenglobal.org\n");
    await mongoose.disconnect();
    return;
  }

  let salieron = 0;
  const fallos = [];

  for (const u of gente) {
    if (!UNA) {
      const ahora = await Users.findOne({ email: u.email })
        .select("sinAvisos genesisEnviadaEn kycStatus").lean();
      if (ahora?.sinAvisos || ahora?.genesisEnviadaEn) continue;
      // Alguien pudo verificarse mientras corría la tanda.
      if (ahora?.kycStatus === "approved") continue;
    }

    const carta = cartaGenesis({ nombre: u.name || u.username, correo: u.email });
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
        await Users.updateOne({ email: u.email }, { $set: { genesisEnviadaEn: new Date() } });
      }
      if (salieron % 25 === 0) console.log(`  ${salieron} / ${gente.length}`);
    } else {
      fallos.push({ correo: u.email, por: r?.motivo || "sin detalle" });
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
