// Lee cada contrato de la 5550. Sólo eth_call / eth_getCode / eth_getStorageAt: no firma nada.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const RPC = 'https://rpc.ordenglobal-rpc.com/';
const codigo = JSON.parse(readFileSync('/tmp/claude-0/inv/codigo-5550.json'));
const candidatas = readFileSync('/tmp/claude-0/inv/candidatas.txt','utf8').split('\n').filter(Boolean);
let idg = 1;
async function lote(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i += 400) {
    const g = calls.slice(i, i + 400);
    const body = g.map(([m, p]) => ({ jsonrpc: '2.0', id: idg++, method: m, params: p }));
    let j; for (let t = 0; t < 5; t++) { try { j = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) })).json(); break; } catch (e) { if (t === 4) throw e; await new Promise(r => setTimeout(r, 2000)); } }
    const porId = new Map(j.map(x => [x.id, x]));
    body.forEach(b => { const x = porId.get(b.id); out.push(x && !x.error ? x.result : null); });
  }
  return out;
}
const call = (to, data) => ['eth_call', [{ to, data }, 'latest']];
const pad = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const SEL = { name:'0x06fdde03', symbol:'0x95d89b41', decimals:'0x313ce567', totalSupply:'0x18160ddd', owner:'0x8da5cb5b', getOwner:'0x893d20e8',
  token0:'0x0dfe1681', token1:'0xd21220a7', factory:'0xc45a0155', getReserves:'0x0902f1ac', fee:'0xddca3f43', slot0:'0x3850c7bd', allPairsLength:'0x574f2ba3',
  WETH:'0xad5c4648', paused:'0x5c975abb', cap:'0x355274ea' };
const IF = (id) => '0x01ffc9a7' + id.replace('0x','').padEnd(64,'0');
const SLOTS = { impl:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', admin:'0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103', beacon:'0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582745133d50' };
const CAPAC = { mint:['0x40c10f19','0xa0712d68'], burn:['0x42966c68'], burnFrom:['0x79cc6790'], pause:['0x8456cb59'], unpause:['0x3f4ba83a'], transferOwnership:['0xf2fde38b'],
  renounceOwnership:['0x715018a6'], grantRole:['0x2f2ff15d'], hasRole:['0x91d14854'], upgradeTo:['0x3659cfe6','0x4f1ef286'], balanceOf:['0x70a08231'], transfer:['0xa9059cbb'],
  deposit:['0xd0e30db0'], withdraw:['0x2e1a7d4d'], createPair:['0xc9c65396'], createPool:['0xa1671295'], swap:['0x022c0d9f','0x128acb08'], blacklist:['0xf9f92be4','0x44337ea1','0xe47d6060'] };
function selectores(hex) { const b = Buffer.from(hex.slice(2), 'hex'); const s = new Set();
  for (let i = 0; i < b.length - 4; i++) { if (b[i] === 0x63) s.add('0x' + b.subarray(i + 1, i + 5).toString('hex')); if (b[i] >= 0x60 && b[i] <= 0x7f) i += b[i] - 0x5f; } return s; }
function texto(r) { if (!r || r === '0x') return null; const h = r.slice(2);
  try { if (h.length >= 128) { const off = parseInt(h.slice(0,64),16)*2; const len = parseInt(h.slice(off,off+64),16); const s = Buffer.from(h.slice(off+64, off+64+len*2),'hex').toString('utf8'); if (s && len < 200) return s.replace(/\0/g,''); } } catch {}
  const s = Buffer.from(h.slice(0,64),'hex').toString('utf8').replace(/\0/g,''); return /^[\x20-\x7e]+$/.test(s) ? s : null; }
const num = (r) => (r && r !== '0x' && r.length >= 66) ? BigInt('0x' + r.slice(2, 66)) : null;
const dir = (r) => (r && r.length >= 66) ? '0x' + r.slice(26, 66) : null;
const addrs = Object.keys(codigo);

// 1 · sondas
const sondas = [];
for (const a of addrs) { for (const s of Object.values(SEL)) sondas.push(call(a, s)); sondas.push(call(a, IF('0x80ac58cd'))); sondas.push(call(a, IF('0xd9b67a26')));
  for (const s of Object.values(SLOTS)) sondas.push(['eth_getStorageAt', [a, s, 'latest']]); }
const r = await lote(sondas);
const nS = Object.keys(SEL).length + 2 + 3;
const fichas = addrs.map((a, i) => { const x = r.slice(i * nS, (i + 1) * nS); const k = Object.keys(SEL); const v = Object.fromEntries(k.map((n, j) => [n, x[j]]));
  const sel = selectores(codigo[a]);
  const cap = Object.fromEntries(Object.entries(CAPAC).map(([n, ss]) => [n, ss.some(s => sel.has(s))]));
  const f = { direccion: a, bytes: (codigo[a].length - 2) / 2, sha256: createHash('sha256').update(Buffer.from(codigo[a].slice(2), 'hex')).digest('hex'),
    nombre: texto(v.name), simbolo: texto(v.symbol), decimales: num(v.decimals)?.toString() ?? null, supply: num(v.totalSupply)?.toString() ?? null,
    owner: dir(v.owner) || dir(v.getOwner), token0: dir(v.token0), token1: dir(v.token1), factory: dir(v.factory), wrappedNativo: dir(v.WETH),
    esV2: !!(v.getReserves && v.getReserves.length >= 194 && v.token0), esV3: !!(v.slot0 && v.token0 && v.fee), factoriaPares: num(v.allPairsLength)?.toString() ?? null,
    pausado: v.paused ? num(v.paused) === 1n : null, erc721: num(x[k.length]) === 1n, erc1155: num(x[k.length + 1]) === 1n,
    impl: dir(x[k.length + 2]), adminProxy: dir(x[k.length + 3]), beacon: dir(x[k.length + 4]), capacidades: cap };
  for (const p of ['impl','adminProxy','beacon','owner']) if (f[p] === '0x' + '0'.repeat(40)) f[p] = null;
  f.estandar = f.erc721 ? 'ERC-721' : f.erc1155 ? 'ERC-1155' : f.esV3 ? 'Pool AMM V3' : f.esV2 ? 'Par AMM V2' : (f.supply !== null && f.decimales !== null && cap.balanceOf && cap.transfer) ? (cap.deposit && cap.withdraw ? 'ERC-20 (envoltorio del nativo)' : 'ERC-20')
    : (f.factoriaPares !== null || cap.createPair || cap.createPool) ? 'Factoría AMM' : f.wrappedNativo ? 'Router AMM' : 'Otro';
  return f; });
writeFileSync('/tmp/claude-0/inv/fichas-5550.json', JSON.stringify(fichas, null, 1));
const c = {}; fichas.forEach(f => c[f.estandar] = (c[f.estandar] || 0) + 1); console.log(c);
