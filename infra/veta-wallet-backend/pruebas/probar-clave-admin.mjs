/* La clave de administración se compara en tiempo constante. En los dos sitios.
 *
 *   node pruebas/probar-clave-admin.mjs
 *
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * `ADMIN_SECRET` abre dos puertas grandes: `POST /addChain`, que decide con qué
 * RPC firma el backend, y `POST /cards/admin/sync`, que recorre las tarjetas de
 * todo el mundo. Durante un tiempo cada una la comprobó a su manera: chains.js
 * con `crypto.timingSafeEqual` y cardController.js con un `!==` pelado. El `!==`
 * corta en el primer byte distinto y ese tiempo se mide desde afuera, así que
 * regala el secreto byte a byte sin que nadie tenga que acertarlo entero.
 *
 * Lo que se comprueba acá es que las dos puertas se comporten IGUAL, y sobre
 * todo los dos casos en los que este arreglo se rompe solo:
 *
 *  1. LONGITUDES DISTINTAS. `timingSafeEqual` no devuelve false: LANZA. Una
 *     guardia que no mire la longitud antes se cae con un 500 en vez de
 *     contestar 403, y una excepción sin atrapar dentro de un middleware es
 *     otra manera de tener el servicio abajo.
 *
 *  2. SIN `ADMIN_SECRET` EN EL ENTORNO. Es el caso que da miedo: si la variable
 *     falta, lo esperado queda vacío, lo enviado también, miden lo mismo, y una
 *     comparación honesta dice «son iguales». Un despliegue al que se le olvidó
 *     una variable dejaría las dos rutas abiertas a cualquiera con un curl. El
 *     secreto vacío tiene que NEGAR el paso, nunca concederlo.
 *
 * Las dos funciones se leen del disco, del archivo de verdad, para que esto se
 * entere si alguien las cambia. No se levanta Express ni se toca Mongo: la
 * guardia es lo único que interesa acá.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");

const CHAINS = fs.readFileSync(path.join(RAIZ, "routes", "chains.js"), "utf8");
const TARJETAS = fs.readFileSync(path.join(RAIZ, "controller", "cardController.js"), "utf8");

let fallos = 0;
const comprobar = (ok, que, detalle = "") => {
  console.log(`  ${ok ? "ok   " : "FALLA"} ${que}${detalle ? "\n           " + detalle : ""}`);
  if (!ok) fallos++;
};

// El entorno es un objeto mutable y no el `process` de verdad: cada caso pone
// el ADMIN_SECRET que quiere probar sin ensuciar el proceso ni arriesgarse a
// que un valor de prueba sobreviva al final del archivo.
const entorno = { env: {} };

// Saca del texto una función suelta, desde `function nombre(` hasta la llave de
// cierre que está pegada al margen. Sirve porque las dos guardias son cortas y
// no dependen de nada más que de `crypto` y de `process.env`.
const TEXTO = {};
function guardiaDe(fuente, nombre, archivo) {
  const re = new RegExp(`^function ${nombre}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}`, "m");
  const trozo = fuente.match(re);
  if (!trozo) throw new Error(`no encontré function ${nombre}() en ${archivo}`);
  TEXTO[archivo] = trozo[0];
  return new Function("crypto", "process", `${trozo[0]}\nreturn ${nombre};`)(crypto, entorno);
}

// Las dos guardias tienen forma distinta (una es middleware de Express, la otra
// devuelve un booleano) y eso está bien: lo que tiene que coincidir es la
// DECISIÓN. Cada una se envuelve para preguntarle lo mismo: ¿deja pasar?
const comoMiddleware = (fn) => (clave) => {
  let paso = false;
  const req = { headers: clave === undefined ? {} : { "x-admin-key": clave } };
  const res = { status: () => ({ json: () => undefined }) };
  fn(req, res, () => { paso = true; });
  return paso;
};

const comoPredicado = (fn) => (clave) =>
  Boolean(fn({ headers: clave === undefined ? {} : { "x-admin-key": clave } }));

const PUERTAS = [
  ["routes/chains.js · soloAdmin", comoMiddleware(guardiaDe(CHAINS, "soloAdmin", "routes/chains.js"))],
  ["controller/cardController.js · esAdmin", comoPredicado(guardiaDe(TARJETAS, "esAdmin", "controller/cardController.js"))],
];

const SECRETO = "un-secreto-de-administracion-largo-y-aburrido";

console.log("\n── cada puerta, caso por caso ──────────────────────────────────");

for (const [nombre, dejaPasar] of PUERTAS) {
  console.log(`\n${nombre}`);

  entorno.env.ADMIN_SECRET = SECRETO;
  comprobar(dejaPasar(SECRETO) === true, "la clave correcta entra");
  comprobar(dejaPasar("un-secreto-de-administracion-largo-y-aburridX") === false,
    "una clave del mismo largo pero distinta NO entra");

  // El caso que convierte el arreglo en una caída: timingSafeEqual lanza si los
  // búferes no miden igual. Tiene que contestar «no», no reventar.
  let reviento = null;
  let veredicto = null;
  try { veredicto = dejaPasar("corta"); } catch (e) { reviento = e; }
  comprobar(reviento === null, "una clave de otro largo no hace saltar una excepción",
    reviento ? `lanzó ${reviento.constructor.name}: ${reviento.message}` : "");
  comprobar(veredicto === false, "y tampoco entra");

  comprobar(dejaPasar("") === false, "un header vacío no entra");
  comprobar(dejaPasar(undefined) === false, "sin el header no se entra");

  // Un despliegue sin la variable puesta. Si acá entra alguien, la ruta quedó
  // abierta al mundo y nadie se va a enterar hasta que sea tarde.
  delete entorno.env.ADMIN_SECRET;
  comprobar(dejaPasar(undefined) === false, "sin ADMIN_SECRET en el entorno, sin header, NO se entra");
  comprobar(dejaPasar("") === false, "sin ADMIN_SECRET en el entorno, con header vacío, NO se entra");
  comprobar(dejaPasar("lo-que-sea") === false, "sin ADMIN_SECRET en el entorno, con cualquier clave, NO se entra");

  entorno.env.ADMIN_SECRET = "";
  comprobar(dejaPasar("") === false, "con ADMIN_SECRET vacía tampoco");
}

console.log("\n── y que no vuelva el atajo ────────────────────────────────────");

// Los casos de arriba miran la decisión, y una comparación con `===` acierta en
// todos salvo dos. El resto de la diferencia es el TIEMPO que tarda, que ningún
// aserto puede medir sin volverse inestable. Así que acá se mira el texto de la
// propia guardia: que la comparación sea la de tiempo constante y no otra.
// Se mira el cuerpo extraído, no el archivo entero, porque en el archivo entero
// la palabra aparece también en los comentarios que explican por qué está.
for (const archivo of Object.keys(TEXTO)) {
  const cuerpo = TEXTO[archivo].replace(/\/\/[^\n]*/g, "");
  comprobar(/crypto\.timingSafeEqual\s*\(/.test(cuerpo),
    `${archivo} compara con crypto.timingSafeEqual`);
  comprobar(!/(===|!==)\s*(String\()?process\.env\.ADMIN_SECRET/.test(cuerpo),
    `${archivo} no volvió al === contra ADMIN_SECRET`);
}

console.log(fallos ? `\n${fallos} comprobación(es) en rojo\n` : "\nTodo en verde\n");
process.exit(fallos ? 1 : 0);
