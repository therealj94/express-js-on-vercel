/* Lo que AU-RA aprendió a hacer — y las dos reglas que no puede romper.
 *
 * AU-RA gana cinco cosas que no necesitan backend nuevo, porque el dato ya
 * estaba en la pantalla y simplemente no se decía: el precio de hoy, el
 * resumen de la semana, el estado de la verificación, el cobro con el monto
 * dictado, y una salida decente cuando no entiende.
 *
 * Y dos reglas que valen para cada una de ellas:
 *  1. NUNCA un número inventado. Si el dato no llegó, se dice que no llegó.
 *  2. EL OJO MANDA TAMBIÉN SOBRE LA VOZ. Quien tapó sus cifras las tapó de la
 *     gente que tiene alrededor; cantarlas por el altavoz es peor que no
 *     taparlas, porque la persona se cree a salvo.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const RAIZ = '/home/user/express-js-on-vercel/apps-web/veta-wallet';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

let verificada = true;
const api = createServer((q, r) => {
  const responder = (c, cuerpo) => {
    r.writeHead(c, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
                     'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    r.end(JSON.stringify(cuerpo));
  };
  if (q.method === 'OPTIONS') return responder(204, {});
  const ruta = q.url.split('?')[0];
  if (ruta === '/genesis/estado') return responder(200, { identidad: {
    id: 'i1', email: 'jose@ordenglobal.org', estado: verificada ? 'verificada' : 'en-revision',
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

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

const p = await nav.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', bypassCSP: true });
await p.addInitScript((u) => {
  window.OG_API = u;
  // AU-RA no habla en las pruebas: se comprueba lo que DICE, no el altavoz
  window.speechSynthesis?.cancel?.();
}, API);
await p.goto(BASE);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const token = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token, correo: 'jose@ordenglobal.org', nombre: 'José Enamorado', direccion: '0xaaaa' }));
});
await p.goto(BASE);
await p.waitForTimeout(1500);
await p.evaluate(() => VETA.idioma('es'));

// una cartera y unos movimientos de mentira, para tener de qué hablar
const MOVS = [
  { hash: '0x1', origenAmount: 12.5, at: new Date(Date.now() - 2 * 864e5).toISOString(), to: '0xaaaa', from: '0xbbbb' },
  { hash: '0x2', origenAmount: 4, at: new Date(Date.now() - 3 * 864e5).toISOString(), to: '0xcccc', from: '0xaaaa' },
  { hash: '0x3', origenAmount: 30, at: new Date(Date.now() - 40 * 864e5).toISOString(), to: '0xaaaa', from: '0xbbbb' },
];
await p.evaluate((movs) => {
  VETA._sembrar([{ s: 'ORIGEN', n: 'Origen', cant: 40, precio: 0.42, nativo: true },
                 { s: 'ONDK', n: 'Ondak', cant: 10, precio: 1.5 }]);
  VETA._sembrarMovs(movs);
}, MOVS);

// lo que AU-RA acaba de decir
const dicho = () => p.evaluate(() => {
  const b = [...document.querySelectorAll('.aura-b:not(.mio)')];
  return b.length ? b[b.length - 1].innerText : '';
});
const preguntar = async (q) => {
  await p.evaluate((x) => VETA.auraChip(x), q);
  await p.waitForTimeout(450);
  return dicho();
};

// ── 1 · el precio, que ya estaba en la cartera ─────────────────────────────
let r = await preguntar('a cuanto esta el origen');
comprobar(/0[.,]42/.test(r), 'dice el precio del ORIGEN con el número real', r.slice(0, 90));
r = await preguntar('precio del ondk');
comprobar(/1[.,]5/.test(r), 'y el del ONDK, que es otro', r.slice(0, 90));

// la regla que no se rompe: sin precio, NO se inventa uno
await p.evaluate(() => VETA._sembrar([]));
r = await preguntar('a cuanto esta el origen');
comprobar(!/\$\s*\d/.test(r) && /no me lleg|no te lo voy a inventar/i.test(r),
  'sin precio no se inventa ninguno: se dice que no llegó', r.slice(0, 100));
await p.evaluate(() => VETA._sembrar([{ s: 'ORIGEN', n: 'Origen', cant: 40, precio: 0.42, nativo: true }]));

// ── 2 · el estado de la identidad, dicho de una vez ────────────────────────
r = await preguntar('estoy verificado');
comprobar(/OG-4K7P-21/.test(r), 'contesta si estás verificado, y con qué Genesis ID', r.slice(0, 100));

// ── 3 · el cobro con el monto dictado ──────────────────────────────────────
await p.evaluate(() => VETA.vista('nucleo'));
await p.waitForTimeout(300);
r = await preguntar('cobrame 25');
const enCobro = await p.evaluate(() => ({
  vista: VETA.dondeEstoy(), monto: document.getElementById('cob-monto')?.value || '' }));
comprobar(enCobro.vista === 'cobrar' && enCobro.monto === '25',
  'un cobro dictado deja la pantalla abierta y el monto puesto',
  `vista=${enCobro.vista} monto=«${enCobro.monto}»`);

// ── 4 · cuando no entiende, ofrece lo más parecido ─────────────────────────
r = await preguntar('cuantas patatas caben en un zapato');
const botones = await p.evaluate(() => {
  const b = [...document.querySelectorAll('.aura-b:not(.mio)')].pop();
  return [...(b?.querySelectorAll('button') || [])].map((x) => x.innerText.trim());
});
comprobar(botones.length > 0, 'cuando no entiende no deja a nadie sin salida',
  botones.length ? 'ofrece: ' + botones.join(' · ') : 'no ofreció nada');

// ── 4b · el saber que Genesis dejó salir ───────────────────────────────────
// AU-RA contesta con las fichas del cerebro, y una ficha nueva se nota sin
// tocar app.js: eso es lo que hace que se pueda «ir entrenando».
{
  const cargado = await p.evaluate(() => Array.isArray(window.AURA_SABER) ? window.AURA_SABER.length : 0);
  comprobar(cargado > 0, `el saber de Genesis llegó al navegador (${cargado} fichas)`);

  // Preguntar por la bóveda tiene que llevar a la ficha que dice que NO la hay.
  // El expediente de la Secretaría del 14/08 es explícito: la figura es
  // referenciado, no hay oro custodiado, y la NI 43-101 reporta recursos
  // mineros — no certifica barras. Esta comprobación existe para que nadie
  // devuelva esas palabras a la boca de AU-RA sin darse cuenta.
  r = await preguntar('que es la boveda');
  comprobar(/no hay oro en bóveda/i.test(r) && !/43-101/.test(r),
    'contesta con una ficha que NO está escrita en app.js, y dice que bóveda no hay', r.slice(0, 110));

  // la que gana es la que comparte más palabras, no la primera que roza el tema
  r = await preguntar('que es origen');
  comprobar(/gramin/.test(r) && !/bóveda/i.test(r),
    'y con dos fichas que hablan de oro, gana la que se pidió', r.slice(0, 90));

  /* Lo interno del cerebro no puede estar ni cargado en la página.
     Esto NO se comprueba con una lista de palabras a mano: una palabra puede
     volverse pública el día que alguien escriba una ficha nueva —pasó con
     «infraestructura», que hoy está en la de ONDK— y entonces la prueba acusa
     una fuga que no existe. Se comprueba contra las fichas internas que hay
     ahora mismo en Genesis Core, que es lo que de verdad no puede viajar. */
  const rastro = await p.evaluate(() => JSON.stringify(window.AURA_SABER || []));
  const { fichas } = JSON.parse(
    await readFile(new URL('../infra/cerebro/conocimiento/saber.json', import.meta.url), 'utf8'));
  const internas = fichas.filter((f) => f.publico !== true);
  const coladas = internas.filter((f) => rastro.includes(f.id) || rastro.includes(f.es.slice(0, 60)));
  comprobar(internas.length > 0 && coladas.length === 0,
    `y NADA interno viajó al navegador (${internas.length} fichas internas comprobadas)`,
    coladas.map((f) => f.id).join(', '));
}

