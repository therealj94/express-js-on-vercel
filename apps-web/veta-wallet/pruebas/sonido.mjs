/* EL SONIDO DE LA CASA: UNA PISTA, Y NADA MÁS.
 *
 *   node pruebas/sonido.mjs      (sirve la carpeta en 8888 él solo)
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * «El sonido de fondo viejo sigue» se reportó tres veces, y las tres se
 * arregló un sistema distinto — porque había DOS. Uno era el ambiente del
 * motor de audio, que se quitó; el otro eran las voces de los planetas: una
 * nota sostenida por cada mundo, sonando sin parar mientras la galaxia
 * estuviera abierta. Con once casas son once notas encimadas, y ninguna
 * captura de pantalla las enseña.
 *
 * Un oído no sirve para comprobar esto: hay que contar los osciladores. Eso es
 * lo que hace esta prueba — mira el grafo de audio de verdad y exige que no
 * quede ni una fuente sonando que no sea la pista.
 *
 * Y comprueba las otras dos cosas que hacían que la música se sintiera rota:
 * que el botón de callarla FUNCIONE sobre la galaxia (vivía dentro de una capa
 * a la que se le habían quitado los toques, así que se veía y no hacía nada), y
 * que la música no se agache sola cuando AU-RA habla — AU-RA no tiene voz, es
 * texto, así que no había a qué hacerle sitio y lo único que lograba era que la
 * pista se fuera y volviera.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8888;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 's2', userId: 's2', address: '0x' + '9'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 900, height: 700 }, locale: 'es' });
const pag = await ctx.newPage();
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));

/* EL CONTADOR DE OSCILADORES. Se envuelve AudioContext antes de que corra una
   línea de la casa: cada oscilador que alguien cree queda anotado, con si
   sigue sonando o si ya se paró. Es la única forma de contestar «¿qué está
   sonando?» sin un oído. */
await pag.addInitScript(`
  localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.genesis.visto','1');
  localStorage.setItem('veta.musica','si');
  window.__osc = { vivos: 0, total: 0 };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const crear = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () {
      const o = crear.call(this);
      const arrancar = o.start.bind(o);
      const parar = o.stop.bind(o);
      let sonando = false;
      o.start = (...a) => { if (!sonando) { sonando = true; window.__osc.vivos++; window.__osc.total++; } return arrancar(...a); };
      o.stop = (...a) => { if (sonando) { sonando = false; window.__osc.vivos--; } return parar(...a); };
      o.addEventListener('ended', () => { if (sonando) { sonando = false; window.__osc.vivos--; } });
      return o;
    };
  }
`);
await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 's2@x.com', name: 'José' } } }));
/* La pista pesa cinco megas y no hace falta bajarla para contar osciladores:
   se responde un mp3 mínimo válido. Lo que se comprueba es el GRAFO. */
await pag.route(/cosmos\.mp3/, (r) => r.fulfill({
  contentType: 'audio/mpeg', body: Buffer.from('ffe318c400000000', 'hex') }));

await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForFunction(() => !document.getElementById('velo-og'), null, { timeout: 20000 }).catch(() => {});
const puerta = await pag.$('#bienvenida .btn-oro');
if (puerta && await puerta.isVisible()) await puerta.click();
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 's2@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });
await pag.waitForFunction(() => !!window.__AE_CASAS_VIVAS?.().length, null, { timeout: 45000 });

console.log('\n── nada suena salvo la pista ────────────────────────────────');
{
  /* Se toca la galaxia para despertar el audio —los navegadores no dejan sonar
     nada sin un gesto— y se le da tiempo de sobra a que las voces de los
     mundos naciesen, si es que quedara alguna. */
  await pag.mouse.click(450, 350);
  await pag.waitForTimeout(2200);
  const osc = await pag.evaluate(() => ({ ...window.__osc, casas: window.__AE_CASAS_VIVAS().length }));
  ok(`el cielo está armado`, osc.casas > 8, `${osc.casas} casas`);
  /* CERO. No «pocos»: una nota sostenida por casa son once, y con el sol doce.
     Si este número no es cero, hay un zumbido debajo de la música. */
  ok('no queda ni un oscilador sonando', osc.vivos === 0,
     `${osc.vivos} sonando de ${osc.total} creados`);
}

