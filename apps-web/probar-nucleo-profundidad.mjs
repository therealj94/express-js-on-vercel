/* La constelación tiene hondura, y seguir tocándola sigue llevando a la app.
 *
 * Este archivo existe porque la profundidad se metió por en medio de la
 * navegación. Entrar a un mundo ya no es «pintar la vista»: es una animación
 * de 240ms y DESPUÉS pintar la vista. Un adorno que se cuela en el camino de
 * un botón es exactamente la clase de cosa que rompe la app entera sin que
 * nadie lo vea hasta que alguien no puede entrar a su billetera.
 *
 * Se comprueban las dos mitades:
 *  · que la hondura está de verdad (cada esfera con su --z, el más grande al
 *    frente, el desenfoque y la niebla repartidos, el paralaje respondiendo al
 *    puntero, y ninguna esfera esperando quieta a que le toque el turno);
 *  · que TOCAR CADA MUNDO sigue abriendo el mundo que dice — que es lo único
 *    que de verdad no se puede romper.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const RAIZ = '/home/user/express-js-on-vercel/apps-web/veta-wallet';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const api = createServer((q, r) => {
  const responder = (c, cuerpo) => {
    r.writeHead(c, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
                     'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    r.end(JSON.stringify(cuerpo));
  };
  if (q.method === 'OPTIONS') return responder(204, {});
  const ruta = q.url.split('?')[0];
  if (ruta === '/genesis/estado') return responder(200, {
    identidad: { id: 'i1', email: 'jose@ordenglobal.org', estado: 'verificada',
                 gid: 'OG-4K7P-21', nombreLegal: 'José Enamorado', faltanDatos: [] } });
  return responder(200, ruta === '/wallet/deposits' || ruta === '/cards/transactions' ? [] : {});
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
await new Promise((ok) => sv.listen(0, ok));
const BASE = `http://127.0.0.1:${sv.address().port}/index.html`;

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });


// EL NUCLEO DE ESFERAS ES EL RESPALDO, no la pantalla principal. Desde que
// AETHERION monta la escena 3D en el Inicio, `nucleo()` solo se pinta cuando
// ese bundle no carga. Sin forzarlo, este archivo media sobre una pantalla que
// ya no aparece: encontraba CERO esferas y no lo decia.
//
// Se corta el BUNDLE, no se sustituye AETHERION: la app trata «no cargo el
// bundle» como un camino previsto y cae al cerebro clasico entero. Dejar un
// AETHERION a medias rompe ademas la entrada por la esfera, y entonces la
// prueba estaria midiendo el remiendo en vez de la app.
const SIN_AETHERION = async (pag) => {
  await pag.route('**/aetherion/assets/aetherion.js*', (r) => r.abort());
};

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

// Con puntero fino y SIN reducir movimiento: es la única combinación en la que
// todo esto tiene que estar encendido a la vez.
const p = await nav.newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
await p.addInitScript((u) => { window.OG_API = u; }, API);
await SIN_AETHERION(p);
await p.goto(BASE);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const token = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token, correo: 'jose@ordenglobal.org', nombre: 'José Enamorado', direccion: '0xaaaa' }));
});
await p.goto(BASE);
await p.waitForTimeout(1400);
await p.evaluate(() => VETA.idioma('es')).catch(() => {});
// `ir('app')` ANTES de `vista('nucleo')`: sin eso la pantalla se queda en el
// cascaron de fuera, el Nucleo no llega a montarse y el selector encuentra
// cero esferas. La prueba llevaba mucho fallando por esto y parecia que las
// esferas hubieran desaparecido de la app.
await p.evaluate(() => { VETA.ir('app'); VETA.vista('nucleo'); });
await p.waitForTimeout(900);

// ── 1 · la hondura está puesta y ordenada ──────────────────────────────────
const capas = await p.evaluate(() => [...document.querySelectorAll('.nu-mundo[data-mundo]')].map((el) => {
  const cs = getComputedStyle(el), es = getComputedStyle(el.querySelector('.nu-esfera'));
  const velo = getComputedStyle(el.querySelector('.nu-esfera'), '::after');
  return { id: el.dataset.mundo,
           z: parseFloat(cs.getPropertyValue('--z')),
           d: cs.getPropertyValue('--d').trim(),
           zi: parseInt(cs.zIndex, 10),
           filtro: es.filter,
           niebla: parseFloat(velo.opacity) };
}));
comprobar(capas.length >= 6, `están las ${capas.length} esferas`);
comprobar(capas.every((c) => c.z >= 0 && c.z <= 1), 'cada una sabe a qué distancia está (--z de 0 a 1)');
comprobar(new Set(capas.map((c) => c.z)).size > 1, 'y no están todas en el mismo plano');

