/* EL DICTADO CONTINUO NO REPITE, NO INVENTA Y NO ESCRIBE SOLO.
 *
 * «las letras que salen se buguean: salen, se quitan, salen cosas random»
 *
 * El fallo era el lector del reconocedor. En modo continuo, `ev.results`
 * ACUMULA todo desde que arrancó el micrófono, y el lector juntaba TODOS los
 * resultados en cada evento: la segunda frase salía con la primera pegada
 * delante, y al mandar nadie apagaba el reconocedor — seguía escribiendo en la
 * caja con el estado en «quieta» y re-mandando lo acumulado en cada final.
 *
 * Esta prueba reproduce los eventos EXACTAMENTE como los emite un reconocedor
 * continuo de verdad —con `resultIndex` marcando desde dónde cambió— y mira lo
 * único que importa: qué se mandó, y qué se enseñó mientras tanto.
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

const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
await p.addInitScript((u) => {
  window.OG_API = u;
  /* EL RECONOCEDOR DE MENTIRA, fiel al de verdad en lo que importa: los
     resultados se ACUMULAN y `resultIndex` marca desde dónde cambió el
     evento. Un doble que no acumula probaría un mundo que no existe — el bug
     vivía exactamente en la acumulación. */
  class Oyente {
    constructor() { this._resultados = []; Oyente.viva = this; }
    start() { Oyente.arranques = (Oyente.arranques || 0) + 1; }
    stop() { this.onend?.(); }
    abort() { if (Oyente.viva === this) Oyente.viva = null; }
    addEventListener() {} removeEventListener() {}
  }
  window.SpeechRecognition = Oyente;
  window.webkitSpeechRecognition = Oyente;
  /* __decir(txt, esFinal): emite un evento como el navegador — el resultado
     nuevo o cambiado va al final, resultIndex apunta a él, y los anteriores
     siguen en la lista. */
  window.__decir = (txt, esFinal) => {
    const o = Oyente.viva;
    if (!o || !o.onresult) return 'sin oyente';
    const rs = o._resultados;
    const ultimo = rs[rs.length - 1];
    const res = Object.assign([{ transcript: txt }], { isFinal: !!esFinal });
    let indice;
    if (ultimo && !ultimo.isFinal) { rs[rs.length - 1] = res; indice = rs.length - 1; }
    else { rs.push(res); indice = rs.length - 1; }
    o.onresult({ results: rs, resultIndex: indice });
    return 'ok';
  };
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
await p.waitForTimeout(2200);
/* El hilo pintado sin relevo, y el ENVÍO espiado: lo que se mide es qué texto
   sale hacia AU-RA, no el viaje de red — ese tiene sus propias pruebas. */
await p.evaluate(() => {
  VETA._chatCon({ id: 'aura@ordenglobal.org', nombre: 'AU-RA' });
  window.__enviados = [];
  CHAT.enviar = async (para, texto, cita) => { window.__enviados.push(texto); return { ok: true }; };
  /* La bandeja también se dobla: chatMandar recarga el hilo tras enviar, y
     sin relevo esa recarga se quedaba 15 segundos colgada con `mandando` en
     true — y un envío «en vuelo» ignora al siguiente. En la app real es un
     viaje de cien milisegundos. */
  CHAT.bandeja = async () => ({ mensajes: [], enLinea: true });
  CHAT.conversaciones = async () => [];
  Object.defineProperty(CHAT, 'listo', { value: () => true });
});
await p.waitForTimeout(600);

console.log('\nHablar una vez manda UNA vez, y lo que se dijo\n');
await p.evaluate(() => VETA.auraDictar());
await p.waitForTimeout(300);
await p.evaluate(() => window.__decir('hola aura', false));
const enCaja = await p.evaluate(() => document.querySelector('#chat-txt')?.value);
ok(enCaja === 'hola aura', 'el parcial se ve en la caja mientras se dice',
   `la caja tenía: «${enCaja}»`);
await p.evaluate(() => window.__decir('hola aura', true));
await p.waitForTimeout(700);
let enviados = await p.evaluate(() => window.__enviados);
ok(enviados.length === 1 && enviados[0] === 'hola aura',
   'se mandó exactamente lo dicho',
   `se mandó: ${JSON.stringify(enviados)}`);

console.log('\nLa SEGUNDA frase no arrastra a la primera\n');
/* Este es el bug, letra por letra: en modo continuo los resultados viejos
   siguen en la lista, y el lector viejo los re-juntaba todos. */
await p.evaluate(() => window.__decir('cuánto tengo', false));
await p.evaluate(() => window.__decir('cuánto tengo', true));
await p.waitForTimeout(700);
enviados = await p.evaluate(() => window.__enviados);
ok(enviados.length === 2 && enviados[1] === 'cuánto tengo',
   'la segunda frase viaja sola, sin la primera pegada delante',
   `se mandó: ${JSON.stringify(enviados)} — el bug era mandar «hola aura cuánto tengo»`);

console.log('\nY si ella te movió de pantalla, lo hablado LLEGA igual\n');
/* «cuánto tengo» navegó a la billetera — eso es AU-RA actuando, y está bien.
   Pero el envío viejo dependía del FORMULARIO del chat, que al navegar deja
   de existir: la frase siguiente se perdía en silencio. Ahora va por una
   cola que no sabe nada del DOM. */
ok((await p.evaluate(() => VETA._vista?.())) === 'billetera',
   'la orden hablada movió la app (a la billetera)',
   'sin navegación esta prueba no prueba nada: revisar auraDesdeElHilo');
ok(await p.evaluate(() => !document.querySelector('#chat-txt')),
   'y el formulario del chat ya no está — que es el caso difícil');
ok(await p.evaluate(() => window.__decir('gracias aura', false)) === 'ok',
   'el micrófono sigue abierto: es un modo continuo, no un turno');
await p.evaluate(() => window.__decir('gracias aura', true));
await p.waitForTimeout(900);
enviados = await p.evaluate(() => window.__enviados);
ok(enviados.length === 3 && enviados[2] === 'gracias aura',
   'y la frase dicha SIN formulario llegó igual, entera y sola',
   `se mandó: ${JSON.stringify(enviados)} — perderla en silencio era el fallo`);

await nav.close(); sv.close(); api.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
