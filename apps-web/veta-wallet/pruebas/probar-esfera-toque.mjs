/* Tocar una esfera del Núcleo abre su mundo, aunque la esfera se mueva.
 *
 * ══ EL FALLO QUE ESTE ARCHIVO FIJA ══════════════════════════════════════════
 *
 * Las esferas FLOTAN: cada una con su vuelta y su desfase, vivas desde el
 * primer fotograma. Un toque, en cambio, son dos momentos separados por
 * ochenta o cien milisegundos — y si la esfera se corre en ese rato, el
 * `pointerup` cae en el lienzo de estrellas que hay detrás.
 *
 * Cuando apretar y soltar ocurren sobre elementos distintos, el navegador NO
 * le manda el `click` a ninguno de los dos: se lo manda al ancestro común. El
 * `onclick` del botón nunca se entera, y la persona toca su billetera y no
 * pasa nada. Medido antes del arreglo:
 *
 *     pointerdown -> esfera wallet
 *     pointerup   -> CANVAS
 *     click       -> cerebro          (y nadie abre nada)
 *
 * Con «reducir movimiento» las esferas se quedan quietas y todo funcionaba,
 * que es por lo que esto se veía sólo a veces y sólo en algunas máquinas: la
 * peor forma de romperse, porque quien lo sufre parece que toca mal.
 *
 * ══ POR QUÉ LOS EVENTOS VAN A MANO ══════════════════════════════════════════
 *
 * El gesto se arma con eventos sintéticos —apretar en la esfera, soltar en el
 * lienzo— en vez de esperar a que la animación se corra sola. Depender de que
 * una esfera flote justo lo suficiente en el momento justo daría una prueba
 * que a veces pasa, y una prueba que a veces pasa no sirve para nada.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

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

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

/* El Núcleo de esferas es el RESPALDO: desde que AETHERION monta la escena 3D
   del Inicio, sólo se pinta si ese bundle no carga. Se corta el bundle para
   llegar a él — sin esto la prueba mediría una pantalla que ya no aparece. */
const montar = async (movimiento) => {
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 },
                                reducedMotion: movimiento, bypassCSP: true });
  await p.route('**/aetherion/assets/aetherion.js*', (r) => r.abort());
  await p.goto(BASE);
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    localStorage.setItem('veta.bienvenida.v1', '1');
    const t = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
    localStorage.setItem('veta.sesion', JSON.stringify({
      token: t, correo: 'jose@prueba.local', nombre: 'José', direccion: '0xaaaa' }));
  });
  await p.goto(BASE);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { VETA.idioma('es'); VETA.ir('app'); VETA.vista('nucleo'); });
  await p.waitForTimeout(1100);
  return p;
};

const centro = (p, id) => p.evaluate((k) => {
  const b = document.querySelector(`.nu-mundo[data-mundo="${k}"]`).getBoundingClientRect();
  return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
}, id);

