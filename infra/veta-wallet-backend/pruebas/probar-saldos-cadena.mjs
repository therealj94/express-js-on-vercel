/* Un saldo que no se pudo leer NO vale cero.
 *
 *   node pruebas/probar-saldos-cadena.mjs
 *
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * `apps-web/veta-wallet/cadena.js` leía los quince saldos de la red y, cuando
 * algo fallaba, devolvía 0. Con el nodo caído los quince salían en cero, se
 * sumaban en cero, y la billetera enseñaba TU PATRIMONIO $0.00 sin un solo
 * aviso. Un nodo caído y una billetera vacía daban exactamente la misma imagen,
 * y lo único que las separa es el dinero de la persona.
 *
 * La casa ya tenía escrita la doctrina contraria en dos sitios —`lib/saldos.js`
 * de este mismo backend («ni un cero de consuelo: se dice que no se pudo
 * mirar») y `apps-web/ordenex/mercado.js` («null = no leídos, fail-closed»)— y
 * lo que se comprueba acá es que la billetera la cumpla.
 *
 * El cero de consuelo no estaba en un solo sitio, estaba en tres, y por eso hay
 * casos para los tres: el `catch { return 0 }` de `portafolio`, el
 * `catch { return 0 }` de `deUnidades`, y el más disimulado de todos, que el
 * `rpc()` no miraba `r.ok` ni el campo `error` del propio JSON-RPC y devolvía
 * `null` — que aguas abajo se volvía cero igual. Quitar uno solo de los tres no
 * arregla nada, así que hay casos que se ponen en rojo con cada uno.
 *
 * CÓMO SE CARGA UN ARCHIVO DE NAVEGADOR DESDE NODE
 *
 * `cadena.js` no es un módulo: es un script que declara `const CADENA = (…)()`.
 * Se lee del disco de verdad —si alguien lo cambia, esto se entera— y se
 * ejecuta en un contexto de `node:vm` con `fetch`, `AbortController` y los
 * relojes puestos a mano. Se le añade una línea al final para publicar `CADENA`
 * en el global del contexto, porque un `const` de nivel superior no aparece
 * solo. Ni red, ni navegador, ni Express: solo el archivo y un `fetch` fingido
 * que hace de nodo.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CADENA_JS = path.join(AQUI, "..", "..", "..", "apps-web", "veta-wallet", "cadena.js");

const FUENTE = fs.readFileSync(CADENA_JS, "utf8");

let fallos = 0;
const comprobar = (ok, que, detalle = "") => {
  console.log(`  ${ok ? "ok   " : "FALLA"} ${que}${detalle ? "\n           " + detalle : ""}`);
  if (!ok) fallos++;
};

const DIRECCION = "0x1111111111111111111111111111111111111111";

/* Monta el módulo con el `fetch` que le toque a cada caso.
 *
 * `responder` recibe la URL y devuelve lo que conteste el servidor fingido, o
 * lanza si lo que se quiere simular es que no hay red. */
function montar(responder) {
  const contexto = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    fetch: async (url, opciones) => responder(String(url), opciones),
  };
  vm.createContext(contexto);
  vm.runInContext(`${FUENTE}\n;globalThis.CADENA = CADENA;`, contexto, { filename: "cadena.js" });
  return contexto.CADENA;
}

// Respuesta de un `fetch` que sí llegó, con el cuerpo que se le diga.
const respuesta = (cuerpo, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => cuerpo,
});

/* El nodo que contesta bien: el saldo que se le pida, en hexadecimal. Los
 * precios se dan por caídos en todos los casos a propósito — acá se prueban los
 * saldos, y un precio ausente ya tiene su propio camino probado (queda null). */
const nodoQueContesta = (hex) => (url) => {
  if (url.includes("rpc")) return respuesta({ jsonrpc: "2.0", id: 1, result: hex });
  throw new Error("sin precios en esta prueba");
};

const filaDe = (cartera, simbolo) => cartera.find((x) => x.s === simbolo);

console.log("\n── el nodo contesta ────────────────────────────────────────────");
{
  // 0x0de0b6b3a7640000 = 1e18 = un ORIGEN entero.
  const CADENA = montar(nodoQueContesta("0x0de0b6b3a7640000"));
  const cartera = await CADENA.portafolio(DIRECCION, null);
  const origen = filaDe(cartera, "ORIGEN");
  comprobar(cartera.length === CADENA.TOKENS.length, "salen los quince tokens");
  comprobar(origen.cant === 1, "el saldo leído es el que dijo el nodo", `cant=${origen.cant}`);
  comprobar(origen.leido === true, "y viene marcado como leído");
  comprobar(origen.error === null, "sin error");
}

