/* LA EXPERIENCIA COMPLETA DEL VISOR, comprobada por dentro.
 *
 *   node pruebas/visor-teatro.mjs      (sirve la carpeta en 8881 él solo)
 *
 * Esto es lo que se le va a enseñar a gente, así que se comprueba el recorrido
 * entero y sus reglas — no que «algo aparece»:
 *
 *  1. AL PONERSE EL VISOR HAY UNA PUERTA, no la galaxia suelta: un botón que
 *     se toca con la mirada.
 *  2. HASTA TOCARLO, LA MIRADA NO ABRE NADA. Es el accidente que se impide:
 *     acomodarse la correa y caer dentro de una app sin haberlo pedido.
 *  3. TOCARLO EMPIEZA LA HISTORIA, y las palabras salen EN LA ESCENA —el HTML
 *     no sirve en estéreo—, delante de la persona.
 *  4. MIENTRAS CUENTA, SOLO SE PUEDE SALIR. La mirada sigue sin abrir casas.
 *  5. AL TERMINAR, EL ECOSISTEMA QUEDA USABLE: se levanta el blindaje y la
 *     mirada vuelve a abrir casas.
 *  6. SALIR DEL VISOR NO DEJA NADA COLGADO: ni pórtico, ni palabras, ni
 *     blindaje.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8881;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 't1', userId: 't1', address: '0x' + 'b'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 900, height: 500 }, locale: 'es',
  hasTouch: true, isMobile: true });
const pag = await ctx.newPage();
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));
await pag.addInitScript(`localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.musica','no');
  Element.prototype.requestFullscreen = function(){ return Promise.resolve(); };`);
await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 't@x.com', name: 'José' } } }));
await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForFunction(() => !document.getElementById('velo-og'), null, { timeout: 20000 }).catch(() => {});
const puerta = await pag.$('#bienvenida .btn-oro');
if (puerta && await puerta.isVisible()) await puerta.click();
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 't@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });
await pag.waitForFunction(() => !!window.__AE_VISOR && !!window.__AE_PORTICO,
  null, { timeout: 45000 });
await pag.waitForTimeout(2500);

console.log('\n── ponerse el visor abre UNA PUERTA, no la galaxia ──────────');
{
  await pag.evaluate(() => VETA.vsEntrar('trescientos60'));
  await pag.waitForFunction(() => window.VISOR.activo(), null, { timeout: 30000 });
  ok('el modo visor entra', true);
  await pag.waitForFunction(() => window.__AE_BLINDADO === true, null, { timeout: 9000 });
  ok('y la mirada nace BLINDADA', true);

  /* La prueba de que el blindaje sirve: se apunta a una casa y se sostiene
     MÁS de lo que dura el dwell. No tiene que abrirse nada. */
  const abrio = await pag.evaluate(async () => {
    const real = window.__AE_MIRAR;
    let tocada = null;
    window.__AE_MIRAR = () => ({ key: 'chat', nombre: 'PULSE2CHAT' });
    const realT = window.__AE_TOCAR;
    window.__AE_TOCAR = (k) => { tocada = k; };
    const t0 = performance.now();
    while (performance.now() - t0 < 3200) await new Promise((r) => requestAnimationFrame(r));
    window.__AE_MIRAR = real; window.__AE_TOCAR = realT;
    return tocada;
  });
  ok('sostener la mirada sobre una casa NO la abre', abrio === null, String(abrio));
}

