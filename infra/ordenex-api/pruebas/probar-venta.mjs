/* La venta de ORIGEN por USDT: la salida.
 *
 *   node pruebas/probar-venta.mjs
 *
 * Vender es lo único de esta casa donde la casa PAGA primero y a una cadena
 * que no controla. Así que lo que se prueba no son las cuentas —esas también,
 * pero son fáciles— sino los tres desastres:
 *
 *   · pagar dos veces (un doble clic, un reintento, dos dynos);
 *   · pagar sin cobrar (firmar y no debitar el ORIGEN);
 *   · pagar más de lo que hay en la caja.
 *
 * La cadena va fingida: `lib/venta.js` guarda el módulo `lib/pagoUsdt.js`
 * entero justamente para esto, así que el camino recorrido es el de
 * producción y no un atajo. Corre contra mongodb-memory-server.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}

const { HDNodeWallet, Wallet } = await import('ethers');

const FRASE = 'test test test test test test test test test test test junk';
process.env.ORDENEX_SEMILLA_DEPOSITOS = FRASE;
process.env.ORDENEX_SEMILLA_XPUB = HDNodeWallet.fromPhrase(FRASE, '', "m/44'/60'/0'/0").neuter().extendedKey;
process.env.ORDENEX_ADM = 'una-clave-de-pruebas-suficientemente-larga-1234';
process.env.VENTAS = '1';

// Genesis fingido por HTTP de verdad, como en probar-compra: el tamiz de
// sanciones se prueba por el mismo camino que en producción.
const { createServer } = await import('node:http');
const sancionadas = new Set();
const genesisFingido = createServer((req, res) => {
  const m = /^\/api\/v1\/tamiz\/direccion\/(.+)$/.exec(req.url || '');
  res.setHeader('content-type', 'application/json');
  if (!m) { res.statusCode = 404; return res.end('{}'); }
  const dir = decodeURIComponent(m[1]).toLowerCase();
  res.end(JSON.stringify({ tamizado: true, sancionada: sancionadas.has(dir) }));
});
await new Promise((listo) => genesisFingido.listen(0, '127.0.0.1', listo));
process.env.GENESIS_URL = `http://127.0.0.1:${genesisFingido.address().port}`;
process.env.GENESIS_API_KEY = 'clave-de-prueba';

const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_venta' });

const { Usuario, Cuenta } = (await import('../models/index.js')).default;
const decimales = (await import('../lib/decimales.js')).default;
const billeteras = (await import('../lib/billeteras.js')).default;
const terminos = (await import('../lib/terminos.js')).default;
const ledger = (await import('../lib/ledger.js')).default;
const referencia = (await import('../lib/referencia.js')).default;
const pagoUsdt = (await import('../lib/pagoUsdt.js')).default;
const venta = (await import('../lib/venta.js')).default;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

await Usuario.syncIndexes();
await venta.OrdenVenta.syncIndexes();

// Los decimales, con una cadena fingida (igual que probar-compra).
const BSC = 56;
const REALES = { 137: { USDT: 6 }, 56: { USDT: 18 }, 1: { USDT: 6 } };
await decimales.verificar({
  proveedorDe: async () => ({
    call: async (tx) => {
      for (const [red, activos] of Object.entries(decimales.ESPERADOS)) {
        for (const [s, f] of Object.entries(activos)) {
          if (f.contrato && f.contrato.toLowerCase() === String(tx.to).toLowerCase()) {
            return '0x' + BigInt(REALES[Number(red)][s]).toString(16).padStart(64, '0');
          }
        }
      }
      throw new Error(`contrato desconocido ${tx.to}`);
    },
  }),
  plazoMs: 3000,
});

// El precio: la onza a 4.493 → el ORIGEN a 2,626422 (el mismo de probar-compra).
const ORO = 4493.00;
const ORIGEN_USD = ORO / 31.1035 / 55;
referencia.referenciaDe = async () => ({ origenUsd: ORIGEN_USD, usd: ORO });

/* LA CADENA, FINGIDA. Solo estas dos funciones salen a la red en producción.
   `CAJA` es lo que la caja tiene; `SIGUIENTE` deja preparar un fallo concreto
   para la próxima firma, que es como se prueban los caminos de duda sin tener
   una cadena que se caiga a pedido. */
