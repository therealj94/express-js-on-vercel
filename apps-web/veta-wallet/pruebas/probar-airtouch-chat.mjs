/* La manito de AIR TOUCH no puede tapar el botón de mandar del chat.
 *
 * ══ POR QUÉ EXISTE ESTE ARCHIVO ═════════════════════════════════════════════
 *
 * `#at-boton` vive en `position:fixed; right:21px; bottom:108px` con 46px de
 * ancho. El pie del chat pone «Mandar» pegado al borde derecho —42px de botón
 * más 12 de margen—. En escritorio los dos reclaman la misma esquina, y como
 * la manito es fija y va en z-index 71, el toque se lo llevaba ella.
 *
 * No era una sospecha: el navegador lo decía con nombre y apellido cuando
 * `probar-chat` intentaba pulsar el botón —«#at-boton subtree intercepts
 * pointer events»— y el clic moría a los 30 segundos. Se podía mandar con
 * Enter, así que nadie se quedaba sin chat; pero un botón que la pantalla
 * enseña y no hace lo que dice es peor que no tenerlo, porque la persona
 * piensa que mandó.
 *
 * ══ QUÉ SE FIJA AQUÍ ════════════════════════════════════════════════════════
 *
 * Las dos mitades, porque arreglar una sola no sirve:
 *  · con el pie del chat en pantalla, la manito SE APARTA y el centro del
 *    botón de mandar le pertenece al botón de mandar;
 *  · y en todo lo demás —billetera, la LISTA de conversaciones, pay,
 *    identidad, ajustes— la manito SIGUE ESTANDO. Apagar AIR TOUCH entero
 *    habría hecho pasar la prueba y roto la función.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, ok));
const BASE = `http://127.0.0.1:${sv.address().port}/index.html`;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const preparar = async (ancho, alto) => {
  const p = await nav.newPage({ viewport: { width: ancho, height: alto }, bypassCSP: true });
  await p.goto(BASE);
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    localStorage.setItem('veta.bienvenida.v1', '1');
    VETA.idioma('es');
    VETA._sembrar([{ s: 'ORIGEN', n: 'Origen', cant: 10, precio: .4, nativo: true }]);
    VETA._sesion({ correo: 'jose@prueba.local', nombre: 'José', direccion: '0xbbbb' });
    VETA._identidad({ estado: 'verificada', gid: 'OG-1A2B-33' });
    VETA.ir('app');
  });
  await p.waitForTimeout(600);
  return p;
};

// ── 1 · con el pie del chat, el centro de «Mandar» es de «Mandar» ───────────
//
// El pie se pone a mano, con el mismo botón de la derecha que el de verdad.
// Lo que se mide es GEOMETRÍA —quién recibe el toque en esa esquina—, y montar
// una conversación real con su relevo para averiguarlo sería pagar mucho por
// la misma respuesta. El hilo entero, con su relevo y sus dos personas, ya lo
// cubre `apps-web/probar-chat.mjs`.
console.log('\n── con un hilo abierto, «Mandar» recibe el toque ─────────────');
for (const [w, h] of [[1280, 860], [1440, 900], [1024, 768]]) {
  const p = await preparar(w, h);
  await p.evaluate(() => VETA.vista('chat'));
  await p.waitForTimeout(700);
  // El pie se coloca DONDE ESTÁ LA MANITO, no pegado abajo. La primera versión
  // de esta prueba lo puso en `bottom:0` y pasaba con el arreglo quitado: la
  // manito vive 108px más arriba y nunca llegaban a tocarse. Una prueba que no
  // sabe ponerse roja no comprueba nada.
  //
  // Anclarlo a la caja real de `#at-boton` fija la regla que importa: donde
  // caiga el botón de mandar, el toque es suyo — sin depender de cuánto mida
  // hoy la barra de pestañas.
  await p.evaluate(() => {
    const at = document.getElementById('at-boton').getBoundingClientRect();
    const pie = document.createElement('div');
    pie.className = 'cha-pie';
    pie.style.cssText = `position:fixed;left:0;right:0;z-index:5;` +
                        `top:${at.top - 11}px;height:${at.height + 22}px`;
    pie.innerHTML = '<input style="flex:1"><button class="cha-manda">M</button>';
    document.body.appendChild(pie);
  });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const m = document.querySelector('.cha-manda');
    const b = m.getBoundingClientRect();
    const centro = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const at = document.getElementById('at-boton');
    return { deQuien: centro === m || m.contains(centro) ? 'del botón de mandar'
                      : (centro?.closest('#at-boton') ? 'DE AIR TOUCH' : (centro?.className || '?')),
             manito: at ? getComputedStyle(at).display : '(no está)' };
  });
  comprobar(r.deQuien === 'del botón de mandar',
    `${w}×${h}: el centro de «Mandar» es ${r.deQuien}`,
    `manito: display=${r.manito}`);
  await p.close();
}

// ── 2 · y la manito sigue estando en todo lo demás ──────────────────────────
console.log('\n── pero AIR TOUCH no se apaga en el resto de la app ──────────');
{
  const p = await preparar(1280, 860);
  for (const v of ['billetera', 'chat', 'pay', 'identidad', 'ajustes']) {
    await p.evaluate((x) => VETA.vista(x), v);
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const a = document.getElementById('at-boton');
      return { display: a ? getComputedStyle(a).display : '(no está)',
               pie: !!document.querySelector('.cha-pie') };
    });
    comprobar(r.display !== 'none' && !r.pie,
      `en ${v} la manito sigue ahí`,
      `display=${r.display}${r.pie ? ' · OJO: hay pie de chat sin hilo abierto' : ''}`);
  }
  await p.close();
}

await nav.close();
sv.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
