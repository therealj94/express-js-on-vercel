#!/usr/bin/env python3
"""Arma el guion que va a correr en el dyno de Heroku, con la carta adentro.

POR QUE NO SE DESPLIEGA EL BACKEND Y YA

Porque desplegar para mandar un correo mueve TODO lo que este pendiente en el
backend, no solo la carta. Antes de un envio irreversible a cientos de personas
eso es riesgo gratis: si algo mas cambio en `infra/veta-wallet-backend/` desde
el ultimo despliegue, saldria de paseo junto con la carta.

Asi que el guion viaja solo y se lleva la carta puesta. De lo que ya esta en
produccion usa unicamente lo que NO toque:

    enviarCorreo   lib/correo.js      — hablar con SES
    Users          models/Users.js    — la lista
    firmaBaja      lib/firmaBaja.js   — firmar el enlace de baja

El marco, los botones y la carta entera van definidos dentro del guion, con el
codigo exacto del repositorio. Produccion no se toca.

COMO SE SABE QUE ES LA MISMA CARTA

`comprobar.mjs`, que se genera al lado, pinta la carta con este mismo codigo y
la compara byte por byte con la que produce el repositorio. Si difieren en un
solo caracter, no se manda nada.
"""
import pathlib, re, sys

RAIZ = pathlib.Path(__file__).resolve().parents[1]
FUENTE = RAIZ / "lib" / "cartaGenesis.js"
CORREO = RAIZ / "lib" / "correo.js"


def marco_local():
    """Saca `marco` de correo.js tal cual está, para pegarlo en el guion.

    Se extrae del archivo en vez de copiarlo a mano: una copia a mano se
    desincroniza el día que alguien cambie el marco, y nadie se entera hasta
    que salen cuatrocientos correos con el marco viejo.
    """
    s = CORREO.read_text()
    i = s.index("export function marco(")
    # hasta el cierre de la función: la primera línea que es exactamente "}"
    j = s.index("\n}\n", i) + 3
    return s[i:j].replace("export function marco(", "function marco(")


def carta_local():
    """La carta del repositorio, con los import cambiados por lo de adentro."""
    s = FUENTE.read_text()
    s = s.replace(
        'import { marco, botonCorreo, escaparCorreo as esc } from "./correo.js";\n'
        'import { enlaceBaja, sorteoVivo } from "./cartaNovedades.js";\n', "")
    s = s.replace("export const ASUNTO", "const ASUNTO")
    s = s.replace("export function cartaGenesis", "function cartaGenesis")
    return s


CABEZA = '''/* GENERADO por armar-envio-genesis.py — no se edita a mano.
   La carta va adentro para no tener que desplegar el backend entero antes de
   un envio irreversible. Lo unico que se toma de produccion es enviarCorreo,
   Users y firmaBaja, que no se tocaron. */
import mongoose from "mongoose";
import { enviarCorreo } from "./lib/correo.js";
import Users from "./models/Users.js";
import { firmaBaja } from "./lib/firmaBaja.js";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function botonCorreo(texto, url) {
  return `<div style="margin:24px 0;"><a href="${url}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:#C9A961;color:#1A1206;font-weight:700;font-size:15px;text-decoration:none;">${esc(texto)}</a></div>`;
}

/* Las dos de cartaNovedades.js, copiadas con su regla intacta: el sorteo
   cierra el 9-sep-2026 23:59:59 en Honduras (UTC-6), que es el MISMO instante
   que usa app.js, y la baja la atiende el backend y no el sitio estatico. */
const SORTEO_FIN = Date.UTC(2026, 8, 10, 5, 59, 59);
const sorteoVivo = () => Date.now() < SORTEO_FIN;
const BAJA = (process.env.API_PUBLICA || "https://vetawallet-1a2e38ac52b1.herokuapp.com") + "/baja";
const enlaceBaja = (correo) =>
  `${BAJA}?c=${encodeURIComponent(correo || "")}&f=${firmaBaja(correo)}`;

'''

