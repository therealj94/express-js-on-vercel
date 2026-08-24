/* EL TOUR GÉNESIS, comprobado por dentro.
 *
 *   node pruebas/genesis-tour.mjs     (sirve la carpeta en 8892 él solo)
 *
 *  1. La primera vez que alguien pisa la galaxia, la historia arranca sola:
 *     tiniebla (el sistema se suelta), LA PALABRA en grande, la luz.
 *  2. Los mundos se acomodan mientras la historia avanza (sim.acomodo baja).
 *  3. Saltar limpia todo y deja la galaxia en formación, como si la historia
 *     ya hubiera pasado — porque pasó.
 *  4. La segunda visita NO se cuenta sola (la marca quedó), pero el botón de
 *     Ajustes la vuelve a contar.
 *  5. El firmamento y el resto del cielo no rompen nada: cero errores.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8892;

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
  sub: 'g1', userId: 'g1', address: '0x' + '7'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

async function abrir({ visto = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
  const pag = await ctx.newPage();
  pag.errores = [];
  pag.on('pageerror', (e) => pag.errores.push(String(e)));
  await pag.addInitScript(`localStorage.setItem('veta.idioma', 'es');
    ${visto ? "localStorage.setItem('veta.genesis.visto', '1');" : ''}`);
  /* La última ruta registrada gana: el comodín va PRIMERO y el login,
     después, para que el comodín no se lo trague. */
  await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
  await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
  await pag.route('**/auth/login', (r) => r.fulfill({ json: {
    token: JWT(), user: { email: 'g@x.com', name: 'Genesis' } } }));
  await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
  await pag.fill('#i-correo', 'g@x.com');
  await pag.fill('#i-clave', 'clave');
  await pag.click('#btn-acceso');
  await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
    null, { timeout: 30000 });
  await pag.waitForFunction(() => !!window.__AE_GENESIS, null, { timeout: 45000 });
  return { ctx, pag };
}

console.log('\n── la primera vez, la historia se cuenta sola ───────────────');
const { pag } = await abrir();
{
  await pag.waitForFunction(() => window.__AE_GENESIS.vivo(), null, { timeout: 15000 });
  ok('el tour arranca solo', true);
  ok('con sus palabras en pantalla', await pag.evaluate(() =>
    !!document.getElementById('gen-letra')));
  // la tiniebla: el sistema se SUELTA (acomodo sube hacia 1)
  await pag.waitForFunction(() => window.AETHERION.acomodo() > 0.5, null, { timeout: 9000 });
  ok('la tiniebla suelta el sistema', true);
  // la palabra, en grande
  await pag.waitForFunction(() =>
    /Sea la luz/.test(document.querySelector('#gen-letra .gen-centro')?.textContent || ''),
    null, { timeout: 12000 });
  ok('«Y dijo: Sea la luz» — en letra grande', await pag.evaluate(() =>
    document.querySelector('#gen-letra .gen-centro').classList.contains('grande')));
  // la luz: el sol nace y los mundos empiezan a acomodarse
  await pag.waitForFunction(() => window.AETHERION.acomodo() < 0.4, null, { timeout: 22000 });
  ok('y con la luz, cada mundo viaja a su órbita', true);
}

console.log('\n── saltar limpia y deja la galaxia en formación ─────────────');
{
  await pag.click('#gen-letra .gen-saltar');
  await pag.waitForFunction(() => !window.__AE_GENESIS.vivo(), null, { timeout: 6000 });
  ok('saltar apaga la historia', true);
  await pag.waitForFunction(() => !document.getElementById('gen-letra'), null, { timeout: 6000 });
  ok('y las palabras se retiran', true);
  await pag.waitForFunction(() => window.AETHERION.acomodo() < 0.05, null, { timeout: 8000 });
  ok('con el sistema en formación', true);
  ok('la marca de visto quedó', await pag.evaluate(() =>
    localStorage.getItem('veta.genesis.visto') === '1'));
  ok('sin errores de página', pag.errores.length === 0, pag.errores.slice(0, 2).join(' · '));
  await pag.context().close();
}

console.log('\n── la segunda visita no se cuenta sola ──────────────────────');
{
  const { pag: q } = await abrir({ visto: true });
  await q.waitForTimeout(5000);
  ok('con la marca puesta, nadie interrumpe', await q.evaluate(() =>
    !window.__AE_GENESIS.vivo() && !document.getElementById('gen-letra')));
  // pero el botón de Ajustes la vuelve a contar
  await q.evaluate(() => VETA.vista('ajustes'));
  await q.waitForTimeout(400);
  const fila = await q.evaluate(() =>
    [...document.querySelectorAll('#lienzo button, #lienzo .fila, #lienzo [onclick]')]
      .some((el) => (el.getAttribute('onclick') || '').includes('tourGenesis')));
  ok('la historia vive en Ajustes', fila);
  await q.evaluate(() => VETA.tourGenesis());
  await q.waitForFunction(() => window.__AE_GENESIS?.vivo(), null, { timeout: 20000 });
  ok('y desde ahí se vuelve a contar', true);
  await q.evaluate(() => window.__AE_GENESIS.saltar());
  ok('sin errores de página', q.errores.length === 0, q.errores.slice(0, 2).join(' · '));
  await q.context().close();
}

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
