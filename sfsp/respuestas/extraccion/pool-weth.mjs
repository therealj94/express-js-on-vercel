import { readFileSync } from 'node:fs';
const RPC='https://rpc.ordenglobal-rpc.com/';
const pools=JSON.parse(readFileSync('/tmp/claude-0/inv/pools-5550.json')).filter(p=>(p.liquidezV3&&p.liquidezV3!=='0')||(p.reserva0&&p.reserva0!=='0'));
const WETH=['0x062be19ed343e24ba4e22ef9c1f5563559b85224','0x6504ac3feb5fb2031d0d6329ebd3444b79710bce','0xccbe0c6690bf61d1f23f95f3998e4ba0d7b89f75'];
const calls=[]; for(const p of pools) for(const t of [p.token0,p.token1]) calls.push([p,t]);
const body=calls.map(([p,t],i)=>({jsonrpc:'2.0',id:i,method:'eth_call',params:[{to:t,data:'0x70a08231'+p.direccion.slice(2).padStart(64,'0')},'latest']}));
const r=(await (await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json()).sort((a,b)=>a.id-b.id);
const res={}; calls.forEach(([p,t],i)=>{ (res[p.direccion] ??= {par:p.par, saldos:[]}).saldos.push([WETH.includes(t)?'WETH':t.slice(0,8), r[i].result?BigInt(r[i].result.slice(0,66)).toString():'error']); });
for(const [a,v] of Object.entries(res)) console.log(a.slice(0,10), v.par.padEnd(22), JSON.stringify(v.saldos));
