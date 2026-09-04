/* La compra de ORIGEN con USDT: el precio congelado y la entrega.
 *
 *   node pruebas/probar-compra.mjs
 *
 * Aquí sí hay cuentas, y son las que le importan a la persona: cuánto ORIGEN
 * recibe. Se prueba con los números de verdad —la onza a 4.493 dólares, el
 * ORIGEN a 2,626422— y contra la MISMA fórmula que hace la pantalla, porque
 * que las dos coincidan hasta el último wei es lo que hace que el número que
 * alguien vio antes de mandar sea el número que recibe.
 *
 * Y se prueba lo que no se ve: que la cantidad salga de la cadena y no de lo
 * cotizado, que una orden vencida no se entregue sola, y que entregar dos
 * veces sea imposible.
 *
 * Corre contra mongodb-memory-server. Si no está, se dice y se sale.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}

const { HDNodeWallet, Wallet, id: keccakId } = await import('ethers');

const FRASE = 'test test test test test test test test test test test junk';
process.env.ORDENEX_SEMILLA_DEPOSITOS = FRASE;
process.env.ORDENEX_SEMILLA_XPUB = HDNodeWallet.fromPhrase(FRASE, '', "m/44'/60'/0'/0").neuter().extendedKey;
process.env.ORDENEX_ADM = 'una-clave-de-pruebas-suficientemente-larga-1234';

// Un Genesis fingido, de verdad por HTTP. lib/genesis.js lee GENESIS_URL en
// CADA llamada justamente para esto (genesis.js:21-24), así que el tamiz de
// sanciones se prueba por el mismo camino que en producción y no por un
// atajo. Un tamiz que en las pruebas no existe es un tamiz que nadie prueba.
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
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_compra' });

const { Usuario } = (await import('../models/index.js')).default;
const dep = (await import('../lib/deposito.js')).default;
const decimales = (await import('../lib/decimales.js')).default;
const billeteras = (await import('../lib/billeteras.js')).default;
const terminos = (await import('../lib/terminos.js')).default;
const { DepositoExterno } = (await import('../lib/vigiaDepositosExternos.js')).default;
const compra = (await import('../lib/compra.js')).default;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

await Usuario.syncIndexes();
await DepositoExterno.syncIndexes();
await compra.OrdenCompra.syncIndexes();

const POLYGON = 137;
const REALES = { 137: { USDT: 6 }, 56: { USDT: 18 }, 1: { USDT: 6 } };
function cadenaFingida() {
  const porContrato = new Map();
  for (const [red, activos] of Object.entries(decimales.ESPERADOS)) {
    for (const [s, f] of Object.entries(activos)) {
      if (f.contrato) porContrato.set(f.contrato.toLowerCase(), { red: Number(red), s });
    }
  }
  return async () => ({
    call: async (tx) => {
      const q = porContrato.get(String(tx.to).toLowerCase());
      if (!q) throw new Error(`contrato desconocido ${tx.to}`);
      return '0x' + BigInt(REALES[q.red][q.s]).toString(16).padStart(64, '0');
    },
  });
}
await decimales.verificar({ proveedorDe: cadenaFingida(), plazoMs: 3000 });

// El precio: el de verdad del día que se armó todo esto. La onza a 4.493,00 →
// el gramin (onza / 31,1035 / 55) sale 2,626422.
const ORO = 4493.00;
const ORIGEN_USD = ORO / 31.1035 / 55;
const PRECIO_WEI = (BigInt(Math.round(ORIGEN_USD * 1e6)) * (10n ** 12n)).toString();

let n = 0;
async function persona({ conWallet = true, conTerminos = true } = {}) {
  const u = await Usuario.create({
    gid: `gid-c-${++n}-${Date.now()}`,
    direccionWallet: conWallet ? Wallet.createRandom().address : null,
    terminosVersion: conTerminos ? terminos.TERMINOS_VERSION : null,
  });
  await dep.asegurarDireccion(u);
  return Usuario.findById(u._id).lean();
}

const o = compra._adentro.origenWeiDe;

decir('la cuenta: la misma que la pantalla, hasta el último wei');
{
  // La fórmula de la pantalla (comprar.js): micro * 10^30 / precioWei.
  const deLaPantalla = (micro, precio) => ((BigInt(micro) * (10n ** 30n)) / BigInt(precio)).toString();
  for (const usd of ['100', '97.5', '1', '4999.999999', '0.000001']) {
    const micro = BigInt(Math.round(Number(usd) * 1e6));
    const canonico = (micro * (10n ** 12n)).toString();
    comprobar(o(canonico, PRECIO_WEI) === deLaPantalla(micro, PRECIO_WEI),
      `${usd} USDT da lo mismo en las dos fórmulas`, o(canonico, PRECIO_WEI));
  }
  // El número que ya conocíamos: 100 USDT a 2,626422 son 38,0746 ORIGEN.
  const cien = o((100n * 10n ** 18n).toString(), PRECIO_WEI);
  comprobar(cien.startsWith('380746'), '100 USDT → 38,0746… ORIGEN', cien);
  comprobar(BigInt(cien) < 381n * 10n ** 17n, 'y NUNCA se entrega de más: la división trunca');
}

decir('lo que se congela es el precio, no la cantidad');
{
  const u = await persona();
  const orden = await compra.abrir(u, {
    montoMicro: '100000000', cadena: POLYGON,
    aceptoRecalculo: true, reglaRecalculoVersion: compra.REGLA_RECALCULO,
  });
  comprobar(orden.direccion === u.direccionDeposito, 'la orden trae la dirección donde hay que depositar');
  comprobar(orden.paso === 1, 'y empieza en el primer paso del riel', String(orden.paso));
  comprobar(orden.restanSeg > 0 && orden.restanSeg <= compra.PLAZO_SEG, 'con su cuenta atrás', String(orden.restanSeg));

  // Llega MENOS de lo cotizado: la billetera de la persona le cobró comisión.
  // Recibe ORIGEN por lo que llegó, al precio que se le prometió.
  const llegaron = '97500000'; // 97,5 USDT en 6 decimales
  const d = await DepositoExterno.create({
    cadena: POLYGON, txHash: keccakId(`t${n}`), logIndex: 0, bloque: 1, enCadena: new Date(),
    de: Wallet.createRandom().address, direccion: u.direccionDeposito, userId: String(u._id),
    crudo: llegaron, decimales: 6, cantidad: decimales.aCanonico(llegaron, POLYGON, 'USDT'),
  });
  const r = await compra.atender(d);
  comprobar(r.ok && r.estado === 'lista', 'el depósito encuentra su orden', r.estado);

  const leida = await compra.OrdenCompra.findById(r.ordenId).lean();
  comprobar(leida.porQuePrecio === 'congelado', 'y se aplica el precio congelado', leida.porQuePrecio);
  comprobar(leida.precioAplicadoWei === leida.precioWei, 'que es exactamente el de la orden');
  comprobar(leida.origenWei === o(d.cantidad, leida.precioWei),
    'y el ORIGEN sale de lo que LLEGÓ, no de lo cotizado');
  comprobar(BigInt(leida.origenWei) < BigInt(leida.origenWeiCotizado),
    'menos dinero, menos ORIGEN: no se regala la diferencia',
    `${leida.origenWei} vs ${leida.origenWeiCotizado}`);
}

decir('el plazo vencido no se entrega solo');
{
  const u = await persona();
  const orden = await compra.OrdenCompra.create({
    userId: String(u._id), cadena: POLYGON, direccion: u.direccionDeposito,
    aWallet: u.direccionWallet, montoMicro: '100000000', precioWei: PRECIO_WEI,
    origenWeiCotizado: o((100n * 10n ** 18n).toString(), PRECIO_WEI),
    plazoSeg: 900, venceEn: new Date(Date.now() - 60_000), // venció hace un minuto
    reglaRecalculo: compra.REGLA_RECALCULO,
    createdAt: new Date(Date.now() - 3600_000),
  });
  const crudo = '100000000';
  const d = await DepositoExterno.create({
    cadena: POLYGON, txHash: keccakId(`v${n}`), logIndex: 0, bloque: 2, enCadena: new Date(),
    de: Wallet.createRandom().address, direccion: u.direccionDeposito, userId: String(u._id),
    crudo, decimales: 6, cantidad: decimales.aCanonico(crudo, POLYGON, 'USDT'),
  });
  const r = await compra.atender(d);
  comprobar(r.estado === 'recalculada', 'la orden vencida pasa a recalculada', r.estado);

  const leida = await compra.OrdenCompra.findById(orden._id).lean();
  comprobar(leida.porQuePrecio === 'recalculado', 'con el precio de ahora', leida.porQuePrecio);
  comprobar(/plazo/.test(leida.motivo || ''), 'y diciendo por qué', leida.motivo);

  // LA PROMESA DE LA PANTALLA: «te avisamos antes de entregarte nada». Una
  // orden recalculada NO entra en la entrega hasta que la persona diga que sí.
  const e = await compra.entregar(orden._id);
  comprobar(e.ok === false && e.estado === 'no-tocaba',
    'y NO se entrega mientras no la confirmen', e.estado);

  const vista = await compra.ver(String(u._id), String(orden._id));
  comprobar(vista.recalculo !== null, 'la pantalla recibe el número nuevo para enseñarlo');
  comprobar(vista.recalculo.cotizado === leida.origenWeiCotizado, 'y el viejo, para poder comparar');

  const tras = await compra.confirmarRecalculo(String(u._id), String(orden._id));
  comprobar(tras.estado === 'esperando', 'confirmado, vuelve a la fila de entrega', tras.estado);
  // Y no se puede confirmar dos veces.
  let dosVeces = false;
  try { await compra.confirmarRecalculo(String(u._id), String(orden._id)); } catch { dosVeces = true; }
  comprobar(dosVeces, 'confirmar dos veces no hace nada');
}

decir('un depósito sin orden ninguna');
{
  const u = await persona();
  const crudo = '50000000';
  const d = await DepositoExterno.create({
    cadena: POLYGON, txHash: keccakId(`s${n}`), logIndex: 0, bloque: 3, enCadena: new Date(),
    de: Wallet.createRandom().address, direccion: u.direccionDeposito, userId: String(u._id),
    crudo, decimales: 6, cantidad: decimales.aCanonico(crudo, POLYGON, 'USDT'),
  });
  const r = await compra.atender(d);
  comprobar(r.ok && r.estado === 'recalculada',
    'se le abre una orden y se le pregunta: el dinero nunca queda sin dueño', r.estado);
  const nueva = await compra.OrdenCompra.findById(r.ordenId).lean();
  comprobar(/sin una orden/.test(nueva.motivo || ''), 'diciendo que llegó sin orden', nueva.motivo);
  comprobar(nueva.aWallet === u.direccionWallet, 'y apuntando a su billetera');
}

decir('el mismo depósito no se atiende dos veces');
{
  const u = await persona();
  const crudo = '10000000';
  const d = await DepositoExterno.create({
    cadena: POLYGON, txHash: keccakId(`d${n}`), logIndex: 0, bloque: 4, enCadena: new Date(),
    de: Wallet.createRandom().address, direccion: u.direccionDeposito, userId: String(u._id),
    crudo, decimales: 6, cantidad: decimales.aCanonico(crudo, POLYGON, 'USDT'),
  });
  const a = await compra.atender(d);
  const b = await compra.atender(d);
  comprobar(b.estado === 'ya-atendido', 'la segunda vez dice que ya estaba', b.estado);
  comprobar(b.ordenId === a.ordenId, 'y es la misma orden, no una nueva');
}

decir('entregar es de una sola vez');
{
  const u = await persona();
  const orden = await compra.OrdenCompra.create({
    userId: String(u._id), cadena: POLYGON, direccion: u.direccionDeposito,
    aWallet: u.direccionWallet, montoMicro: '1000000', precioWei: PRECIO_WEI,
    origenWeiCotizado: '1', plazoSeg: 900, venceEn: new Date(Date.now() + 900_000),
    reglaRecalculo: compra.REGLA_RECALCULO,
    depositoId: new mongoose.Types.ObjectId(), origenWei: '1000000000000000000',
  });
  // Sin ORDENEX_HOT_KEY no hay entrega — y eso es lo correcto. Lo que se prueba
  // aquí es que el paso a 'entregando' lo gana UNO SOLO: los dos intentos
  // simultáneos no pueden acabar los dos firmando.
  const [x, y] = await Promise.all([compra.entregar(orden._id), compra.entregar(orden._id)]);
  const noTocaba = [x, y].filter((r) => r.estado === 'no-tocaba').length;
  comprobar(noTocaba === 1, 'de dos intentos a la vez, uno se queda fuera', `${x.estado} / ${y.estado}`);
  const leida = await compra.OrdenCompra.findById(orden._id).lean();
  comprobar(leida.estado === 'fallida' && /no está configurada/.test(leida.motivo || ''),
    'y sin billetera de entrega la orden queda fallida, no entregada', `${leida.estado}: ${leida.motivo}`);
  comprobar(leida.hash === null, 'sin hash: no salió nada');
}

decir('las guardas de abrir');
{
  const sinWallet = await persona({ conWallet: false });
  let codigo = null;
  try {
    await compra.abrir(sinWallet, { montoMicro: '1000000', cadena: POLYGON,
      aceptoRecalculo: true, reglaRecalculoVersion: compra.REGLA_RECALCULO });
  } catch (e) { codigo = e.codigo; }
  comprobar(codigo === 'SIN_DIRECCION_WALLET',
    'sin billetera de Veta Wallet la orden NO nace', codigo);

  const u = await persona();
  const casos = [
    [{ montoMicro: '0' }, 'MONTO_INVALIDO', 'un monto de cero'],
    [{ montoMicro: '-5' }, 'MONTO_INVALIDO', 'un monto negativo'],
    [{ montoMicro: '1.5' }, 'MONTO_INVALIDO', 'un monto con coma'],
    [{ cadena: 999 }, 'RED_INVALIDA', 'una red que no recibe USDT'],
    [{ aceptoRecalculo: false }, 'FALTA_ACEPTAR_RECALCULO', 'sin aceptar la regla de recálculo'],
    [{ reglaRecalculoVersion: 'vieja' }, 'FALTA_ACEPTAR_RECALCULO', 'aceptando una versión vieja de la regla'],
  ];
  for (const [cambio, esperado, que] of casos) {
    let c = null;
    try {
      await compra.abrir(u, { montoMicro: '1000000', cadena: POLYGON, aceptoRecalculo: true,
        reglaRecalculoVersion: compra.REGLA_RECALCULO, ...cambio });
    } catch (e) { c = e.codigo; }
    comprobar(c === esperado, `${que} → ${esperado}`, c);
  }

  // Una billetera de la casa no puede comprar: mandarse ORIGEN a uno mismo y
  // anotarlo como entregado es un descuadre que después no encuentra nadie.
  const dela = await Usuario.create({ gid: `gid-casa-${Date.now()}`, direccionWallet: billeteras.UNICA,
    terminosVersion: terminos.TERMINOS_VERSION });
  await dep.asegurarDireccion(dela);
  let cc = null;
  try {
    await compra.abrir(await Usuario.findById(dela._id).lean(), { montoMicro: '1000000', cadena: POLYGON,
      aceptoRecalculo: true, reglaRecalculoVersion: compra.REGLA_RECALCULO });
  } catch (e) { cc = e.codigo; }
  comprobar(cc === 'WALLET_DE_LA_CASA', 'una billetera de la casa no puede comprar', cc);
}

decir('una orden es de quien la pidió');
{
  const a = await persona();
  const b = await persona();
  const orden = await compra.abrir(a, { montoMicro: '1000000', cadena: POLYGON,
    aceptoRecalculo: true, reglaRecalculoVersion: compra.REGLA_RECALCULO });
  let codigo = null;
  try { await compra.ver(String(b._id), orden.id); } catch (e) { codigo = e.codigo; }
  comprobar(codigo === 'NO_EXISTE', 'otra persona no puede ni verla', codigo);
  let c2 = null;
  try { await compra.cancelar(String(b._id), orden.id); } catch (e) { c2 = e.codigo; }
  comprobar(c2 === 'NO_SE_PUEDE_CANCELAR', 'ni cancelarla', c2);
  const mia = await compra.ver(String(a._id), orden.id);
  comprobar(mia.id === orden.id, 'y su dueña sí');
}

decir('cancelar solo lo que no tiene dinero encima');
{
  const u = await persona();
  const orden = await compra.abrir(u, { montoMicro: '1000000', cadena: POLYGON,
    aceptoRecalculo: true, reglaRecalculoVersion: compra.REGLA_RECALCULO });
  await compra.OrdenCompra.updateOne({ _id: orden.id }, { depositoId: new mongoose.Types.ObjectId() });
  let codigo = null;
  try { await compra.cancelar(String(u._id), orden.id); } catch (e) { codigo = e.codigo; }
  comprobar(codigo === 'NO_SE_PUEDE_CANCELAR',
    'una orden con depósito NO se cancela: ese dinero ya llegó', codigo);
}

decir('el riel dice la verdad');
{
  const casos = [
    [{ estado: 'esperando', depositoId: null }, 1, 'esperando el depósito'],
    [{ estado: 'esperando', depositoId: 'x' }, 2, 'el depósito se vio'],
    [{ estado: 'entregando', depositoId: 'x' }, 3, 'entregando'],
    [{ estado: 'recalculada', depositoId: 'x' }, 3, 'esperando que confirmen'],
    [{ estado: 'entregada', depositoId: 'x' }, 4, 'entregado'],
  ];
  for (const [o2, esperado, que] of casos) {
    comprobar(compra._adentro.pasoDe(o2) === esperado, `${que} → paso ${esperado}`,
      String(compra._adentro.pasoDe(o2)));
  }
}

decir('el tamiz de sanciones');
{
  const u = await persona();
  const sucia = Wallet.createRandom().address;
  sancionadas.add(sucia.toLowerCase());
  const crudo = '20000000';
  const d = await DepositoExterno.create({
    cadena: POLYGON, txHash: keccakId(`x${n}`), logIndex: 0, bloque: 5, enCadena: new Date(),
    de: sucia, direccion: u.direccionDeposito, userId: String(u._id),
    crudo, decimales: 6, cantidad: decimales.aCanonico(crudo, POLYGON, 'USDT'),
  });
  const r = await compra.atender(d);
  comprobar(r.ok === false && r.estado === 'sancionado',
    'un depósito de origen sancionado no se atiende', r.estado);
  const leido = await DepositoExterno.findById(d._id).lean();
  comprobar(leido.estado === 'anulado', 'y el depósito queda anulado, no acreditado', leido.estado);
  const sinOrden = await compra.OrdenCompra.findOne({ depositoId: d._id }).lean();
  comprobar(sinOrden === null, 'sin abrirle orden ninguna');

  // Y si Genesis no contesta, TAMPOCO se atiende: un tamiz que no se pudo
  // hacer no es un tamiz aprobado. Es la misma regla que los retiros.
  const antes = process.env.GENESIS_URL;
  process.env.GENESIS_URL = 'http://127.0.0.1:1';
  const u2 = await persona();
  const d2 = await DepositoExterno.create({
    cadena: POLYGON, txHash: keccakId(`y${n}`), logIndex: 0, bloque: 6, enCadena: new Date(),
    de: Wallet.createRandom().address, direccion: u2.direccionDeposito, userId: String(u2._id),
    crudo, decimales: 6, cantidad: decimales.aCanonico(crudo, POLYGON, 'USDT'),
  });
  const r2 = await compra.atender(d2);
  comprobar(r2.ok === false && r2.estado === 'sin-tamiz',
    'si el tamiz no contesta, no se atiende: fail-closed', r2.estado);
  const d2Leido = await DepositoExterno.findById(d2._id).lean();
  comprobar(d2Leido.estado === 'visto', 'y el depósito NO se anula: se vuelve a intentar', d2Leido.estado);
  process.env.GENESIS_URL = antes;
}

console.log(`\n${fallos ? `FALLARON ${fallos}` : 'Todo en verde'}`);
genesisFingido.close();
await mongoose.disconnect();
await servidor.stop();
process.exit(fallos ? 1 : 0);
