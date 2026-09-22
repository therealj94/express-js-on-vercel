import { readFileSync, writeFileSync } from 'node:fs';
const RPC = 'https://rpc.ordenglobal-rpc.com/';
const fichas = JSON.parse(readFileSync('/tmp/claude-0/inv/fichas-5550.json'));
const M = '/home/user/express-js-on-vercel/infra/migracion-cadena/';
// Candidatas a tenedor: todo lo conocido.
const cand = new Set(readFileSync('/tmp/claude-0/inv/candidatas.txt','utf8').split('\n').filter(Boolean));
const c8532 = JSON.parse(readFileSync('/home/user/express-js-on-vercel/genesis-id/datos/cadena-8532.json'));
for (const c of c8532.cuentas) if (c.direccion) cand.add(c.direccion.toLowerCase());
const pre = JSON.parse(readFileSync(M + 'preimagenes-cerradas.json'));
const recorrer = (o) => { if (Array.isArray(o)) o.forEach(recorrer); else if (o && typeof o === 'object') Object.values(o).forEach(recorrer); else if (typeof o === 'string' && /^0x[0-9a-f]{40}$/i.test(o)) cand.add(o.toLowerCase()); };
recorrer(pre); recorrer(JSON.parse(readFileSync(M + 'ranuras_identificadas.json')));
for (const f of fichas) cand.add(f.direccion);
const lista = [...cand];
console.log('candidatas a tenedor:', lista.length);
let idg = 1;
async function lote(calls) { const out = [];
  for (let i = 0; i < calls.length; i += 500) { const g = calls.slice(i, i + 500);
    const body = g.map(([m, p]) => ({ jsonrpc: '2.0', id: idg++, method: m, params: p }));
    const j = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) })).json();
    const porId = new Map(j.map(x => [x.id, x])); body.forEach(b => { const x = porId.get(b.id); out.push(x && !x.error ? x.result : null); }); }
  return out; }
const tokens = fichas.filter(f => f.estandar.startsWith('ERC-20') || f.estandar === 'ERC-721' || (f.nombre || '').startsWith('Wrapped'));
const res = {};
for (const t of tokens) {
  const r = await lote(lista.map(a => ['eth_call', [{ to: t.direccion, data: '0x70a08231' + a.slice(2).padStart(64, '0') }, 'latest']]));
  const saldos = lista.map((a, i) => [a, r[i] && r[i].length >= 66 ? BigInt('0x' + r[i].slice(2, 66)) : 0n]).filter(([, s]) => s > 0n).sort((x, y) => (y[1] > x[1] ? 1 : -1));
  const suma = saldos.reduce((s, [, v]) => s + v, 0n);
  const supply = t.supply ? BigInt(t.supply) : null;
  res[t.direccion] = { tenedores: saldos.map(([a, s]) => [a, s.toString()]), suma: suma.toString(), supply: t.supply,
    completo: supply !== null && suma === supply, cobertura: supply ? Number((suma * 1000000n) / (supply || 1n)) / 10000 : null };
}
writeFileSync('/tmp/claude-0/inv/tenedores-5550.json', JSON.stringify(res));
const v = Object.values(res); console.log('tokens:', v.length, '· completos:', v.filter(x => x.completo).length, '· incompletos:', v.filter(x => !x.completo).map(x => x.cobertura));
