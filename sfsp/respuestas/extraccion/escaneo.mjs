// Recorre la cadena entera, sólo lectura. Guarda cada fase en disco para poder reanudar.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
const RPC = process.argv[2] || 'https://rpc.ordenglobal-rpc.com/';
const DIR = process.argv[3] || '/tmp/claude-0/inv/5550';
import { mkdirSync } from 'node:fs'; mkdirSync(DIR, { recursive: true });
let id = 1;
async function lote(llamadas, intentos = 5) {
  const cuerpo = llamadas.map(([method, params]) => ({ jsonrpc: '2.0', id: id++, method, params }));
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(90000) });
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error('respuesta no es lote: ' + JSON.stringify(j).slice(0, 200));
      j.sort((a, b) => a.id - b.id);
      for (const x of j) if (x.error) throw new Error(JSON.stringify(x.error));
      return j.map((x) => x.result);
    } catch (e) { if (i === intentos - 1) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
}
async function enParalelo(tareas, n) { const out = new Array(tareas.length); let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < tareas.length) { const i = k++; out[i] = await tareas[i](); } })); return out; }
const hex = (n) => '0x' + n.toString(16);

const f1 = `${DIR}/fase1-conteos.json`;
let corte, conteos;
if (existsSync(f1)) ({ corte, conteos } = JSON.parse(readFileSync(f1)));
else {
  corte = parseInt((await lote([['eth_blockNumber', []]]))[0], 16);
  const T = 1000, tareas = [];
  for (let a = 0; a <= corte; a += T) { const b = Math.min(corte, a + T - 1);
    tareas.push(async () => { const r = await lote(Array.from({ length: b - a + 1 }, (_, i) => ['eth_getBlockTransactionCountByNumber', [hex(a + i)]])); return r.map((c, i) => [a + i, parseInt(c, 16)]); }); }
  const t0 = Date.now(); let hechos = 0;
  const res = await enParalelo(tareas.map((t) => async () => { const r = await t(); if (++hechos % 25 === 0) console.error(`fase1 ${hechos}/${tareas.length} ${((Date.now()-t0)/1000)|0}s`); return r; }), 6);
  conteos = res.flat().filter(([, c]) => c > 0);
  writeFileSync(f1, JSON.stringify({ corte, conteos }));
}
console.error(`corte ${corte} · bloques con transacciones: ${conteos.length} · transacciones: ${conteos.reduce((s, [, c]) => s + c, 0)}`);

const f2 = `${DIR}/fase2-bloques.json`;
let bloques;
if (existsSync(f2)) bloques = JSON.parse(readFileSync(f2));
else {
  const nums = conteos.map(([n]) => n), tareas = [];
  for (let i = 0; i < nums.length; i += 50) { const g = nums.slice(i, i + 50);
    tareas.push(() => lote(g.map((n) => ['eth_getBlockByNumber', [hex(n), true]]))); }
  bloques = (await enParalelo(tareas, 4)).flat().map((b) => ({ number: parseInt(b.number, 16), timestamp: parseInt(b.timestamp, 16), miner: b.miner,
    txs: b.transactions.map((t) => ({ hash: t.hash, from: t.from, to: t.to, value: t.value, input: t.input.slice(0, 10), gas: t.gas, gasPrice: t.gasPrice })) }));
  writeFileSync(f2, JSON.stringify(bloques));
}
const txs = bloques.flatMap((b) => b.txs.map((t) => ({ ...t, block: b.number, ts: b.timestamp })));
console.error(`transacciones leídas: ${txs.length}`);

const f3 = `${DIR}/fase3-recibos.json`;
let recibos;
if (existsSync(f3)) recibos = JSON.parse(readFileSync(f3));
else {
  const tareas = [];
  for (let i = 0; i < txs.length; i += 100) { const g = txs.slice(i, i + 100);
    tareas.push(() => lote(g.map((t) => ['eth_getTransactionReceipt', [t.hash]]))); }
  recibos = (await enParalelo(tareas, 4)).flat().map((r) => ({ hash: r.transactionHash, status: r.status, contractAddress: r.contractAddress, gasUsed: r.gasUsed,
    logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })) }));
  writeFileSync(f3, JSON.stringify(recibos));
}

// Fase 4: creaciones internas (un contrato que crea otro). Se trazan los bloques con transacciones.
const f4 = `${DIR}/fase4-internas.json`;
let internas;
if (existsSync(f4)) internas = JSON.parse(readFileSync(f4));
else {
  internas = [];
  const conDestino = [...new Set(txs.filter((t) => t.to).map((t) => t.block))];
  const walk = (c, tx, blk, depth) => { if (!c) return; if (depth > 0 && (c.type === 'CREATE' || c.type === 'CREATE2') && c.to) internas.push({ address: c.to.toLowerCase(), creador: c.from.toLowerCase(), tx, block: blk, tipo: c.type, error: c.error || null }); for (const s of c.calls || []) walk(s, tx, blk, depth + 1); };
  const tareas = conDestino.map((n) => async () => { const r = await lote([['debug_traceBlockByNumber', [hex(n), { tracer: 'callTracer' }]]]); (r[0] || []).forEach((x) => walk(x.result, x.txHash, n, 0)); });
  let k = 0; await enParalelo(tareas.map((t) => async () => { await t(); if (++k % 200 === 0) console.error(`fase4 ${k}/${tareas.length}`); }), 6);
  writeFileSync(f4, JSON.stringify(internas));
}
console.error(`creaciones internas: ${internas.length}`);
const directas = txs.filter((t) => !t.to).map((t) => { const r = recibos.find((x) => x.hash === t.hash); return { address: r?.contractAddress?.toLowerCase() || null, creador: t.from.toLowerCase(), tx: t.hash, block: t.block, ts: t.ts, status: r?.status }; });
writeFileSync(`${DIR}/creaciones.json`, JSON.stringify({ corte, directas, internas }, null, 1));
console.error(`despliegues directos: ${directas.length} (${directas.filter(d=>d.status==='0x1').length} exitosos)`);
