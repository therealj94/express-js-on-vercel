/* ENTRAR A TODAS LAS CASAS Y PODER VOLVER.
 *
 *   node pruebas/inicio-ida-y-vuelta.mjs
 *
 * Esta prueba nació de un encierro real: se entraba a PULSE2CHAT desde el
 * planeta, se tocaba atrás, y la app quedaba pegada — el Inicio volvía a
 * abrir la casa sola porque el motor todavía la tenía marcada como abierta.
 * Aquí se recorre el ecosistema entero por el CAMINO DE LA PERSONA (tocar el
 * planeta, tocar ENTRAR) y se exige volver, cada vez:
 *
 *   · las casas de adentro (billetera, chat, identidad, ajustes, pay) abren
 *     su vista y el Inicio las recupera;
 *   · las de afuera (ordenscan, aucorp, ordenex) abren pestaña y la galaxia
 *     exhala de vuelta al cielo sin dejar a nadie mirando «Entrando…»;
 *   · el botón de atrás del navegador nunca deja la casa trabada;
 *   · las pestañas de abajo siempre responden.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const PUERTO = 8873;
spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', new URL('..', import.meta.url).pathname], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

async function entrar(ctx) {
  const p = await ctx.newPage();
  await p.addInitScript("localStorage.setItem('veta.genesis.visto','1')");
  // las casas enmarcadas, respondidas aquí: sin internet y sin sorpresas
  await p.route(/amplifyapp\.com/, (r) => r.fulfill({
    contentType: 'text/html', body: '<title>AuCorp</title><h1>banca</h1>' }));
  await p.route(/ordenexchange\.link/, (r) => r.fulfill({
    contentType: 'text/html', body: '<title>Ordenex</title><h1>mercado</h1>' }));
  p.errores = [];
  p.on('pageerror', (e) => p.errores.push(String(e)));
  await p.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
  await p.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const tk = btoa(JSON.stringify({ sub: 'p1', exp: Math.floor(Date.now() / 1000) + 9999 }));
    VETA._sesion({ token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'Medardo', direccion: '0x' + '1'.repeat(40) });
    VETA._identidad({ estado: 'verificada' });
    document.getElementById('velo-og')?.remove();
    document.getElementById('app')?.classList.remove('oculto');
    for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
    VETA.ir('app'); VETA.auraBienFin?.();
  });
  await p.waitForFunction(() => !!window.__aeCamera, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(4200);
  return p;
}

const ADENTRO = [
  { key: 'wallet', vista: 'billetera' },
  { key: 'chat', vista: 'chat' },
  { key: 'gid', vista: 'identidad' },
  { key: 'pay', vista: 'pay' },
  { key: 'genesis', vista: 'genesis' },
  { key: 'ajustes', vista: 'ajustes' },
];
const AFUERA = ['scan', 'aucorp', 'oxch'];

console.log('\n── ida y vuelta por las casas de adentro ────────────────────');
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
const p = await entrar(ctx);
{
  for (const casa of ADENTRO) {
    await p.evaluate((k) => window.__AE_ABRIR(k), casa.key);
    await p.waitForTimeout(1100);
    const llego = await p.evaluate(() => VETA.dondeEstoy());
    ok(`entrar a ${casa.key} abre ${casa.vista}`, llego === casa.vista, llego);

    /* LA VUELTA. Es la parte que estaba rota: el Inicio tiene que quedarse en
       el Inicio, no rebotar de vuelta a la casa que se acaba de cerrar. */
    await p.evaluate(() => VETA.vista('nucleo'));
    await p.waitForTimeout(2600);
    const donde = await p.evaluate(() => VETA.dondeEstoy());
    ok(`  y volver al Inicio se QUEDA en el Inicio`, donde === 'nucleo', donde);
    ok(`  con la galaxia viva otra vez`, await p.evaluate(() =>
      !!document.querySelector('#ae-casa canvas')));
  }
}

console.log('\n── el botón de atrás del navegador ──────────────────────────');
{
  await p.evaluate(() => window.__AE_ABRIR('chat'));
  await p.waitForTimeout(1400);
  await p.goBack();
  await p.waitForTimeout(2600);
  const donde = await p.evaluate(() => VETA.dondeEstoy());
  ok('atrás desde el chat devuelve al Inicio', donde === 'nucleo', donde);
  ok('y el Inicio no vuelve a entrar solo', await p.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    return VETA.dondeEstoy() === 'nucleo';
  }));
  ok('sin quedar ningún panel de «Entrando…» colgado', await p.evaluate(() =>
    !document.querySelector('.ae-dim')));
}

