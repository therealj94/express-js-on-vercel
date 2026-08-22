/* La ruta que mueve todo el saldo no puede ser la más suelta de la casa.
 *
 *   node pruebas/probar-limites-envio.mjs
 *
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * Así estaban los topes, medidos sobre app.js:
 *
 *   /users/decriptSeed   enseña la frase semilla       5 cada 15 min
 *   /cards/fund          mueve hasta 5.000 USD        10 cada 15 min
 *   /transaction/send    mueve TODO el saldo         100 por minuto
 *
 * O sea que la ruta que puede vaciar una cuenta entera era trescientas veces
 * más permisiva que la que enseña la semilla, y no tenía freno propio: caía
 * solo en el limitador global, que existe para que nadie tumbe el servidor y no
 * para proteger el dinero de nadie.
 *
 * Y las tres piden la contraseña, así que las tres son un oráculo para
 * adivinarla: se prueba una, el servidor contesta si acertó, se prueba otra. Con
 * cien por minuto se prueban ciento cuarenta y cuatro mil contraseñas al día por
 * esa puerta.
 *
 * Lo que se comprueba acá no es un número concreto —ese se puede subir mañana
 * con una razón escrita— sino la RELACIÓN entre los tres: que enviar dinero
 * nunca sea más suelto que enseñar la semilla ni que mover la tarjeta. Escrito
 * así, la prueba sigue sirviendo el día que alguien retoque los topes.
 *
 * Se lee app.js del disco y se sacan los limitadores de ahí. No se levanta
 * Express: lo que interesa es qué tope tiene cada ruta, no que express-rate-limit
 * cuente bien, que eso ya es problema suyo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const APP = fs.readFileSync(path.join(AQUI, "..", "app.js"), "utf8");

let fallos = 0;
const comprobar = (ok, que, detalle = "") => {
  console.log(`  ${ok ? "ok   " : "FALLA"} ${que}${detalle ? "\n           " + detalle : ""}`);
  if (!ok) fallos++;
};

// ── qué limitadores hay y a qué rutas se aplican ─────────────────────────────

/* Cada `const NOMBRE = rateLimit({ ... })`, con su ventana y su tope. Los
 * números se leen del propio archivo para que esto no se quede hablando de un
 * app.js que ya no existe. */
function limitadores() {
  const encontrados = {};
  const re = /const\s+(\w+)\s*=\s*rateLimit\(\{([\s\S]*?)\}\);/g;
  let m;
  while ((m = re.exec(APP))) {
    const cuerpo = m[2];
    const ventana = /windowMs:\s*([^,\n]+)/.exec(cuerpo);
    const tope = /max:\s*(\d+)/.exec(cuerpo);
    if (!ventana || !tope) continue;
    encontrados[m[1]] = {
      // La ventana está escrita como `15 * 60 * 1000`: se evalúa esa expresión
      // y nada más, así se lee el número que de verdad se despliega.
      ventanaMs: Number(new Function(`return (${ventana[1].trim()});`)()),
      tope: Number(tope[1]),
    };
  }
  return encontrados;
}

const LIM = limitadores();

// A qué prefijos se aplica cada uno.
function rutasDe(nombre) {
  const re = new RegExp(`app\\.use\\(\\s*["']([^"']+)["']\\s*,\\s*${nombre}\\s*\\)`, "g");
  const rutas = [];
  let m;
  while ((m = re.exec(APP))) rutas.push(m[1]);
  return rutas;
}

// El limitador que cubre una ruta dada. Gana el prefijo más largo que la cubra,
// que es como monta Express.
function limitadorDe(ruta) {
  let mejor = null;
  for (const nombre of Object.keys(LIM)) {
    for (const prefijo of rutasDe(nombre)) {
      if (ruta === prefijo || ruta.startsWith(prefijo.replace(/\/$/, "") + "/")) {
        if (!mejor || prefijo.length > mejor.prefijo.length) {
          mejor = { nombre, prefijo, ...LIM[nombre] };
        }
      }
    }
  }
  return mejor;
}

// Peticiones por minuto que permite un tope. Es la única forma de comparar dos
// limitadores con ventanas distintas sin engañarse.
const porMinuto = (l) => (l.tope * 60000) / l.ventanaMs;

console.log("\n── qué tope tiene cada puerta ──────────────────────────────────");

const SEMILLA = limitadorDe("/users/decriptSeed");
const TARJETA = limitadorDe("/cards/fund");
const ENVIO = limitadorDe("/transaction/send");
const ENVIO_TOKEN = limitadorDe("/transaction/sendToken");

for (const [que, l] of [
  ["/users/decriptSeed", SEMILLA],
  ["/cards/fund", TARJETA],
  ["/transaction/send", ENVIO],
  ["/transaction/sendToken", ENVIO_TOKEN],
]) {
  comprobar(Boolean(l), `${que} tiene un limitador propio`,
    l ? `${l.tope} cada ${l.ventanaMs / 60000} min (${porMinuto(l)}/min) por ${l.prefijo}` : "no encontré ninguno");
}

if (!SEMILLA || !TARJETA || !ENVIO || !ENVIO_TOKEN) {
  console.log(`\n${fallos} comprobación(es) en rojo\n`);
  process.exit(1);
}

console.log("\n── la relación entre las tres ──────────────────────────────────");

comprobar(porMinuto(ENVIO) <= porMinuto(SEMILLA),
  "enviar dinero NO es más suelto que enseñar la frase semilla",
  `envío ${porMinuto(ENVIO)}/min vs semilla ${porMinuto(SEMILLA)}/min`);

comprobar(porMinuto(ENVIO) <= porMinuto(TARJETA),
  "ni más suelto que fondear la tarjeta, que mueve mucho menos",
  `envío ${porMinuto(ENVIO)}/min vs tarjeta ${porMinuto(TARJETA)}/min`);

comprobar(ENVIO.ventanaMs >= SEMILLA.ventanaMs,
  "y la ventana no es más corta que la de la semilla, que sería la misma trampa por el otro lado",
  `${ENVIO.ventanaMs / 60000} min vs ${SEMILLA.ventanaMs / 60000} min`);

/* El caso que se cuela solo. Con un limitador por RUTA se tendrían cinco en
   /send más otros cinco en /sendToken alternando entre las dos: el doble del
   tope escrito, sin que nadie haya cambiado un número. El presupuesto es uno y
   se comparte. */
comprobar(ENVIO.nombre === ENVIO_TOKEN.nombre && ENVIO.prefijo === ENVIO_TOKEN.prefijo,
  "las dos rutas de envío comparten el MISMO presupuesto, no uno cada una",
  `send → ${ENVIO.prefijo}, sendToken → ${ENVIO_TOKEN.prefijo}`);

console.log("\n── y que el freno sea propio, no el global ─────────────────────");

/* El limitador global es el que existe para que nadie tumbe el servidor: no
   lleva nombre y se monta sin prefijo. Si el envío volviera a caer solo en él,
   `limitadorDe` no encontraría nada y esto ya estaría en rojo más arriba; acá se
   comprueba lo otro, que el freno del envío no sea ESE. */
const globalSinPrefijo = /app\.use\(rateLimit\(\{/.test(APP);
comprobar(globalSinPrefijo, "el limitador global sigue puesto (no se quitó nada por el camino)");
comprobar(ENVIO.prefijo.startsWith("/transaction"),
  "el freno del envío está montado sobre /transaction, no heredado del global",
  `prefijo=${ENVIO.prefijo}`);

console.log(fallos ? `\n${fallos} comprobación(es) en rojo\n` : "\nTodo en verde\n");
process.exit(fallos ? 1 : 0);
