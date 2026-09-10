/* Con el nodo caído, ¿qué dice la billetera?
 *
 * Decía `TU PATRIMONIO $0.00`. Un saldo que no se pudo leer se devolvía como
 * cero, así que un nodo caído era indistinguible de «no tenés nada» — la
 * mentira más cara que puede contar una billetera, y encima en el número más
 * importante de la pantalla.
 *
 * Lo peor es que la doctrina correcta ya estaba escrita en esta casa, tres
 * veces: el backend de esta misma billetera dice «Ni un cero de consuelo: se
 * dice que no se pudo mirar», Ordenex se niega a operar sobre un saldo que no
 * leyó, y el comentario de `app.js` explicaba que un precio caído no puede
 * aparecer como si el activo valiera cero. Se aplicaba a los precios y no a los
 * saldos.
 *
 * Esta prueba corta el nodo de verdad y mira la pantalla. Corre con el servidor
 * estático en 8791:
 *   python3 -m http.server 8791 --directory /home/user/express-js-on-vercel &
 *   node probar-saldo-nodo-caido.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

let fallos = 0;
const ok = (que, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FALLA'}  ${que}${extra ? '  · ' + extra : ''}`);
  if (!cond) fallos++;
};

const pag = await nav.newPage();
await pag.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:8791')
  ? r.continue() : r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/pruebas/vacio.html',
  { waitUntil: 'domcontentloaded' });

/* Se carga `cadena.js` con un `fetch` fingido que hace de nodo, para poder
   decidir a voluntad si contesta o si se cae. */
const fuente = readFileSync(new URL('../cadena.js', import.meta.url).pathname, 'utf8');

async function conNodo(modo) {
  return pag.evaluate(async ([src, modo]) => {
    window.__modo = modo;
    window.fetch = async (url, opciones) => {
      if (window.__modo === 'caido') throw new Error('el nodo no responde');
      if (window.__modo === 'error502') {
        return { ok: false, status: 502, text: async () => '<html>bad gateway</html>',
                 json: async () => { throw new Error('no es json'); } };
      }
      if (window.__modo === 'errorRpc') {
        return { ok: true, status: 200,
                 json: async () => ({ error: { code: -32000, message: 'nodo ocupado' } }) };
      }
      /* Un nodo sano: 1 unidad de todo. `rpc()` manda una peticion suelta y
         espera un objeto con `result`, no un lote. */
      const cuerpo = JSON.parse(opciones?.body || '{}');
      return { ok: true, status: 200,
               json: async () => ({ jsonrpc: '2.0', id: cuerpo.id,
                                    result: '0x' + (10n ** 18n).toString(16) }) };
    };
    /* Se envuelve en su propio ambito: `cadena.js` declara `const CADENA` de
       nivel superior, asi que no queda colgado de `window`, y un `eval` suelto
       ademas explotaria la segunda vez por redeclaracion. Asi se puede cargar
       una vez por cada modo de caida. */
    const CADENA = new Function(src + '; return CADENA;')();
    try {
      const filas = await CADENA.portafolio('0x1111111111111111111111111111111111111111', null);
      return { ok: true, filas: filas.map(f => ({ s: f.s, cant: f.cant, leido: f.leido })) };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }, [fuente, modo]);
}

try {
  console.log('── Con el nodo sano');
  const sano = await conNodo('sano');
  ok('se leen los saldos', sano.ok && sano.filas.some(f => f.leido === true));
  ok('y traen número', sano.ok && sano.filas.every(f => f.leido !== true || typeof f.cant === 'number'));

  for (const [nombre, modo] of [
    ['el nodo no responde', 'caido'],
    ['el nodo devuelve 502 con HTML', 'error502'],
    ['el nodo devuelve un error de JSON-RPC', 'errorRpc'],
  ]) {
    console.log(`\n── Cuando ${nombre}`);
    const r = await conNodo(modo);
    if (!r.ok) { ok('portafolio() no lanza: eso tiraría las lecturas buenas', false, r.error); continue; }
    ok('portafolio() devuelve las filas igual', Array.isArray(r.filas) && r.filas.length > 0);
    ok('NINGUNA dice que se leyó', r.filas.every(f => f.leido === false));
    /* La que importa: si esto fuera 0, la pantalla diría «no tenés nada». */
    ok('y NINGUNA trae un cero de consuelo', r.filas.every(f => f.cant === null),
      r.filas.filter(f => f.cant === 0).length ? 'hay ceros' : 'todas en null');
  }

  console.log('\n── Y lo que ve la persona en la pantalla');
  /* Se comprueba la aritmética de `app.js` sobre esas filas, que es donde el
     `null` se convertía en cero sin que nadie lo notara: en JavaScript
     `null * 3` da 0, no NaN. */
  const pantalla = await pag.evaluate(() => {
    const leido = x => x.leido !== false && x.cant != null;
    const cartera = [{ s: 'ORIGEN', cant: null, leido: false, precio: 2.68 },
                     { s: 'AUKA', cant: null, leido: false, precio: 4596 }];
    const hayAlguno = cartera.some(leido);
    const conPrecio = cartera.filter(x => x.precio != null && leido(x));
    const totalViejo = cartera.filter(x => x.precio != null)
      .reduce((s, x) => s + x.cant * x.precio, 0);
    const totalNuevo = hayAlguno ? conPrecio.reduce((s, x) => s + x.cant * x.precio, 0) : null;
    return { totalViejo, totalNuevo };
  });
  ok('la cuenta VIEJA daba cero (el fallo)', pantalla.totalViejo === 0, `$${pantalla.totalViejo}`);
  ok('la cuenta NUEVA dice «no lo sé»', pantalla.totalNuevo === null,
    pantalla.totalNuevo === null ? 'null → se pinta «—»' : `$${pantalla.totalNuevo}`);
} catch (e) {
  console.error('\nse rompió:', e.message);
  fallos++;
} finally {
  await nav.close();
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\ntodo en verde');
process.exit(fallos ? 1 : 0);
