/* El web OS del Inicio (Aetherion), fundido con la casa.
 *
 *   node pruebas/aetherion-inicio.mjs
 *
 * Lo que se comprueba es la FUSIÓN, no el adorno:
 *
 *  1. Pisar el Inicio monta la galaxia 3D (canvas WebGL vivo) con el saludo
 *     de la casa encima, en el idioma de la persona.
 *  2. El puente navega DE VERDAD: abrir un pozo interno desmonta la galaxia
 *     y aterriza en la vista real; volver al Inicio la remonta.
 *  3. Salir de la app apaga React del todo: nada queda quemando cuadros.
 *  4. LA RED DE SEGURIDAD: si el bundle no carga, el Inicio es el cerebro
 *     clásico de siempre — jamás una pantalla en negro.
 *  5. En el teléfono nada desborda.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
const PUERTO = 8899;
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
  p.errores = [];
  p.on('pageerror', (e) => p.errores.push(String(e)));
  await p.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
  await p.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const tk = btoa(JSON.stringify({ sub: 'p1', exp: Math.floor(Date.now() / 1000) + 9999 }));
    VETA._sesion({ token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'José', direccion: '0x' + '1'.repeat(40) });
    VETA._identidad({ estado: 'verificada' });
    document.getElementById('velo-og')?.remove();
    document.getElementById('app')?.classList.remove('oculto');
    for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
    VETA.ir('app'); VETA.auraBienFin?.();
  });
  return p;
}

console.log('\n── el Inicio ES la galaxia 3D ───────────────────────────────');
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
const p = await entrar(ctx);
{
  /* La cámara del web OS aparece cuando WebGL termina de armar el contexto;
     bajo el render por software del arnés eso puede tardar más que un reloj
     fijo. Se espera al MECANISMO, no a un número. */
  await p.waitForFunction(() => !!window.__aeCamera, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const estado = await p.evaluate(() => ({
    casa: !!document.getElementById('ae-casa'),
    canvas: !!document.querySelector('#ae-casa canvas'),
    camara: !!window.__aeCamera,
    saludo: document.querySelector('.ae-saludo')?.textContent || '',
    hud: !!document.querySelector('.ae-hud'),
  }));
  ok('la galaxia está montada en el lienzo', estado.casa && estado.canvas);
  ok('y VIVA: la cámara del web OS responde', estado.camara);
  ok('con el saludo de la casa encima', /José/.test(estado.saludo), estado.saludo.slice(0, 40));
  ok('y su HUD en pantalla', estado.hud);
  await p.screenshot({ path: '/tmp/aet-inicio.png' });
}

console.log('\n── el puente navega de verdad ───────────────────────────────');
{
  await p.evaluate(() => window.__AE_ABRIR('wallet'));
  await p.waitForTimeout(900);
  ok('abrir un pozo aterriza en la vista real', await p.evaluate(() => VETA.dondeEstoy() === 'billetera'));
  ok('y la galaxia quedó desmontada', await p.evaluate(() => !document.getElementById('ae-casa')));
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(3000);
  ok('volver al Inicio la remonta', await p.evaluate(() =>
    !!document.querySelector('#ae-casa canvas')));
  await p.evaluate(() => VETA.salir());
  await p.waitForTimeout(700);
  ok('salir de la sesión la apaga del todo', await p.evaluate(() =>
    !document.getElementById('ae-casa') || !document.querySelector('#ae-casa canvas')));
  ok('sin errores de página en el viaje', p.errores.length === 0, p.errores.slice(0, 2).join(' · '));
  await ctx.close();
}

console.log('\n── la red de seguridad: sin bundle, el cerebro clásico ──────');
{
  const c2 = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
  const q = await c2.newPage();
  q.on('pageerror', () => {});
  await q.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
  await q.route('**/aetherion/**', (r) => r.abort());     // el bundle "no existe"
  await q.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  await q.waitForTimeout(1500);
  await q.evaluate(() => {
    const tk = btoa(JSON.stringify({ sub: 'p1', exp: Math.floor(Date.now() / 1000) + 9999 }));
    VETA._sesion({ token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'P', direccion: '0x' + '1'.repeat(40) });
    VETA._identidad({ estado: 'verificada' });
    document.getElementById('velo-og')?.remove();
    document.getElementById('app')?.classList.remove('oculto');
    for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
    VETA.ir('app'); VETA.auraBienFin?.();
  });
  await q.waitForTimeout(3000);
  ok('el Inicio clásico aparece, con sus esferas', await q.evaluate(() =>
    !!document.getElementById('red-nucleo') && !!document.querySelector('.nu-mundo')));
  await c2.close();
}

console.log('\n── el teléfono ──────────────────────────────────────────────');
{
  const c3 = await b.newContext({ ...devices['Pixel 7'], locale: 'es' });
  const m = await entrar(c3);
  await m.waitForTimeout(9000);
  const md = await m.evaluate(() => {
    const s = document.querySelector('.ae-saludo')?.getBoundingClientRect();
    const tb = document.querySelector('.tabs')?.getBoundingClientRect();
    return {
      canvas: !!document.querySelector('#ae-casa canvas'),
      desborde: document.documentElement.scrollWidth - innerWidth,
      tabs: !!tb,
      /* el lienzo lleva un transform de animación que secuestraba el fixed:
         el saludo tiene que quedar ENTERO por encima de las pestañas */
      saludoLibre: !!(s && tb) && s.bottom <= tb.top && s.top > 0,
    };
  });
  ok('la galaxia monta también en el teléfono', md.canvas);
  ok('sin desbordes', md.desborde <= 0, `${md.desborde}px`);
  ok('y las pestañas de la casa siguen a mano', md.tabs);
  ok('con el saludo entero, por encima de las pestañas', md.saludoLibre);
  await m.screenshot({ path: '/tmp/aet-movil.png' });
  await c3.close();
}

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
