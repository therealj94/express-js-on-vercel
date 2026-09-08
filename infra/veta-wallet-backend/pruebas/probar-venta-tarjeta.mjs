/* LA VENTA DE LA TARJETA: 5 USD en ORIGEN, con Genesis ID y con tope.
 *
 *   node pruebas/probar-venta-tarjeta.mjs
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * Esta ruta cobra dinero y emite un producto, en ese orden y en dos sistemas
 * distintos. Los finales malos son concretos y ninguno se ve en el camino
 * feliz:
 *
 *   · Se cobra dos veces porque alguien tocó el botón otra vez.
 *   · Se emite una tarjeta gratis porque el cobro falló y nadie miró.
 *   · Se cobra y no hay tarjeta, y el siguiente intento vuelve a cobrar.
 *   · Se cobra y DESPUÉS se descubre que no había cupo.
 *   · El tope interno se cuela en una respuesta y deja de ser interno.
 *   · El emisor no contesta cuántas hay y el tope se abre solo.
 *
 * Cada uno de esos tiene su comprobación acá. El código se lee del archivo de
 * verdad y se ejecuta con dobles: sin Express, sin Mongo y sin red.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

let fallos = 0;
const ok = (c, que, detalle = "") => {
  console.log(`  ${c ? "ok   " : "FALLA"} ${que}${detalle && !c ? "\n           " + detalle : ""}`);
  if (!c) fallos++;
};
const titulo = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(2, 58 - t.length))}`);

// ── el módulo de las reglas, cargado de verdad y con sus dependencias fingidas
//
// Se le quitan los `import` y los `export` y se evalúa el cuerpo entero: así
// lo que se prueba es EL archivo, no una copia de sus reglas escrita acá. Una
// copia se queda vieja el día que alguien cambie el precio.
function cargarVenta(deps) {
  const fuente = leer("lib", "ventaTarjeta.js")
    .replace(/^import .*$/gm, "")
    .replace(/^export /gm, "");
  const nombres = Object.keys(deps);
  const salida = "return { PRECIO_USD, TOPE_TARJETAS, DESTINO, precio, cuantasHay, hayCupo, paraLaPantalla };";
  return new Function(...nombres, `${fuente}\n${salida}`)(...nombres.map((n) => deps[n]));
}

const entorno = { env: {} };
let listaQueContesta = null;   // lo que devuelve el emisor, o un Error si lanza
const axiosFalso = {
  get: async () => {
    if (listaQueContesta instanceof Error) throw listaQueContesta;
    return { data: listaQueContesta };
  },
};
let precioOrigen = 2.586461;
const getOrigenPriceUsd = async () => precioOrigen;
// El getAddress de verdad: comprobar el checksum es la mitad del punto.
const { getAddress } = await import("ethers");

const V = cargarVenta({ axios: axiosFalso, getAddress, getOrigenPriceUsd, process: entorno, console });

// ── 1 · el destino y el precio ──────────────────────────────────────────────
titulo("a dónde va el dinero, y cuánto es");
ok(V.DESTINO === "0xc3B6a925AdC91069b62D97666A482136eA0a7311",
  "el ORIGEN de la venta va a la billetera de las ventas de tarjeta", V.DESTINO);
ok(V.DESTINO !== (entorno.env.TREASURY_OG_ADDRESS || ""),
  "y NO al treasury que fondea los saldos",
  "son dos dineros: el precio del plástico y el respaldo de lo que se gasta con él");
{
  /* La dirección pasa por getAddress, así que un carácter cambiado revienta al
     CARGAR el módulo y no el día del primer cobro. Se comprueba de verdad:
     se le cambia una letra a la dirección dentro del archivo y el módulo tiene
     que negarse a existir. */
  const rota = "0xc3B6a925AdC91069b62D97666A482136eA0a7312";   // último dígito cambiado
  const fuenteRota = leer("lib", "ventaTarjeta.js")
    .replace(/^import .*$/gm, "").replace(/^export /gm, "")
    .replace("0xc3B6a925AdC91069b62D97666A482136eA0a7311", rota);
  let reviento = null;
  try {
    new Function("axios", "getAddress", "getOrigenPriceUsd", "process", "console",
      fuenteRota + "\nreturn DESTINO;")(axiosFalso, getAddress, getOrigenPriceUsd, entorno, console);
  } catch (e) { reviento = e; }
  ok(reviento !== null,
    "con una letra cambiada, el módulo NO carga",
    "mejor que el proceso no levante a que levante cobrando hacia una dirección que no es de nadie");
}

