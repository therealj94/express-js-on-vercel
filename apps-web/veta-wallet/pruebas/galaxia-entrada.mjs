/* La entrada galáctica, comprobada por dentro.
 *
 *   node pruebas/galaxia-entrada.mjs   (sirve la carpeta en 8899 él solo)
 *
 * Lo que se comprueba no es «hay un canvas»: es el mecanismo entero y sus
 * promesas.
 *
 *  1. El velo de apertura aparece con el logo y la frase, y SE VA SOLO.
 *  2. El cielo no es verde (el pozo se queda adentro): el fondo muestreado
 *     es azul-negro, y está VIVO — dos miradas separadas difieren.
 *  3. Entrar VIAJA: tras el palomeo del botón, la app no aparece en seco;
 *     hay un tramo en que la puerta sigue en pantalla (el hipersalto), y
 *     recién después aterriza #app.
 *  4. El interior NO se tocó: dentro de la app la galaxia queda apagada
 *     (display none) y el body conserva su fotografía de siempre.
 *  5. Salir vuelve a la puerta y el cielo se enciende otra vez.
 *  6. Con movimiento reducido: sin velo y sin viaje — la app entra en seco.
 *  7. En el teléfono nada desborda y el cielo cubre la pantalla entera.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8899;

// La carpeta se sirve sola: la prueba no depende de un servidor que alguien
// dejó (o no dejó) corriendo.
spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'p1', userId: 'p1', address: '0x' + '1'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

async function abrir({ reducido = false, ancho = 1360, alto = 900 } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto },
    reducedMotion: reducido ? 'reduce' : 'no-preference', locale: 'es' });
  const pag = await ctx.newPage();
  pag.errores = [];
  pag.on('pageerror', (e) => pag.errores.push(String(e)));
  await pag.route('**/auth/login', (r) => r.fulfill({ json: {
    token: JWT(), user: { email: 'p@x.com', name: 'Prueba Galaxia' } } }));
  await pag.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
  await pag.route('**/api.coingecko.com/**', (r) => r.fulfill({ json: {} }));
  await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  return { ctx, pag };
}

const pixel = (pag, x, y) => pag.evaluate(([px, py]) => {
  const c = document.getElementById('galaxia');
  const d = c.getContext('2d').getImageData(px * (c.width / c.clientWidth),
    py * (c.height / c.clientHeight), 1, 1).data;
  return [d[0], d[1], d[2]];
}, [x, y]);

console.log('\n── el velo de apertura ──────────────────────────────────────');
const { pag } = await abrir();
{
  const velo = await pag.evaluate(() => {
    const v = document.getElementById('velo-og');
    return v && getComputedStyle(v).display !== 'none' ? {
      frase: v.querySelector('.velo-frase')?.textContent || '',
      oro: !!v.querySelector('.velo-frase span.oro'),
      logo: !!v.querySelector('img'),
    } : null;
  });
  ok('el velo recibe con el logo de Orden Global', !!velo?.logo);
  ok('y con la frase de la casa', /futuro es orden|future is order/i.test(velo?.frase || ''), velo?.frase);
  ok('la última palabra va en oro', !!velo?.oro);
  await pag.waitForTimeout(3600);
  ok('y se va solo, sin pedir nada',
     await pag.evaluate(() => !document.getElementById('velo-og')));
}

console.log('\n── el cielo: ni verde, ni quieto ────────────────────────────');
{
  const [r, g, bl] = await pixel(pag, 6, 6);
  ok('el fondo dejó el verde: es azul-negro', bl >= g && g < 40, `rgb(${r},${g},${bl})`);
  const brillo = await pag.evaluate(() => {
    const c = document.getElementById('galaxia');
    const d = c.getContext('2d').getImageData(0, 0, c.width, Math.min(200, c.height)).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i]);
    return max;
  });
  ok('y tiene estrellas de verdad', brillo > 170, `brillo máximo ${brillo}`);
  const antes = await pag.evaluate(() =>
    document.getElementById('galaxia').getContext('2d').getImageData(0, 0, 220, 220).data.join().length);
  await pag.waitForTimeout(450);
  const despues = await pag.evaluate(() =>
    document.getElementById('galaxia').getContext('2d').getImageData(0, 0, 220, 220).data.join().length);
  const iguales = await pag.evaluate(async () => {
    const c = document.getElementById('galaxia').getContext('2d');
    const a = c.getImageData(0, 0, 220, 220).data;
    await new Promise((r) => setTimeout(r, 420));
    const b2 = c.getImageData(0, 0, 220, 220).data;
    for (let i = 0; i < a.length; i++) if (a[i] !== b2[i]) return false;
    return true;
  });
  ok('el cielo está vivo: dos miradas difieren', !iguales, String(antes === despues ? '' : ''));
}

