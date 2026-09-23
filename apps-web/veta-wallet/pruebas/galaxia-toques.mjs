/* Tocar un mundo abre ESE mundo. Comprobado con toques de verdad.
 *
 *   node pruebas/galaxia-toques.mjs   (sirve la carpeta en 8897 él solo)
 *
 * Nació de un defecto que se veía y no se medía: en el teléfono, el botón
 * invisible de un nombre tapaba el nombre de otro y tocar «PULSE2CHAT» abría
 * Ordenex. Esta prueba lo mide en teléfono y en escritorio:
 *
 *  1. Cada nombre visible es el elemento de arriba en su propio centro
 *     (ningún botón vecino lo tapa).
 *  2. En el centro de cada planeta visible, la escena dice que es ese planeta
 *     y ningún nombre ajeno está encima.
 *  3. Tocar cada nombre con un dedo de verdad le pide a la casa abrir ESE
 *     mundo, no otro.
 *  4. Dentro de la wallet no hay planeta de Ajustes (ya está en la barra) y la
 *     galaxia habla el idioma de la casa.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const servidor = http.createServer(async (q, r) => {
  try {
    const ruta = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    const archivo = path.join(raiz, ruta === '/' ? 'index.html' : ruta);
    if (!archivo.startsWith(raiz)) { r.writeHead(403).end(); return; }
    const datos = await readFile(archivo);
    r.writeHead(200, { 'content-type': tipos[path.extname(archivo)] || 'application/octet-stream' }).end(datos);
  } catch { r.writeHead(404).end(); }
}).listen(8897, '127.0.0.1');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FALLA ') + m); if (!c) fallos++; };

for (const [nombre, vp, tactil] of [['teléfono', { width: 390, height: 844 }, true], ['escritorio', { width: 1440, height: 900 }, false]]) {
  console.log(`── ${nombre} ${'─'.repeat(40)}`);
  const ctx = await b.newContext({ viewport: vp, hasTouch: tactil, isMobile: tactil });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto('http://127.0.0.1:8897/index.html');
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    localStorage.setItem('veta.bienvenida.v1', '1'); VETA.idioma('es');
    VETA._sesion({ correo: 'prueba@og.test', nombre: 'Prueba', direccion: '0xb' });
    VETA._identidad({ estado: 'verificada', gid: 'OG-PRUEBA' }); VETA.ir('app');
  });
  await p.waitForTimeout(9000);

  const nombres = await p.evaluate(() => [...document.querySelectorAll('.world-label')]
    .filter((e) => getComputedStyle(e).visibility === 'visible')
    .map((e) => e.querySelector('strong').firstChild.textContent.trim()));
  ok(!nombres.includes('Settings') && !nombres.includes('Ajustes'), 'sin planeta de Ajustes dentro de la wallet');
  ok(nombres.includes('MINAS') && nombres.includes('Veta Wallet'), `habla español y están los mundos (${nombres.length})`);

  // 1 y 2 · en el mismo cuadro: la escena se congela un instante para medir
  const medida = await p.evaluate(() => {
    const r = [];
    for (const e of document.querySelectorAll('.world-label')) {
      if (getComputedStyle(e).visibility !== 'visible') continue;
      const c = e.getBoundingClientRect(), x = c.x + c.width / 2, y = c.y + c.height / 2;
      const arriba = document.elementFromPoint(x, y)?.closest('.world-label');
      r.push({ nombre: e.textContent.trim().slice(0, 14), propio: arriba === e });
    }
    return r;
  });
  const tapados = medida.filter((m) => !m.propio).map((m) => m.nombre);
  ok(tapados.length === 0, `ningún nombre tapado por otro${tapados.length ? ': ' + tapados.join(', ') : ''}`);

  // 3 · cada nombre abre su mundo
  const abiertos = [];
  await p.evaluate(() => {
    const original = window.__AE_ABRIR;
    window.__AE_PEDIDOS = [];
    window.__AE_ABRIR = (k) => { window.__AE_PEDIDOS.push(k); };   // se anota y no se abre nada
    window.__AE_RESTAURAR = () => { window.__AE_ABRIR = original; };
  });
  const claves = await p.evaluate(() => [...document.querySelectorAll('.world-label')]
    .map((e, i) => ({ i, visible: getComputedStyle(e).visibility === 'visible', texto: e.querySelector('strong').firstChild.textContent.trim() }))
    .filter((x) => x.visible));
  for (const { i, texto } of claves) {
    // primero quieta la cámara, DESPUÉS se mide dónde está el nombre: medirlo
    // antes y tocar después es tocar donde el nombre ya no está
    await p.evaluate(() => { window.__AE_PEDIDOS = []; AUGALAXY.exhalar(); });
    await p.waitForTimeout(1400);
    // y se toca cuando el nombre está quieto: con el dibujo por software un
    // cuadro puede tardar medio segundo y el nombre seguir deslizándose
    const donde = (i) => p.evaluate((i) => { const r = document.querySelectorAll('.world-label')[i].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, i);
    let c = await donde(i);
    for (let k = 0; k < 10; k++) {
      await p.waitForTimeout(250);
      const d = await donde(i);
      const quieto = Math.hypot(d[0] - c[0], d[1] - c[1]) < 2;
      c = d;
      if (quieto) break;
    }
    if (tactil) await p.touchscreen.tap(c[0], c[1]); else await p.mouse.click(c[0], c[1]);
    // el vuelo dura 2,1 s en una pantalla de verdad; dibujando por software
    // puede tardar el triple, así que se espera al pedido y no a un reloj fijo
    await p.waitForFunction(() => window.__AE_PEDIDOS.length > 0, null, { timeout: 9000 }).catch(() => {});
    const pedido = await p.evaluate(() => window.__AE_PEDIDOS.at(-1) || null);
    if (!pedido) console.log('    (debajo del dedo:', await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + e.className + ' «' + (e.textContent || '').trim().slice(0, 20) + '»' : 'nada'; }, c), ')');
    abiertos.push({ texto, pedido });
    // la cámara se queda aparcada en el planeta hasta que la casa abre su app;
    // aquí la casa no abre nada, así que se la devuelve al cielo a mano
    await p.evaluate(() => AUGALAXY.exhalar());
    await p.waitForTimeout(900);
  }
  const clave = { 'Veta Wallet': 'wallet', 'PULSE2CHAT': 'chat', 'Genesis ID': 'gid', 'MyTokenPay': 'pay', 'GENESIS CORE': 'genesis',
    'ORDENSCAN': 'scan', 'Ordenex': 'oxch', 'AuCorp': 'aucorp', 'MINAS': 'minas', 'DBNX': 'dbnx' };
  for (const { texto, pedido } of abiertos) ok(pedido === clave[texto], `tocar «${texto}» pide ${pedido}`);
  ok(errores.length === 0, 'sin errores de página' + (errores.length ? ': ' + errores[0] : ''));
  await ctx.close();
}

await b.close();
servidor.close();
console.log(fallos ? `\n${fallos} FALLAS` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