// ── 5 · las sugerencias siguen a la persona ────────────────────────────────
const chipsDe = async (v) => {
  await p.evaluate((x) => VETA.vista(x), v);
  await p.waitForTimeout(300);
  // el panel se abre de verdad: con él cerrado los chips siguen en el DOM
  // pero innerText devuelve vacío, y la prueba se creería que los leyó
  await p.evaluate(() => { if (!document.getElementById('aura-panel').classList.contains('ver')) VETA.auraToca(); });
  await p.waitForTimeout(250);
  return p.evaluate(() => [...document.querySelectorAll('.aura-chip')].map((x) => x.textContent.trim()));
};
const enCambiar = await chipsDe('cambiar');
const enChat = await chipsDe('chat');
comprobar(JSON.stringify(enCambiar) !== JSON.stringify(enChat),
  'los chips cambian con la pantalla en vez de ser siempre los mismos cuatro',
  `cambiar: ${enCambiar.join(' · ')}\n           chat:    ${enChat.join(' · ')}`);
comprobar(enCambiar.every((c) => !/genesis id/i.test(c)),
  'y a quien ya está verificado no se le ofrece verificarse');

// ── 6 · el resumen de la semana, con los movimientos de verdad ────────────
r = await preguntar('resumen de la semana');
comprobar(/\b2\b/.test(r) && !/30/.test(r),
  'el resumen cuenta los de esta semana y deja fuera el de hace 40 días', r.slice(0, 130));

// ── 7 · el ojo manda también sobre la voz ──────────────────────────────────
await p.evaluate(() => { if (!VETA._estado().ocultos) VETA.tapar(); });
await p.waitForTimeout(200);
r = await preguntar('resumen de la semana');
comprobar(!/\$\s*\d/.test(r) && /oculta|destap/i.test(r),
  'con las cifras tapadas, el resumen no las canta en voz alta', r.slice(0, 110));

await p.close(); await nav.close(); sv.close(); api.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