console.log('\n── entrar es un viaje ───────────────────────────────────────');
{
  await pag.fill('#i-correo', 'p@x.com');
  await pag.fill('#i-clave', 'clave-de-prueba');
  await pag.click('#btn-acceso');
  /* El palomeo del botón tarda ~0.6s y el salto 1.35s: a un segundo del
     toque, la puerta TIENE que seguir en pantalla. Si la app ya está, el
     viaje no existió y esto es un corte disfrazado. */
  await pag.waitForTimeout(950);
  ok('a un segundo del toque, todavía se viaja',
     await pag.evaluate(() => document.getElementById('app').classList.contains('oculto')));
  await pag.screenshot({ path: '/tmp/gx-viaje.png' });
  await pag.waitForTimeout(2600);
  ok('y del otro lado está la casa', await pag.evaluate(() =>
    !document.getElementById('app').classList.contains('oculto')));
  ok('adentro la galaxia queda apagada', await pag.evaluate(() =>
    getComputedStyle(document.getElementById('galaxia')).display === 'none'));
  /* El aterrizaje cae en el Núcleo, que pinta su propio negro (en-cerebro):
     ese TAMBIÉN es diseño de adentro y no se toca. La fotografía de siempre
     se comprueba en una vista corriente, que es donde vive. */
  await pag.evaluate(() => VETA.vista('billetera'));
  await pag.waitForTimeout(400);
  ok('y el interior conserva su fotografía de siempre', await pag.evaluate(() =>
    getComputedStyle(document.body).backgroundImage.includes('fondo.jpg')));
}

console.log('\n── salir vuelve a encender el cielo ─────────────────────────');
{
  await pag.evaluate(() => VETA.salir());
  await pag.waitForTimeout(700);
  ok('salir deja en la puerta', await pag.evaluate(() =>
    !document.getElementById('acceso').classList.contains('oculto')));
  ok('con la galaxia viva otra vez', await pag.evaluate(() =>
    getComputedStyle(document.getElementById('galaxia')).display !== 'none' && GALAXIA.viva()));
  ok('sin errores de página en todo el viaje', pag.errores.length === 0,
     pag.errores.slice(0, 2).join(' · '));
  await pag.context().close();
}

console.log('\n── movimiento reducido: sin velo y sin viaje ────────────────');
{
  const { pag: q } = await abrir({ reducido: true });
  ok('el velo ni aparece', await q.evaluate(() => {
    const v = document.getElementById('velo-og');
    return !v || getComputedStyle(v).display === 'none';
  }));
  await q.fill('#i-correo', 'p@x.com');
  await q.fill('#i-clave', 'clave');
  await q.click('#btn-acceso');
  await q.waitForTimeout(1600);
  ok('la app entra en seco, como pide esa preferencia', await q.evaluate(() =>
    !document.getElementById('app').classList.contains('oculto')));
  await q.context().close();
}

console.log('\n── el teléfono ──────────────────────────────────────────────');
{
  const { pag: m } = await abrir({ ancho: 390, alto: 844 });
  await m.waitForTimeout(3600);          // el velo pasa y queda la puerta
  const medidas = await m.evaluate(() => ({
    desborde: document.documentElement.scrollWidth - innerWidth,
    cielo: (() => { const c = document.getElementById('galaxia');
      return c.clientWidth >= innerWidth && c.clientHeight >= innerHeight; })(),
  }));
  ok('nada desborda a lo ancho', medidas.desborde <= 0, `${medidas.desborde}px`);
  ok('y el cielo cubre la pantalla entera', medidas.cielo);
  await m.screenshot({ path: '/tmp/gx-movil.png' });
  ok('sin errores de página', m.errores.length === 0, m.errores.slice(0, 2).join(' · '));
  await m.context().close();
}

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
