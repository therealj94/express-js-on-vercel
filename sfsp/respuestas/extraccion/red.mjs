const RPC = 'https://rpc.ordenglobal-rpc.com/';
const q = async (m, p = []) => (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) })).json());
const hex = (n) => '0x' + n.toString(16);
const alto = parseInt((await q('eth_blockNumber')).result, 16);
const b = async (n) => (await q('eth_getBlockByNumber', [hex(n), false])).result;
const ult = await b(alto);
const t2 = parseInt(ult.timestamp, 16);
// buscar el bloque de hace 30 días por bisección
let lo = 1, hi = alto; const obj = t2 - 30 * 86400;
while (lo < hi) { const mid = (lo + hi) >> 1; const t = parseInt((await b(mid)).timestamp, 16); if (t < obj) lo = mid + 1; else hi = mid; }
const b1 = await b(lo); const t1 = parseInt(b1.timestamp, 16);
const primer = await b(1); const tp = parseInt(primer.timestamp, 16);
console.log(JSON.stringify({
  altura: alto, fechaUltimo: new Date(t2 * 1000).toISOString(),
  ventana30d: { desde: lo, fechaDesde: new Date(t1 * 1000).toISOString(), intervaloMedioSeg: (t2 - t1) / (alto - lo) },
  desdeElBloque1: { intervaloMedioSeg: (t2 - tp) / (alto - 1), primerBloque: new Date(tp * 1000).toISOString() },
  gasLimitUltimo: parseInt(ult.gasLimit, 16), baseFeePerGas: ult.baseFeePerGas ? parseInt(ult.baseFeePerGas, 16) : null,
  gasPrice: parseInt((await q('eth_gasPrice')).result, 16),
  validadores: (await q('qbft_getValidatorsByBlockNumber', ['latest'])).result,
  metricas: (await q('qbft_getSignerMetrics', [])).result ?? (await q('qbft_getSignerMetrics', [])).error,
  peers: (await q('net_peerCount')).result, cliente: (await q('web3_clientVersion')).result,
  syncing: (await q('eth_syncing')).result,
}, null, 1));
