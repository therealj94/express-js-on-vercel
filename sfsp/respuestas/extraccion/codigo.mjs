import { readFileSync, writeFileSync } from 'node:fs';
const [RPC, SALIDA] = [process.argv[2], process.argv[3]];
const cand = readFileSync('/tmp/claude-0/inv/candidatas.txt','utf8').split('\n').filter(Boolean);
const out = {};
for (let i = 0; i < cand.length; i += 100) {
  const g = cand.slice(i, i+100);
  const body = g.map((a, k) => ({ jsonrpc:'2.0', id:k, method:'eth_getCode', params:[a,'latest'] }));
  const r = await (await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json();
  r.sort((a,b)=>a.id-b.id).forEach((x,k)=>{ if (x.result && x.result !== '0x') out[g[k]] = x.result; });
}
writeFileSync(SALIDA, JSON.stringify(out));
console.log(Object.keys(out).length, 'con código de', cand.length);
