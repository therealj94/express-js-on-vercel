/* LA TARJETA SE VENDE: 5 USD en ORIGEN, y la pantalla lo dice antes.
 *
 *   node pruebas/probar-venta-tarjeta.mjs      (sirve la carpeta él solo)
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * Emitir la tarjeta pasó de gratis a costar dinero. Lo que se rompe cuando eso
 * se hace mal no es un botón: es la confianza de quien pagó.
 *
 *   1. Que el precio salga ANTES del formulario. Enterarse de que cuesta 5
 *      dólares después de llenar el teléfono y aceptar los términos es la peor
 *      forma de enterarse.
 *   2. Que se pida la contraseña y viaje en el pago. Sin ella el servidor no
 *      puede cobrar, y el botón sería un botón que no puede funcionar.
 *   3. Que el tope de tarjetas NO aparezca en la pantalla por ningún lado. Es
 *      interno: ni el número, ni cuántas quedan.
 *   4. Que con la emisión cerrada no haya formulario que llenar.
 *   5. Que «pagada y sin tarjeta» se lea como lo que es —el dinero está, la
 *      tarjeta llega— y no como «error», que se lee como «lo perdí».
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8898;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x && !c ? '  · ' + x : ''}`); if (!c) f++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'm1', userId: 'm1', address: '0x' + '5'.repeat(40),
  kycStatus: 'approved', verificada: true,
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

// Lo que contesta el servidor fingido. Cada caso lo cambia.
let emision = { abierta: true, precioUsd: 5, precioOrigen: 1.933333, origenPriceUsd: 2.586461, verificada: true };
let respuestaPedido = { estado: 201, cuerpo: { message: 'ok', card: { last4: '1954' } } };
const pedidos = [];

const ctx = await b.newContext({ viewport: { width: 430, height: 940 }, locale: 'es' });
const pag = await ctx.newPage();
const errores = [];
pag.on('pageerror', (e) => errores.push(String(e)));
await pag.addInitScript(`localStorage.setItem('veta.idioma', 'es');`);
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'm@x.com', name: 'Marco', kycStatus: 'approved' } } }));
await pag.route('**/cards/emision', (r) => r.fulfill({ json: emision }));
/* Genesis ID verificado: la pantalla mira `identidad.estado`, no el JWT. Sin
   esto no sale el formulario y la prueba mediría una pantalla que no es. */
await pag.route('**/genesis/estado', (r) => r.fulfill({ json: {
  estado: 'verificada', status: 'verificada', verified: true, gid: 'GID-PRUEBA' } }));
// Sin tarjeta: el 404 es lo que la pantalla lee como «todavía no tenés».
await pag.route('**/cards/my-card', (r) => r.fulfill({ status: 404, json: { message: 'no card' } }));
await pag.route('**/cards/request', (r) => {
  pedidos.push(JSON.parse(r.request().postData() || '{}'));
  r.fulfill({ status: respuestaPedido.estado, json: respuestaPedido.cuerpo });
});
await pag.route('**/cards/transactions**', (r) => r.fulfill({ json: [] }));
await pag.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
await pag.route('**/api.coingecko.com/**', (r) => r.fulfill({ json: {} }));

await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'm@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });

const irATarjeta = async () => {
  await pag.evaluate(() => VETA.vista('tarjeta'));
  await pag.waitForTimeout(1600);
};
const texto = () => pag.evaluate(() => document.getElementById('lienzo')?.innerText || document.body.innerText);

