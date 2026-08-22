/* La puerta del webhook de tarjeta, y el registro que escupía credenciales.
 *
 *   node pruebas/probar-webhook-tarjeta.mjs
 *
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * `POST /cards/webhook` no pide sesión y cambia el estado de las tarjetas de la
 * gente: bloquear, descongelar, anotar declinaciones. La única prueba que pedía
 * era un secreto compartido comparado con `!==`. Dos problemas distintos:
 *
 *   1. El `!==` corta en el primer byte distinto, y ese tiempo se mide desde
 *      afuera: regala el secreto byte a byte sin que nadie tenga que acertarlo
 *      entero. La casa ya arregló esto dos veces —routes/chains.js y el
 *      `esAdmin` de cardController.js— y esta puerta se había quedado atrás.
 *      Por eso `probar-clave-admin.mjs` existe y por eso esto se le parece.
 *
 *   2. Un secreto en una cabecera no dice NADA sobre el cuerpo. Quien lo tenga
 *      —o quien lo vea en un registro, en un proxy, en una captura— puede
 *      mandar el evento que quiera. El patrón correcto ya estaba escrito en
 *      controller/kycController.js: HMAC-SHA256 sobre el cuerpo crudo,
 *      comparado con `timingSafeEqual`.
 *
 * Qué firma manda CryptoMate de verdad no se sabe: se buscó en el repositorio y
 * no hay documentación ni ejemplo. Así que la capa de HMAC se enciende sola
 * cuando exista `CRYPTOMATE_WEBHOOK_SECRET`, y hasta entonces queda la
 * comparación en tiempo constante y la protección contra repetición. Lo que se
 * comprueba acá es que las dos capas se comporten como toca en los dos estados,
 * porque el peligroso es justamente el de en medio: una capa apagada que
 * PAREZCA encendida.
 *
 * Y de paso el registro: `controller/transactionController.js` hacía
 * `console.log(provider)` en cada envío. `chain.provider` es la URL del RPC y
 * este repositorio documenta en routes/chains.js que ese campo ha llevado la
 * clave dentro y que ya se fue una por ahí.
 *
 * Las funciones se leen del archivo de verdad y se ejecutan con dobles: sin
 * Express, sin Mongo y sin red.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

const TARJETAS = leer("controller", "cardController.js");
const ENVIOS = leer("controller", "transactionController.js");
const APP = leer("app.js");

let fallos = 0;
const comprobar = (ok, que, detalle = "") => {
  console.log(`  ${ok ? "ok   " : "FALLA"} ${que}${detalle ? "\n           " + detalle : ""}`);
  if (!ok) fallos++;
};

// El entorno es un objeto mutable y no el `process` de verdad: cada caso pone
// las variables que quiere sin ensuciar el proceso ni arriesgarse a que un
// valor de prueba sobreviva al final del archivo.
const entorno = { env: {} };

const TEXTO = {};
function funcionDe(nombre, deps = {}) {
  const re = new RegExp(`^function ${nombre}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}`, "m");
  const trozo = TARJETAS.match(re);
  if (!trozo) throw new Error(`no encontré function ${nombre}() en controller/cardController.js`);
  TEXTO[nombre] = trozo[0];
  const nombres = Object.keys(deps);
  return new Function(...nombres, `${trozo[0]}\nreturn ${nombre};`)(...nombres.map((n) => deps[n]));
}

const claveValida = funcionDe("claveDeWebhookValida", { crypto, process: entorno });
const firmaValida = funcionDe("firmaDeWebhookValida", { crypto, process: entorno });

const CLAVE = "una-clave-de-webhook-larga-y-aburrida";
const SECRETO = "el-secreto-con-el-que-se-firma-el-cuerpo";
const CUERPO = Buffer.from(JSON.stringify({ product: "cards", event_type: "card_frozen", operation_id: "op-1" }));

const pedido = (cabeceras, crudo = CUERPO) => ({ headers: cabeceras, rawBody: crudo });

// ── capa 1: el secreto compartido ────────────────────────────────────────────

console.log("\n── el secreto compartido ───────────────────────────────────────");

entorno.env.CRYPTOMATE_WEBHOOK_KEY = CLAVE;
comprobar(claveValida(pedido({ "x-webhook-key": CLAVE })) === true, "la clave correcta entra");
comprobar(claveValida(pedido({ "x-webhook-key": CLAVE.slice(0, -1) + "X" })) === false,
  "una clave del mismo largo pero distinta NO entra");

// El caso que convierte el arreglo en una caída: timingSafeEqual no devuelve
// false si los búferes miden distinto, LANZA. Una guardia que no mire la
// longitud antes se cae con un 500 en vez de contestar 401.
let reviento = null;
let veredicto = null;
try { veredicto = claveValida(pedido({ "x-webhook-key": "corta" })); } catch (e) { reviento = e; }
comprobar(reviento === null, "una clave de otro largo no hace saltar una excepción",
  reviento ? `lanzó ${reviento.constructor.name}: ${reviento.message}` : "");
comprobar(veredicto === false, "y tampoco entra");

comprobar(claveValida(pedido({})) === false, "sin la cabecera no se entra");
comprobar(claveValida(pedido({ "x-webhook-key": "" })) === false, "con la cabecera vacía tampoco");

/* El que da miedo: si la variable falta, lo esperado queda vacío, lo enviado
   también, miden lo mismo, y una comparación honesta dice «son iguales». Un
   despliegue al que se le olvidó una variable dejaría el webhook abierto a
   cualquiera con un curl. El secreto vacío tiene que NEGAR el paso. */
