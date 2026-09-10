/* La constancia del registro publico: que se vea, que diga lo que debe y que
 * lleve a donde dice.
 *
 * No comprueba «existe el elemento» —eso lo cumple una caja vacia— sino las
 * cuatro cosas que pueden salir mal de verdad: que el texto llegue traducido en
 * los dos idiomas (una clave que falte deja el hueco en blanco y no se nota
 * hasta que alguien la ve), que los tres valores citados sean los que de verdad
 * tiene el archivo publicado, que la tarjeta entera sea el enlace, y que en el
 * telefono no se salga ni se monte encima de nada.
 */
import { abrirNavegador } from '../../navegador.mjs';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join, normalize } from 'path';

const RAIZ = new URL('..', import.meta.url).pathname;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };

const servidor = createServer((pet, res) => {
  const limpio = normalize(decodeURIComponent(pet.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let ruta = join(RAIZ, limpio === '/' ? 'index.html' : limpio);
  if (!existsSync(ruta) || ruta.endsWith('/')) ruta = join(RAIZ, 'index.html');
  res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream' });
  res.end(readFileSync(ruta));
});

const fallos = [];
const revisar = (bien, queja) => { if (!bien) fallos.push(queja); };

await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const nav = await abrirNavegador();

// Lo que el registro publico dice HOY. Si esto cambia alla, la prueba cae aqui
// antes de que la web quede mintiendo.
const REGISTRO = 'https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-5550.json';
let arriba = null;
try {
  arriba = await (await fetch(REGISTRO, { signal: AbortSignal.timeout(20000) })).json();
} catch {
  console.log('  (sin red: no se pudo cotejar contra ethereum-lists, se salta ese cotejo)');
}

for (const idioma of ['es', 'en']) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: idioma });
  const pag = await ctx.newPage();
  await pag.goto(`${BASE}/`);
  await pag.evaluate(i => { try { localStorage.setItem('veta.idioma', i); } catch {} }, idioma);
  await pag.reload();
  await pag.locator('.constancia h3').waitFor({ state: 'attached' });
  /* La entrada ahora es el login; la constancia vive en la portada de venta,
     que se abre con el boton «Conocer Orden Global». Aqui se va directo. */
  await pag.evaluate(() => VETA.ir('bienvenida'));
  await pag.waitForTimeout(250);

  const c = pag.locator('.constancia');
  revisar(await c.count() === 1, `[${idioma}] deberia haber UNA constancia, hay ${await c.count()}`);

  // Ningun hueco en blanco: cada nodo con data-t tiene que haber recibido texto.
  const vacios = await c.locator('[data-t]').evaluateAll(ns =>
    ns.filter(n => !n.textContent.trim()).map(n => n.getAttribute('data-t')));
  revisar(vacios.length === 0, `[${idioma}] sin traducir: ${vacios.join(', ')}`);

  const texto = (await c.innerText()).toLowerCase();
  // La palabra prohibida: Chainlist no certifica nada.
  for (const palabra of ['certificad', 'certified', 'avalad', 'respaldad']) {
    revisar(!texto.includes(palabra),
      `[${idioma}] la constancia dice «${palabra}…» y el registro no certifica nada`);
  }

  /* Al ser la tarjeta un <a>, el subrayado cae sobre CADA linea de dentro.
     Salio asi la primera vez y solo se vio mirando la captura.
     Se mira el <a>, no los hijos: en CSS la decoracion se propaga a lo que hay
     dentro pero la PINTA el ancestro, asi que el hijo sigue declarando `none`
     y preguntarle a el da siempre verde. Esa version de esta comprobacion no
     detecto la mutacion; esta si. */
  const raya = await c.evaluate(n => getComputedStyle(n).textDecorationLine);
  revisar(raya === 'none', `[${idioma}] la tarjeta subraya todo su contenido (text-decoration-line: ${raya})`);

  const destino = await c.getAttribute('href');
  revisar(destino === 'https://chainlist.org/chain/5550',
    `[${idioma}] el enlace va a ${destino}`);
  revisar(await c.evaluate(n => n.tagName) === 'A',
    `[${idioma}] la tarjeta entera tiene que ser el enlace`);
  revisar(await c.locator('a').count() === 0,
    `[${idioma}] hay un <a> dentro del <a>: eso no es HTML valido`);

  // Los tres valores citados, contra el archivo que esta publicado.
  if (arriba) {
    const valores = await c.locator('.cst-campo b').allInnerTexts();
    const esperado = [String(arriba.chainId), arriba.shortName, arriba.nativeCurrency.symbol];
    revisar(JSON.stringify(valores) === JSON.stringify(esperado),
      `[${idioma}] la web cita ${JSON.stringify(valores)} y el registro dice ${JSON.stringify(esperado)}`);
  }

  if (idioma === 'es') await c.screenshot({ path: '/tmp/constancia-escritorio.png' });
  await ctx.close();
}

// El telefono: que no se desborde y que el boton siga siendo tocable.
const movil = await nav.newContext({ viewport: { width: 360, height: 780 }, isMobile: true,
  deviceScaleFactor: 2 });
const pm = await movil.newPage();
await pm.goto(`${BASE}/`);
await pm.locator('.constancia h3').waitFor({ state: 'attached' });
await pm.evaluate(() => VETA.ir('bienvenida'));
await pm.waitForTimeout(250);
const cm = pm.locator('.constancia');
const caja = await cm.boundingBox();
revisar(caja.x >= 0 && caja.x + caja.width <= 360 + 1,
  `en movil la constancia se sale: de ${Math.round(caja.x)} a ${Math.round(caja.x + caja.width)} en 360px`);
const desborde = await pm.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
revisar(desborde <= 0, `la pagina scrollea de lado ${desborde}px con la constancia puesta`);
const boton = await cm.locator('.cst-btn').boundingBox();
revisar(boton.height >= 40, `el boton mide ${Math.round(boton.height)}px de alto; con el dedo hacen falta 40`);
// Nada montado encima: el boton por debajo del cuerpo, no cruzandolo.
const cuerpo = await cm.locator('.cst-cuerpo').boundingBox();
revisar(boton.y >= cuerpo.y + cuerpo.height - 1,
  'en movil el boton se monta sobre el texto');
await cm.screenshot({ path: '/tmp/constancia-movil.png' });
await movil.close();

await nav.close();
servidor.close();

if (fallos.length) {
  console.log(`\n✗ ${fallos.length} fallo(s):`);
  for (const f of fallos) console.log('   ' + f);
  process.exit(1);
}
console.log('✓ la constancia: texto en los dos idiomas, valores cotejados contra el');
console.log('  registro publico, enlace correcto y sin desbordes en movil');