// ── 1 · el caso exacto: se aprieta la esfera y se suelta FUERA ──────────────
console.log('\n── la esfera se mueve entre apretar y soltar ─────────────────');
{
  const p = await montar('no-preference');
  const [x, y] = await centro(p, 'wallet');
  // Apretar en la esfera y soltar 40px más allá, sobre el lienzo: exactamente
  // lo que hace la animación cuando corre la esfera bajo el dedo.
  await p.evaluate(([cx, cy]) => {
    const esfera = document.elementFromPoint(cx, cy);
    const comun = { bubbles: true, cancelable: true, composed: true, pointerId: 1,
                    pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    esfera.dispatchEvent(new PointerEvent('pointerdown', { ...comun, clientX: cx, clientY: cy }));
    const fuera = document.querySelector('#red-nucleo, canvas') || document.body;
    fuera.dispatchEvent(new PointerEvent('pointerup', {
      ...comun, buttons: 0, clientX: cx + 3, clientY: cy + 4 }));
  }, [x, y]);
  await p.waitForTimeout(1500);
  const v = await p.evaluate(() => VETA.dondeEstoy());
  comprobar(v === 'billetera', 'soltar fuera de la esfera abre igual la billetera',
    `terminó en: ${v}`);
  await p.close();
}

// ── 2 · un toque lento y quieto también es un toque ─────────────────────────
console.log('\n── quien toca despacio no se queda fuera ────────────────────');
{
  const p = await montar('no-preference');
  const [x, y] = await centro(p, 'wallet');
  await p.mouse.move(x, y);
  await p.waitForTimeout(120);
  await p.mouse.down();
  await p.waitForTimeout(1200);          // pulsación larga, sin moverse
  await p.mouse.up();
  await p.waitForTimeout(1500);
  const v = await p.evaluate(() => VETA.dondeEstoy());
  comprobar(v === 'billetera', 'una pulsación de 1,2 s sin moverse abre igual',
    `terminó en: ${v}`);
  await p.close();
}

// ── 3 · pero un jalón sigue sin abrir nada ──────────────────────────────────
console.log('\n── arrastrar la constelación no es tocarla ──────────────────');
for (const [nom, vuelta] of [['un jalón de 112 px', false], ['un jalón que VUELVE al inicio', true]]) {
  const p = await montar('no-preference');
  const [x, y] = await centro(p, 'wallet');
  await p.mouse.move(x, y);
  await p.waitForTimeout(120);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(x - i * 14, y + i * 6); await p.waitForTimeout(30); }
  if (vuelta) for (let i = 8; i >= 0; i--) { await p.mouse.move(x - i * 14, y + i * 6); await p.waitForTimeout(30); }
  await p.mouse.up();
  await p.waitForTimeout(1400);
  const v = await p.evaluate(() => VETA.dondeEstoy());
  comprobar(v === 'nucleo', `${nom} deja la constelación donde estaba`, `terminó en: ${v}`);
  await p.close();
}

// ── 4 · los dos caminos no se pisan ────────────────────────────────────────
//
// Hay dos maneras de entrar: el `onclick` del botón —que es el camino de
// siempre— y el rescate del apretón, para cuando la esfera se corre. Si los
// dos se dispararan en el mismo toque se entraría dos veces.
//
// Se espía `VETA.nuAbrir`, que es EXACTAMENTE el camino del onclick: el
// rescate llama a la función de dentro y no pasa por ahí. Así se ve cuál de
// los dos actuó en cada caso, que es lo que hay que poder distinguir.
console.log('\n── el rescate no se pisa con el clic de siempre ──────────────');
{
  // (a) la esfera quieta: entra por el onclick, el rescate se aparta
  const p = await montar('reduce');
  await p.evaluate(() => {
    window.__onclick = 0;
    const antes = VETA.nuAbrir;
    VETA.nuAbrir = (...a) => { window.__onclick++; return antes(...a); };
  });
  const [x, y] = await centro(p, 'wallet');
  await p.mouse.move(x, y);
  await p.waitForTimeout(120);
  await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => window.__onclick);
  const v = await p.evaluate(() => VETA.dondeEstoy());
  comprobar(n === 1 && v === 'billetera',
    'con la esfera quieta entra el clic de siempre, una sola vez',
    `onclick x${n} · terminó en ${v}`);
  await p.close();
}
{
  // (b) soltando fuera: el onclick NO llega —es el fallo— y entra el rescate
  const p = await montar('no-preference');
  await p.evaluate(() => {
    window.__onclick = 0;
    const antes = VETA.nuAbrir;
    VETA.nuAbrir = (...a) => { window.__onclick++; return antes(...a); };
  });
  const [x, y] = await centro(p, 'wallet');
  await p.evaluate(([cx, cy]) => {
    const esfera = document.elementFromPoint(cx, cy);
    const comun = { bubbles: true, cancelable: true, composed: true, pointerId: 1,
                    pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    esfera.dispatchEvent(new PointerEvent('pointerdown', { ...comun, clientX: cx, clientY: cy }));
    const fuera = document.querySelector('#red-nucleo, canvas') || document.body;
    fuera.dispatchEvent(new PointerEvent('pointerup', {
      ...comun, buttons: 0, clientX: cx + 3, clientY: cy + 4 }));
  }, [x, y]);
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => window.__onclick);
  const v = await p.evaluate(() => VETA.dondeEstoy());
  comprobar(n === 0 && v === 'billetera',
    'soltando fuera el clic de siempre no llega, y el rescate entra solo',
    `onclick x${n} · terminó en ${v}`);
  await p.close();
}

await nav.close();
sv.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