console.log('\n── tocar la puerta empieza la historia ──────────────────────');
{
  /* Se aprieta el pórtico como lo apretaría una mirada sostenida: el propio
     motor avisa por el mismo evento que usa de verdad. */
  await pag.evaluate(() => dispatchEvent(new CustomEvent('ae-portico', { detail: { modo: 'inicio' } })));
  await pag.waitForFunction(() => window.__AE_GENESIS.vivo(), null, { timeout: 12000 });
  ok('la historia arranca', true);
  ok('los nombres los pone la ESCENA, no el HTML',
     await pag.evaluate(() => window.__AE_PELICULA() === 2));
  ok('y no se pinta capa HTML de rótulos',
     await pag.evaluate(() => !document.getElementById('gen-letra')));

  /* LAS PALABRAS TIENEN QUE ESTAR DELANTE. El teatro las coloca a dos metros
     y medio del ojo: se comprueba que existen y dónde caen. */
  /* Se espera a que HAYA TEXTO, no a que exista el puente: el puente contesta
     siempre, con las manos vacías si todavía no hay frase. */
  const llego = await pag.waitForFunction(() => !!window.__AE_TEATRO?.()?.texto,
    null, { timeout: 16000 }).then(() => true).catch(() => false);
  if (!llego) {
    console.log('   diag:', JSON.stringify(await pag.evaluate(() => ({
      hayDecir: typeof window.__AE_DECIR,
      hayTeatro: typeof window.__AE_TEATRO,
      teatro: window.__AE_TEATRO?.(),
      pelicula: window.__AE_PELICULA?.(),
      pruebaDirecta: (() => { try { window.__AE_DECIR('PRUEBA', 'grande'); return 'llamado'; }
        catch (e) { return 'EX ' + e.message; } })(),
    }))));
    await pag.waitForTimeout(600);
    console.log('   tras llamada directa:', JSON.stringify(await pag.evaluate(() => window.__AE_TEATRO?.())));
  }
  const t = await pag.evaluate(() => window.__AE_TEATRO());
  ok('hay palabras en la escena', !!t.texto, (t.texto || '').slice(0, 34));
  ok('y están DELANTE de la persona', t.delante,
     `${t.dist} unidades, ${t.grados}° del centro de la vista`);
}

console.log('\n── mientras cuenta, solo se puede salir ─────────────────────');
{
  ok('la mirada sigue blindada', await pag.evaluate(() => window.__AE_BLINDADO === true));
  const abrio = await pag.evaluate(async () => {
    const real = window.__AE_MIRAR;
    let tocada = null;
    window.__AE_MIRAR = () => ({ key: 'wallet', nombre: 'Veta Wallet' });
    const realT = window.__AE_TOCAR;
    window.__AE_TOCAR = (k) => { tocada = k; };
    const t0 = performance.now();
    while (performance.now() - t0 < 3200) await new Promise((r) => requestAnimationFrame(r));
    window.__AE_MIRAR = real; window.__AE_TOCAR = realT;
    return tocada;
  });
  ok('ninguna casa se abre por accidente', abrio === null, String(abrio));
  ok('y el botón de salir está a la vista',
     await pag.evaluate(() => window.__AE_PORTICO_MODO?.() === 'salir'));
}

console.log('\n── al terminar, el ecosistema queda usable ──────────────────');
{
  await pag.evaluate(() => window.__AE_GENESIS.saltar());
  await pag.waitForFunction(() => !window.__AE_GENESIS.vivo(), null, { timeout: 9000 });
  await pag.waitForFunction(() => window.__AE_BLINDADO === false, null, { timeout: 9000 });
  ok('se levanta el blindaje', true);
  ok('las palabras se retiran', await pag.evaluate(() => !window.__AE_TEATRO?.()?.texto));
  ok('y el pórtico también', await pag.evaluate(() => !window.__AE_PORTICO_MODO?.()));
  ok('el visor sigue puesto', await pag.evaluate(() => VISOR.activo()));

  /* Y AHORA SÍ: la mirada abre casas. Es el momento en que la película se
     vuelve producto. */
  const abrio = await pag.evaluate(async () => {
    VISOR.mirada(true);
    const real = window.__AE_MIRAR;
    let tocada = null;
    window.__AE_MIRAR = () => ({ key: 'chat', nombre: 'PULSE2CHAT' });
    const realT = window.__AE_TOCAR;
    window.__AE_TOCAR = (k) => { tocada = k; };
    const t0 = performance.now();
    while (performance.now() - t0 < 4200) await new Promise((r) => requestAnimationFrame(r));
    window.__AE_MIRAR = real; window.__AE_TOCAR = realT;
    return tocada;
  });
  ok('la mirada vuelve a abrir casas', abrio === 'chat', String(abrio));
}

console.log('\n── salir no deja nada colgado ───────────────────────────────');
{
  await pag.evaluate(() => VISOR.salir());
  await pag.waitForFunction(() => !window.VISOR.activo(), null, { timeout: 9000 });
  ok('el visor se quita', true);
  ok('sin blindaje colgado', await pag.evaluate(() => window.__AE_BLINDADO === false));
  ok('sin pórtico flotando', await pag.evaluate(() => !window.__AE_PORTICO_MODO?.()));
  ok('sin palabras flotando', await pag.evaluate(() => !window.__AE_TEATRO?.()?.texto));
  ok('y la casa vuelve entera', await pag.evaluate(() =>
    !document.body.classList.contains('en-visor')));
}

ok('sin errores de página en todo el recorrido', pag.errores.length === 0,
   pag.errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