let CAJA = 10_000n * 10n ** 18n;
let pagos = [];
let SIGUIENTE = null;
pagoUsdt.saldo = async (red) => {
  const crudo = (CAJA / 10n ** BigInt(18 - REALES[red].USDT)).toString();
  return { crudo, canonico: decimales.aCanonico(crudo, red, 'USDT') };
};
pagoUsdt.configurada = () => ({ ok: true, motivo: null, direccion: billeteras.UNICA });
let GAS_NATIVO = 10n ** 17n;          // 0,1 BNB: de sobra
pagoUsdt.gas = async () => {
  const porPago = 10n ** 13n;          // ~0,00001 por transferencia
  return { nativo: GAS_NATIVO.toString(), porPago: porPago.toString(),
           alcanza: GAS_NATIVO >= porPago, ventasQueQuedan: Number(GAS_NATIVO / porPago) };
};
pagoUsdt.pagar = async (red, { a, crudo }) => {
  if (SIGUIENTE) { const e = SIGUIENTE; SIGUIENTE = null; throw e; }
  pagos.push({ red, a, crudo });
  return { hash: '0x' + 'cd'.repeat(32) };
};

let n = 0;
async function persona({ origen = '1000000000000000000000' } = {}) {
  const u = await Usuario.create({
    gid: `gid-v-${++n}-${Date.now()}`,
    direccionWallet: Wallet.createRandom().address,
    terminosVersion: terminos.TERMINOS_VERSION,
  });
  if (BigInt(origen) > 0n) await ledger.acreditar(String(u._id), 'ORIGEN', origen, `prueba:${u._id}`);
  return Usuario.findById(u._id).lean();
}
/** El saldo de ORIGEN de alguien, leido de la cuenta y no con una sonda: una
 *  sonda que acredita o debita para mirar cambia lo que esta mirando. */