titulo("5 dólares, cobrados en ORIGEN");
{
  const p = await V.precio();
  ok(p.usd === 5, "el precio está fijado en DÓLARES", String(p.usd));
  ok(Math.abs(p.origen - 5 / precioOrigen) < 1e-5,
    "y se convierte a ORIGEN con el precio del momento", `${p.origen} ORIGEN a $${precioOrigen}`);
  ok(p.origen * precioOrigen >= 5,
    "redondeando HACIA ARRIBA: cobrar de menos por un redondeo es regalar",
    `${p.origen} × ${precioOrigen} = ${(p.origen * precioOrigen).toFixed(8)}`);

  // El precio en ORIGEN NO puede estar congelado: si lo estuviera, el día que
  // el oro se mueva la tarjeta costaría otra cosa sin que nadie lo decida.
  precioOrigen = 1.0;
  const q = await V.precio();
  ok(Math.abs(q.origen - 5) < 1e-6,
    "con otro precio del ORIGEN, la tarjeta sigue costando 5 USD", `${q.origen} ORIGEN`);
  precioOrigen = 2.586461;

  precioOrigen = 0;
  let malo = null;
  try { await V.precio(); } catch (e) { malo = e; }
  ok(malo !== null, "sin precio de ORIGEN no se inventa uno: se niega",
    "un precio a cero cobraría infinitos ORIGEN, o ninguno");
  precioOrigen = 2.586461;
}

// ── 2 · el tope ─────────────────────────────────────────────────────────────
const tarjetas = (n, estado = "ACTIVE") =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, status: estado }));

titulo("el tope, contado por el emisor");
{
  listaQueContesta = tarjetas(26);
  ok((await V.cuantasHay()) === 26, "se cuenta lo que el emisor dice que hay",
    "una tarjeta creada a mano en el panel existe igual y ocupa cupo igual");

  listaQueContesta = [...tarjetas(3), ...tarjetas(2, "DELETED")];
  ok((await V.cuantasHay()) === 3, "las canceladas no ocupan cupo");

  listaQueContesta = { data: tarjetas(7) };
  ok((await V.cuantasHay()) === 7, "y da igual si la lista viene envuelta");

  listaQueContesta = tarjetas(39);
  ok((await V.hayCupo()).hay === true, "con 39 de 40, se puede emitir una más");
  listaQueContesta = tarjetas(40);
  ok((await V.hayCupo()).hay === false, "con 40, no");
  listaQueContesta = tarjetas(41);
  ok((await V.hayCupo()).hay === false, "y con más, tampoco");
}

titulo("si no se puede contar, no se emite");
{
  listaQueContesta = new Error("el emisor no contesta");
  let malo = null;
  try { await V.hayCupo(); } catch (e) { malo = e; }
  ok(malo !== null, "contar lanza en vez de devolver cero",
    "un tope que se abre solo cuando el emisor no contesta no es un tope");

  const vista = await V.paraLaPantalla();
  ok(vista.abierta === false, "y la pantalla dice CERRADA, no abierta");

  listaQueContesta = "esto no es una lista";
  malo = null;
  try { await V.cuantasHay(); } catch (e) { malo = e; }
  ok(malo !== null, "una respuesta con otra forma también se niega");
}

// ── 3 · el tope es interno ──────────────────────────────────────────────────
titulo("el tope no sale de casa");
{
  listaQueContesta = tarjetas(38);
  const vista = await V.paraLaPantalla();
  const texto = JSON.stringify(vista);
  ok(vista.abierta === true, "la pantalla sabe que se está emitiendo");
  ok(!/"tope"|"cuantas"|"quedan"/.test(texto),
    "y NO se le dice el tope, ni cuántas hay, ni cuántas quedan", texto);
  ok(!/\b40\b|\b38\b|\b2\b/.test(texto.replace(/2\.\d+|"precioOrigen":[\d.]+/g, "")),
    "ni el número por ningún otro nombre",
    "«quedan 2» convierte una decisión de operación en una carrera");
  ok(typeof vista.precioUsd === "number" && typeof vista.precioOrigen === "number",
    "lo que sí se dice: cuánto cuesta, en dólares y en ORIGEN");
}