console.log('\n── el toque de elegir SÍ suena, y se apaga solo ─────────────');
{
  /* Lo que se quitó es el FONDO, no la respuesta: tocar un planeta tiene que
     sonar. Y su nota tiene que morir sola — si se quedara viva, cada toque
     dejaría un zumbido nuevo encima del anterior. */
  const antes = await pag.evaluate(() => window.__osc.total);
  await pag.evaluate(() => window.__AE_TOCAR?.('wallet'));
  await pag.waitForTimeout(500);
  const durante = await pag.evaluate(() => ({ ...window.__osc }));
  ok('tocar una casa hace sonar algo', durante.total > antes,
     `${durante.total - antes} nota(s)`);
  await pag.waitForTimeout(1200);
  const luego = await pag.evaluate(() => window.__osc.vivos);
  ok('y esa nota se apaga sola', luego === 0, `${luego} quedaron sonando`);
}

console.log('\n── el botón de la música funciona SOBRE la galaxia ──────────');
{
  const btn = await pag.$('#musica-btn');
  ok('el botón está en pantalla', !!btn);
  if (btn) {
    /* ESTE ERA EL FALLO. El botón vivía dentro de una capa a la que se le
       quitan los toques mientras se ve la galaxia, y solo tres elementos los
       recuperaban. Se veía, se podía apuntar, y no hacía nada: había que irse
       hasta Ajustes. Así que no basta con que exista — hay que preguntar QUIÉN
       recibe el toque en su centro. */
    const quien = await btn.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(t) ? 'el botón' : (t?.id || t?.className || 'otra cosa');
    });
    ok('y el toque le llega a él', quien === 'el botón', String(quien));

    const antes = await pag.evaluate(() => window.MUSICA.quiere());
    await btn.click();
    await pag.waitForTimeout(500);
    const despues = await pag.evaluate(() => window.MUSICA.quiere());
    ok('tocarlo cambia la música', antes !== despues, `${antes} → ${despues}`);
    ok('y el botón se ve como quedó',
       await btn.evaluate((el) => el.classList.contains('callada')) === !despues);
    await btn.click();     // se deja como estaba
    await pag.waitForTimeout(300);
  }
}

console.log('\n── la música no se agacha sola ──────────────────────────────');
{
  /* NO SE MIDE EL VOLUMEN, SE MIRA QUIÉN PIDE BAJARLO.
     Medir el volumen obligaría a que la pista esté sonando de verdad, y una
     pista de cinco megas no pinta nada en una prueba de lógica. Lo que se
     quiere saber es más simple y más directo: si alguien PIDE agacharla.
     AU-RA lo pedía cada vez que decía algo —hasta seis segundos con un
     mensaje largo— y AU-RA no tiene voz: es texto en pantalla. No competía
     con nada; lo único que lograba era que la música se fuera y volviera. */
  await pag.evaluate(() => { window.__antes = window.MUSICA.ultimoAgache(); });

  await pag.evaluate(() => window.AURA?.hablar?.(
    'Esta es una frase larga de AU-RA, de las que antes agachaban la música casi seis segundos enteros.'));
  await pag.waitForTimeout(1500);
  const trasAura = await pag.evaluate(() =>
    JSON.stringify(window.MUSICA.ultimoAgache()) !== JSON.stringify(window.__antes)
      ? window.MUSICA.ultimoAgache() : null);
  ok('AU-RA hablando no pide bajar la música', trasAura === null,
     trasAura ? `${trasAura.ms}ms${trasAura.hondo ? ' hondo' : ''}` : '');

  /* Y LOS GOLPES DE LA PELÍCULA, SI PIDEN, PIDEN POCO. Antes la bajaban al
     diez por ciento durante segundo y pico: un fondo que se apaga y vuelve
     llama MÁS la atención que uno constante, que es lo contrario de lo que un
     fondo tiene que hacer. */
  await pag.evaluate(() =>
    dispatchEvent(new CustomEvent('ae-golpe', { detail: { ms: 1400 } })));
  await pag.waitForTimeout(400);
  const golpe = await pag.evaluate(() => window.MUSICA.ultimoAgache());
  ok('un golpe pide un respiro corto', !!golpe && golpe.ms <= 500,
     golpe ? `${golpe.ms}ms` : 'ninguno');
  ok('y nunca hondo', !!golpe && !golpe.hondo);
}

ok('sin errores de página en todo el recorrido', pag.errores.length === 0,
   pag.errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
