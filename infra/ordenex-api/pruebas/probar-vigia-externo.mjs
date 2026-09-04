/* El vigía multicadena de USDT, contra Mongo de verdad y una cadena fingida.
 *
 *   node pruebas/probar-vigia-externo.mjs
 *
 * Lo que se castiga es lo que se pierde para siempre si está mal: que la marca
 * de bloque NUNCA avance sobre una página que no se leyó entera, que el mismo
 * log no se anote dos veces, y que las claves de marca no se pisen con las del
 * vigía de compras — que compartiría colección y cada uno se saltaría los
 * bloques que leyó el otro.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}

const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_prueba' });

const { Wallet, zeroPadValue, id: keccakId } = await import('ethers');
const M = (await import('../models/index.js')).default;
const { Usuario } = M;
const redes = (await import('../lib/redesUsdt.js')).default;
const decimales = (await import('../lib/decimales.js')).default;
const proveedores = (await import('../lib/proveedores.js')).default;
const vig = (await import('../lib/vigiaDepositosExternos.js')).default;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

await vig.DepositoExterno.syncIndexes();

// ── Los decimales, fingidos: esta prueba no sale a ninguna cadena ───────────
const PORCONTRATO = new Map();
for (const [red, acts] of Object.entries(decimales.ESPERADOS)) {
  for (const [s, f] of Object.entries(acts)) if (f.contrato) PORCONTRATO.set(f.contrato.toLowerCase(), { red: Number(red), s });
}
await decimales.verificar({
  proveedorDe: async () => ({
    call: async (tx) => {
      const q = PORCONTRATO.get(String(tx.to).toLowerCase());
      const d = q.red === 137 || q.red === 1 ? (q.s === 'USDT' ? 6 : 18) : 18;
      return '0x' + BigInt(d).toString(16).padStart(64, '0');
    },
  }),
  plazoMs: 2000,
});
comprobar(decimales.listo(137) && decimales.listo(56), 'los decimales quedaron comprobados para la prueba');

// ── La cadena fingida ───────────────────────────────────────────────────────
const TEMA = redes.TEMA_TRANSFER;
const REMITENTE = '0x1111111111111111111111111111111111111111';

function log({ a, monto, bloque, hash, index = 0 }) {
  return {
    topics: [TEMA, zeroPadValue(REMITENTE, 32), zeroPadValue(a, 32)],
    data: '0x' + BigInt(monto).toString(16).padStart(64, '0'),
    blockNumber: bloque,
    transactionHash: hash,
    index,
  };
}

function cadenaFingida({ punta = 1000, logs = [], topeRango = null, falla = null, finalized = null }) {
  const pedidos = [];
  return {
    pedidos,
    getBlockNumber: async () => punta,
    getBlock: async (x) => {
      if (x === 'finalized') return finalized === null ? null : { number: finalized };
      return { number: x, timestamp: 1_750_000_000 + Number(x) };
    },
    getLogs: async ({ fromBlock, toBlock, topics }) => {
      pedidos.push([fromBlock, toBlock]);
      if (falla && falla(fromBlock, toBlock)) throw new Error('el nodo se cayó');
      if (topeRango && toBlock - fromBlock + 1 > topeRango) {
        const e = new Error('query returned more than 10000 results');
        e.code = -32005;
        throw e;
      }
      const buscadas = new Set((topics[2] || []).map((t) => String(t).toLowerCase()));
      return logs.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock
        && buscadas.has(String(l.topics[2]).toLowerCase()));
    },
  };
}

const proveedorReal = proveedores.proveedorDe;
async function conCadena(pv, cuerpo) {
  proveedores.proveedorDe = async () => pv;
  try { return await cuerpo(); } finally { proveedores.proveedorDe = proveedorReal; }
}

async function limpiar() {
  await vig.DepositoExterno.deleteMany({});
  await vig.Marca.deleteMany({});
  vig._adentro.rangoDe.clear();
}

let n = 0;
async function usuarioCon(direccion) {
  return Usuario.create({ gid: `gid-${++n}-${Date.now()}`, direccionDeposito: direccion });
}

decir('las claves de marca NO se pisan con las del vigía de compras');
{
  comprobar(vig.claveMarca(137) === 'dep:polygon' && vig.claveMarca(56) === 'dep:bsc',
    'llevan prefijo `dep:`, que es lo que las separa de las de vigiaCompras',
    `${vig.claveMarca(137)} / ${vig.claveMarca(56)}`);
  const fuente = await (await import('node:fs/promises'))
    .readFile(new URL('../lib/vigiaCompras.js', import.meta.url), 'utf8');
  comprobar(/clave: red\.clave/.test(fuente),
    'y vigiaCompras sigue usando la clave pelada: comparten colección, no claves');
}

decir('ve un depósito y lo anota con las dos escalas');
await limpiar();
{
  const w = Wallet.createRandom();
  const u = await usuarioCon(w.address);
  const pv = cadenaFingida({ punta: 1000, logs: [log({ a: w.address, monto: 100_000000n, bloque: 800, hash: '0xaa' })] });
  await conCadena(pv, () => vig.vuelta(137));
  const d = await vig.DepositoExterno.findOne({ txHash: '0xaa' }).lean();
  comprobar(d && d.userId === String(u._id), 'el depósito queda a nombre de su dueño');
  comprobar(d.crudo === '100000000', 'se guarda el crudo tal como vino de la cadena');
  comprobar(d.cantidad === (100n * 10n ** 18n).toString(),
    'y el canónico a 18 — cien dólares, no una millonésima', d.cantidad);
  comprobar(d.decimales === 6, 'con los decimales que se leyeron de esa red');
  comprobar(d.de.toLowerCase() === REMITENTE, 'y el remitente, que es lo que irá al tamiz');
  comprobar(d.enCadena instanceof Date && d.enCadena.getTime() === (1_750_000_000 + 800) * 1000,
    'la hora es la DEL BLOQUE, no la de cuando lo vimos');
  comprobar(d.estado === 'visto', 'queda en `visto`: este vigía no acredita nada');
}

decir('el mismo log dos veces se anota UNA');
{
  const antes = await vig.DepositoExterno.countDocuments({});
  await vig.Marca.deleteMany({}); // se rebobina para que lo vuelva a leer
  const w = await vig.DepositoExterno.findOne({ txHash: '0xaa' }).lean();
  const pv = cadenaFingida({ punta: 1000, logs: [log({ a: w.direccion, monto: 100_000000n, bloque: 800, hash: '0xaa' })] });
  await conCadena(pv, () => vig.vuelta(137));
  comprobar(await vig.DepositoExterno.countDocuments({}) === antes,
    'el índice único lo impide: releer no duplica');
}

decir('LA REGLA QUE MÁS IMPORTA: la marca no avanza sobre lo que no se leyó');
await limpiar();
{
  const w = Wallet.createRandom();
  await usuarioCon(w.address);
  // La cadena falla en cualquier página que TOQUE el bloque 700. Se comprueba
  // contra `b` y no contra `a`: una página que empieza en 500 y termina en 940
  // incluye el 700, y mirar solo el principio dejaba pasar la página entera —
  // que era el fallo de esta misma prueba antes de escribirla bien.
  const pv = cadenaFingida({ punta: 1000, falla: (a, b) => b >= 700 });
  const r = await conCadena(pv, () => vig.vuelta(137));
  const marca = await vig.Marca.findOne({ clave: 'dep:polygon' }).lean();
  comprobar(!r.ok, 'la vuelta se reporta como fallida', JSON.stringify(r));
  comprobar(marca && marca.bloque < 700,
    'y la marca quedó ANTES del rango que no se pudo leer — no en el final',
    `marca=${marca?.bloque}`);
  comprobar(marca.bloque === 499,
    'exactamente al final de la última página buena', String(marca.bloque));
  comprobar(await vig.DepositoExterno.countDocuments({}) === 0,
    'y no se anotó nada de la página que falló');
}

decir('un rango muy grande se parte a la mitad, y no se pierde ningún log');
await limpiar();
{
  const w = Wallet.createRandom();
  await usuarioCon(w.address);
  const logs = [];
  for (let i = 0; i < 8; i++) logs.push(log({ a: w.address, monto: 1_000000n, bloque: 500 + i * 50, hash: '0xb' + i }));
  const pv = cadenaFingida({ punta: 1000, logs, topeRango: 120 });
  const r = await conCadena(pv, () => vig.vuelta(137));
  comprobar(r.ok, 'la vuelta termina bien aunque el nodo rechace rangos grandes');
  comprobar(await vig.DepositoExterno.countDocuments({}) === 8,
    'los ocho depósitos aparecen, ni uno perdido',
    String(await vig.DepositoExterno.countDocuments({})));
  comprobar(pv.pedidos.some(([a, b]) => b - a + 1 <= 120), 'y de verdad se partió el rango');
}

decir('un RPC que va por detrás de la marca se descarta');
await limpiar();
{
  const w = Wallet.createRandom();
  await usuarioCon(w.address);
  await vig.Marca.create({ clave: 'dep:polygon', bloque: 900 });
  const pv = cadenaFingida({ punta: 500 }); // atrasado
  const r = await conCadena(pv, () => vig.vuelta(137));
  comprobar(!r.ok && /por detrás/.test(r.error),
    'no se le cree: avanzaría la marca sobre bloques que no vio', JSON.stringify(r));
  const marca = await vig.Marca.findOne({ clave: 'dep:polygon' }).lean();
  comprobar(marca.bloque === 900, 'y la marca no se movió');
}

decir('un log con destino ajeno se descarta aunque el nodo lo devuelva');
await limpiar();
{
  const mio = Wallet.createRandom();
  const ajeno = Wallet.createRandom();
  await usuarioCon(mio.address);
  const pv = cadenaFingida({ punta: 1000, logs: [log({ a: mio.address, monto: 5_000000n, bloque: 900, hash: '0xc1' })] });
  // El nodo miente: devuelve también uno que no se pidió.
  const original = pv.getLogs;
  pv.getLogs = async (f) => (await original(f)).concat(
    f.fromBlock <= 900 && f.toBlock >= 900 ? [log({ a: ajeno.address, monto: 9n, bloque: 900, hash: '0xc2' })] : []);
  await conCadena(pv, () => vig.vuelta(137));
  comprobar(await vig.DepositoExterno.countDocuments({}) === 1, 'solo se anota el nuestro');
  comprobar(!(await vig.DepositoExterno.findOne({ txHash: '0xc2' })), 'el ajeno no entra');
}

decir('sin decimales comprobados, esa cadena no se mira');
await limpiar();
{
  const w = Wallet.createRandom();
  await usuarioCon(w.address);
  decimales._adentro.olvidar();
  const pv = cadenaFingida({ punta: 1000, logs: [log({ a: w.address, monto: 100_000000n, bloque: 900, hash: '0xd1' })] });
  const r = await conCadena(pv, () => vig.vuelta(137));
  comprobar(!r.ok && /decimales/.test(r.error),
    'se niega a anotar cantidades en una unidad sin comprobar', JSON.stringify(r));
  comprobar(await vig.DepositoExterno.countDocuments({}) === 0, 'y no anotó nada');
}

decir('las confirmaciones salen del tiempo de bloque MEDIDO, no de una constante');
{
  redes._adentro.olvidar();
  const pv = {
    getBlockNumber: async () => 100000,
    // 0,75 s por bloque, como BSC hoy — no los 3 s de cuando se escribió el 30
    getBlock: async (x) => ({ number: x, timestamp: 1_750_000_000 + Math.round(Number(x) * 0.75) }),
  };
  await conCadena(pv, () => redes.medir(56));
  const b = redes.bloquesDe(56);
  comprobar(b >= 120, 'con bloques de 0,75s, 90s de espera son 120 bloques, no 30', String(b));
  comprobar(b > redes.REDES[56].pisoBloques,
    'y queda muy por encima del piso heredado de vigiaCompras');
  const e = redes.estado();
  comprobar(e[56].medido === true, 'el panel dice que se midió de verdad');
}

decir('el techo respeta el piso aunque el nodo mienta sobre `finalized`');
{
  const pv = {
    getBlockNumber: async () => 100000,
    getBlock: async (x) => (x === 'finalized' ? { number: 100000 } : { number: x, timestamp: 1 }),
  };
  const t = await redes.techo(pv, 137);
  comprobar(t <= 100000 - redes.bloquesDe(137),
    'un nodo que jura que finalized es la punta no nos hace leer la punta', String(t));
}

await mongoose.disconnect();
await servidor.stop();

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
