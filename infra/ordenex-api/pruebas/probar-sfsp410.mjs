/* SFSP-410 · la entrega de ORIGEN bajo demanda, contra los contratos DE VERDAD.
 *
 *   node pruebas/probar-sfsp410.mjs
 *
 * Levanta una cadena LOCAL (Hardhat en proceso, chainId 31337, sólo en
 * 127.0.0.1) con SFSPNativeVault y SFSPIssuanceController desplegados desde
 * los artefactos compilados de sfsp/contracts (pruebas/sfsp410/cadena-local.cjs),
 * y prueba lo que importa:
 *
 *   · interruptor APAGADO → el camino de siempre (la caliente), sin tocar SFSP;
 *   · ENCENDIDO → releaseOnDemand con la referencia de pago correcta, y sin
 *     mirar el inventario de la caliente;
 *   · la misma orden otra vez → OperationReplay tratado como "ya entregado";
 *   · cupo agotado → cola de gobierno, sin bucle;
 *   · destino que es cuenta interna → rechazado;
 *   · emitirToken (mintOnDemand), la llave que nunca aparece en un error, y la
 *     negativa a firmar en una cadena que no es la esperada.
 *
 * Ninguna red de verdad, ninguna llave de verdad: las llaves son aleatorias y
 * mueren con la cadena local. Si falta mongodb-memory-server o los contratos
 * no están compilados, se dice y se sale sin probar nada.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CONTRATOS = path.resolve(AQUI, '../../../sfsp/contracts');

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}
if (!fs.existsSync(path.join(CONTRATOS, 'node_modules', 'hardhat'))
    || !fs.existsSync(path.join(CONTRATOS, 'artifacts', 'src', 'SFSPNativeVault.sol', 'SFSPNativeVault.json'))) {
  console.log(`sfsp/contracts sin node_modules o sin compilar (${CONTRATOS}): esta prueba NO corrio y NO probo nada.`);
  process.exit(0);
}

const { Wallet, JsonRpcProvider, HDNodeWallet, keccak256, toUtf8Bytes, Interface, getAddress } = await import('ethers');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

// ── la cadena local ─────────────────────────────────────────────────────────
const hijo = spawn(process.execPath, [path.join(AQUI, 'sfsp410', 'cadena-local.cjs')], {
  env: { ...process.env, SFSP_CONTRATOS: CONTRATOS },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let errHijo = '';
hijo.stderr.on('data', (d) => { errHijo += d; });
const L = await new Promise((listo, falla) => {
  let buf = '';
  const t = setTimeout(() => falla(new Error(`la cadena local no arrancó en 120s\n${errHijo}`)), 120_000);
  hijo.stdout.on('data', (d) => {
    buf += d;
    const m = /SFSP410_LISTO (\{.*\})\n/.exec(buf);
    if (m) { clearTimeout(t); listo(JSON.parse(m[1])); }
  });
  hijo.on('exit', (c) => { clearTimeout(t); falla(new Error(`la cadena local salió (${c})\n${errHijo}`)); });
});
const apagarCadena = () => { try { hijo.stdin.end(); hijo.kill('SIGTERM'); } catch {} };

const cadenaLocal = new JsonRpcProvider(L.rpc, undefined, { cacheTimeout: -1 });
const saldo = async (a) => BigInt(await cadenaLocal.getBalance(a));
const ETH = 10n ** 18n;
const [ALICE, BOB] = L.elegibles.map((a) => getAddress(a));

// ── el entorno: TODO apunta a la cadena local ───────────────────────────────
const FRASE = 'test test test test test test test test test test test junk';
process.env.ORDENEX_SEMILLA_DEPOSITOS = FRASE;
process.env.ORDENEX_SEMILLA_XPUB = HDNodeWallet.fromPhrase(FRASE, '', "m/44'/60'/0'/0").neuter().extendedKey;
process.env.ORDENEX_ADM = 'una-clave-de-pruebas-suficientemente-larga-1234';
process.env.COMPRAS = '1';
process.env.ORDENEX_HOT_KEY = Wallet.createRandom().privateKey;
process.env.OG_CHAIN_PROVIDER = 'http://127.0.0.1:9';   // la caliente: jamás se toca
process.env.SFSP410_RPC = L.rpc;
process.env.SFSP410_CHAIN_ID = String(L.chainId);
process.env.SFSP410_VAULT_ADDRESS = L.vault;
process.env.SFSP410_ISSUANCE_ADDRESS = L.issuance;
process.env.SFSP410_ASSET_IDS = JSON.stringify({ AUKA: L.assetId });
process.env.SFSP410_ISSUER_KEY = L.emisorLlave;
delete process.env.SFSP410_EMISION;

const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_sfsp410' });

const { Usuario } = (await import('../models/index.js')).default;
const dep = (await import('../lib/deposito.js')).default;
const decimales = (await import('../lib/decimales.js')).default;
const terminos = (await import('../lib/terminos.js')).default;
const referencia = (await import('../lib/referencia.js')).default;
const compra = (await import('../lib/compra.js')).default;
const cadena = (await import('../lib/cadena5550.js')).default;
const sfsp410 = (await import('../lib/sfsp410.js')).default;
const adminRutas = (await import('../routes/admin.js')).default;

// La caliente, fingida y CONTADA: con SFSP410 encendido no se puede tocar.
let INVENTARIO = 10n ** 24n;
let enviadosCaliente = 0;
let lecturasCaliente = 0;
cadena.saldoDe = async () => { lecturasCaliente++; return { ok: true, wei: INVENTARIO.toString(), error: null }; };
cadena.enviarDesdeCaliente = async () => { enviadosCaliente++; return { hash: `0x${'cd'.repeat(32)}` }; };

// El precio, fijo: la prueba es de la entrega, no del feed del oro.
referencia.referenciaDe = async () => ({ usd: 4493, origenUsd: 4493 / 31.1035 / 55 });

// Las redes de fuera, verificadas contra una cadena fingida (como probar-compra).
{
  const REALES = { 137: { USDT: 6 }, 56: { USDT: 18 }, 1: { USDT: 6 } };
  const porContrato = new Map();
  for (const [red, activos] of Object.entries(decimales.ESPERADOS)) {
    for (const [s, f] of Object.entries(activos)) {
      if (f.contrato) porContrato.set(f.contrato.toLowerCase(), { red: Number(red), s });
    }
  }
  await decimales.verificar({
    proveedorDe: async () => ({
      call: async (tx) => {
        const q = porContrato.get(String(tx.to).toLowerCase());
        return '0x' + BigInt(REALES[q.red][q.s]).toString(16).padStart(64, '0');
      },
    }),
    plazoMs: 3000,
  });
}

await compra.OrdenCompra.syncIndexes();
await compra.PorPagar.syncIndexes();

let n = 0;
async function orden({ aWallet, origenWei }) {
  n++;
  return compra.OrdenCompra.create({
    userId: `u-${n}`, cadena: 137, direccion: Wallet.createRandom().address, aWallet,
    montoMicro: '1000000', precioWei: String(ETH), origenWeiCotizado: String(origenWei),
    plazoSeg: 900, venceEn: new Date(Date.now() + 900_000), reglaRecalculo: compra.REGLA_RECALCULO,
    depositoId: new mongoose.Types.ObjectId(), txDeposito: keccak256(toUtf8Bytes(`dep-${n}`)),
    cantidadUsdt: String(origenWei), origenWei: String(origenWei), precioAplicadoWei: String(ETH),
    porQuePrecio: 'congelado', estado: 'esperando',
  });
}
const leer = (id) => compra.OrdenCompra.findById(id).lean();
const IFACE = new Interface([
  'event NativeReleased(bytes32 indexed assetId, address indexed destination, bytes32 indexed operationId, uint256 amount, bytes32 route, bytes32 evidenceRoot)',
  'event MintOnDemand(bytes32 indexed assetId, address indexed destination, bytes32 indexed paymentRef, uint256 amount, uint256 usedInPeriod, uint64 periodIndex)',
  'function balanceOf(address) view returns (uint256)',
]);
async function liberaciones(ref) {
  const logs = await cadenaLocal.getLogs({
    address: L.vault, fromBlock: 0, toBlock: 'latest',
    topics: [IFACE.getEvent('NativeReleased').topicHash, null, null, ref],
  });
  return logs.map((l) => ({ ...IFACE.parseLog(l).args.toObject(), hash: l.transactionHash }));
}
async function esperarMinado(hash) {
  if (!hash) return null;
  return cadenaLocal.waitForTransaction(hash, 1, 30_000);
}

try {
  decir('interruptor APAGADO: el camino de siempre, byte a byte');
  {
    comprobar(sfsp410.activo() === false, 'sin SFSP410_EMISION, está apagado');
    process.env.SFSP410_EMISION = 'true';
    comprobar(sfsp410.activo() === false, "sólo '1' lo enciende ('true' no)");
    delete process.env.SFSP410_EMISION;

    const o = await orden({ aWallet: ALICE, origenWei: ETH });
    const antesAlice = await saldo(ALICE);
    const antesBoveda = await saldo(L.vault);
    const r = await compra.entregar(o._id);
    comprobar(r.ok && r.estado === 'entregada', 'la orden se entrega', JSON.stringify(r));
    comprobar(r.hash === `0x${'cd'.repeat(32)}`, 'con el hash del envío desde la caliente', r.hash);
    comprobar(enviadosCaliente === 1, 'firmó la caliente, una vez', String(enviadosCaliente));
    comprobar(lecturasCaliente === 1, 'y miró el inventario de la caliente antes', String(lecturasCaliente));
    comprobar((await saldo(ALICE)) === antesAlice && (await saldo(L.vault)) === antesBoveda,
      'la bóveda y la cadena SFSP ni se enteran');
    const ref = compra._adentro.referenciaDeOrden(o).paymentRef;
    comprobar((await liberaciones(ref)).length === 0, 'no hay ninguna liberación con esa referencia');

    // abrir, apagado: sigue mirando el inventario de la caliente.
    const u = await Usuario.create({
      gid: `gid-sfsp-${Date.now()}`, direccionWallet: ALICE, terminosVersion: terminos.TERMINOS_VERSION,
    });
    await dep.asegurarDireccion(u);
    const usuario = await Usuario.findById(u._id).lean();
    INVENTARIO = 0n;
    let e = null;
    try {
      await compra.abrir(usuario, { montoMicro: '5000000', cadena: 137, aceptoRecalculo: true, reglaRecalculoVersion: compra.REGLA_RECALCULO });
    } catch (x) { e = x; }
    comprobar(e?.codigo === 'SIN_INVENTARIO', 'abrir, apagado y con la caliente vacía, sigue diciendo SIN_INVENTARIO', e?.codigo);
    INVENTARIO = 10n ** 24n;
    globalThis.__usuario = usuario;
  }

  decir('interruptor ENCENDIDO: releaseOnDemand con la referencia correcta');
  process.env.SFSP410_EMISION = '1';
  let primeraOrden;
  let primerHash;
  {
    comprobar(sfsp410.activo() === true, "SFSP410_EMISION=1 lo enciende");
    const lecturasAntes = lecturasCaliente;
    const enviosAntes = enviadosCaliente;

    // abrir: sin mirar la caliente, contra el cupo de la bóveda.
    INVENTARIO = 0n; // si se mirara la caliente, fallaría
    const abierta = await compra.abrir(globalThis.__usuario, {
      montoMicro: '5000000', cadena: 137, aceptoRecalculo: true, reglaRecalculoVersion: compra.REGLA_RECALCULO,
    });
    comprobar(!!abierta.id, 'abrir no mira el inventario de la caliente (vacía) y la orden nace', abierta.id);
    comprobar(lecturasCaliente === lecturasAntes, 'ni una lectura de la caliente');
    await compra.OrdenCompra.deleteOne({ _id: abierta.id });
    INVENTARIO = 10n ** 24n;

    const o = await orden({ aWallet: ALICE, origenWei: 2n * ETH });
    primeraOrden = o;
    const antesAlice = await saldo(ALICE);
    const antesBoveda = await saldo(L.vault);
    const r = await compra.entregar(o._id);
    await esperarMinado(r.hash);
    comprobar(r.ok && r.estado === 'entregada' && r.sfsp410 === 'entregada', 'la orden se entrega por SFSP-410', JSON.stringify(r));
    comprobar(enviadosCaliente === enviosAntes, 'la caliente NO firma nada');
    comprobar(lecturasCaliente === lecturasAntes, 'y su inventario no se mira');

    const esperada = keccak256(toUtf8Bytes(`SFSP410/v1|ordenex|compra-usdt|${o._id}`));
    comprobar(r.paymentRef === esperada, 'paymentRef = keccak256("SFSP410/v1|ordenex|compra-usdt|<id de la orden>")', r.paymentRef);
    const evs = await liberaciones(esperada);
    comprobar(evs.length === 1, 'hay UNA liberación en la bóveda con esa referencia', String(evs.length));
    comprobar(evs[0]?.destination === ALICE && evs[0]?.amount === 2n * ETH, 'al usuario, por el monto exacto');
    comprobar(evs[0]?.hash === r.hash, 'y es la transacción que quedó anotada en la orden');
    comprobar((await saldo(ALICE)) - antesAlice === 2n * ETH, 'el usuario recibe 2 ORIGEN');
    comprobar(antesBoveda - (await saldo(L.vault)) === 2n * ETH, 'y salen de la bóveda, no de un inventario');
    const leida = await leer(o._id);
    comprobar(leida.estado === 'entregada' && leida.hash === r.hash, 'la orden queda entregada con su hash');
    const deuda = await compra.PorPagar.findOne({ ordenId: o._id }).lean();
    comprobar(!!deuda && deuda.hash === r.hash, 'y la cuenta por pagar se anota igual');
    primerHash = r.hash;
  }

  decir('la misma orden otra vez: OperationReplay = ya entregado');
  {
    // Lo que pasaría si el dyno muere después de liberar y antes de anotar:
    // la orden vuelve a 'esperando' con la entrega ya hecha en la cadena.
    await compra.OrdenCompra.updateOne({ _id: primeraOrden._id }, { estado: 'esperando', hash: null });
    await compra.PorPagar.deleteOne({ ordenId: primeraOrden._id });
    const antesAlice = await saldo(ALICE);
    const r = await compra.entregar(primeraOrden._id);
    comprobar(r.ok && r.estado === 'entregada' && r.sfsp410 === 'ya-entregado', 'se da por entregada', JSON.stringify(r));
    comprobar(r.hash === primerHash, 'con el hash de la PRIMERA entrega, leído del evento', `${r.hash} vs ${primerHash}`);
    comprobar((await saldo(ALICE)) === antesAlice, 'y el usuario NO recibe otra vez');
    comprobar((await liberaciones(r.paymentRef)).length === 1, 'sigue habiendo una sola liberación');
    const leida = await leer(primeraOrden._id);
    comprobar(leida.estado === 'entregada' && /ya estaba entregada/.test(leida.motivo || ''), 'la orden dice que ya estaba', leida.motivo);
    comprobar(!!(await compra.PorPagar.findOne({ ordenId: primeraOrden._id })), 'y la deuda se vuelve a anotar');

    // Directo en el adaptador, con la referencia a mano.
    const r2 = await sfsp410.entregarOrigen(ALICE, 2n * ETH, compra._adentro.referenciaDeOrden(primeraOrden), { x: 1 });
    comprobar(r2.ok && r2.estado === 'ya-entregado' && r2.hash === primerHash, 'el adaptador también lo trata como entregado');
    const r3 = await sfsp410.entregarOrigen(BOB, 1n, compra._adentro.referenciaDeOrden(primeraOrden), { x: 1 });
    comprobar(r3.ok && r3.estado === 'ya-entregado' && !!r3.discrepancia,
      'y si la referencia se reusara con otro destino/monto, lo marca como discrepancia', JSON.stringify(r3.discrepancia));
  }

  decir('cupo agotado: a la cola de gobierno, sin bucle');
  {
    // Cupo de prueba: 10 por periodo, 4 por operación. Ya van 2.
    const a = await orden({ aWallet: BOB, origenWei: 4n * ETH });
    const b = await orden({ aWallet: BOB, origenWei: 4n * ETH });
    const c = await orden({ aWallet: BOB, origenWei: 3n * ETH });
    const ra = await compra.entregar(a._id); await esperarMinado(ra.hash);
    const rb = await compra.entregar(b._id); await esperarMinado(rb.hash);
    comprobar(ra.ok && rb.ok, 'dentro del cupo se entrega (2 + 4 + 4 = 10)', JSON.stringify([ra, rb]));
    const antesBob = await saldo(BOB);
    const rc = await compra.entregar(c._id);
    comprobar(!rc.ok && rc.estado === 'en-revision', 'la que se pasa del cupo no se entrega y queda en revisión', JSON.stringify(rc));
    const lc = await leer(c._id);
    comprobar(/^SFSP410 · cola de gobierno · CUPO_AGOTADO/.test(lc.motivo || ''), 'con motivo «cola de gobierno · CUPO_AGOTADO»', lc.motivo);
    comprobar((await saldo(BOB)) === antesBob, 'no se movió nada');

    // La vuelta del atendedor no la vuelve a intentar: no es 'esperando'.
    const antesCiclo = (await leer(c._id)).updatedAt.getTime();
    await compra.ciclo();
    const trasCiclo = await leer(c._id);
    comprobar(trasCiclo.estado === 'en-revision' && trasCiclo.updatedAt.getTime() === antesCiclo, 'el ciclo no la toca: no hay reintento en bucle');

    // Más que el máximo por operación, también a la cola.
    const d = await orden({ aWallet: BOB, origenWei: 5n * ETH });
    const rd = await compra.entregar(d._id);
    const ld = await leer(d._id);
    comprobar(rd.estado === 'en-revision' && /MONTO_SOBRE_CUPO/.test(ld.motivo || ''), 'sobre el máximo por operación: cola de gobierno', ld.motivo);

    // El panel la ve, y una persona la devuelve a la fila.
    const est = await compra.estadoSfsp410();
    comprobar(est.configuracion.encendido === true && Array.isArray(est.paradas) && est.paradas.some((p) => String(p._id) === String(c._id)),
      '/admin/sfsp410 la lista entre las paradas');
    comprobar(!JSON.stringify(est).includes(L.emisorLlave.slice(2)), 'y el estado NO trae la llave del emisor');
    comprobar(est.capacidad?.ok === true && est.capacidad.restanteWei === '0', 'con el cupo del periodo en cero', JSON.stringify(est.capacidad));
    const rr = await compra.reintentarSfsp410(c._id);
    comprobar(rr.estado === 'esperando', 'reintentar la devuelve a la fila', JSON.stringify(rr));
    let e = null; try { await compra.reintentarSfsp410(primeraOrden._id); } catch (x) { e = x; }
    comprobar(e?.codigo === 'NO_SE_PUEDE_REINTENTAR', 'una orden entregada no se puede "reintentar"', e?.codigo);

    // abrir con el cupo agotado: la guarda de delante dice que no.
    let e2 = null;
    try {
      await compra.abrir(globalThis.__usuario, { montoMicro: '5000000', cadena: 137, aceptoRecalculo: true, reglaRecalculoVersion: compra.REGLA_RECALCULO });
    } catch (x) { e2 = x; }
    comprobar(e2?.codigo === 'SIN_CUPO' && e2?.status === 503, 'con el cupo agotado, abrir no deja congelar precio', e2?.codigo);
  }

  decir('destino que es cuenta interna: rechazado');
  {
    // Nuevo periodo: se adelanta el reloj de la cadena local un día.
    await cadenaLocal.send('evm_increaseTime', [86400]);
    await cadenaLocal.send('evm_mine', []);
    const o = await orden({ aWallet: L.interna, origenWei: ETH });
    const antes = await saldo(L.interna);
    const r = await compra.entregar(o._id);
    const l = await leer(o._id);
    comprobar(!r.ok && r.estado === 'fallida', 'la orden falla (es de la orden, no de la casa)', JSON.stringify(r));
    comprobar(/DESTINO_INTERNO/.test(l.motivo || ''), 'con motivo DESTINO_INTERNO', l.motivo);
    comprobar((await saldo(L.interna)) === antes, 'y la cuenta interna no recibe nada');

    // Un destino no elegible no recibe y lo mira una persona.
    const o2 = await orden({ aWallet: L.noElegible, origenWei: ETH });
    const r2 = await compra.entregar(o2._id);
    const l2 = await leer(o2._id);
    comprobar(r2.estado === 'en-revision' && /DESTINO_NO_ELEGIBLE/.test(l2.motivo || ''), 'destino no elegible: en revisión', l2.motivo);

    // La que estaba en cola, ya en el periodo nuevo, se entrega sola.
    const colaVieja = await compra.OrdenCompra.findOne({ estado: 'esperando', aWallet: BOB, origenWei: String(3n * ETH) }).lean();
    const r3 = await compra.entregar(colaVieja._id); await esperarMinado(r3.hash);
    comprobar(r3.ok && r3.sfsp410 === 'entregada', 'la orden de la cola, devuelta a la fila, se entrega en el periodo nuevo', JSON.stringify(r3));
  }

  decir('emitirToken: mintOnDemand dentro del cupo');
  {
    const asset = new (await import('ethers')).Contract(L.asset, IFACE, cadenaLocal);
    const ref = sfsp410.referenciaDePago('ordenex', 'compra-auka', 'prueba-0001');
    const antes = await asset.balanceOf(ALICE);
    const r = await sfsp410.emitirToken('AUKA', ALICE, 100, ref, { recibo: 'r1' }, { esperar: true });
    comprobar(r.ok && r.estado === 'entregada', 'emite al usuario', JSON.stringify(r));
    comprobar((await asset.balanceOf(ALICE)) - antes === 100n, 'y el usuario tiene 100 unidades más');
    const logs = await cadenaLocal.getLogs({ address: L.issuance, fromBlock: 0, topics: [IFACE.getEvent('MintOnDemand').topicHash, null, null, ref.paymentRef] });
    comprobar(logs.length === 1, 'MintOnDemand con paymentRef = keccak256 de la referencia canónica');
    const r2 = await sfsp410.emitirToken('AUKA', ALICE, 100, ref, { recibo: 'r1' }, { esperar: true });
    comprobar(r2.ok && r2.estado === 'ya-entregado' && r2.hash === r.hash, 'la misma referencia otra vez: ya entregado', JSON.stringify(r2));
    const r3 = await sfsp410.emitirToken('AUKA', L.interna, 10, sfsp410.referenciaDePago('ordenex', 'compra-auka', 'prueba-0002'), { recibo: 'r2' });
    comprobar(!r3.ok && r3.estado === 'rechazada' && r3.codigo === 'DESTINO_INTERNO' && r3.error === 'MintToInternalAccount',
      'a una cuenta interna: MintToInternalAccount → rechazada', JSON.stringify(r3));
    const r4 = await sfsp410.emitirToken('AUKA', BOB, 301, sfsp410.referenciaDePago('ordenex', 'compra-auka', 'prueba-0003'), { recibo: 'r3' });
    comprobar(!r4.ok && r4.estado === 'cola-gobierno' && r4.codigo === 'MONTO_SOBRE_CUPO', 'sobre el máximo por operación: cola de gobierno', JSON.stringify(r4));
  }

  decir('gobierno en pausa: se espera, no se reintenta en bucle');
  {
    const { Contract, encodeBytes32String } = await import('ethers');
    const firmante = await cadenaLocal.getSigner(L.firmantes[0]);
    const gob = new Contract(L.governance, ['function emergencyPause(bytes32 reason, uint64 duration)'], firmante);
    await (await gob.emergencyPause(encodeBytes32String('INCIDENTE'), 3600)).wait();
    const o = await orden({ aWallet: ALICE, origenWei: ETH });
    const r = await compra.entregar(o._id);
    const l = await leer(o._id);
    comprobar(r.estado === 'en-revision' && /PAUSADO/.test(l.motivo || ''), 'con pausa: en revisión, motivo PAUSADO', l.motivo);
    await cadenaLocal.send('evm_increaseTime', [3601]);
    await cadenaLocal.send('evm_mine', []);
    await compra.reintentarSfsp410(o._id);
    const r2 = await compra.entregar(o._id); await esperarMinado(r2.hash);
    comprobar(r2.ok && r2.sfsp410 === 'entregada', 'pasada la pausa, devuelta a la fila, se entrega', JSON.stringify(r2));
  }

  decir('lo que nunca se hace');
  {
    // La llave no aparece nunca en un error, ni con forma rota.
    const buena = process.env.SFSP410_ISSUER_KEY;
    process.env.SFSP410_ISSUER_KEY = buena.slice(0, 40); // rota
    let e = null;
    try { await sfsp410.entregarOrigen(ALICE, 1, sfsp410.referenciaDePago('ordenex', 'x', 'k1'), { a: 1 }); } catch (x) { e = x; }
    comprobar(e?.codigo === 'SFSP410_SIN_EMISOR' && e?.nuncaSalio === true, 'llave rota: no se firma nada', e?.codigo);
    comprobar(!String(e?.message).includes(buena.slice(2, 12)) && !JSON.stringify(e).includes(buena.slice(2, 12)),
      'y el error nombra la variable, no el valor');
    process.env.SFSP410_ISSUER_KEY = buena;

    // Otra cadena: se niega a firmar.
    process.env.SFSP410_CHAIN_ID = '5550';
    let e2 = null;
    try { await sfsp410.entregarOrigen(ALICE, 1, sfsp410.referenciaDePago('ordenex', 'x', 'k2'), { a: 1 }); } catch (x) { e2 = x; }
    comprobar(e2?.codigo === 'SFSP410_RED', 'si la cadena no es la esperada, no firma', e2?.codigo);
    process.env.SFSP410_CHAIN_ID = String(L.chainId);

    // Referencias: deterministas, y con forma.
    const a = sfsp410.referenciaDePago('ordenex', 'compra-usdt', 'abc');
    const b = sfsp410.referenciaDePago('ordenex', 'compra-usdt', 'abc');
    comprobar(a.paymentRef === b.paymentRef && a.canonica === 'SFSP410/v1|ordenex|compra-usdt|abc', 'la referencia es determinista');
    let e3 = null; try { sfsp410.referenciaDePago('ordenex', 'compra usdt', 'abc'); } catch (x) { e3 = x; }
    comprobar(e3?.codigo === 'REFERENCIA_INVALIDA', 'y no admite partes con espacios o separadores');
    comprobar(sfsp410.raizDeEvidencia({ b: 2, a: 1 }) === sfsp410.raizDeEvidencia({ a: 1, b: 2 }), 'la evidencia no depende del orden de las claves');

    // La ruta del panel existe y exige la clave.
    const capas = adminRutas.stack.filter((c) => c.route && /sfsp410/.test(c.route.path)).map((c) => c.route.path);
    comprobar(capas.includes('/sfsp410') && capas.includes('/sfsp410/reintentar/:id'), 'las rutas /admin/sfsp410 existen', capas.join(', '));

    // Y apagado otra vez: vuelve a la caliente sin reiniciar nada.
    delete process.env.SFSP410_EMISION;
    const envios = enviadosCaliente;
    const o = await orden({ aWallet: ALICE, origenWei: ETH });
    const r = await compra.entregar(o._id);
    comprobar(r.ok && enviadosCaliente === envios + 1, 'apagar el interruptor devuelve al camino de la caliente al instante (rollback)');
    let e4 = null; try { await compra.reintentarSfsp410(o._id); } catch (x) { e4 = x; }
    comprobar(e4?.codigo === 'SFSP410_APAGADO', 'y apagado no se reintenta nada por SFSP-410');
  }
} catch (e) {
  fallos++;
  console.error(e);
} finally {
  await mongoose.disconnect();
  await servidor.stop();
  apagarCadena();
}

console.log(`\n${fallos === 0 ? 'TODO EN VERDE' : `${fallos} en rojo`}`);
process.exit(fallos === 0 ? 0 : 1);
