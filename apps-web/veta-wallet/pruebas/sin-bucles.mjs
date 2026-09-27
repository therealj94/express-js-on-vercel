/* ¿UNA API CAÍDA DEJA LA PANTALLA EN BUCLE? — hallazgo de Codex en el PR #31.
 *
 *   python3 -m http.server 8791 --bind 127.0.0.1   (desde la raíz del repo)
 *   node apps-web/veta-wallet/pruebas/sin-bucles.mjs
 *
 * Remesas, MyTokenPay y Mi comercio piden sus datos al entrar y se vuelven a
 * pintar cuando llegan. Si la respuesta falla y el fallo no cuenta como «ya se
 * intentó», el repintado vuelve a pedir, falla otra vez, y así varias veces por
 * segundo: la pantalla no termina de aparecer y el servidor recibe una ráfaga.
 * Con las tres APIs caídas, aquí se cuenta cuántas veces se piden en cuatro
 * segundos. Una o dos es un reintento; más es un bucle.
 */
import { chromium } from 'playwright';

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });
let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };

const CASOS = [
  { vista: 'remesas', que: 'Remesas con la tasa caída', patron: /open\.er-api\.com/ },
  { vista: 'pay', que: 'MyTokenPay con el directorio caído', patron: /\/api\/companies(\?|$)/ },
  // Mi comercio falla ya al entrar a MyTokenPay: se cuenta todo lo que va a su API.
  { vista: 'paymio', que: 'Mi comercio con su API caída', patron: /mytokenpay-api-[^/]*\.herokuapp\.com/ },
];

for (const c of CASOS) {
  const ctx = await nav.newContext({ locale: 'es-HN', viewport: { width: 430, height: 900 } });
  const pag = await ctx.newPage();
  const err = []; pag.on('pageerror', (e) => err.push(String(e)));
  let pedidos = 0;
  await pag.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:8791')) return route.continue();
    if (c.patron.test(u)) { pedidos++; return route.fulfill({ status: 503, body: 'caído' }); }
    if (u.includes('/augalaxy/')) return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/index.html', { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(2000);
  await pag.evaluate(() => {
    const tk = btoa(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 99999 }));
    VETA._sesion({ token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'Prueba', direccion: '0x' + '1'.repeat(40) });
    VETA._identidad({ estado: 'verificada' });
    document.getElementById('velo-og')?.remove();
    document.getElementById('app')?.classList.remove('oculto');
    for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
  });
  await pag.waitForTimeout(500);
  pedidos = 0;
  await pag.evaluate((v) => VETA.vista(v), c.vista);
  /* Y también se cuentan los REPINTADOS: si el fallo ocurre antes de salir a
     la red (sin llaves para entrar, por ejemplo), el bucle no pide nada pero
     rehace la pantalla sin parar. */
  await pag.evaluate(() => {
    window.__repintes = 0;
    new MutationObserver(() => { window.__repintes++; })
      .observe(document.getElementById('lienzo') || document.body, { childList: true });
  });
  await pag.waitForTimeout(4000);
  const repintes = await pag.evaluate(() => window.__repintes);
  ok(`${c.que}: no se pide en bucle`, pedidos <= 2, `${pedidos} pedidos en 4 s`);
  ok('  ni se repinta en bucle', repintes <= 6, `${repintes} repintados en 4 s`);
  ok('  y sin errores de javascript', !err.length, err[0] || '');
  await ctx.close();
}

await nav.close();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
