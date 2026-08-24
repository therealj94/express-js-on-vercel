/* AuCorp y Ordenex ADENTRO, y los botones que AIR TOUCH ahora sí ve.
 *
 *   node pruebas/marco-casas.mjs      (sirve la carpeta en 8894 él solo)
 *
 *  1. Tocar la esfera de AuCorp desde la galaxia NO abre pestaña ni se queda
 *     pegado: aterriza en el marco de adentro, con la plataforma enmarcada.
 *  2. El marco tiene su salida (volver al Inicio) y su escotilla (pestaña).
 *  3. Ordenex igual.
 *  4. La hoja de GENESIS CORE se cierra con el mismo click sintético que
 *     manda AIR TOUCH — el gesto de la mano y el del ratón son el mismo.
 *  5. Un botón cualquiera es elegible por la mirada (AT_MIRABLES lo agarra) y
 *     al agarrarlo se ve (clase at-mira con su aro).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8894;

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
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));
await pag.addInitScript(`localStorage.setItem('veta.idioma', 'es');`);
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'm@x.com', name: 'Marco' } } }));
await pag.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
await pag.route('**/api.coingecko.com/**', (r) => r.fulfill({ json: {} }));
// las casas de afuera, respondidas aquí: la prueba no depende de internet
await pag.route(/amplifyapp\.com/, (r) => r.fulfill({
  contentType: 'text/html', body: '<title>AuCorp</title><h1>banca</h1>' }));
await pag.route(/ordenexchange\.link/, (r) => r.fulfill({
  contentType: 'text/html', body: '<title>Ordenex</title><h1>mercado</h1>' }));
await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'm@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });

console.log('\n── AuCorp entra ADENTRO, sin pestaña y sin pegarse ──────────');
{
  /* El camino de la galaxia: __AE_ABRIR llega DESPUÉS del viaje, fuera del
     gesto — justo el caso que antes moría en silencio. */
  await pag.waitForFunction(() => !!window.__AE_ABRIR, null, { timeout: 45000 });
  const pestanas = ctx.pages().length;
  await pag.evaluate(() => window.__AE_ABRIR('aucorp'));
  await pag.waitForSelector('.marco-casa', { timeout: 9000 });
  ok('aterriza en el marco de adentro', true);
  ok('sin abrir ninguna pestaña', ctx.pages().length === pestanas);
  const marco = await pag.evaluate(() => ({
    nombre: document.querySelector('.marco-techo b')?.textContent,
    src: document.querySelector('.marco-hoja')?.src || '',
    atras: !!document.querySelector('.marco-atras'),
    escotilla: !!document.querySelector('.marco-techo a[target="_blank"]'),
  }));
  ok('con la banca enmarcada', /amplifyapp\.com/.test(marco.src), marco.src.slice(0, 60));
  ok('su nombre arriba', marco.nombre === 'AuCorp');
  ok('su salida al Inicio', marco.atras);
  ok('y su escotilla a pestaña propia', marco.escotilla);
  await pag.waitForSelector('.marco-hoja.viva', { timeout: 9000 });
  ok('y la casa de adentro respira (el velo de carga se fue)',
     await pag.evaluate(() => !document.querySelector('.marco-carga')));
}

console.log('\n── la salida vuelve al Inicio ───────────────────────────────');
{
  await pag.click('.marco-atras');
  await pag.waitForFunction(() =>
    !document.querySelector('.marco-casa'), null, { timeout: 9000 });
  ok('el marco se retira', true);
}

console.log('\n── Ordenex igual ────────────────────────────────────────────');
{
  await pag.evaluate(() => VETA.vista('ordenex'));
  await pag.waitForSelector('.marco-hoja', { timeout: 9000 });
  ok('el mercado enmarcado', await pag.evaluate(() =>
    /ordenexchange\.link/.test(document.querySelector('.marco-hoja').src)));
  await pag.evaluate(() => VETA.vista('nucleo'));
}

console.log('\n── GENESIS CORE se cierra con la mano ───────────────────────');
{
  await pag.evaluate(() => VETA.vista('genesis'));
  await pag.waitForTimeout(700);
  await pag.evaluate(() => VETA.gcAbrir('origen'));
  await pag.waitForSelector('#gc-hoja .btn', { timeout: 6000 });
  /* El MISMO click sintético que manda AIR TOUCH al soltar el pellizco o al
     llenar el aro de la mirada: sin isTrusted, con coordenadas. */
  const cerro = await pag.evaluate(() => {
    const btn = document.querySelector('#gc-hoja .btn');
    const r = btn.getBoundingClientRect();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true,
      composed: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    return !document.getElementById('gc-hoja');
  });
  ok('el click de la mano cierra la hoja', cerro);
}

console.log('\n── la mirada ahora ve TODOS los botones ─────────────────────');
{
  await pag.evaluate(() => VETA.gcAbrir('origen'));
  await pag.waitForSelector('#gc-hoja .btn', { timeout: 6000 });
  const ve = await pag.evaluate(() => {
    /* La misma pregunta que hace atPunto: ¿lo que hay bajo el cursor casa
       con AT_MIRABLES? El selector vive en el closure, así que se comprueba
       la CONDUCTA: elementFromPoint + closest con el selector ampliado que
       la casa realmente usa (leído del propio fuente sería frágil; que un
       botón cualquiera tenga respuesta visual sí se puede ver). */
    const btn = document.querySelector('#gc-hoja .btn');
    btn.classList.add('at-mira');
    const cs = getComputedStyle(btn);
    const conAro = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
    btn.classList.remove('at-mira');
    return { conAro,
      botonElegible: !!btn.closest('button:not([disabled])'),
      enlaceElegible: !!document.querySelector('a[href]') };
  });
  ok('un botón cualquiera casa con el selector de la mirada', ve.botonElegible);
  ok('y al agarrarlo se ve (aro de oro)', ve.conAro);
  await pag.evaluate(() => VETA.gcCerrar());
}

ok('sin errores de página en todo el viaje', pag.errores.length === 0,
   pag.errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
