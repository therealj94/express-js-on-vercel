/* LA TARJETA NO PARPADEA, Y LOS PAGOS SE VEN.
 *
 *   node pruebas/probar-tarjeta-parpadeo.mjs
 *
 * POR QUÉ EXISTE
 *
 * En app.vetawallet.com/tarjeta el plástico aparecía un segundo y se iba:
 * el fondo de café parpadeaba detrás y Chrome pedía recargar. Causa: cada
 * vez que vista('tarjeta') corría, si emision era null se volvía a pedir
 * /cards/emision y se volvía a llamar vista('tarjeta'). Un 500 del precio
 * dejaba emision en null para siempre. Bucle. Crash.
 *
 * Y los pagos de CryptoMate no se pintaban: se miraba m.amount en dólares
 * y se ignoraba origenAmount, merchant_name y date.
 *
 * QUÉ SE COMPRUEBA
 *
 *   1. Con /cards/emision en 500, la pantalla de una tarjeta YA emitida
 *      se pinta y se queda. No hay bucle.
 *   2. Los movimientos que manda el backend ({ transactions, merchant,
 *      date, origenAmount }) se leen y se ven en ORIGEN.
 *   3. Un 500 de movimientos no se traduce en «todavía no hay consumos».
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8899;

try { spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('error', () => {}); } catch {}
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => {
  console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x && !c ? '  · ' + x : ''}`);
  if (!c) f++;
};

const CHROME = [
  process.env.PW_CHROME,
  '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
].find((p) => p && existsSync(p));

const b = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'm1', userId: 'm1', address: '0x' + '5'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
const pag = await ctx.newPage();
const errores = [];
pag.on('pageerror', (e) => errores.push(String(e)));
await pag.addInitScript(`localStorage.setItem('veta.idioma', 'es');`);

let pintadas = 0;
let emisionVeces = 0;
pag.on('framenavigated', () => {});

await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'm@x.com', name: 'Carlos Paguada' } } }));
await pag.route('**/cards/my-card', (r) => r.fulfill({ json: {
  status: 'ACTIVE', frozen: false, last4: '5478', lastFour: '5478',
  cardHolderName: 'Carlos Paguada', availableOrigen: 3.0095 } }));
await pag.route('**/cards/emision', (r) => {
  emisionVeces++;
  r.fulfill({ status: 500, json: { message: 'boom' } });
});
await pag.route('**/cards/transactions**', (r) => r.fulfill({ json: {
  transactions: [{
    id: 'tx-cafe',
    merchant: 'Café Central',
    date: '2026-09-08T18:40:00Z',
    amount: 12.5,
    origenAmount: 5,
    currency: 'ORIGEN',
    status: 'SUCCESS',
    type: 'TRANSACTION_CLEARED',
  }],
  total: 1, page: 1, ogTokenPrice: 2.5,
} }));
await pag.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
await pag.route('**/api.coingecko.com/**', (r) => r.fulfill({ json: {} }));
await pag.route('**/genesis/estado', (r) => r.fulfill({ json: {
  estado: 'verificada', status: 'verificada', verified: true, gid: 'GID-PRUEBA' } }));

await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'm@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });

console.log('\n── no parpadea aunque el precio de emitir falle ──────────────');
await pag.evaluate(() => { window.__pintadasTarjeta = 0; });
await pag.evaluate(() => {
  const l = document.getElementById('lienzo');
  const obs = new MutationObserver(() => {
    if (l.innerHTML.includes('tar-plastico') || l.innerHTML.includes('tar-escena')) {
      window.__pintadasTarjeta = (window.__pintadasTarjeta || 0) + 1;
    }
  });
  obs.observe(l, { childList: true, subtree: true });
  window.__obsTarjeta = obs;
});
await pag.evaluate(() => VETA.vista('tarjeta'));
await pag.waitForSelector('.tar-escena, .tar-plastico', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 2500));
pintadas = await pag.evaluate(() => window.__pintadasTarjeta || 0);

ok('el plástico se queda en pantalla', await pag.locator('.tar-escena').count() === 1);
ok('dice el nombre del titular', (await pag.locator('.tar-titular').innerText()).includes('CARLOS'));
ok('no entra en bucle de pintadas', pintadas < 8, `${pintadas} pintadas`);
ok('no pide emisión en bucle', emisionVeces < 3, `${emisionVeces} llamadas`);
ok('Chrome no recargó la página', errores.filter(e => /reload|maximum/i.test(e)).length === 0);

console.log('\n── los pagos de CryptoMate se ven ────────────────────────────');
const cuerpo = await pag.locator('#lienzo').innerText();
ok('sale el comercio', /Café Central/.test(cuerpo));
ok('sale en ORIGEN, no en dólares sueltos', /ORIGEN/.test(cuerpo) && /Café Central/.test(cuerpo));
ok('no dice que no hay consumos', !/Todavía no hay consumos/.test(cuerpo));

console.log('\n── un fallo de movimientos no miente ─────────────────────────');
await pag.unroute('**/cards/transactions**');
await pag.route('**/cards/transactions**', (r) => r.fulfill({
  status: 500, json: { message: 'Error fetching transactions' },
}));
await pag.evaluate(() => VETA.reintentarMovs());
await new Promise((r) => setTimeout(r, 800));
const cuerpo2 = await pag.locator('#lienzo').innerText();
ok('un 500 no se lee como «no hay consumos»',
  /No pudimos leer los pagos/.test(cuerpo2) || /Café Central/.test(cuerpo2));
ok('sin errores de página', errores.length === 0, errores.slice(0, 3).join(' | '));

await b.close();
sv.kill();

console.log('');
if (f) { console.log(`FALLÓ · ${f}`); process.exit(1); }
console.log('ok · la tarjeta se queda y los pagos se ven');
