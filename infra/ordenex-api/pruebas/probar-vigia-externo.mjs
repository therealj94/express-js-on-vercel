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
/* En una funcion porque hay pruebas mas abajo que OLVIDAN los decimales a
   proposito —para comprobar que sin ellos no se mira esa cadena— y las que
   vienen despues los necesitan otra vez. Repetir el bloque a mano fue lo que
   dejo tres pruebas nuevas en rojo por un motivo que no tenia nada que ver con
   lo que probaban. */
async function fingirDecimales() {
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
}
await fingirDecimales();
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

/* ══ UN NODO QUE CONTESTA Y NO SIRVE ═══════════════════════════════════════
 *
 * El 4 de septiembre, con esto recién desplegado, Ethereum y BSC llevaban
 * horas sin ver un bloque. Los nodos no estaban caídos: a `eth_chainId`
 * contestaban al instante y por la cadena correcta, así que pasaban la puerta
 * de proveedores.js y se quedaban elegidos. Lo que rechazaban era el getLogs:
 *
 *   403 · {"code":-32602,"message":"Archive requests require a personal token"}
 *
 * Sirvo la punta, no sirvo historia. Y el único criterio para cambiar de nodo
 * era «no contesta», así que el vigía se quedaba pegado al que lo rechazaba y
 * fallaba cada treinta segundos, en silencio, para siempre. La lista de
 * respaldo estaba escrita y era inalcanzable.
 *
 * Se prueban las dos mitades del arreglo: que se cambie de nodo, y que un
 * error de RANGO siga partiéndose en vez de gastar un nodo que sí sirve. */

/** Da un proveedor distinto en cada llamada, como haría la lista de respaldo. */
async function conCadenas(lista, cuerpo) {
  let i = 0;
  const usados = [];
  proveedores.proveedorDe = async () => {
    const pv = lista[Math.min(i, lista.length - 1)];
    usados.push(i); i += 1;
    return pv;
  };
  try { return { r: await cuerpo(), usados }; } finally { proveedores.proveedorDe = proveedorReal; }
}

/** Un nodo que sirve la punta y se niega a dar historia, como publicnode. */
function nodoSinArchivo({ punta = 1000, desdeBloque = 0 }) {
  return {
    getBlockNumber: async () => punta,
    getBlock: async (x) => (x === 'finalized' ? null : { number: x, timestamp: 1_750_000_000 + Number(x) }),
    getLogs: async ({ fromBlock }) => {
      if (fromBlock < desdeBloque) {
        const e = new Error('server response 403 Forbidden: Archive requests require a personal token');
        e.code = -32602;
        throw e;
      }
      return [];
    },
  };
}

await fingirDecimales();   // una prueba de mas arriba los olvido a proposito
decir('un nodo que sirve la punta y no la historia se descarta, y se usa el siguiente');
await limpiar();
{
  const w = Wallet.createRandom();
  const u = await usuarioCon(w.address);
  const malo = nodoSinArchivo({ punta: 1000, desdeBloque: 999 });   // solo la punta
  const bueno = cadenaFingida({ punta: 1000, logs: [log({ a: w.address, monto: 7_000000n, bloque: 800, hash: '0xe1' })] });
  const { r, usados } = await conCadenas([malo, bueno], () => vig.vuelta(137));

  comprobar(r.ok === true, 'la vuelta termina bien con el segundo nodo', JSON.stringify(r));
  comprobar(usados.length >= 2, 'se pidió proveedor más de una vez: hubo cambio', `pedidos: ${usados.length}`);
  const d = await vig.DepositoExterno.findOne({ txHash: '0xe1' }).lean();
  comprobar(!!d && d.userId === String(u._id),
    'y el depósito que el primer nodo escondía SÍ se anotó', d ? d.txHash : 'no se anotó');
}

decir('un error de RANGO no gasta un nodo: se parte la consulta, como antes');
await limpiar();
{
  const w = Wallet.createRandom();
  await usuarioCon(w.address);
  const logs = [log({ a: w.address, monto: 3_000000n, bloque: 850, hash: '0xe2' })];
  const pv = cadenaFingida({ punta: 1000, logs, topeRango: 120 });
  const { r, usados } = await conCadenas([pv], () => vig.vuelta(137));
  comprobar(r.ok === true, 'la vuelta sale bien partiendo el rango', JSON.stringify(r));
  /* Es la distinción que importa: «pediste demasiado» se arregla pidiendo
     menos, y descartar el nodo por eso tiraría uno que funciona. Un mismo
     mensaje puede encajar en los dos moldes —«limit exceeded» de un plan
     gratis— y por eso el de rango manda. */
  comprobar(usados.length === 1, 'y NO se cambió de nodo', `pedidos: ${usados.length}`);
  comprobar(!!(await vig.DepositoExterno.findOne({ txHash: '0xe2' }).lean()), 'el depósito se anotó');
}

decir('si NINGÚN nodo da historia, arranca mirando menos y lo dice');
await limpiar();
{
  const w = Wallet.createRandom();
  await usuarioCon(w.address);
  /* Ethereum el 4 de septiembre: no había un solo RPC público gratis que
     sirviera logs de hace dos horas. El vigía puede funcionar igual a partir
     de AHORA —la punta sí la dan—, y lo que no puede es recuperar el rato
     anterior al arranque. Antes se quedaba muerto; ahora acorta y AVISA. */
  const punta = 100000;
  const soloPunta = nodoSinArchivo({ punta, desdeBloque: punta - 200 });
  const avisos = [];
  const warnReal = console.warn;
  console.warn = (...a) => avisos.push(a.join(' '));
  let r;
  try { ({ r } = await conCadenas([soloPunta, soloPunta, soloPunta, soloPunta], () => vig.vuelta(1))); }
  finally { console.warn = warnReal; }

  comprobar(r.ok === true, 'la vuelta termina bien en vez de quedarse trabada', JSON.stringify(r));
  const marca = await vig.Marca.findOne({ clave: vig.claveMarca(1) }).lean();
  comprobar(!!marca, 'y deja marca, que es lo que hace que la vuelta siguiente ya sea barata');
  /* Callar esto sería lo peligroso: el síntoma de un arranque que se comió una
     hora de historia es alguien que depositó justo antes del despliegue y a
     quien nunca se le acreditó. */
  const aviso = avisos.find((t) => /ningún RPC sirve historia/i.test(t));
  comprobar(!!aviso, 'y AVISA de qué trozo de historia se quedó sin mirar', aviso || 'no avisó');
  comprobar(!!aviso && /RPC_ETHEREUM/.test(aviso),
    'diciendo con qué variable se arregla, sin que haya que buscarlo', aviso || '');
}

decir('esDeProveedor separa «este nodo no me sirve» de «pedí demasiado»');
{
  const { esDeProveedor, esDeRango } = vig._adentro;
  const archivo = Object.assign(new Error('403 Forbidden: Archive requests require a personal token'), { code: -32602 });
  comprobar(esDeProveedor(archivo) && !esDeRango(archivo), 'el 403 de archivo: cambiar de nodo');
  const rango = Object.assign(new Error('query returned more than 10000 results'), { code: -32005 });
  comprobar(esDeRango(rango), 'el de resultados: partir la consulta');
  const caido = new Error('el nodo se cayó');
  comprobar(!esDeProveedor(caido) && !esDeRango(caido),
    'y una caída no es ninguno de los dos: se reintenta la vuelta siguiente');
}

await mongoose.disconnect();
await servidor.stop();

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