// el que está más cerca tapa al que está más lejos
const porZ = [...capas].sort((a, b) => a.z - b.z);
comprobar(porZ.every((c, i) => i === 0 || c.zi >= porZ[i - 1].zi),
  'el que está delante tapa al que está detrás, no al revés',
  porZ.map((c) => `${c.id} z=${c.z} capa=${c.zi}`).join(' · '));

// ninguna esfera esperando su turno quieta: el retardo va en NEGATIVO
const enPositivo = capas.filter((c) => /^\d/.test(c.d) && parseFloat(c.d) > 0);
comprobar(enPositivo.length === 0,
  'ninguna arranca quieta esperando su turno (retardo en negativo)',
  enPositivo.length ? enPositivo.map((c) => `${c.id} espera ${c.d}`).join(' · ') : '');

// niebla y desenfoque: los tiene el fondo, no el frente
const frente = porZ[porZ.length - 1], fondo = porZ[0];
comprobar(fondo.niebla > frente.niebla,
  'lo lejano se lava contra el fondo y lo cercano no',
  `fondo(${fondo.id})=${fondo.niebla.toFixed(2)} · frente(${frente.id})=${frente.niebla.toFixed(2)}`);
comprobar(/blur\(0px\)|none/.test(frente.filtro) && /blur\((0\.\d+|1)/.test(fondo.filtro),
  'y lo lejano va desenfocado mientras lo cercano está nítido',
  `fondo=${fondo.filtro} · frente=${frente.filtro}`);

// ── 2 · el paralaje contesta al puntero, y vuelve a su sitio ───────────────
const leerPx = () => p.evaluate(() =>
  getComputedStyle(document.getElementById('cerebro')).getPropertyValue('--px').trim());
await p.mouse.move(1100, 300);
await p.waitForTimeout(300);
const movido = await leerPx();
comprobar(movido !== '' && Math.abs(parseFloat(movido)) > 0.1,
  'la constelación se mueve con el puntero', `--px=${movido || '(sin poner)'}`);
await p.mouse.move(640, 450);
await p.waitForTimeout(300);
const centro = await p.evaluate(() =>
  document.getElementById('cerebro').getBoundingClientRect());
comprobar(Math.abs(parseFloat(await leerPx())) < Math.abs(parseFloat(movido)),
  'y se endereza al volver al centro', `caja de ${Math.round(centro.width)}px de ancho`);

// ── 3 · lo que no se puede romper: tocar un mundo abre ESE mundo ───────────
const DESTINOS = { wallet: 'billetera', chat: 'chat', pay: 'pay', gid: 'identidad', ajustes: 'ajustes' };
for (const [id, esperada] of Object.entries(DESTINOS)) {
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(450);
  const boton = p.locator(`.nu-mundo[data-mundo="${id}"]`);
  if (!(await boton.count())) { comprobar(false, `la esfera de ${id} existe`); continue; }
  await boton.click({ force: true });
  // 240ms de animación + lo que tarde en pintar: se espera al RESULTADO,
  // no a un número de milisegundos elegido a ojo
  await p.waitForFunction((v) => VETA.dondeEstoy() === v, esperada, { timeout: 4000 })
    .then(() => comprobar(true, `tocar ${id} abre ${esperada}`))
    .catch(async () => comprobar(false, `tocar ${id} abre ${esperada}`,
      'se quedó en: ' + await p.evaluate(() => VETA.dondeEstoy())));
}

// ── 4 · sin movimiento, se entra igual y en el acto ────────────────────────
const q = await nav.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', bypassCSP: true });
await q.addInitScript((u) => { window.OG_API = u; }, API);
await q.goto(BASE);
await q.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const token = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token, correo: 'jose@ordenglobal.org', nombre: 'José Enamorado', direccion: '0xaaaa' }));
});
await q.goto(BASE);
await q.waitForTimeout(1400);
await q.evaluate(() => VETA.vista('nucleo'));
await q.waitForTimeout(400);
await q.locator('.nu-mundo[data-mundo="wallet"]').click({ force: true });
await q.waitForTimeout(60);   // menos que los 240ms de la animación
comprobar(await q.evaluate(() => VETA.dondeEstoy()) === 'billetera',
  'con el movimiento reducido se entra en seco, sin esperar la animación');
await q.close();

await p.close(); await nav.close(); sv.close(); api.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