console.log("\n── un cero de verdad SIGUE siendo cero ─────────────────────────");
{
  // Esto es lo que contesta la cadena para una cuenta que nunca recibió nada, y
  // es la mitad que no hay que romper: si un cero leído saliera como «no se
  // pudo leer», la billetera dejaría de poder decir «no tenés nada» nunca.
  const CADENA = montar(nodoQueContesta("0x0"));
  const cartera = await CADENA.portafolio(DIRECCION, null);
  const origen = filaDe(cartera, "ORIGEN");
  comprobar(origen.cant === 0, "0x0 es cero", `cant=${origen.cant}`);
  comprobar(origen.leido === true, "y es un cero LEÍDO, no un hueco");

  const vacio = montar(nodoQueContesta("0x"));
  const cartera2 = await vacio.portafolio(DIRECCION, null);
  comprobar(filaDe(cartera2, "ORIGEN").cant === 0, "0x a secas también es cero");
  comprobar(filaDe(cartera2, "ORIGEN").leido === true, "y también está leído");
}

console.log("\n── el nodo caído, de las cuatro maneras en que se cae ───────────");

const CAIDAS = [
  ["no hay red", () => { throw new Error("fetch failed"); }],
  ["contesta 502 con una página de HTML", () => respuesta("<html>502</html>", false, 502)],
  ["contesta 200 pero no es JSON", () => ({ ok: true, status: 200, json: async () => { throw new Error("no es JSON"); } })],
  ["contesta un error de JSON-RPC", () => respuesta({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "nodo ocupado" } })],
];

for (const [nombre, responder] of CAIDAS) {
  console.log(`\n${nombre}`);
  const CADENA = montar(() => responder());
  const cartera = await CADENA.portafolio(DIRECCION, null);

  const origen = filaDe(cartera, "ORIGEN");
  comprobar(origen.cant === null, "el saldo es null, NO cero", `cant=${JSON.stringify(origen.cant)}`);
  comprobar(origen.cant !== 0, "y ni por accidente es un cero");
  comprobar(origen.leido === false, "la fila dice que no se leyó");
  comprobar(typeof origen.error === "string" && origen.error.length > 0,
    "y dice por qué", `error=${JSON.stringify(origen.error)}`);

  comprobar(cartera.every((x) => x.leido === false && x.cant === null),
    "los quince, no solo el primero");

  /* Lo que la pantalla necesita poder decidir. Con esto se distingue «no tenés
     nada» de «no pudimos mirar», que es todo el punto del arreglo. */
  const ningunaLeida = cartera.every((x) => !x.leido);
  comprobar(ningunaLeida === true,
    "se puede saber, desde la forma que sale, que NO hubo lectura ninguna");

  /* Y el total que pintaría una suma ingenua ya no puede dar $0.00 sin avisar:
     quien sume tiene que tropezarse con el null. */
  const sumaIngenua = cartera
    .filter((x) => x.precio != null)
    .reduce((s, x) => s + x.cant * x.precio, 0);
  comprobar(sumaIngenua === 0 && ningunaLeida,
    "un total de cero solo puede salir junto a «ninguna leída», que es lo que hay que mirar antes de pintarlo");
}

console.log("\n── una lectura PARCIAL no tira las buenas ──────────────────────");
{
  /* Tres de quince pueden fallar sin que se caiga el nodo entero. Si esto
     devolviera un único veredicto de todo o nada, habría que elegir entre tirar
     doce saldos buenos o dar por buenos tres huecos. */
  let n = 0;
  const CADENA = montar((url) => {
    if (!url.includes("rpc")) throw new Error("sin precios en esta prueba");
    n++;
    if (n % 5 === 0) throw new Error("este token no contestó");
    return respuesta({ jsonrpc: "2.0", id: 1, result: "0x0de0b6b3a7640000" });
  });
  const cartera = await CADENA.portafolio(DIRECCION, null);
  const leidas = cartera.filter((x) => x.leido);
  const huecos = cartera.filter((x) => !x.leido);

  comprobar(leidas.length > 0 && huecos.length > 0,
    "conviven filas leídas y filas sin leer", `${leidas.length} leídas, ${huecos.length} huecos`);
  comprobar(leidas.every((x) => x.cant === 1), "las leídas traen su cifra");
  comprobar(huecos.every((x) => x.cant === null), "y las otras, null");
}

console.log("\n── y que no vuelva el cero de consuelo ─────────────────────────");
{
  /* Los casos de arriba miran el comportamiento. Esto mira el texto, porque hay
     una forma de romperlo que ningún caso ve venir: que alguien vuelva a poner
     un `catch { return 0 }` en otro sitio del mismo archivo «para que no se
     rompa la pantalla». */
  const sinComentarios = FUENTE
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  comprobar(!/catch\s*(\([^)]*\))?\s*\{\s*return\s+0\s*;?\s*\}/.test(sinComentarios),
    "no hay ningún `catch { return 0 }` en cadena.js");
  comprobar(/if\s*\(!r\.ok\)/.test(sinComentarios),
    "rpc() mira r.ok antes de creerse la respuesta");
  comprobar(/d\.error/.test(sinComentarios),
    "rpc() mira el campo error del JSON-RPC");
}

console.log(fallos ? `\n${fallos} comprobación(es) en rojo\n` : "\nTodo en verde\n");
process.exit(fallos ? 1 : 0);
