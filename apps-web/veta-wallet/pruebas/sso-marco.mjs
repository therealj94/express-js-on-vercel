/* LA LLAVE QUE CRUZA EL CRISTAL, comprobada por dentro.
 *
 *   node pruebas/sso-marco.mjs      (sirve la carpeta en 8879 él solo)
 *
 * El fallo que esto fija: Ordenex, viviendo DENTRO de su marco, mandaba el
 * marco a app.vetawallet.com al tocar «conectar con mi Veta Wallet» — o sea,
 * metía la wallet dentro de la wallet. La CSP lo bloquea con razón, y quedaba
 * la página en blanco.
 *
 * Lo que se comprueba:
 *  1. La casa de adentro PIDE la llave en vez de viajar: el marco NO cambia
 *     de dirección.
 *  2. La wallet la acuña y la devuelve por el mismo canal.
 *  3. La puerta está cerrada por los dos lados: un mensaje de un origen que
 *     NO es el que está enmarcado se ignora — nadie más puede pedir la llave.
 *  4. Sin sesión, no hay llave.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8879;

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
  sub: 's1', userId: 's1', address: '0x' + 'c'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, locale: 'es' });
const pag = await ctx.newPage();
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));
await pag.addInitScript(`localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.musica','no');
  localStorage.setItem('veta.genesis.visto','1');`);
await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
/* El token del SSO: lo acuña el backend de la wallet y aquí se responde igual
   que él, para que el camino sea el de verdad de punta a punta. */
await pag.route('**/genesis/sso/token', (r) => r.fulfill({ json: { token: 'TOKEN-DE-PRUEBA' } }));
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 's@x.com', name: 'SSO' } } }));
/* Ordenex, fingido pero con SU comportamiento real: pide la llave al padre y
   avisa cuando la recibe. Lo que se prueba es el CANAL, no su interfaz. */
await pag.route(/ordenexchange\.link/, (r) => r.fulfill({
  contentType: 'text/html',
  body: `<!doctype html><meta charset="utf-8"><title>ORDENEX</title>
    <body style="background:#0b1020;color:#eee;font:14px system-ui">
    <h1 id="estado">fuera</h1>
    <script>
      const WALLET = 'http://127.0.0.1:${PUERTO}';
      window.__recibido = null;
      window.__pedir = () => {
        if (window.top !== window.self) {
          parent.postMessage({ og: 'sso-pedido', app: 'ordenex' }, '*');
        } else { location.href = WALLET + '/#sso-ordenex'; }
      };
      addEventListener('message', (ev) => {
        if (!ev.data) return;
        if (ev.data.og === 'sso-token') {
          window.__recibido = ev.data.token;
          document.getElementById('estado').textContent = 'dentro';
        } else if (ev.data.og === 'sso-no') {
          window.__recibido = 'NO:' + ev.data.motivo;
        }
      });
    </script></body>` }));

await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForFunction(() => !document.getElementById('velo-og'), null, { timeout: 20000 }).catch(() => {});
const puerta = await pag.$('#bienvenida .btn-oro');
if (puerta && await puerta.isVisible()) await puerta.click();
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 's@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });

console.log('\n── la casa de adentro pide, no viaja ────────────────────────');
{
  await pag.evaluate(() => VETA.vista('ordenex'));
  /* Se espera a que el marco RESPIRE, no a que exista: recién creado su
     dirección todavía es about:blank y buscarlo ahí no encuentra nada. */
  await pag.waitForFunction(() => !!document.querySelector('.marco-hoja.viva'),
    null, { timeout: 15000 });
  ok('Ordenex carga de verdad dentro del marco', true);
  const marco = pag.frames().find((fr) => /ordenexchange/.test(fr.url()));
  ok('y es su propia dirección', !!marco, marco ? marco.url().slice(0, 40) : 'sin marco');

  const antes = marco.url();
  await marco.evaluate(() => window.__pedir());
  /* La llave viaja por el canal, no por la barra de direcciones: se espera a
     que llegue, y el marco tiene que seguir donde estaba. */
  const llego = await marco.waitForFunction(() => !!window.__recibido,
    null, { timeout: 12000 }).then(() => true).catch(() => false);
  ok('la llave llega sin recargar nada', llego);
  ok('y es la que acuñó la wallet',
     await marco.evaluate(() => window.__recibido) === 'TOKEN-DE-PRUEBA');
  const despues = pag.frames().find((fr) => /ordenexchange/.test(fr.url()))?.url();
  ok('el marco NO se fue a la wallet', despues === antes, `${despues}`.slice(0, 46));
  ok('y no quedó una wallet dentro de la wallet',
     pag.frames().filter((fr) => /index\.html/.test(fr.url())).length <= 1);
}

console.log('\n── la puerta está cerrada para los demás ────────────────────');
{
  /* Un mensaje que NO viene del origen enmarcado no puede pedir la llave.
     Se manda desde la propia página —el caso más favorable para un atacante—
     y aun así tiene que ser ignorado. */
  const coló = await pag.evaluate(async () => {
    let respondio = false;
    const oir = (ev) => { if (ev.data?.og === 'sso-token') respondio = true; };
    addEventListener('message', oir);
    postMessage({ og: 'sso-pedido', app: 'ordenex' }, '*');
    await new Promise((r) => setTimeout(r, 1200));
    removeEventListener('message', oir);
    return respondio;
  });
  ok('un mensaje de otro origen se ignora', !coló);
}

console.log('\n── la ficha de versión dice qué está cargado ────────────────');
{
  await pag.evaluate(() => VETA.vista('ajustes'));
  await pag.waitForTimeout(600);
  ok('la fila de versión está en Ajustes', await pag.evaluate(() =>
    [...document.querySelectorAll('#lienzo [onclick]')]
      .some((el) => (el.getAttribute('onclick') || '').includes('versionMirar'))));
  await pag.evaluate(() => VETA.versionMirar());
  await pag.waitForSelector('.ver-lista', { timeout: 6000 });
  const ficha = await pag.evaluate(() => ({
    filas: document.querySelectorAll('.ver-lista dt').length,
    casa: document.querySelectorAll('.ver-lista dd')[0]?.textContent || '',
    galaxia: document.querySelectorAll('.ver-lista dd')[2]?.textContent || '',
    boton: !!document.getElementById('ver-refrescar'),
  }));
  ok('enseña las cuatro cosas', ficha.filas === 4, `${ficha.filas} filas`);
  ok('con el sello de la casa', /^[0-9a-f]{6,}$|sin-sellar/.test(ficha.casa), ficha.casa);
  ok('y el de la galaxia', /^[0-9a-f]{6,}$/.test(ficha.galaxia), ficha.galaxia);
  ok('con el botón que tira la copia vieja', ficha.boton);
}

ok('sin errores de página en todo el recorrido', pag.errores.length === 0,
   pag.errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
