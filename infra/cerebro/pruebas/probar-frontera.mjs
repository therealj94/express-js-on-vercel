/* Lo interno no sale. Ni marcado, ni por descuido, ni por un fallo del código.
 *
 *   node infra/cerebro/pruebas/probar-frontera.mjs
 *
 * Genesis sabe todo lo de la casa. AU-RA habla con cualquiera que abra la
 * billetera. Entre las dos hay una puerta —publicar-saber.mjs— y esta prueba
 * existe para que esa puerta no dependa de que nadie se despiste.
 *
 * Lo que se comprueba no es que el programa «funcione»: es que se NIEGUE. Un
 * publicador que en la duda publica es peor que no tener publicador, porque da
 * la sensación de que hay una frontera.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const PUBLICADOR = join(AQUI, '..', 'publicar-saber.mjs');
const SABER_REAL = join(AQUI, '..', 'conocimiento', 'saber.json');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

/* Corre el publicador de verdad sobre un saber inventado, en una carpeta
   aparte. Se copia el programa para que sus rutas relativas caigan dentro del
   banco de pruebas y no toquen el archivo real de la billetera. */
function publicar(fichas) {
  const caja = mkdtempSync(join(tmpdir(), 'frontera-'));
  mkdirSync(join(caja, 'conocimiento'), { recursive: true });
  mkdirSync(join(caja, '..', '..', 'apps-web', 'veta-wallet'), { recursive: true });
  writeFileSync(join(caja, 'conocimiento', 'saber.json'), JSON.stringify({ fichas }));
  const prog = join(caja, 'publicar-saber.mjs');
  writeFileSync(prog, readFileSync(PUBLICADOR, 'utf8'));
  const destino = join(caja, '..', '..', 'apps-web', 'veta-wallet', 'saber.js');
  if (existsSync(destino)) rmSync(destino);
  let salida = '', codigo = 0;
  try {
    salida = execFileSync(process.execPath, [prog], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    codigo = e.status ?? 1;
    salida = (e.stdout || '') + (e.stderr || '');
  }
  const escrito = existsSync(destino) ? readFileSync(destino, 'utf8') : null;
  rmSync(caja, { recursive: true, force: true });
  return { codigo, salida, escrito };
}

const buena = (extra = {}) => ({
  id: 'publica', tema: 'Cosa pública', publico: true,
  revisadoPor: 'jose@ordenglobal.org', revisadoEn: '2026-08-16',
  palabras: ['cosa'], es: 'Esto lo puede saber cualquiera.', en: 'Anyone can know this.',
  ...extra,
});

console.log('\n── lo interno no cruza ─────────────────────────────────────────');

{
  const r = publicar([
    buena(),
    { id: 'secreta', tema: 'INTERNO', publico: false, palabras: ['x'],
      es: 'La contraseña del panel la tiene el equipo y los nodos están en tal sitio.',
      en: 'The panel password is with the team and the nodes are over there.' },
  ]);
  comprobar(r.codigo === 0, 'una ficha interna no impide publicar las públicas', r.salida.trim());
  comprobar(r.escrito !== null && !r.escrito.includes('contraseña del panel'),
    'y su texto NO aparece en lo que se publica');
  comprobar(r.escrito !== null && !r.escrito.includes('"publico"'),
    'ni siquiera viaja la marca: al otro lado no existe el concepto');
  comprobar((r.escrito || '').includes('Anyone can know this'),
    'lo público sí sale, en los dos idiomas');
}

console.log('\n── privado por defecto ─────────────────────────────────────────');

{
  const r = publicar([buena(), { id: 'sinmarca', palabras: ['y'], es: 'Sin marca.', en: 'Unmarked.' }]);
  comprobar(!(r.escrito || '').includes('Sin marca'),
    'una ficha SIN la marca no se publica');
}
for (const valor of ['true', 1, 'sí', 'yes']) {
  const r = publicar([buena(), { id: 'casi', publico: valor, palabras: ['z'],
    revisadoPor: 'a@b.com', revisadoEn: '2026-08-16', es: 'Casi.', en: 'Almost.' }]);
  comprobar(r.codigo !== 0 && !(r.escrito || '').includes('Casi.'),
    `«publico: ${JSON.stringify(valor)}» no cuela por true — corta la publicación`);
}

console.log('\n── marcada pública, pero con algo que no puede salir ───────────');

const veneno = [
  ['una llave privada', '0x' + 'a'.repeat(64)],
  ['una llave de AWS', 'AKIA1234567890ABCDEF'],
  ['una máquina de AWS', 'i-0aff688efc52ab8c8'],
  ['una IP', 'el nodo está en 18.234.39.26'],
  ['un campo de credencial', 'password: loquesea'],
  ['un servidor interno', 'genesis-id.onrender.com'],
];
for (const [que, texto] of veneno) {
  const r = publicar([buena({ es: `Mirá esto: ${texto}`, en: `Look: ${texto}` })]);
  comprobar(r.codigo !== 0 && r.escrito === null,
    `con ${que} dentro NO se publica NADA, ni las otras fichas`,
    r.codigo === 0 ? 'se publicó igual' : '');
}

console.log('\n── una ficha pública tiene que estar terminada ─────────────────');

{
  const r = publicar([buena({ en: '' })]);
  comprobar(r.codigo !== 0, 'sin el texto en inglés no se publica');
}
{
  const r = publicar([buena({ revisadoPor: '' })]);
  comprobar(r.codigo !== 0, 'y sin que nadie la firme, tampoco');
}
{
  const r = publicar([buena({ revisadoEn: 'ayer' })]);
  comprobar(r.codigo !== 0, 'ni sin una fecha de revisión de verdad');
}
{
  const r = publicar([buena(), buena({ tema: 'otra' })]);
  comprobar(r.codigo !== 0, 'dos fichas con el mismo id cortan la publicación');
}

console.log('\n── el archivo que hay ahora en la billetera ────────────────────');

{
  const real = JSON.parse(readFileSync(SABER_REAL, 'utf8'));
  const internas = real.fichas.filter((f) => f.publico !== true);
  const publicado = readFileSync(join(RAIZ, 'apps-web', 'veta-wallet', 'saber.js'), 'utf8');

  comprobar(internas.length > 0,
    `hay ${internas.length} ficha(s) interna(s) en Genesis — si no, esta prueba no prueba nada`);

  const coladas = internas.filter((f) => {
    const trozo = String(f.es).slice(0, 40);
    return publicado.includes(trozo) || publicado.includes(f.id);
  });
  comprobar(coladas.length === 0,
    'ninguna se coló en el saber.js que se está sirviendo',
    coladas.map((f) => f.id).join(', '));

  const publicas = real.fichas.filter((f) => f.publico === true);
  comprobar(publicas.every((f) => publicado.includes(f.id)),
    `y las ${publicas.length} públicas sí están`);

  // El publicador es determinista: correrlo otra vez no puede cambiar nada.
  execFileSync(process.execPath, [PUBLICADOR], { stdio: 'ignore' });
  comprobar(readFileSync(join(RAIZ, 'apps-web', 'veta-wallet', 'saber.js'), 'utf8') === publicado,
    'y volver a publicar da exactamente el mismo archivo');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
