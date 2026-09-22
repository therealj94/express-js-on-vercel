import { readFileSync, writeFileSync } from 'node:fs';
import * as sdk from '/home/user/express-js-on-vercel/sfsp/sdk/dist/index.js';
const d = JSON.parse(readFileSync('/home/user/express-js-on-vercel/genesis-id/datos/cadena-8532.json'));
const f5550 = JSON.parse(readFileSync('/tmp/claude-0/inv/fichas-5550.json')).map((f) => f.direccion);
const h = (a) => sdk.keccak256Hex(Buffer.from(a.slice(2), 'hex')).toLowerCase();
const porHash = new Map(f5550.map((a) => [h(a).replace(/^0x/, ''), a]));
const salida = d.cuentas.filter((c) => c.tipo === 'contrato').map((c) => {
  const hash = c.hash.toLowerCase().replace(/^0x/, '');
  const en5550 = c.direccion ? (f5550.includes(c.direccion.toLowerCase()) ? c.direccion.toLowerCase() : null) : (porHash.get(hash) || null);
  return { direccion8532: c.direccion?.toLowerCase() || null, hash: '0x' + hash, saldoNativo: c.saldo, nonce: c.nonce, en5550, recuperadaPorHuella: !c.direccion && !!en5550 };
});
writeFileSync('/tmp/claude-0/inv/emparejado-8532.json', JSON.stringify(salida));
console.log('contratos 8532:', salida.length, '· pasaron a la 5550:', salida.filter((x) => x.en5550).length, '· dirección recuperada por huella:', salida.filter((x) => x.recuperadaPorHuella).length, '· sin pareja:', JSON.stringify(salida.filter((x) => !x.en5550).map((x) => x.direccion8532 || x.hash)));
