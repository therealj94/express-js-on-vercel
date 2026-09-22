import { readFileSync, writeFileSync } from 'node:fs';
const RPC = 'https://rpc.ordenglobal-rpc.com/';
const f = JSON.parse(readFileSync('/tmp/claude-0/inv/fichas-5550.json'));
const sym = Object.fromEntries(f.map((x) => [x.direccion, x.simbolo || x.nombre || null]));
const pools = f.filter((x) => x.estandar.startsWith('Par') || x.estandar.startsWith('Pool'));
const body = pools.map((p, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: p.direccion, data: p.estandar.startsWith('Par') ? '0x0902f1ac' : '0x1a686502' }, 'latest'] }));
const r = (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()).sort((a, b) => a.id - b.id);
const out = pools.map((p, i) => { const h = (r[i].result || '0x').slice(2);
  const v2 = p.estandar.startsWith('Par');
  return { direccion: p.direccion, tipo: p.estandar, par: `${sym[p.token0] || p.token0?.slice(0, 10)} / ${sym[p.token1] || p.token1?.slice(0, 10)}`, token0: p.token0, token1: p.token1, factoria: p.factory,
    reserva0: v2 && h.length >= 128 ? BigInt('0x' + h.slice(0, 64)).toString() : null, reserva1: v2 && h.length >= 128 ? BigInt('0x' + h.slice(64, 128)).toString() : null,
    liquidezV3: !v2 && h.length >= 64 ? BigInt('0x' + h.slice(0, 64)).toString() : null }; });
writeFileSync('/tmp/claude-0/inv/pools-5550.json', JSON.stringify(out));
const conFondos = out.filter((o) => (o.reserva0 && o.reserva0 !== '0') || (o.liquidezV3 && o.liquidezV3 !== '0'));
console.log('pares/pools:', out.length, '· con liquidez hoy:', conFondos.length); conFondos.slice(0, 12).forEach((o) => console.log(' ', o.tipo, o.par, o.reserva0 ?? '', o.reserva1 ?? '', o.liquidezV3 ?? ''));