console.log('\n── AuCorp y Ordenex abren ADENTRO; scan, afuera ─────────────');
{
  /* AuCorp y Ordenex ya no son pestañas: viven en su marco, dentro de la
     casa. Desde la galaxia se aterriza en el marco — sin pestañas, sin
     «Entrando…» colgado — y volver al Inicio revive el cielo. */
  for (const key of ['aucorp', 'oxch']) {
    await p.evaluate((k) => window.__AE_ABRIR(k), key);
    await p.waitForSelector('.marco-casa', { timeout: 9000 });
    ok(`${key} aterriza en su marco de adentro`, true);
    ok(`  con la plataforma enmarcada`, await p.evaluate(() =>
      /amplifyapp\.com|ordenexchange\.link/.test(document.querySelector('.marco-hoja')?.src || '')));
    await p.click('.marco-atras');
    await p.waitForFunction(() => VETA.dondeEstoy() === 'nucleo', null, { timeout: 9000 });
    await p.waitForFunction(() => !!document.querySelector('#ae-casa canvas'),
      null, { timeout: 20000 });
    ok(`  y volver revive el cielo`, true);
    await p.waitForTimeout(500);
  }
  /* ORDENSCAN sigue siendo una casa de afuera: se comprueba LA ORDEN de la
     pestaña (en el arnés no hay gesto y el navegador la bloquearía). */
  await p.evaluate(() => {
    window.__abiertas = [];
    const real = window.open;
    window.open = (u, ...r) => { window.__abiertas.push(String(u)); return real.call(window, u, ...r); };
  });
  await p.evaluate(() => window.__AE_ABRIR('scan'));
  await p.waitForTimeout(1600);
  const url = await p.evaluate(() => window.__abiertas.at(-1) || '');
  ok('scan manda a su casa de afuera', /^https?:\/\//.test(url), url.slice(0, 46));
  ok('  y la galaxia se queda en el Inicio', await p.evaluate(() => VETA.dondeEstoy()) === 'nucleo');
}

console.log('\n── las pestañas de abajo siempre responden ──────────────────');
{
  const movil = await b.newContext({ ...devices['Pixel 7'], locale: 'es' });
  const m = await entrar(movil);
  await m.evaluate(() => window.__AE_ABRIR('chat'));
  await m.waitForTimeout(1200);
  /* El saludo de PULSE2CHAT está EN PANTALLA en este momento: tocar Inicio
     tiene que funcionar igual. Mientras se comía los toques, la casa parecía
     trabada — que fue justo lo que pasó de verdad. */
  ok('el saludo de marca no bloquea la pantalla', await m.evaluate(() => {
    const c = document.getElementById('p2c-portada');
    return !c || getComputedStyle(c).pointerEvents === 'none';
  }));
  const tabs = await m.$$('.tabs .nav');
  ok('el teléfono tiene sus pestañas a mano', tabs.length >= 4, `${tabs.length}`);
  await m.click('.tabs .nav[data-vista=nucleo]', { force: true });
  await m.waitForTimeout(2600);
  ok('tocar Inicio desde el chat vuelve al Inicio', await m.evaluate(() =>
    VETA.dondeEstoy()) === 'nucleo');
  await m.click('.tabs .nav[data-vista=billetera]', { force: true });
  await m.waitForTimeout(1400);
  ok('y de ahí se sigue navegando', await m.evaluate(() => VETA.dondeEstoy()) === 'billetera');
  ok('sin errores de página en todo el recorrido', m.errores.length === 0,
     m.errores.slice(0, 2).join(' · '));
  await movil.close();
}

console.log('\n── pantalla completa ────────────────────────────────────────');
{
  const b2 = await p.evaluate(() => {
    const el = document.getElementById('pantalla-llena');
    return el ? { hay: true, oculto: el.classList.contains('oculto'),
                  arriba: el.getBoundingClientRect().top < 120,
                  derecha: el.getBoundingClientRect().right > innerWidth - 90 } : { hay: false };
  });
  ok('el botón de pantalla completa está', b2.hay && !b2.oculto);
  ok('arriba a la derecha, como se pidió', b2.arriba && b2.derecha);
  ok('y la casa sabe entrar y salir', await p.evaluate(() =>
    typeof VETA.pantallaLlena === 'function'));
  ok('sin errores de página en todo el recorrido', p.errores.length === 0,
     p.errores.slice(0, 2).join(' · '));
}

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
