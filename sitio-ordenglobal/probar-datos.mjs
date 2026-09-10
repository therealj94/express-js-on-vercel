/* Los dos números de la página salen de fuera, o no salen.
 *
 * node probar-datos.mjs
 *
 * Esta página tuvo durante meses dos cifras inventadas: la altura de la cadena
 * subía sola con Math.random() y el precio del gramin se movía con dos senos
 * alrededor de un 2,40 escrito a mano. Las dos se ven muy convincentes, y las
 * dos eran mentira.
 *
 * Ahora las dos se piden: la altura al RPC de la 5550, el precio al mismo feed
 * de oro que usa la billetera. Aquí se comprueban las dos mitades de la regla:
 *
 *  · con respuesta, el número que se pinta es EL QUE VINO —y el precio, la
 *    cuenta correcta sobre él: onza / 31,1035 gramos / 55 por gramin—;
 *  · sin respuesta, se queda el guion. Nunca un número inventado.
 *
 * El navegador de este entorno no sale a internet, así que las dos respuestas
 * se fingen. Lo que se está probando no es que las APIs contesten: es que la
 * página haga la cuenta bien y que no se invente nada cuando no contestan.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, ok));
const BASE = `http://127.0.0.1:${sv.address().port}/index.html`;

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

// `contestan` decide si las dos APIs responden o si se caen las dos.
async function abrir(contestan) {
  const p = await nav.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript((hayRed) => {
    const real = window.fetch;
    window.fetch = (u, o) => {
      const url = String(u);
      const nuestra = url.includes('gold-api') || url.includes('ordenglobal-rpc');
      if (!nuestra) return real(u, o);
      if (!hayRed) return Promise.reject(new Error('sin red'));
      return Promise.resolve({ json: () => Promise.resolve(
        url.includes('gold-api')
          ? { price: 4377.600098 }
          : { result: { number: '0x2d1a', hash: '0x' + 'ab'.repeat(32) } }) });
    };
  }, contestan);
  await p.goto(BASE);
  await p.waitForTimeout(2200);
  const leido = await p.evaluate(() => ({
    precio: document.getElementById('fx-val')?.textContent?.trim(),
    altura: document.getElementById('height')?.textContent?.trim(),
    hash: document.getElementById('hashrow')?.textContent?.trim(),
  }));
  await p.close();
  return { ...leido, errs };
}

// ── 1 · con respuesta, los números son los que vinieron ────────────────────
const bien = await abrir(true);
comprobar(bien.errs.length === 0, 'la página no revienta', bien.errs.slice(0, 2).join(' · '));
// 4377,600098 / 31,1035 / 55 = 2,559…  → $2.56
comprobar(bien.precio === '$2.56',
  'el precio del gramin sale del oro, con la cuenta de la billetera',
  `esperado $2.56 · pintado ${bien.precio}`);
comprobar(bien.altura === (0x2d1a).toLocaleString('es-ES').replace(/\./g, ' '),
  'la altura es la que contestó la cadena', `pintado ${bien.altura}`);
comprobar(/^0x(ab)+$/.test(bien.hash || ''),
  'y el hash es el del bloque, no cuarenta dígitos al azar');

// ── 2 · sin respuesta, guion — jamás un número de adorno ───────────────────
const caido = await abrir(false);
comprobar(caido.precio === '—',
  'sin precio del oro no se inventa ninguno', `pintado ${caido.precio}`);
comprobar(caido.altura === '—',
  'sin respuesta de la cadena tampoco', `pintado ${caido.altura}`);
comprobar(caido.hash === '—', 'ni hash');

await nav.close(); sv.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
