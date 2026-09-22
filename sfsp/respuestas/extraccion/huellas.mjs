import { readFileSync, writeFileSync } from 'node:fs';
import * as sdk from '/home/user/express-js-on-vercel/sfsp/sdk/dist/index.js';
const RPC = 'https://rpc.ordenglobal-rpc.com/';
const K = sdk.keccak256 || sdk.keccak256Hex || sdk.keccak;
const hx = (b) => Buffer.from(b).toString('hex');
const kk = (hexData) => { const r = K(Buffer.from(hexData, 'hex')); return (typeof r === 'string' ? r.replace(/^0x/, '') : hx(r)); };
const ranuras = JSON.parse(readFileSync('/home/user/express-js-on-vercel/infra/migracion-cadena/ranuras-todas.json'));
const ten = JSON.parse(readFileSync('/tmp/claude-0/inv/tenedores-5550.json'));
const cand = readFileSync('/tmp/claude-0/inv/candidatas.txt', 'utf8').split('\n').filter(Boolean);
const pad = (x) => x.replace(/^0x/, '').padStart(64, '0');
const salida = {};
for (const tok of process.argv.slice(2)) {
  const slots = ranuras[tok] || {};
  const claves = Object.keys(slots).map((k) => '0x' + pad(k));
  const esHash = (k) => BigInt(k) > 1000n;
  // índice del mapping de saldos: el que empareja con los tenedores conocidos
  const conocidos = ten[tok].tenedores.map(([a]) => a);
  let indice = null;
  for (let i = 0; i < 30 && indice === null; i++) { const set = new Set(claves); if (conocidos.some((a) => set.has('0x' + kk(pad(a) + pad('0x' + i.toString(16)))))) indice = i; }
  // todas las claves de saldo de candidatas conocidas, con ese índice
  const deCandidatas = new Set(indice === null ? [] : cand.map((a) => '0x' + kk(pad(a) + pad('0x' + indice.toString(16)))));
  const desconocidas = claves.filter((k) => esHash(k) && !deCandidatas.has(k));
  // leer su valor ACTUAL en la 5550
  const body = desconocidas.map((k, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_getStorageAt', params: [tok, k, 'latest'] }));
  const r = body.length ? await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() : [];
  const valores = r.sort((a, b) => a.id - b.id).map((x) => BigInt(x.result || '0x0')).filter((v) => v > 0n).sort((a, b) => (b > a ? 1 : -1));
  const sumaDesc = valores.reduce((s, v) => s + v, 0n);
  const supply = BigInt(ten[tok].supply || '0'); const ident = BigInt(ten[tok].suma);
  salida[tok] = { indiceSaldos: indice, clavesEnFoto: claves.length, desconocidasConValor: valores.length, sumaIdentificada: ident.toString(), sumaDesconocida: sumaDesc.toString(),
    supply: supply.toString(), cierra: ident + sumaDesc === supply, diferencia: (supply - ident - sumaDesc).toString(), valoresDesconocidos: valores.map(String) };
  console.log(tok.slice(0, 10), 'índice', indice, '· desconocidas con valor', valores.length, '· identificado + desconocido = supply?', ident + sumaDesc === supply, '· diferencia', (supply - ident - sumaDesc).toString());
}
writeFileSync('/tmp/claude-0/inv/huellas.json', JSON.stringify(salida));