// ── 4 · el orden de la ruta ─────────────────────────────────────────────────
//
// El orden IMPORTA y no se ve en ninguna prueba de comportamiento: hay que
// mirarlo en el archivo. Cobrarle a alguien para después decirle que no hay
// tarjetas es lo peor que puede hacer esta ruta; emitir antes de cobrar deja
// una tarjeta gratis que no se puede deshacer.
titulo("el orden: cupo → cobro → emisión");
{
  const src = leer("controller", "cardController.js");
  const i = src.indexOf("export const requestCard");
  const trozo = src.slice(i, src.indexOf("export const", i + 10));
  const pKyc = trozo.indexOf('kycStatus !== "approved"');
  const pCupo = trozo.indexOf("venta.hayCupo");
  const pCobro = trozo.indexOf("cobrarLaTarjeta(");
  const pEmite = trozo.indexOf("/cards/virtual-cards/create");
  ok(pKyc > -1 && pKyc < pCupo, "primero el Genesis ID");
  ok(pCupo > -1 && pCupo < pCobro, "después el cupo, ANTES de cobrar",
    "cobrar y después decir que no hay tarjetas es lo peor que puede hacer esta ruta");
  ok(pCobro > -1 && pCobro < pEmite, "después el cobro, ANTES de emitir",
    "al revés, un cobro fallido deja una tarjeta emitida y gratis, y eso no se deshace");
  ok(/estado = "emitida"/.test(trozo) && trozo.indexOf('estado = "emitida"') > pEmite,
    "y la compra se cierra solo cuando la tarjeta ya existe");
  ok(/PAGADA_SIN_EMITIR/.test(trozo),
    "con un final propio para «pagada y sin tarjeta», que es el caso feo");
  ok(!/\b40\b/.test(trozo.replace(/\d{3,}/g, "")),
    "y el número del tope no aparece en la ruta");
}

