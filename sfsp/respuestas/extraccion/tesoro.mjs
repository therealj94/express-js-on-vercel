import { readFileSync, writeFileSync } from 'node:fs';
const RPC='https://rpc.ordenglobal-rpc.com/';
const TES={ '0x3d5510e5081822877d14cd51b356bf01df2c32c9':'Tesoro (destino de la consolidación)', '0xacc03b7fe0c658cb3872726d05da24d0554f44b8':'Asignación preservada 1', '0x50219186545980b35912adc89550522e63667f74':'Asignación preservada 2', '0x3011f7f9d263d7f73a1ac2130ac7afe426495718':'Asignación preservada 3' };
const cand=[...new Set([...readFileSync('/tmp/claude-0/inv/candidatas.txt','utf8').split('\n').filter(Boolean), ...Object.keys(TES)])];
const alto=parseInt((await (await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]})})).json()).result,16);
const body=cand.map((a,i)=>({jsonrpc:'2.0',id:i,method:'eth_getBalance',params:[a,'latest']}));
const r=(await (await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json()).sort((a,b)=>a.id-b.id);
const errs=r.filter(x=>x.error); if(errs.length) console.error('errores', errs.length, JSON.stringify(errs[0])); const saldo=Object.fromEntries(cand.map((a,i)=>[a,BigInt(r[i].result||'0x0')]));
const total=Object.values(saldo).reduce((s,v)=>s+v,0n);
const enTes=Object.keys(TES).reduce((s,a)=>s+saldo[a],0n);
const B=1000000000000n*10n**18n;
const f=(x)=>{const neg=x<0n; x=neg?-x:x; const e=x/10n**18n, d=(x%10n**18n).toString().padStart(18,'0').replace(/0+$/,''); return (neg?'-':'')+e.toLocaleString('es')+(d?','+d:'');};
// movimientos de las 4 en las 95 transacciones
const bl=JSON.parse(readFileSync('/tmp/claude-0/inv/5550/fase2-bloques.json'));
const mov={}; for(const b of bl) for(const t of b.txs){ for(const a of Object.keys(TES)){ const v=BigInt(t.value); if(t.from.toLowerCase()===a){(mov[a]??={sal:0n,ent:0n,nsal:0,nent:0}); mov[a].sal+=v; mov[a].nsal++;} if(t.to&&t.to.toLowerCase()===a){(mov[a]??={sal:0n,ent:0n,nsal:0,nent:0}); mov[a].ent+=v; mov[a].nent++;} } }
const out={ bloque:alto, tesoreria:Object.entries(TES).map(([a,n])=>({direccion:a,rol:n,saldo:f(saldo[a]), movimientos5550: mov[a]?{salidas:mov[a].nsal, salidoORIGEN:f(mov[a].sal), entradas:mov[a].nent, entradoORIGEN:f(mov[a].ent)}:'ninguno'})),
  enTesoreria:f(enTes), fueraDeTesoreria:f(B-enTes), sumaDeTodasLasConocidas:f(total), emisionEsperada:f(B), diferenciaConEmision:f(B-total),
  otrasRelevantes: cand.filter(a=>!TES[a] && saldo[a] > 10n**18n).map(a=>[a,f(saldo[a])]).sort((x,y)=>0) };
writeFileSync('/tmp/claude-0/inv/tesoro.json',JSON.stringify(out,null,1)); console.log(JSON.stringify(out,null,1));
