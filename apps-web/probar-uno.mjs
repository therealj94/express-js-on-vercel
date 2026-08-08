// Prueba la version de un solo archivo bajo la regla del CDN ajeno: pase lo
// que pase, y pida lo que pida el navegador, el servidor contesta index.html.
//
// Es la unica forma honesta de probarla. Servirla desde una carpeta normal la
// aprobaria por motivos equivocados, porque ahi los archivos sueltos existen.
//
//   node probar-uno.mjs <carpeta-con-index.html>

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const CARPETA = process.argv[2];
const HTML = readFileSync(`${CARPETA}/index.html`, 'utf-8');

let pedidos = [];
const servidor = createServer((req, res) => {
  pedidos.push(req.url);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HTML);                       // todo devuelve lo mismo, como alla
});
await new Promise(r => servidor.listen(0, r));
const RAIZ = `http://127.0.0.1:${servidor.address().port}`;

// El banco de pruebas no tiene salida a internet, asi que las tipografias de
// Google no cargan. Ese ruido no es de la pagina y no cuenta.
const propios = es => es.filter(e => !/fonts\.(googleapis|gstatic)\.com|ERR_CONNECTION_RESET|Failed to load resource/.test(e));

let fallos = 0;
const ok = (n, c, extra) => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'}  ${n}${extra ? `\n           ${extra}` : ''}`);
  if (!c) fallos++;
};

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

async function abrir(ruta) {
  const pag = await navegador.newPage();
  const errores = [];
  // Las tipografias vienen de Google y aqui la red de salida esta cerrada; que
  // no carguen es cosa del banco de pruebas, no de la pagina.
  const externo = u => !u.startsWith(RAIZ);
  pag.on('console', m => m.type() === 'error' && errores.push(m.text()));
  pag.on('pageerror', e => errores.push(e.message));
  pag.on('requestfailed', p => externo(p.url()) || errores.push(`fallo ${p.url()}`));
  await pag.goto(RAIZ + ruta, { waitUntil: 'networkidle' });
  return { pag, errores };
}

console.log('\n══ La aplicacion, con el CDN devolviendo el index a todo');
{
  const { pag, errores } = await abrir('/');
  ok('no hay errores propios en consola', propios(errores).length === 0, propios(errores)[0]);
  ok('el codigo se ejecuto y VETA existe', await pag.evaluate(() => typeof window.VETA === 'object'));
  ok('los textos estan traducidos, no en bruto',
     !(await pag.locator('body').innerText()).includes('data-t'));
  const vacios = await pag.evaluate(() =>
    [...document.querySelectorAll('[data-t]')].filter(e => !e.textContent.trim()).length);
  ok('ningun texto quedo sin rellenar', vacios === 0, `vacios: ${vacios}`);
  ok('el icono viaja dentro del HTML',
     await pag.evaluate(() => [...document.images].every(i => i.complete && i.naturalWidth > 0)));
  ok('la portada se pinta entera', await pag.locator('#portada').isVisible());

  // Cambiar de idioma es lo primero que se rompe si i18n no se incrusto bien.
  await pag.evaluate(() => window.VETA.idioma('en'));
  await pag.waitForTimeout(250);
  ok('cambiar a ingles cambia la pagina',
     (await pag.locator('body').innerText()).toLowerCase().includes('wallet'));

  ok('nada se pidio al servidor aparte del documento',
     pedidos.every(u => !/\.(js|png|css)$/.test(u)),
     pedidos.filter(u => /\.(js|png|css)$/.test(u)).join(' '));
  await pag.close();
}

for (const [ruta, aguja] of [['/privacidad', 'Privacidad'], ['/terminos', 'Términos']]) {
  console.log(`\n══ ${ruta}`);
  const { pag, errores } = await abrir(ruta);
  const texto = await pag.locator('body').innerText();
  ok('no hay errores propios en consola', propios(errores).length === 0, propios(errores)[0]);
  ok('sale el texto legal y no la aplicacion',
     texto.includes(aguja) || texto.toLowerCase().includes(aguja.toLowerCase().slice(0, 6)),
     texto.slice(0, 90).replace(/\n/g, ' '));
  ok('la aplicacion no arranco encima', await pag.evaluate(() => !document.querySelector('#portada')));
  ok('el titulo del navegador es el de la pagina legal',
     /privacidad|terminos|privacy|terms/i.test(await pag.title()), await pag.title());
  await pag.close();
}

await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} fallan\n` : '\nLa version de un solo archivo pasa todo\n');
process.exit(fallos ? 1 : 0);