// ── 5 · el cobro, con memoria ───────────────────────────────────────────────
titulo("no se cobra dos veces");
{
  const src = leer("controller", "cardController.js");
  const re = /^async function cobrarLaTarjeta\s*\([^)]*\)\s*\{[\s\S]*?^\}/m;
  const trozo = src.match(re);
  if (!trozo) throw new Error("no encontré cobrarLaTarjeta() en cardController.js");

  // Los dobles. Cada caso los reconfigura.
  let compraAbierta = null;
  const creadas = [];
  const CardPurchase = {
    findOne: async () => compraAbierta,
    create: async (d) => { const c = { ...d, _id: "compra1", save: async () => {} }; creadas.push(c); return c; },
  };
  let saldoInterno = 0;
  const devoluciones = [];
  const OrigenBalance = {
    findOneAndUpdate: async (filtro, cambio) => {
      const pide = filtro.origen?.$gte ?? 0;
      if (saldoInterno < pide) return null;
      saldoInterno += cambio.$inc.origen;
      return { origen: saldoInterno };
    },
    updateOne: async (_, cambio) => { devoluciones.push(cambio.$inc.origen); saldoInterno += cambio.$inc.origen; },
  };
  const enviadas = [];
  const ethersFalso = {
    JsonRpcProvider: class { async getTransactionReceipt() { return reciboQueHay; } async getBalance() { return 10n ** 21n; } },
    Wallet: class {
      constructor() { this.address = "0x" + "1".repeat(40); }
      async sendTransaction(t) { enviadas.push(t); return { hash: "0xhash", wait: async () => ({ status: 1 }) }; }
    },
    parseEther: (s) => BigInt(Math.round(Number(s) * 1e18)),
  };
  let reciboQueHay = null;
  const bcryptFalso = { compare: async (a, b) => a === "buena" };

  const cobrar = new Function(
    "CardPurchase", "OrigenBalance", "venta", "ethers", "bcrypt",
    "descifrarLlavePrivada", "precioDeGas", "OG_RPC_TARJETA", "ESPERA_PAGO_MS", "console",
    `${trozo[0]}\nreturn cobrarLaTarjeta;`
  )(CardPurchase, OrigenBalance, V, ethersFalso, bcryptFalso,
    () => "0x" + "ab".repeat(32), async () => 1n, "http://x", 50, console);

  const usuario = { _id: "u1", password: "hash", privateKey: "cifrada" };

  // (a) una compra YA PAGADA no se vuelve a cobrar
  compraAbierta = { estado: "pagada", _id: "vieja" };
  saldoInterno = 1000;
  let r = await cobrar(usuario, "buena", {});
  ok(r._id === "vieja" && saldoInterno === 1000,
    "una compra ya pagada NO se cobra otra vez: lo que falta es emitir",
    "es lo que hace que reintentar después de un fallo del emisor sea seguro");

  // (b) saldo comprado: decremento atómico, sin firmar nada
  compraAbierta = null;
  saldoInterno = 10; enviadas.length = 0;
  r = await cobrar(usuario, "buena", {});
  const p = await V.precio();
  ok(Math.abs(saldoInterno - (10 - p.origen)) < 1e-9,
    "con saldo comprado se descuenta de la base y no se firma nada", `quedan ${saldoInterno}`);
  ok(enviadas.length === 0, "sin transacción, sin gas y sin espera");
  ok(r.fuente === "interno" && r.estado === "pagada", "y la compra nace pagada");

  // (c) sin saldo comprado: se firma contra la billetera de las ventas
  compraAbierta = null; saldoInterno = 0; enviadas.length = 0;
  r = await cobrar(usuario, "buena", {});
  ok(enviadas.length === 1, "sin saldo comprado, se firma en la cadena");
  ok(enviadas[0]?.to === V.DESTINO,
    "y va a la billetera de las ventas de tarjeta", String(enviadas[0]?.to));
  ok(r.estado === "pagada" && r.ogTxHash === "0xhash", "con su hash guardado");

  // (d) la contraseña es de verdad
  compraAbierta = null; saldoInterno = 0;
  let malo = null;
  try { await cobrar(usuario, "mala", {}); } catch (e) { malo = e; }
  ok(malo?.codigo === "CLAVE_MALA" && malo?.http === 401,
    "con la contraseña equivocada no se cobra", malo?.message);

  malo = null;
  try { await cobrar(usuario, "", {}); } catch (e) { malo = e; }
  ok(malo?.codigo === "FALTA_CLAVE", "y sin contraseña tampoco", malo?.message);

  // (e) un pago emitido y sin confirmar NO se cobra otra vez
  compraAbierta = { estado: "pendiente", ogTxHash: "0xhash", save: async () => {} };
  reciboQueHay = null; saldoInterno = 1000; enviadas.length = 0;
  malo = null;
  try { await cobrar(usuario, "buena", {}); } catch (e) { malo = e; }
  ok(malo?.codigo === "PAGO_EN_CURSO", "un pago sin confirmar se espera, no se repite", malo?.message);
  ok(saldoInterno === 1000 && enviadas.length === 0, "y no se cobró nada mientras tanto");

  // (f) el mismo pago, ya minado, cierra la compra sin cobrar de nuevo
  compraAbierta = { estado: "pendiente", ogTxHash: "0xhash", save: async () => {} };
  reciboQueHay = { status: 1 }; saldoInterno = 1000; enviadas.length = 0;
  r = await cobrar(usuario, "buena", {});
  ok(r.estado === "pagada" && saldoInterno === 1000 && enviadas.length === 0,
    "y si ya se minó, la compra pasa a pagada sin cobrar de nuevo");

  // (g) un pago que NO entró sí se vuelve a cobrar: no se cobró nada
  compraAbierta = { estado: "pendiente", ogTxHash: "0xhash", save: async () => {} };
  reciboQueHay = { status: 0 }; saldoInterno = 10; enviadas.length = 0;
  r = await cobrar(usuario, "buena", {});
  ok(r.estado === "pagada" && saldoInterno < 10,
    "un pago que se revirtió sí se cobra de nuevo: ahí no se cobró nada");

  // (h) choque del índice único: se devuelve el ORIGEN antes de salir
  compraAbierta = null; saldoInterno = 10; devoluciones.length = 0;
  CardPurchase.create = async () => { throw new Error("E11000 duplicate key"); };
  malo = null;
  try { await cobrar(usuario, "buena", {}); } catch (e) { malo = e; }
  ok(malo?.codigo === "COMPRA_EN_CURSO", "dos peticiones a la vez: la segunda choca", malo?.message);
  ok(devoluciones.length === 1 && Math.abs(devoluciones[0] - p.origen) < 1e-9,
    "y el ORIGEN que ya se había descontado se devuelve",
    "se cobró y no se va a usar: dejarlo cobrado es quedarse con dinero de alguien por un choque nuestro");
  ok(Math.abs(saldoInterno - 10) < 1e-9, "el saldo queda como estaba", String(saldoInterno));
}

console.log(fallos ? `\n${fallos} en rojo.\n` : "\nTodo en verde\n");
process.exit(fallos ? 1 : 0);