delete entorno.env.CRYPTOMATE_WEBHOOK_KEY;
comprobar(claveValida(pedido({})) === false, "sin la variable en el entorno, sin cabecera, NO se entra");
comprobar(claveValida(pedido({ "x-webhook-key": "" })) === false, "sin la variable, con cabecera vacía, NO se entra");
comprobar(claveValida(pedido({ "x-webhook-key": "lo-que-sea" })) === false, "sin la variable, con cualquier clave, NO se entra");
entorno.env.CRYPTOMATE_WEBHOOK_KEY = CLAVE;

console.log("\n── y que no vuelva el atajo ────────────────────────────────────");

/* Los casos de arriba miran la decisión, y un `!==` acierta en casi todos. El
   resto de la diferencia es el TIEMPO que tarda, que ningún aserto puede medir
   sin volverse inestable. Así que acá se mira el texto de la propia guardia. Se
   mira el cuerpo extraído y no el archivo entero, porque en el archivo entero la
   palabra aparece también en los comentarios que explican por qué está. */
for (const nombre of ["claveDeWebhookValida", "firmaDeWebhookValida"]) {
  const cuerpo = TEXTO[nombre].replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  comprobar(/crypto\.timingSafeEqual\s*\(/.test(cuerpo), `${nombre} compara con crypto.timingSafeEqual`);
  comprobar(!/(===|!==)\s*(String\()?process\.env\.CRYPTOMATE/.test(cuerpo),
    `${nombre} no volvió al === contra la variable de entorno`);
}

// ── capa 2: la firma sobre el cuerpo ─────────────────────────────────────────

console.log("\n── la firma HMAC, apagada mientras no se confirme ──────────────");

delete entorno.env.CRYPTOMATE_WEBHOOK_SECRET;
comprobar(firmaValida(pedido({ "x-webhook-key": CLAVE })) === true,
  "sin secreto configurado la capa no corre: no se puede exigir una firma que todavía no sabemos si llega");

console.log("\n── la firma HMAC, encendida ────────────────────────────────────");

entorno.env.CRYPTOMATE_WEBHOOK_SECRET = SECRETO;
const firmaDe = (cuerpo, secreto = SECRETO) =>
  crypto.createHmac("sha256", secreto).update(cuerpo).digest("hex");

comprobar(firmaValida(pedido({ "x-webhook-signature": firmaDe(CUERPO) })) === true,
  "la firma correcta entra");
comprobar(firmaValida(pedido({ "x-webhook-signature": "sha256=" + firmaDe(CUERPO) })) === true,
  "y también con el prefijo sha256=, que es como lo escriben varios proveedores");
comprobar(firmaValida(pedido({})) === false,
  "con el secreto puesto, SIN firma no se entra");
comprobar(firmaValida(pedido({ "x-webhook-signature": firmaDe(CUERPO, "otro-secreto") })) === false,
  "una firma hecha con otro secreto no entra");
comprobar(firmaValida(pedido({ "x-webhook-signature": "no-es-hexadecimal" })) === false,
  "una firma que no es ni hexadecimal no entra ni revienta");
comprobar(firmaValida(pedido({ "x-webhook-signature": firmaDe(CUERPO).slice(0, 20) })) === false,
  "una firma más corta tampoco, y sin excepción");

{
  // La firma es sobre EL CUERPO: cambiarlo tiene que invalidarla. Es todo el
  // punto de tener firma y no solo un secreto en una cabecera.
  const otro = Buffer.from(JSON.stringify({ product: "cards", event_type: "card_unblocked", operation_id: "op-1" }));
  comprobar(firmaValida({ headers: { "x-webhook-signature": firmaDe(CUERPO) }, rawBody: otro }) === false,
    "firmado un cuerpo y mandado otro, NO entra");
}
{
  /* Sin los bytes de verdad no hay firma que valga. Volver a serializar el
     objeto ya parseado da otros bytes —otro orden, otros espacios, otros
     escapes— y el HMAC saldría distinto. Antes que dar por buena una firma que
     no se pudo comprobar, se niega. */
  comprobar(firmaValida({ headers: { "x-webhook-signature": firmaDe(CUERPO) } }) === false,
    "sin el cuerpo crudo guardado, no se da por buena ninguna firma");
  /* Y tampoco se rehace el cuerpo a partir del objeto ya parseado «para poder
     comprobar algo». Ese remiendo es peor que no comprobar: da por buena una
     firma cuando el JSON de origen resulta ser byte a byte lo que devuelve
     JSON.stringify, y la rechaza cuando no —o sea, funciona o no según cómo
     escriba el JSON el proveedor, que es lo mismo que no funcionar. */
  comprobar(
    firmaValida({
      headers: { "x-webhook-signature": firmaDe(CUERPO) },
      body: JSON.parse(CUERPO.toString()),
    }) === false,
    "ni se rehace el cuerpo desde el objeto parseado para dar la firma por buena");
  comprobar(/verify:\s*\(req,\s*res,\s*buf\)\s*=>\s*\{\s*req\.rawBody\s*=\s*buf/.test(APP),
    "app.js guarda los bytes tal como llegaron, que es de donde sale el cuerpo crudo");
}
{
  // El nombre de la cabecera se puede fijar desde el entorno justo porque no
  // sabemos cuál manda CryptoMate: el día que lo diga, se pone y no hay que
  // tocar código.
  entorno.env.CRYPTOMATE_WEBHOOK_SIGNATURE_HEADER = "x-cryptomate-signature";
  comprobar(firmaValida(pedido({ "x-cryptomate-signature": firmaDe(CUERPO) })) === true,
    "el nombre de la cabecera se puede cambiar desde el entorno");
  comprobar(firmaValida(pedido({ "x-webhook-signature": firmaDe(CUERPO) })) === false,
    "y entonces la de antes ya no vale");
  delete entorno.env.CRYPTOMATE_WEBHOOK_SIGNATURE_HEADER;
}
delete entorno.env.CRYPTOMATE_WEBHOOK_SECRET;

// ── repetición ───────────────────────────────────────────────────────────────

console.log("\n── un evento no se aplica dos veces ────────────────────────────");
{
  /* Un webhook se reintenta: el proveedor no recibe el 200 y vuelve a mandar el
     mismo evento. Y quien tenga una copia de una petición válida la puede
     reenviar cuantas veces quiera. El doble del modelo imita lo único que
     importa de la colección: que la clave sea única y que el segundo en llegar
     reciba un 11000. */
  const vistos = new Set();
  const Idempotencia = {
    async create(doc) {
      const k = `${doc.clave} ${doc.usuario}`;
      if (vistos.has(k)) { const e = new Error("dup"); e.code = 11000; throw e; }
      vistos.add(k);
      return doc;
    },
  };
  const re = /^async function eventoYaAplicado\s*\([^)]*\)\s*\{[\s\S]*?^\}/m;
  const trozo = TARJETAS.match(re);
  comprobar(Boolean(trozo), "eventoYaAplicado está en cardController.js");

  if (trozo) {
    const fn = new Function("Idempotencia", "console",
      `${trozo[0]}\nreturn eventoYaAplicado;`)(Idempotencia, { error: () => undefined });

    comprobar((await fn("op-1")) === false, "la primera vez el evento se atiende");
    comprobar((await fn("op-1")) === true, "la segunda se reconoce como repetido");
    comprobar((await fn("op-2")) === false, "y otro evento distinto sigue pasando");
    comprobar((await fn(undefined)) === false,
      "sin identificador se atiende igual: perder un evento de verdad es peor que aplicar dos veces uno que no trae identificador");

    // Si la base falla por algo que NO es una clave duplicada, el evento se
    // atiende. Un fallo de la base no puede convertirse en un evento perdido.
    const rota = { async create() { throw new Error("mongo caído"); } };
    const fn2 = new Function("Idempotencia", "console",
      `${trozo[0]}\nreturn eventoYaAplicado;`)(rota, { error: () => undefined });
    comprobar((await fn2("op-3")) === false, "y si la base falla por otra cosa, el evento se atiende igual");
  }
}

console.log("\n── la guardia se llama de verdad ───────────────────────────────");
{
  /* Todo lo de arriba prueba las funciones. Esto mira que el manejador las use:
     una guardia perfecta que nadie llama no protege nada. */
  const manejador = /export const cardWebhook[\s\S]*?\n\};/.exec(TARJETAS);
  comprobar(Boolean(manejador), "se encuentra cardWebhook");
  if (manejador) {
    const cuerpo = manejador[0].replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    comprobar(/claveDeWebhookValida\(req\)/.test(cuerpo), "cardWebhook comprueba la clave");
    comprobar(/firmaDeWebhookValida\(req\)/.test(cuerpo), "cardWebhook comprueba la firma");
    comprobar(/eventoYaAplicado\(/.test(cuerpo), "cardWebhook mira si el evento ya se aplicó");
    comprobar(!/!==\s*process\.env\.CRYPTOMATE_WEBHOOK_KEY/.test(cuerpo),
      "y no quedó ningún `!==` contra el secreto dentro del manejador");
  }
}

// ── el registro que escupía las credenciales del RPC ─────────────────────────

console.log("\n── el nodo y su clave no se escriben en el registro ────────────");
{
  const limpio = ENVIOS.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  comprobar(!/console\.(log|info|warn|error)\s*\(\s*provider\s*\)/.test(limpio),
    "no se registra el objeto del proveedor, que lleva la URL del RPC con la clave dentro");
  comprobar(!/console\.\w+\([^)]*chain\.provider/.test(limpio),
    "ni chain.provider por su nombre");
  comprobar(!/console\.\w+\(\s*chain\s*\)/.test(limpio),
    "ni el documento entero de la cadena, que lo contiene");
  comprobar(/const provider = new JsonRpcProvider\(chain\.provider\);/.test(limpio),
    "y el proveedor se sigue creando igual: lo que se quitó es el registro, no la función");
}

console.log(fallos ? `\n${fallos} comprobación(es) en rojo\n` : "\nTodo en verde\n");
process.exit(fallos ? 1 : 0);
