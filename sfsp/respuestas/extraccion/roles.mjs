import { readFileSync, writeFileSync } from 'node:fs';
import * as sdk from '/home/user/express-js-on-vercel/sfsp/sdk/dist/index.js';
const RPC = 'https://rpc.ordenglobal-rpc.com/';
const fichas = JSON.parse(readFileSync('/tmp/claude-0/inv/fichas-5550.json'));
const cand = readFileSync('/tmp/claude-0/inv/candidatas.txt', 'utf8').split('\n').filter(Boolean);
const rol = (n) => sdk.keccak256Hex(Buffer.from(n)).replace(/^0x/, '');
const ROLES = { DEFAULT_ADMIN: '0'.repeat(64), MINTER: rol('MINTER_ROLE'), PAUSER: rol('PAUSER_ROLE'), BURNER: rol('BURNER_ROLE'), UPGRADER: rol('UPGRADER_ROLE'), ADMIN: rol('ADMIN_ROLE'), OPERATOR: rol('OPERATOR_ROLE'), ISSUER: rol('ISSUER_ROLE') };
const pad = (a) => a.replace(/^0x/, '').padStart(64, '0');
let id = 1;
async function lote(calls) { const out = []; for (let i = 0; i < calls.length; i += 500) { const g = calls.slice(i, i + 500);
  const body = g.map((p) => ({ jsonrpc: '2.0', id: id++, method: 'eth_call', params: p })); const j = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const m = new Map(j.map((x) => [x.id, x])); body.forEach((b) => { const x = m.get(b.id); out.push(x && !x.error ? x.result : null); }); } return out; }
const res = {};
for (const f of fichas.filter((f) => f.capacidades.hasRole)) {
  const pares = []; for (const [n, h] of Object.entries(ROLES)) for (const a of cand) pares.push([n, a, [{ to: f.direccion, data: '0x91d14854' + h + pad(a) }, 'latest']]);
  const r = await lote(pares.map((p) => p[2]));
  res[f.direccion] = pares.filter((p, i) => r[i] && BigInt(r[i]) === 1n).map(([n, a]) => `${n}: ${a}`);
}
// última transferencia en la 5550, desde los recibos
const recibos = JSON.parse(readFileSync('/tmp/claude-0/inv/5550/fase3-recibos.json'));
const bloques = JSON.parse(readFileSync('/tmp/claude-0/inv/5550/fase2-bloques.json'));
const tsDe = new Map(); bloques.forEach((b) => b.txs.forEach((t) => tsDe.set(t.hash, b.timestamp)));
const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ultima = {}, eventos = {};
for (const r of recibos) for (const l of r.logs) { const a = l.address.toLowerCase(); eventos[a] = (eventos[a] || 0) + 1;
  if (l.topics[0] === T) { const ts = tsDe.get(r.hash); if (!ultima[a] || ts > ultima[a]) ultima[a] = ts; } }
writeFileSync('/tmp/claude-0/inv/roles-5550.json', JSON.stringify({ roles: res, ultima, eventos }));
console.log('contratos con control de acceso por roles:', Object.keys(res).length, '· con roles hallados:', Object.values(res).filter((x) => x.length).length, '· con transferencias en la 5550:', Object.keys(ultima).length);