COLA = '''
/* ── el envio ───────────────────────────────────────────────────────────── */

const MODO = (process.env.MODO || "ensayo").toLowerCase();   // ensayo | una | real
const UNA = (process.env.UNA || "").trim().toLowerCase();
const PAUSA = 1100;                                          // un envio por segundo
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

await mongoose.connect(
  `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`);

const filtro = MODO === "una"
  ? { email: UNA }
  : {
      email: { $exists: true, $nin: [null, ""] },
      sinAvisos: { $exists: false },
      genesisEnviadaEn: { $exists: false },
      kycStatus: { $ne: "approved" },
    };

/* En modo UNA no se busca en la base: la prueba se manda a una bandeja de la
   casa, que no tiene por que ser una cuenta de la billetera. Buscarla ahi hacia
   que la prueba dijera «no hay a quien escribirle» y no saliera nada. */
const gente = MODO === "una"
  ? [{ email: UNA, name: "Jose" }]
  : await Users.find(filtro)
      .select("email name username kycStatus sinAvisos country").lean();

const total = await Users.countDocuments({ email: { $exists: true, $nin: [null, ""] } });
const yaTienen = await Users.countDocuments({ kycStatus: "approved" });
const deBaja = await Users.countDocuments({ sinAvisos: { $exists: true } });
const yaRecibio = await Users.countDocuments({ genesisEnviadaEn: { $exists: true } });

console.log("");
console.log(`  Carta        : ${ASUNTO}`);
console.log(`  Cuentas      : ${total} con correo`);
console.log(`    ya la tienen : ${yaTienen}   (no se les escribe)`);
console.log(`    de baja      : ${deBaja}   (no se les escribe)`);
console.log(`    ya recibio   : ${yaRecibio}   (no se repite)`);
console.log(`  DESTINO      : ${gente.length} personas`);

/* De donde es la gente. La carta nombra ONDK, que es un valor negociable, y la
   preventa dice que no se mercadea en Estados Unidos. Que salga impreso obliga
   a mirarlo. `country` es lo que la persona declaro al abrir la cuenta: una
   pista, no una prueba de residencia. */
const paises = {};
for (const u of gente) {
  const k = (u.country || "").trim() || "(sin declarar)";
  paises[k] = (paises[k] || 0) + 1;
}
const orden = Object.entries(paises).sort((a, b) => b[1] - a[1]);
console.log(`  Paises       : ${orden.slice(0, 10).map(([p, n]) => `${p} ${n}`).join("  ·  ")}`);
if (orden.length > 10) console.log(`                 ... y ${orden.length - 10} mas`);
const eeuu = orden.filter(([p]) => /^(US|USA|EEUU|Estados Unidos|United States)$/i.test(p))
  .reduce((s, [, n]) => s + n, 0);
if (eeuu) console.log(`\\n  *** ${eeuu} de Estados Unidos. ONDK no se mercadea alla. ***`);
console.log(`  Modo         : ${MODO === "real" ? "DE VERDAD" : MODO === "una" ? "UNA SOLA a " + UNA : "ENSAYO — no sale ninguno"}`);
console.log("");

if (!gente.length) {
  console.log("  No hay a quien escribirle.\\n");
  await mongoose.disconnect();
  process.exit(0);
}

if (MODO === "ensayo") {
  const m = cartaGenesis({ nombre: gente[0].name || gente[0].username, correo: gente[0].email });
  console.log(`  (${m.html.length} bytes de HTML, ${m.texto.length} de texto)`);
  console.log(`  A un envio por segundo, la tanda tarda ${Math.ceil((gente.length * PAUSA) / 60000)} minutos.`);
  console.log("\\n  ENSAYO: no salio ningun correo.\\n");
  await mongoose.disconnect();
  process.exit(0);
}

let salieron = 0;
const fallos = [];
for (const u of gente) {
  if (MODO !== "una") {
    /* Se vuelve a mirar JUSTO ANTES de mandar: entre que se armo la lista y
       que le toca a esta persona pueden pasar minutos, y en esos minutos pudo
       darse de baja o verificarse. */
    const ahora = await Users.findOne({ email: u.email })
      .select("sinAvisos genesisEnviadaEn kycStatus").lean();
    if (ahora?.sinAvisos || ahora?.genesisEnviadaEn) continue;
    if (ahora?.kycStatus === "approved") continue;
  }

  const carta = cartaGenesis({ nombre: u.name || u.username, correo: u.email });
  const r = await enviarCorreo({
    para: u.email, asunto: carta.asunto, html: carta.html, texto: carta.texto,
  });

  if (r?.ok) {
    salieron++;
    /* Se marca INMEDIATAMENTE. Si el dyno muere en la persona 200, las 199
       anteriores ya estan marcadas y no reciben dos veces. */
    if (MODO !== "una") {
      /* Por la coleccion CRUDA, no por el modelo: mongoose descarta en
         silencio lo que no esta en el esquema, y asi fue como el 26-ago
         salieron 419 correos sin que ninguno quedara marcado. La marca de
         «ya se le mando» no puede depender de que el esquema desplegado
         este al dia. */
      await Users.collection.updateOne({ email: u.email },
        { $set: { genesisEnviadaEn: new Date() } });
    }
    if (salieron % 25 === 0) console.log(`  ${salieron} / ${gente.length}`);
  } else {
    fallos.push({ correo: u.email, por: r?.motivo || "sin detalle" });
    if (fallos.length === 1) console.log(`\\n  primer fallo: ${r?.motivo}\\n`);
  }
  await dormir(PAUSA);
}

console.log(`\\n  Salieron   : ${salieron}`);
console.log(`  Fallaron   : ${fallos.length}`);
for (const f of fallos.slice(0, 12)) console.log(`     · ${f.correo}: ${f.por}`);
if (fallos.length > 12) console.log(`     · ... y ${fallos.length - 12} mas`);
console.log("");
await mongoose.disconnect();
process.exit(0);
'''

if __name__ == "__main__":
    salida = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/enviar-genesis-dyno.js")
    salida.write_text(CABEZA + marco_local() + "\n\n" + carta_local() + COLA)
    print(f"{salida}  ({salida.stat().st_size} bytes)")