async function saldoDe(userId) {
  const c = await Cuenta.findOne({ userId: String(userId), activo: 'ORIGEN' }).lean();
  return BigInt(c ? c.disponible : 0);
}
const afuera = () => Wallet.createRandom().address;
const clave = () => `venta-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

decir('la cuenta: lo que sale por lo que se entrega');
{
  const c = await venta.cotizar({ origenWei: (100n * 10n ** 18n).toString(), red: BSC });
  // 100 ORIGEN × 2,626422 = 262,6422 USDT brutos.
  comprobar(c.brutoCanonico.startsWith('2626422'), '100 ORIGEN dan 262,6422 USDT brutos', c.brutoCanonico);
  // La comisión de salida es el 1 %: quedan 260,015…
  const bruto = BigInt(c.brutoCanonico), com = BigInt(c.comisionCanonico), neto = BigInt(c.netoCanonico);
  comprobar(com === bruto / 100n, 'la comisión de salida es el 1 % del bruto', `${com} de ${bruto}`);
  comprobar(neto === bruto - com, 'y el neto es el bruto menos la comisión');
  comprobar(neto < bruto, 'sale menos de lo que entra: la casa no paga de más');
  // Nunca se redondea hacia arriba.
  const c2 = await venta.cotizar({ origenWei: '1', red: BSC });
  comprobar(BigInt(c2.brutoCanonico) <= 3n, 'un wei de ORIGEN no se redondea hacia arriba', c2.brutoCanonico);
}

decir('las guardas de antes de tocar nada');
{
  const u = await persona();
  const base = { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() };
  const casos = [
    [{ red: 999 }, 'RED_INVALIDA', 'una red que no paga USDT'],
    [{ origenWei: '0' }, 'CANTIDAD_INVALIDA', 'cero ORIGEN'],
    [{ origenWei: '-5' }, 'CANTIDAD_INVALIDA', 'una cantidad negativa'],
    [{ direccion: 'no-es-una-direccion' }, 'DIRECCION_INVALIDA', 'una dirección que no lo es'],
    [{ ventaKey: 'corta' }, 'VENTA_KEY_INVALIDA', 'sin una clave con cuerpo'],
    [{ direccion: billeteras.UNICA }, 'DIRECCION_DE_LA_CASA', 'pagando a la caja de la casa'],
    [{ direccion: Object.keys(billeteras.RETIRADAS)[0] }, 'DIRECCION_DE_LA_CASA', 'pagando a una billetera retirada'],
  ];
  for (const [cambio, esperado, que] of casos) {
    let c = null;
    try { await venta.vender(u, { ...base, ventaKey: clave(), ...cambio }); } catch (e) { c = e.codigo; }
    comprobar(c === esperado, `${que} → ${esperado}`, c);
  }
  comprobar(pagos.length === 0, 'y ninguna de esas firmó nada', String(pagos.length));

  // El tamiz de sanciones sobre quien COBRA.
  const sucia = afuera();
  sancionadas.add(sucia.toLowerCase());
  let cs = null;
  try { await venta.vender(u, { ...base, ventaKey: clave(), direccion: sucia }); } catch (e) { cs = e.codigo; }
  comprobar(cs === 'DIRECCION_SANCIONADA', 'una dirección sancionada no cobra', cs);
  sancionadas.delete(sucia.toLowerCase());
}

decir('vender de verdad: cobra el ORIGEN y paga el USDT');
{
  const u = await persona({ origen: (500n * 10n ** 18n).toString() });
  const destino = afuera();
  const antes = pagos.length;
  const v = await venta.vender(u, {
    origenWei: (100n * 10n ** 18n).toString(), red: BSC, direccion: destino, ventaKey: clave(),
  });
  comprobar(v.estado === 'pagada' && v.hash, 'la venta queda pagada, con su hash', `${v.estado} ${v.hash}`);
  comprobar(pagos.length - antes === 1, 'y se firmó UNA vez', String(pagos.length - antes));
  comprobar(pagos.at(-1).a === destino, 'a la dirección que se pidió');
  comprobar(pagos.at(-1).crudo === v.netoCanonico, 'por el neto, no por el bruto (BSC tiene 18 decimales)', `${pagos.at(-1).crudo} vs ${v.netoCanonico}`);

  const quedan = await saldoDe(u._id);
  comprobar(quedan === 400n * 10n ** 18n, 'y se le debitaron exactamente los 100 ORIGEN', quedan.toString());
}

decir('pagar dos veces es imposible');
{
  const u = await persona();
  const k = clave();
  const args = { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: k };
  const antes = pagos.length;
  const a = await venta.vender(u, args);
  const b = await venta.vender(u, args);           // el reintento del navegador
  comprobar(pagos.length - antes === 1, 'la misma clave no firma dos veces', String(pagos.length - antes));
  comprobar(a.id === b.id, 'y devuelve la misma venta', `${a.id} / ${b.id}`);

  // Dos peticiones a la vez, que es el caso que un `if` no cubre.
  const u2 = await persona();
  const k2 = clave();
  const args2 = { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: k2 };
  const antes2 = pagos.length;
  await Promise.allSettled([venta.vender(u2, args2), venta.vender(u2, args2)]);
  comprobar(pagos.length - antes2 === 1, 'ni siquiera lanzadas a la vez', String(pagos.length - antes2));
}

decir('no se paga lo que no se puede cobrar');
{
  const pobre = await persona({ origen: (5n * 10n ** 18n).toString() });
  const antes = pagos.length;
  let c = null;
  try {
    await venta.vender(pobre, { origenWei: (100n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() });
  } catch (e) { c = e.codigo; }
  comprobar(c === 'SALDO_INSUFICIENTE', 'sin ORIGEN suficiente, la venta se niega', c);
  comprobar(pagos.length === antes, 'y NO se firmó nada', String(pagos.length - antes));
  const v = await venta.OrdenVenta.findOne({ userId: String(pobre._id) }).sort({ en: -1 }).lean();
  comprobar(v.estado === 'fallida', 'la fila queda fallida, no pagando', `${v.estado}: ${v.motivo}`);
}

decir('no se paga más de lo que hay en la caja');
{
  const u = await persona({ origen: (10_000n * 10n ** 18n).toString() });
  const guardada = CAJA;
  CAJA = 50n * 10n ** 18n;                          // 50 USDT en la caja
  const antes = pagos.length;
  let c = null;
  try {
    // 100 ORIGEN son ~260 USDT: no caben.
    await venta.vender(u, { origenWei: (100n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() });
  } catch (e) { c = e.codigo; }
  comprobar(c === 'SIN_CAJA', 'con la caja corta, la venta se niega', c);
  comprobar(pagos.length === antes, 'y no se firma una transferencia a medias');

  // Y lo que YA está comprometido cuenta: con la caja justa para una, la
  // segunda no entra mientras la primera siga en duda.
  CAJA = 30n * 10n ** 18n;
  SIGUIENTE = Object.assign(new Error('se agotó el plazo'), { code: 'TIMEOUT' });
  let dudosa = null;
  try {
    await venta.vender(u, { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() });
  } catch (e) { dudosa = e.codigo; }
  comprobar(dudosa === 'EN_DUDA', 'un pago sin respuesta queda EN DUDA', dudosa);
  let c2 = null;
  try {
    await venta.vender(u, { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() });
  } catch (e) { c2 = e.codigo; }
  comprobar(c2 === 'SIN_CAJA', 'y lo que está en duda sigue comprometiendo la caja', c2);
  CAJA = guardada;
}

decir('sin gas en la pagadora no se acepta la venta');
{
  /* La pagadora paga desde si misma y su moneda nativa la pone una persona:
     nadie la fondea sola. Sin gas, la firma revienta DESPUES de confirmar, y
     aunque el ORIGEN vuelva, quien vendio ya se llevo el rechazo. */
  const u = await persona();
  const guardado = GAS_NATIVO;
  GAS_NATIVO = 0n;
  const antes = pagos.length;
  let c = null;
  try {
    await venta.vender(u, { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() });
  } catch (e) { c = e.codigo; }
  comprobar(c === 'SIN_GAS', 'sin gas, la venta se niega antes de tocar el saldo', c);
  comprobar(pagos.length === antes, 'y no se intenta firmar');
  comprobar(await saldoDe(u._id) === 1000n * 10n ** 18n, 'el ORIGEN ni se toca', String(await saldoDe(u._id)));
  GAS_NATIVO = guardado;
}

decir('cuando el pago no sale, el ORIGEN se devuelve');
{
  const u = await persona({ origen: (100n * 10n ** 18n).toString() });
  // Un error ANTERIOR a la firma: el nodo la rechazó y no hay nada vivo.
  SIGUIENTE = Object.assign(new Error('sin fondos para el gas'), { code: 'INSUFFICIENT_FUNDS' });
  let c = null;
  try {
    await venta.vender(u, { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() });
  } catch (e) { c = e.codigo; }
  comprobar(c === 'NO_SE_PUDO_PAGAR', 'se dice que no se pudo pagar', c);
  comprobar(await saldoDe(u._id) === 100n * 10n ** 18n, 'y el ORIGEN volvió entero a su cuenta', String(await saldoDe(u._id)));
  const v = await venta.OrdenVenta.findOne({ userId: String(u._id) }).sort({ en: -1 }).lean();
  comprobar(v.estado === 'fallida', 'la venta queda fallida', v.estado);
}

decir('cuando el pago queda en duda, el ORIGEN NO se devuelve');
{
  // Es la decisión más importante de este archivo: si puede haber una
  // transacción viva, devolver el ORIGEN sería pagar Y no cobrar.
  const u = await persona({ origen: (100n * 10n ** 18n).toString() });
  SIGUIENTE = Object.assign(new Error('la respuesta no llegó'), { code: 'SERVER_ERROR' });
  let c = null;
  try {
    await venta.vender(u, { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() });
  } catch (e) { c = e.codigo; }
  comprobar(c === 'EN_DUDA', 'se dice que quedó en duda', c);
  comprobar(await saldoDe(u._id) === 90n * 10n ** 18n, 'y el ORIGEN sigue debitado: lo mira una persona', String(await saldoDe(u._id)));
  const v = await venta.OrdenVenta.findOne({ userId: String(u._id) }).sort({ en: -1 }).lean();
  comprobar(v.estado === 'en-duda', 'la venta queda en duda');
  const e = await venta.estado();
  comprobar(e.quierenOjos.some((x) => x.id === String(v._id)), 'y sale en el panel, en «quieren ojos»');
}

decir('apagada, y sin llave');
{
  const u = await persona();
  const args = { origenWei: (10n * 10n ** 18n).toString(), red: BSC, direccion: afuera(), ventaKey: clave() };

  process.env.VENTAS = '0';
  let c = null;
  try { await venta.vender(u, args); } catch (e) { c = e.codigo; }
  comprobar(c === 'VENTA_APAGADA', 'con VENTAS != 1 no se vende', c);
  comprobar(venta.encendida() === false, 'y la casa lo dice');
  process.env.VENTAS = '1';

  const antes = pagoUsdt.configurada;
  pagoUsdt.configurada = () => ({ ok: false, motivo: 'falta ORDENEX_VENTA_KEY', direccion: billeteras.UNICA });
  let c2 = null;
  try { await venta.vender(u, { ...args, ventaKey: clave() }); } catch (e) { c2 = e.codigo; }
  comprobar(c2 === 'VENTA_SIN_BILLETERA', 'sin llave de la caja tampoco', c2);
  pagoUsdt.configurada = antes;
}

decir('la llave de la caja tiene que ser LA de la caja');
{
  // Esto no se finge: es la comprobación de verdad de lib/pagoUsdt.js, que es
  // la que impide pagar con el dinero de otro entorno.
  const real = (await import('../lib/pagoUsdt.js')).default;
  const guardada = process.env.ORDENEX_VENTA_KEY;

  delete process.env.ORDENEX_VENTA_KEY;
  comprobar(real.pagadora(null).ok === false, 'sin llave, no se firma');

  process.env.ORDENEX_VENTA_KEY = Wallet.createRandom().privateKey;
  const otra = real.pagadora(null);
  comprobar(otra.ok === false && /no es la de/.test(otra.motivo),
    'una llave de OTRA billetera no firma, aunque sea válida', otra.motivo);

  if (guardada === undefined) delete process.env.ORDENEX_VENTA_KEY; else process.env.ORDENEX_VENTA_KEY = guardada;
}

console.log(`\n${fallos ? `FALLARON ${fallos}` : 'Todo en verde'}`);
genesisFingido.close();
await mongoose.disconnect();
await servidor.stop();
process.exit(fallos ? 1 : 0);
