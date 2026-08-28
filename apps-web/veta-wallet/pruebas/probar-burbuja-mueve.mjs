/* LA BURBUJA SE MUEVE, SE ABRE Y SE CIERRA.
 *
 * «la burbuja donde puedo hablar con aura corrido … que se puede mover, abrir
 *  y cerrar».
 *
 * Tres gestos y ni uno más: tocar abre, arrastrar mueve, y al soltarla se
 * acomoda al borde más cercano. Lo que se prueba es cada uno por separado y,
 * sobre todo, que NO se pisen: el error clásico de una burbuja arrastrable es
 * que moverla termine abriendo el panel encima de lo que se quería mirar.
 *
 * Se usa el ratón, que en Playwright dispara los mismos `pointer*` que un
 * dedo. El teclado no se puede probar acá —no existe en un navegador de
 * escritorio— y queda anotado como lo que es: sin probar.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const RAIZ = '/home/user/express-js-on-vercel/apps-web/veta-wallet';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const api = createServer((q, r) => {
  const j = (c, b) => { r.writeHead(c, { 'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*' }); r.end(JSON.stringify(b)); };
  if (q.method === 'OPTIONS') return j(204, {});
  const u = q.url.split('?')[0];
  if (u === '/genesis/estado') return j(200, { identidad: { id: 'i1',
    email: 'jose@ordenglobal.org', estado: 'verificada', gid: 'OG-1', faltanDatos: [] } });
  return j(200, u === '/wallet/deposits' || u === '/cards/transactions' ? [] : {});
});
await new Promise(ok => api.listen(0, ok));
const API = `http://127.0.0.1:${api.address().port}`;

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise(ok => sv.listen(8899, '127.0.0.1', ok));

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
await p.addInitScript((u) => { window.OG_API = u; }, API);
await p.goto('http://127.0.0.1:8899/index.html');
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
});
await p.goto('http://127.0.0.1:8899/index.html');
await p.waitForTimeout(2200);
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(2500);

const caja = () => p.evaluate(() => {
  const o = document.querySelector('#aura-orbe');
  if (!o) return null;
  const c = o.getBoundingClientRect();
  return { x: Math.round(c.left), y: Math.round(c.top),
           w: Math.round(c.width), oculto: o.hasAttribute('data-oculto') };
});

console.log('\nLa burbuja está y se puede agarrar\n');
const c0 = await caja();
ok(!!c0 && !c0.oculto, 'la burbuja está a la vista en el dashboard');
ok(c0.w >= 40, 'y es lo bastante grande para el pulgar', `mide ${c0?.w}px`);
ok(await p.evaluate(() => getComputedStyle(document.querySelector('#aura-orbe')).touchAction === 'none'),
   'el gesto es suyo: arrastrarla no arrastra la página');

console.log('\nArrastrar la mueve, y NO abre el panel\n');
const cx = c0.x + c0.w / 2, cy = c0.y + c0.w / 2;
await p.mouse.move(cx, cy);
await p.mouse.down();
await p.mouse.move(cx - 40, cy - 200, { steps: 12 });
await p.mouse.move(cx - 60, cy - 260, { steps: 8 });
const enVuelo = await caja();
ok(enVuelo.y < c0.y - 100, 'mientras se arrastra, la burbuja va con el dedo',
   `de y=${c0.y} a y=${enVuelo.y}`);
await p.mouse.up();
await p.waitForTimeout(500);

const trasSoltar = await caja();
ok(trasSoltar.y < c0.y - 100, 'al soltar se queda donde la dejaste, no vuelve sola',
   `y=${trasSoltar.y}`);
ok(trasSoltar.x <= 20 || trasSoltar.x >= 390 - trasSoltar.w - 20,
   'y se acomoda al borde: suelta a mitad de pantalla taparía cosas',
   `x=${trasSoltar.x} de 390`);
ok(!(await p.evaluate(() => document.querySelector('#aura-panel')?.classList.contains('ver'))),
   'ARRASTRAR NO ABRE: mover la burbuja no puede terminar con el panel encima');

console.log('\nTocar sí abre, y vuelve a cerrar\n');
const c1 = await caja();
await p.mouse.click(c1.x + c1.w / 2, c1.y + c1.w / 2);
await p.waitForTimeout(600);
ok(await p.evaluate(() => document.querySelector('#aura-panel')?.classList.contains('ver')),
   'un toque limpio abre el panel');
await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(400);
ok(!(await p.evaluate(() => document.querySelector('#aura-panel')?.classList.contains('ver'))),
   'y se cierra');

console.log('\nDónde la dejaste se recuerda\n');
const guardado = await p.evaluate(() => localStorage.getItem('veta.aura.orbe.pos'));
ok(!!guardado, 'la posición queda guardada',
   'quien la corrió porque es zurdo no tiene que correrla otra vez');
await p.reload();
await p.waitForTimeout(2500);
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(2000);
const trasRecargar = await caja();
ok(trasRecargar && Math.abs(trasRecargar.y - trasSoltar.y) < 60,
   'y al volver a entrar sigue donde la dejaste',
   `estaba en y=${trasSoltar.y}, volvió en y=${trasRecargar?.y}`);

await p.screenshot({ path: '/tmp/claude-0/-home-user-express-js-on-vercel/0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad/burbuja.png' });

console.log('\n  (el teclado no se puede probar en un navegador de escritorio:');
console.log('   el código lo escucha con visualViewport, pero queda SIN PROBAR)\n');

await nav.close(); sv.close(); api.close();
console.log(fallos ? `${fallos} comprobación(es) fallaron\n` : 'Todo en verde\n');
process.exit(fallos ? 1 : 0);
