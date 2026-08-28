/* Saca TODAS las frases fijas de AU-RA en la billetera, con su clave.
 *
 *   node infra/aura/voz-grabada/sacar-frases.mjs > frases.json
 *
 * ── POR QUÉ EXISTE, SEGUNDA VEZ ───────────────────────────────────────────
 *
 * La primera versión vivía en el scratchpad de una sesión y un reinicio del
 * contenedor se la llevó. El día que hizo falta regrabar —se encontró que el
 * saludo de visita en español era la única frase sin grabar de su
 * conversación— hubo que reescribirla de memoria. Lo que hace falta dos veces
 * vive en el repositorio: esta es la lección, escrita en la ruta del archivo.
 *
 * ── QUÉ SACA Y DE DÓNDE ──────────────────────────────────────────────────
 *
 * No lee el fuente con una expresión regular: carga la app en un navegador de
 * verdad y le pide la tabla a ella (`VETA._auraTxt()`). Así lo que se graba es
 * EXACTAMENTE lo que la app dice, y una frase nueva que alguien escriba mañana
 * entra sola en la próxima grabación.
 *
 * Se recorre la tabla entera, anidados incluidos. Quedan fuera:
 *   · lo que lleva huecos «{nombre}» — se arma en vivo y lo dice la voz en
 *     vivo del nodo, no un fichero;
 *   · lo más corto que 10 letras — etiquetas de botones que nadie pronuncia.
 *
 * La clave es el FNV-1a gemelo de `claveVoz()` en aura.js: si el texto cambia
 * UNA coma, la clave cambia, el fichero no aparece, y la frase cae a la voz
 * del navegador — mejor la voz de siempre que un audio que dice otra cosa.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '../../../apps-web/veta-wallet');

/* Los mismos nombres que usa claveVoz() en aura.js. Cambiarlos allá sin
   cambiarlos acá deja el mapa entero apuntando a ficheros que no existen. */
const VOZ_NOMBRE = { es: 'aura-calida-es', en: 'aura-calida-en' };

function clave(texto, lang) {
  const bytes = Buffer.from((VOZ_NOMBRE[lang] || VOZ_NOMBRE.es) + '|' + texto, 'utf8');
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, '127.0.0.1', ok));
const WEB = `http://127.0.0.1:${sv.address().port}/index.html`;

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await nav.newPage({ bypassCSP: true });
p.on('pageerror', (e) => process.stderr.write('[pagina] ' + String(e).slice(0, 200) + '\n'));
await p.addInitScript(() => { window.OG_API = 'http://127.0.0.1:1'; });
await p.goto(WEB);
/* `typeof` y no `window.VETA`: VETA es un `const` de guion clásico — existe
   como identificador pero NO cuelga de window. Ya mordió una vez con CHAT. */
await p.waitForFunction(() => typeof VETA !== 'undefined' && !!VETA._auraTxt,
  null, { timeout: 30000 });
const tabla = await p.evaluate(() => VETA._auraTxt());
await nav.close(); sv.close();

function frasesDe(nodo, saco) {
  if (typeof nodo === 'string') {
    const t = nodo.trim();
    if (t.length >= 10 && !t.includes('{')) saco.add(t);
    return;
  }
  if (Array.isArray(nodo)) return nodo.forEach((x) => frasesDe(x, saco));
  if (nodo && typeof nodo === 'object') Object.values(nodo).forEach((x) => frasesDe(x, saco));
}

const salida = [];
for (const lang of ['es', 'en']) {
  const saco = new Set();
  frasesDe(tabla[lang], saco);
  for (const texto of saco) salida.push({ k: clave(texto, lang), idioma: lang, texto });
}
process.stdout.write(JSON.stringify(salida, null, 1) + '\n');
process.stderr.write(`frases: ${salida.length} (es+en)\n`);
