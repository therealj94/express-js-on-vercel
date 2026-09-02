/* El registro de contratos verificados por Orden Global, leído de la cadena.
 *
 *   node ogscan-frontend/verificar-contratos.mjs            # imprime el registro
 *   node ogscan-frontend/verificar-contratos.mjs --comprobar # compara con index.html
 *
 * QUE ES «VERIFICADO» AQUI, Y QUE NO.
 *
 * Un explorador grande verifica un contrato compilando su fuente y comparando
 * el bytecode. De los tokens de la 5550 el repositorio NO tiene la fuente
 * Solidity (se desplegaron antes de este repo), asi que eso hoy no se puede
 * hacer y no se finge. Lo que SI se puede hacer, y es lo que esto hace:
 *
 *   1. leer el bytecode que hay EN LA CADENA en cada direccion del catalogo;
 *   2. calcular su SHA-256;
 *   3. dejarlo escrito en el repositorio, con fecha, en el registro
 *      VERIFICADOS de index.html.
 *
 * Con eso el explorador puede decir, con verdad: «el bytecode de este contrato
 * es el que Orden Global registro tal dia» — y avisar en rojo si un dia deja de
 * serlo (un proxy re-apuntado, un selfdestruct, un contrato distinto en la
 * misma direccion tras una migracion). Cuando aparezca la fuente, se agrega
 * `fuente` con la ruta en el repo y el sha256 del archivo, y la ficha lo dice.
 *
 * Solo lee (eth_getCode): no firma, no mueve nada.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RPC = process.env.OG_RPC || 'https://rpc.ordenglobal-rpc.com/';
const AQUI = dirname(fileURLToPath(import.meta.url));

// Los contratos que se registran: los del catalogo del ecosistema
// (infra/ordenex-api/lib/tokens.js, la tabla espejo) mas el envoltorio de
// ORIGEN que el genesis de la 5550 preservo.
const CONTRATOS = [
  ['AUKA', '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B', 'Gold Kapital · token de commodity referenciado a la onza de oro'],
  ['AGKA', '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B', 'AGKA · token de commodity referenciado a la onza de plata'],
  ['ONDK', '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1', 'Orden Kapital · security token'],
  ['MNKA', '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead', 'MNKA'],
  ['IBS', '0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62', 'IBS Energy'],
  ['HARV', '0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923', 'Harvi'],
  ['AUBEX', '0xF1498640B27A66C0DC505093D70911C060e04fb0', 'AUBEX'],
  ['ASL', '0x69846aC960D45F9946C613DFCe1b761D37Faf098', 'Athletic'],
  ['LOVE', '0x638F2ba0e3E1083D1ba570b449BD266F3860D164', 'Amor Global'],
  ['REST', '0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD', 'Real State'],
  ['SOL', '0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66', 'Solar'],
  ['AIT', '0xAE14Db486872AC07d74Ad69cC09590239b21BA2e', 'AI'],
  ['AGRO', '0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe', 'Agrotech'],
  ['POLITICAL', '0x92496E1848e001428A3495409a9A9f616bB6dD3B', 'Political'],
  ['WORIGEN', '0xccbe0c6690bf61d1f23f95f3998e4ba0d7b89f75', 'Wrapped ORIGEN · envoltorio del nativo'],
];

async function rpc(metodo, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

const sha256 = (hex) => createHash('sha256').update(Buffer.from(hex.replace(/^0x/, ''), 'hex')).digest('hex');

const registro = {};
for (const [simbolo, direccion, nombre] of CONTRATOS) {
  const codigo = await rpc('eth_getCode', [direccion, 'latest']);
  if (!codigo || codigo === '0x') {
    console.error(`  ${simbolo}: SIN CODIGO en ${direccion} — no se registra`);
    continue;
  }
  registro[direccion.toLowerCase()] = { simbolo, nombre, bytecodeSha256: sha256(codigo), bytes: (codigo.length - 2) / 2 };
}

if (process.argv.includes('--comprobar')) {
  // Compara con lo escrito en index.html: un hash que cambio es un contrato
  // que cambio, y eso hay que mirarlo antes de republicar el registro.
  const html = await readFile(join(AQUI, 'index.html'), 'utf8');
  let malas = 0;
  for (const [dir, r] of Object.entries(registro)) {
    const escrito = (html.match(new RegExp(`"${dir}"[^}]*bytecodeSha256:\\s*"([0-9a-f]{64})"`)) || [])[1];
    const ok = escrito === r.bytecodeSha256;
    if (!ok) malas++;
    console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${r.simbolo.padEnd(9)} ${dir} ${ok ? 'coincide' : `en cadena ${r.bytecodeSha256.slice(0, 12)}… · registrado ${(escrito || '—').slice(0, 12)}…`}`);
  }
  console.log(malas ? `\n${malas} contrato(s) no coinciden con el registro` : '\nTodo en verde: la cadena dice lo que dice el registro');
  process.exit(malas ? 1 : 0);
}

const hoy = new Date().toISOString().slice(0, 10);
console.log(`// Generado por verificar-contratos.mjs el ${hoy} contra ${RPC}`);
console.log('const VERIFICADOS = {');
for (const [dir, r] of Object.entries(registro)) {
  console.log(`  "${dir}": { simbolo: "${r.simbolo}", nombre: ${JSON.stringify(r.nombre)}, bytecodeSha256: "${r.bytecodeSha256}", bytes: ${r.bytes}, registradoEn: "${hoy}", fuente: null },`);
}
console.log('};');
