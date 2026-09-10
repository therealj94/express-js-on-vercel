/* EL CHAT NO SE SUBE SOLO CUANDO SUBE EL TECLADO.
 *
 * «escribo algo en pulse2chat y se sube solo la conversación, y me toca bajar
 *  y me vuelve a subir solo»
 *
 * La causa no era el repintado —eso ya tenía su arreglo y su prueba— sino una
 * unidad de CSS. La pantalla del chat mide `calc(100svh - 76px)` en el
 * teléfono, y `svh` es la altura con el navegador abierto del todo: un número
 * fijo que NO encoge cuando sube el teclado. Entonces la página queda más alta
 * que lo que se ve, el navegador la desplaza solo para enseñar el campo donde
 * estás escribiendo, y eso en pantalla es la conversación yéndose arriba. Al
 * bajar con el dedo, el navegador vuelve a desplazarla.
 *
 * ── CÓMO SE PRUEBA UN TECLADO QUE NO EXISTE ───────────────────────────────
 *
 * Un navegador de escritorio no tiene teclado en pantalla, así que se pone un
 * `visualViewport` de mentira que se puede encoger a voluntad — que es
 * EXACTAMENTE lo que hace el de verdad: la ventana sigue midiendo lo mismo y
 * lo visible se hace más chico. Lo que se comprueba es lo único que importa:
 * que con el teclado arriba la página QUEPA en lo que se ve, porque una
 * página que cabe no se desplaza sola.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

const api = createServer((q, r) => {
  const j = (c, b) => { r.writeHead(c, { 'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*' }); r.end(JSON.stringify(b)); };
  if (q.method === 'OPTIONS') return j(204, {});
  const u = q.url.split('?')[0];
  if (u === '/genesis/estado') return j(200, { identidad: { id: 'i1',
    email: 'jose@ordenglobal.org', estado: 'verificada', gid: 'OG-1', faltanDatos: [] } });
  return j(200, u === '/wallet/deposits' || u === '/cards/transactions' ? [] : {});
});
await new Promise((ok) => api.listen(0, ok));
const API = `http://127.0.0.1:${api.address().port}`;

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(8899, '127.0.0.1', ok));
const WEB = 'http://127.0.0.1:8899/index.html';

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

/* Un teléfono: 390×844, que es lo que mide un iPhone corriente. */
const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
await p.addInitScript((u) => {
  window.OG_API = u;
  /* EL TECLADO DE MENTIRA. Se reemplaza `visualViewport` por uno cuyo alto se
     puede cambiar desde la prueba: es justo lo que hace el de verdad —la
     ventana sigue midiendo 844 y lo visible baja a 444— y avisa por el mismo
     evento `resize`. */
  const oyentes = { resize: [], scroll: [] };
  const falso = {
    height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1,
    addEventListener: (t, f) => { (oyentes[t] || []).push(f); },
    removeEventListener: () => {},
  };
  window.__teclado = (px) => {
    falso.height = 844 - px;
    oyentes.resize.forEach((f) => f());
  };
  Object.defineProperty(window, 'visualViewport', { value: falso, configurable: true });
}, API);

await p.goto(WEB);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
});
await p.goto(WEB);
await p.waitForTimeout(2200);
await p.evaluate(() => { VETA.ir('app'); VETA.vista('chat'); });
await p.waitForTimeout(2500);
await p.evaluate(() => VETA.vista('chat'));
await p.waitForTimeout(1500);
/* Con un hilo ABIERTO: el campo de escribir solo existe dentro de una
   conversación, y es justo el elemento que el navegador persigue cuando sube
   el teclado. `_chatCon` pinta el hilo sin relevo, que es lo que hace falta
   acá — se está midiendo maquetación, no protocolo. */
await p.evaluate(() => VETA._chatCon({ id: 'aura@ordenglobal.org', nombre: 'AU-RA' }));
await p.waitForTimeout(800);

const medir = () => p.evaluate(() => {
  const c = document.querySelector('.p2c');
  const vv = window.visualViewport;
  return {
    p2c: c ? Math.round(c.getBoundingClientRect().height) : null,
    doc: Math.round(document.documentElement.scrollHeight),
    visible: vv.height,
    teclado: getComputedStyle(document.documentElement).getPropertyValue('--teclado').trim(),
  };
});