console.log('\n── el precio, antes del formulario ──────────────────────────');
await irATarjeta();
{
  const t = await texto();
  ok('se dice cuánto cuesta emitir', /\$5(\.00)?/.test(t), t.slice(0, 200));
  ok('y cuántos ORIGEN se cobran', /1\.93|1,93/.test(t), (t.match(/[\d.,]+ ORIGEN/g) || []).join(' · '));
  const antes = await pag.evaluate(() => {
    const c = document.querySelector('.tar-precio')?.getBoundingClientRect().top ?? 1e9;
    const form = document.querySelector('#tar-cod')?.getBoundingClientRect().top ?? -1;
    return { c, form };
  });
  ok('y el precio va ARRIBA del formulario', antes.c < antes.form, JSON.stringify(antes));
  ok('hay dónde poner la contraseña', await pag.evaluate(() => !!document.getElementById('tar-clave')));
  const pie = await pag.evaluate(() =>
    document.getElementById('tar-clave')?.closest('.campo')?.querySelector('.pie')?.textContent || '');
  ok('y el pie del campo habla del PAGO, no de revelar el número',
    /firmar el pago/i.test(pie), pie);
  /* EL BOTÓN DICE LO QUE VA A PAGAR — la misma regla que la casa escribió
     para vender. Un botón que dice «Solicitar» donde se cobran 5 dólares es
     el peor sitio para callarlo. */
  const btn = await pag.evaluate(() => document.getElementById('tar-btn')?.textContent?.trim() || '');
  ok('el botón nombra el importe', /\$5/.test(btn), btn);
}

if (process.env.VETA_FOTO) {
  await pag.screenshot({ path: process.env.VETA_FOTO, fullPage: true });
  console.log(`  ·     foto en ${process.env.VETA_FOTO}`);
}

console.log('\n── el tope no se ve por ningún lado ─────────────────────────');
{
  const t = await texto();
  ok('no se dice el tope ni cuántas quedan',
    !/\b40\b/.test(t) && !/quedan|restantes|cupo/i.test(t),
    t.replace(/\s+/g, ' ').slice(0, 240));
}

console.log('\n── se paga: la clave viaja con el pedido ────────────────────');
{
  pedidos.length = 0;
  await pag.fill('#tar-cod', '504');
  await pag.fill('#tar-tel', '99999999');
  await pag.fill('#tar-clave', 'mi-clave');
  await pag.check('#tar-term');
  await pag.click('#tar-btn');
  await pag.waitForTimeout(1500);
  ok('se manda un solo pedido', pedidos.length === 1, String(pedidos.length));
  ok('con la contraseña dentro', pedidos[0]?.password === 'mi-clave');
  ok('y con los términos aceptados', pedidos[0]?.acceptedTerms === true);
}

console.log('\n── pagada y sin tarjeta: el dinero está ─────────────────────');
{
  respuestaPedido = { estado: 502, cuerpo: { code: 'PAGADA_SIN_EMITIR', message: 'x' } };
  await irATarjeta();
  await pag.fill('#tar-cod', '504');
  await pag.fill('#tar-tel', '99999999');
  await pag.fill('#tar-clave', 'mi-clave');
  await pag.check('#tar-term');
  await pag.click('#tar-btn');
  await pag.waitForTimeout(1500);
  const aviso = await pag.evaluate(() => document.getElementById('tar-aviso')?.textContent || '');
  ok('se dice que el pago quedó registrado', /pago quedó registrado/i.test(aviso), aviso);
  ok('y que volver a tocar no cobra de nuevo', /no se cobra de nuevo/i.test(aviso), aviso);
  ok('el botón vuelve a funcionar',
    await pag.evaluate(() => document.getElementById('tar-btn')?.disabled === false));
}

console.log('\n── con la emisión cerrada, no hay formulario ────────────────');
{
  respuestaPedido = { estado: 201, cuerpo: { message: 'ok' } };
  emision = { abierta: false, precioUsd: 5, precioOrigen: 1.933333, origenPriceUsd: 2.586461, verificada: true };
  await pag.evaluate(() => VETA.vista('billetera'));
  await pag.waitForTimeout(400);
  // Se tira lo leído para que la pantalla vuelva a preguntar.
  await pag.evaluate(() => { VETA.reintentar(); });
  await pag.waitForTimeout(600);
  await irATarjeta();
  const t = await texto();
  ok('se dice que no se están emitiendo tarjetas', /no estamos emitiendo/i.test(t), t.slice(0, 200));
  ok('y no hay formulario que llenar',
    await pag.evaluate(() => !document.getElementById('tar-btn')));
  ok('sin decir por qué no: eso es interno', !/\b40\b|cupo|quedan/i.test(t));
}

console.log('\n── sin errores de JavaScript ────────────────────────────────');
ok('la consola quedó limpia', errores.length === 0, errores.slice(0, 2).join(' | '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo.\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
