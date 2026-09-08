/* RECARGAR LA TARJETA, DESDE LA TARJETA (Veta Wallet web).
 *
 *   node pruebas/probar-tarjeta-recargar.mjs      (sirve la carpeta él solo)
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * En esta pantalla se podía congelar la tarjeta, ver su número y ver su PIN —
 * y nada más. No había forma de cargarle saldo: quien quería recargar tenía
 * que saber por su cuenta que eso se hace en Ordenex, entrar, encontrar la
 * sala y pegar una dirección de cuarenta y dos caracteres. José lo pidió con
 * esas palabras: «al igual este boton este recargar en donde aparece la
 * tarjeta».
 *
 * QUÉ SE COMPRUEBA
 *
 *   1. Que el botón esté donde aparece la tarjeta, y que sea el que se ve
 *      primero: es lo que la gente viene a hacer.
 *   2. Que abra Ordenex ADENTRO, en su marco, y directamente en la sala de
 *      recargar —no en el portafolio a buscar el mismo botón otra vez.
 *   3. Que esa sala se GASTE: entrar después a Ordenex desde el Núcleo tiene
 *      que abrir donde siempre. Una intención que se queda pegada manda a
 *      alguien a una pantalla de mover dinero que no pidió.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8897;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'm1', userId: 'm1', address: '0x' + '5'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
const pag = await ctx.newPage();
const errores = [];
pag.on('pageerror', (e) => errores.push(String(e)));
await pag.addInitScript(`localStorage.setItem('veta.idioma', 'es');`);
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'm@x.com', name: 'Marco' } } }));
// La tarjeta, con forma de verdad. ACTIVE y con saldo: es el caso normal.
await pag.route('**/cards/my-card', (r) => r.fulfill({ json: {
  status: 'ACTIVE', frozen: false, last4: '1954', lastFour: '1954',
  cardHolderName: 'Marco Prueba', availableOrigen: 12.5 } }));
await pag.route('**/cards/transactions**', (r) => r.fulfill({ json: [] }));
await pag.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
await pag.route('**/api.coingecko.com/**', (r) => r.fulfill({ json: {} }));
await pag.route(/amplifyapp\.com/, (r) => r.fulfill({
  contentType: 'text/html', body: '<title>AuCorp</title><h1>banca</h1>' }));
// La casa de cambio, contestada aquí: la prueba no depende de internet.
await pag.route(/ordenexchange\.link/, (r) => r.fulfill({
  contentType: 'text/html; charset=utf-8', body: '<title>Ordenex</title><h1>casa de cambio</h1>' }));

await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'm@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });

console.log('\n── el botón, donde aparece la tarjeta ───────────────────────');
await pag.evaluate(() => VETA.vista('tarjeta'));
await pag.waitForSelector('.tar-botones', { timeout: 15000 });
{
  const botones = await pag.evaluate(() =>
    [...document.querySelectorAll('.tar-botones button')].map((x) => ({
      txt: x.innerText.trim(), oro: x.classList.contains('btn-oro'),
      alto: Math.round(x.getBoundingClientRect().height),
    })));
  ok('hay un botón de Recargar en la pantalla de la tarjeta',
     botones.some((x) => /recargar/i.test(x.txt)), JSON.stringify(botones.map((x) => x.txt)));
  ok('y es el primero: es a lo que la gente viene', /recargar/i.test(botones[0]?.txt || ''));
  ok('el único de oro, para que no compita con congelar ni con ver el PIN',
     botones.filter((x) => x.oro).length === 1);
  ok('con alto de dedo (≥ 36 px)', (botones[0]?.alto || 0) >= 36, `${botones[0]?.alto} px`);
}

console.log('\n── abre Ordenex adentro y en la sala de recargar ────────────');
{
  const pestanas = ctx.pages().length;
  await pag.click('.tar-botones button.btn-oro');
  await pag.waitForSelector('.marco-casa', { timeout: 12000 });
  const src = await pag.evaluate(() => document.querySelector('.marco-hoja')?.src || '');
  ok('sin abrir ninguna pestaña', ctx.pages().length === pestanas);
  ok('con la casa de cambio enmarcada', /ordenexchange\.link/.test(src), src.slice(0, 70));
  ok('y puesta en la sala de recargar', /#recargar$/.test(src), src.slice(-24));
  ok('con su salida de vuelta', await pag.evaluate(() => !!document.querySelector('.marco-atras')));
}

console.log('\n── y esa intención se gasta ─────────────────────────────────');
{
  await pag.click('.marco-atras');
  await pag.waitForFunction(() => !document.querySelector('.marco-casa'), null, { timeout: 9000 });
  await pag.evaluate(() => VETA.vista('ordenex'));
  await pag.waitForSelector('.marco-casa', { timeout: 12000 });
  const src = await pag.evaluate(() => document.querySelector('.marco-hoja')?.src || '');
  ok('entrar a Ordenex por su puerta de siempre abre donde siempre',
     !/#recargar/.test(src),
     'una intención pegada manda a alguien a una pantalla de mover dinero que no pidió');
}

console.log('\n── sin errores de JavaScript ────────────────────────────────');
ok('la consola quedó limpia', errores.length === 0, errores.slice(0, 2).join(' | '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo.\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