console.log('\nSin teclado, todo como estaba\n');
const sinT = await medir();
ok(sinT.p2c !== null, 'la pantalla del chat está', `.p2c = ${sinT.p2c}`);
ok(sinT.teclado === '' || sinT.teclado === '0px',
   'la variable del teclado vale cero',
   `--teclado = «${sinT.teclado}» — sin teclado no se toca nada`);

console.log('\nCon el teclado arriba, el campo queda a la vista\n');
/* 400 px de teclado es lo normal en un teléfono: de 844 quedan 444 visibles. */
await p.evaluate(() => window.__teclado(400));
await p.waitForTimeout(400);
const conT = await medir();
ok(conT.teclado === '400px',
   'se mide cuánto tapa el teclado',
   `--teclado = «${conT.teclado}»`);
ok(conT.p2c !== null && conT.p2c < sinT.p2c - 300,
   'y la pantalla del chat encoge otro tanto',
   `.p2c pasó de ${sinT.p2c} a ${conT.p2c}`);
/* ── LA COMPROBACIÓN QUE IMPORTA, Y NO ES LA QUE PARECE ────────────────────
 *
 * La primera versión de esto miraba si el DOCUMENTO cabía en lo visible. No
 * sirve: `scrollHeight` nunca baja del alto de la ventana, y el teclado de
 * verdad tampoco encoge la ventana —solo lo visible—. Con esa medida, esto no
 * podía pasar nunca, ni con el arreglo puesto ni sin él.
 *
 * Lo que de verdad provoca el desplazamiento es OTRA cosa: el navegador mueve
 * la ventana visible para enseñar el campo donde estás escribiendo. Si el
 * campo YA está dentro de lo visible, no tiene por qué mover nada — y no lo
 * mueve. Así que se mide el campo. */
const campo = () => p.evaluate(() => {
  const c = document.querySelector('#chat-txt') || document.querySelector('.cha-pie');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const vv = window.visualViewport;
  return { abajo: Math.round(r.bottom), visible: Math.round(vv.height + vv.offsetTop) };
});
const conCampo = await campo();
ok(conCampo && conCampo.abajo <= conCampo.visible,
   'el campo de escribir queda DENTRO de lo que se ve',
   conCampo
     ? `el campo termina en ${conCampo.abajo} y lo visible llega a ${conCampo.visible} — `
       + `sobresale ${conCampo.abajo - conCampo.visible}px, y eso es lo que el navegador `
       + 'desplaza solo para enseñártelo'
     : 'no se encontró el campo');

/* Y LA PRUEBA DE QUE ESTO MIDE ALGO: se apaga el arreglo —se pone la variable
   a cero, que es exactamente como estaba antes— y el campo TIENE que quedar
   fuera. Un detector que da verde con y sin arreglo no detecta nada. */
await p.evaluate(() => document.documentElement.style.setProperty('--teclado', '0px'));
await p.waitForTimeout(250);
const sinArreglo = await campo();
ok(sinArreglo && sinArreglo.abajo > sinArreglo.visible,
   'y sin el arreglo queda fuera, que era el fallo',
   `con --teclado en 0 el campo termina en ${sinArreglo?.abajo} y lo visible `
   + `llega a ${sinArreglo?.visible}: si esto no sobresale, la prueba no mide nada`);
await p.evaluate(() => window.__teclado(400));
await p.waitForTimeout(250);

console.log('\nY al bajar el teclado vuelve a como estaba\n');
await p.evaluate(() => window.__teclado(0));
await p.waitForTimeout(400);
const vuelta = await medir();
ok(vuelta.teclado === '0px', 'la variable vuelve a cero');
ok(Math.abs(vuelta.p2c - sinT.p2c) < 4,
   'y la pantalla recupera su alto',
   `${sinT.p2c} antes, ${vuelta.p2c} después`);

await p.screenshot({ path: '/tmp/teclado.png' });
await nav.close(); sv.close(); api.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
