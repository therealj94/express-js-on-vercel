/* ¿UN TOQUE ABRE EL PLANETA? — la queja del 27-sep: «esos planetas no se
 * pueden tocar».
 *
 *   node pruebas/toque-planeta.mjs
 *
 * El gesto tenía tres trampas: descartaba todo toque de más de 260 ms, leía
 * como giro cualquier temblor de más de 10 px, y para entrar pedía un SEGUNDO
 * toque en menos de 340 ms sobre un planeta que ya se había movido. Aquí se
 * fija lo que tiene que pasar ahora:
 *
 *   rápido, quieto              → entra
 *   rápido, con 12 px de temblor → entra
 *   lento (400 ms), quieto      → entra
 *   pulsación larga (800 ms)    → enseña la ficha, no entra ni abre menú
 *   arrastre de 40 px           → gira, no abre nada
 *
 * Los eventos se despachan DENTRO de la página, con sus tiempos por reloj de
 * la página: dibujando por software un cuadro tarda segundos, y un toque
 * mandado desde fuera llegaba con dos segundos y medio entre apretar y soltar,
 * que es una pulsación larga por mucho que el guion dijera 60 ms.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let malas = 0;
const exigir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '  ' + extra : ''}`);
};

const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': T[extname(p)] || 'application/octet-stream' }); r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, ok));
const base = `http://127.0.0.1:${sv.address().port}`;

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function abrirInicio() {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-HN', hasTouch: true, isMobile: true });
  p.on('pageerror', (e) => console.log('  ERROR JS:', String(e).slice(0, 300)));
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.setItem('veta.sesion', JSON.stringify({
    token: 'x.' + btoa(JSON.stringify({ address: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2', exp: 2e9 })) + '.y',
    correo: 'jose@ordenglobal.org', nombre: 'José Enamorado',
    direccion: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2' })));
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.evaluate(() => { try { (0, eval)('VETA').vista('nucleo'); } catch {} });
  await p.waitForFunction(() => typeof window.__AE_MIRAR === 'function' && !window.__AE_PUERTA,
    null, { timeout: 60000 });
  await p.waitForTimeout(4000);
  return p;
}

/* El centro de toque de una casa, barriendo con el mismo rayo que usa el dedo. */
const centro = (p, key) => p.evaluate((key) => {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < innerHeight; y += 6) for (let x = 0; x < innerWidth; x += 6) {
    let c = null; try { c = window.__AE_MIRAR(x, y); } catch {}
    if (c?.key === key) { n++; sx += x; sy += y; }
  }
  return n ? { x: Math.round(sx / n), y: Math.round(sy / n) } : null;
}, key);

const tocar = (p, { x, y }, ms, mov) => p.evaluate(({ x, y, ms, mov }) => new Promise((ok) => {
  const cv = document.querySelector('#ae-casa canvas');
  const ev = (t, px, py) => cv.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true,
    pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py }));
  ev('pointerdown', x, y);
  if (mov) ev('pointermove', x + mov, y + mov / 2);
  setTimeout(() => {
    ev('pointerup', x + mov, y + mov / 2);
    setTimeout(() => ok({ vuela: window.AUGALAXY._transito().active,
      ficha: !!document.querySelector('.ae-whisper'),
      menu: !!document.querySelector('.ae-tear-backdrop') }), 60);
  }, ms);
}), { x, y, ms, mov });

const CASOS = [
  { que: 'toque rápido y quieto', ms: 80, mov: 0, entra: true },
  { que: 'toque rápido con 12 px de temblor', ms: 80, mov: 12, entra: true },
  { que: 'toque lento, 400 ms', ms: 400, mov: 0, entra: true },
  { que: 'pulsación larga, 800 ms', ms: 800, mov: 0, entra: false, ficha: true },
  { que: 'arrastre de 40 px', ms: 80, mov: 40, entra: false, ficha: false },
];

for (const c of CASOS) {
  const p = await abrirInicio();
  const donde = await centro(p, 'pay');
  if (!donde) { exigir(false, c.que, 'no se encontró MyTokenPay en pantalla'); await p.close(); continue; }
  const r = await tocar(p, donde, c.ms, c.mov);
  if (c.entra) {
    exigir(r.vuela && !r.ficha && !r.menu, c.que + ' → entra', JSON.stringify(r));
  } else {
    exigir(!r.vuela && r.ficha === c.ficha && !r.menu,
      c.que + (c.ficha ? ' → ficha, sin entrar' : ' → nada'), JSON.stringify(r));
  }
  await p.close();
}

/* Dos casos que encontró la revisión de Codex (PR #31). */
{
  // Un pellizco: un dedo se mueve y el otro se queda quieto sobre el planeta.
  // Soltar primero el que se movió y luego el quieto NO es un toque.
  const p = await abrirInicio();
  const d = await centro(p, 'pay');
  const r = await p.evaluate(({ x, y }) => new Promise((ok) => {
    const cv = document.querySelector('#ae-casa canvas');
    const ev = (t, id, px, py) => cv.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true,
      pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: px, clientY: py }));
    ev('pointerdown', 1, x, y);
    ev('pointerdown', 2, x + 120, y + 60);
    ev('pointermove', 2, x + 170, y + 110);
    ev('pointerup', 2, x + 170, y + 110);
    setTimeout(() => { ev('pointerup', 1, x, y);
      setTimeout(() => ok({ vuela: window.AUGALAXY._transito().active }), 60); }, 80);
  }), d);
  exigir(!r.vuela, 'soltar un pellizco sobre un planeta no entra', JSON.stringify(r));
  await p.close();
}
{
  // Pulsación larga (enseña la ficha) y después arrastre: la ficha se retira.
  const p = await abrirInicio();
  const d = await centro(p, 'pay');
  const r = await p.evaluate(({ x, y }) => new Promise((ok) => {
    const cv = document.querySelector('#ae-casa canvas');
    const ev = (t, px, py) => cv.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true,
      pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py }));
    ev('pointerdown', x, y);
    setTimeout(() => {
      const conFicha = !!document.querySelector('.ae-whisper') || document.body.classList.contains('hay-ficha');
      ev('pointermove', x + 30, y); ev('pointermove', x + 60, y);
      setTimeout(() => { ev('pointerup', x + 60, y);
        setTimeout(() => ok({ conFicha, despues: document.body.classList.contains('hay-ficha'),
          vuela: window.AUGALAXY._transito().active }), 700); }, 60);
    }, 800);
  }), d);
  exigir(r.conFicha && !r.despues && !r.vuela, 'pulsación larga y luego arrastre: la ficha se retira y no entra', JSON.stringify(r));
  await p.close();
}

await nav.close();
sv.close();
console.log(malas ? `\n${malas} falla(s)` : '\nTodo en verde');
process.exit(malas ? 1 : 0);
