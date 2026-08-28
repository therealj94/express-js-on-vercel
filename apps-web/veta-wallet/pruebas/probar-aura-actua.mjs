/* LO QUE SE LE ESCRIBE EN EL HILO TAMBIÉN MUEVE LA APP.
 *
 * «igual se pueda mover en el ecosistema, decirle y ella pueda moverse y hacer
 *  cosas»
 *
 * Escribir «llevame a cobrar» en la bolita abría Cobrar. Escribir lo MISMO en
 * el hilo de PULSE2CHAT —que es donde dice «la inteligencia de la casa» y
 * donde la gente va a hablar con ella— no hacía nada: el hilo mandaba el texto
 * derecho al modelo, y un modelo no abre pantallas. La misma frase daba dos
 * resultados según en qué caja la escribieras.
 *
 * Acá se comprueba que las dos puertas llevan al mismo sitio, y —tan
 * importante como eso— que el hilo NO se pone a hacer cosas cuando la frase es
 * una pregunta o un ajuste de la propia AU-RA.
 */
import { chromium } from 'playwright';
import { createServer, request as httpPeticion } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const puertoLibre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});

const P_RELEVO = await puertoLibre();
const relevo = spawn('python3', [join(RAIZ, '../../infra/mensajes/servidor.py')], {
  env: { ...process.env,
         MENSAJES_DATOS: join(mkdtempSync(join(tmpdir(), 'actua-')), 'datos.json'),
         MENSAJES_PUERTO: String(P_RELEVO),
         HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1400));

const post = (ruta, cuerpo) => new Promise((ok) => {
  const d = Buffer.from(JSON.stringify(cuerpo));
  const q = httpPeticion({ host: '127.0.0.1', port: P_RELEVO, path: ruta, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': d.length } }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { ok(JSON.parse(b)); } catch { ok({}); } });
    });
  q.on('error', () => ok({}));
  q.end(d);
});
const alta = await post('/alta', { correo: 'aura@ordenglobal.org', nombre: 'AU-RA' });

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
await p.addInitScript(({ u, m }) => { window.OG_API = u; window.OG_MENSAJES_API = m; },
  { u: API, m: `http://127.0.0.1:${P_RELEVO}` });
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
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(2500);

const donde = () => p.evaluate(() => VETA._vista?.() ?? null);

/* Se llama a la puerta del hilo DIRECTAMENTE. Mandar de verdad exige el lazo
   con AU-RA y una vuelta al relevo, y lo que se está probando no es el envío
   —eso tiene sus pruebas— sino que lo escrito mueva la app. */
const escribirEnElHilo = (txt) => p.evaluate((t) => VETA._auraDesdeElHilo(t), txt);

console.log('\nDecirle a dónde ir, ESCRIBIENDO EN EL HILO\n');
const viajes = [
  ['llevame a cobrar', 'cobrar'],
  ['abrime la tarjeta', 'tarjeta'],
  ['quiero ver mi actividad', 'actividad'],
  ['llevame a contactos', 'contactos'],
];
for (const [frase, esperado] of viajes) {
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(250);
  const movio = await escribirEnElHilo(frase);
  await p.waitForTimeout(350);
  const v = await donde();
  ok(movio === true && v === esperado,
     `«${frase}» abre ${esperado}`,
     `terminó en «${v}» (movió: ${movio})`);
}

console.log('\nUna PREGUNTA no es un viaje\n');
/* «¿qué es la tarjeta?» no puede llevarte a la tarjeta: es una pregunta, y la
   contesta ella. La guarda ya existía en el cerebro; acá se comprueba que
   sigue valiendo desde esta puerta nueva. */
for (const frase of ['¿qué es la tarjeta?', '¿cómo funciona el cobro?',
                     '¿qué es Genesis ID?']) {
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(250);
  const movio = await escribirEnElHilo(frase);
  await p.waitForTimeout(300);
  ok(movio === false && (await donde()) === 'nucleo',
     `«${frase}» no te arrastra a ningún lado`,
     `terminó en «${await donde()}» (movió: ${movio})`);
}

console.log('\nY los ajustes de ella son suyos, no viajes\n');
/* «cambiame la voz» dispararía el /cambi/ de la tabla y abriría la pantalla de
   cambiar monedas. Un atajo que te lleva a otro lado es peor que no tenerlo. */
for (const frase of ['cambiame la voz', 'hablame con voz cálida', 'modo pensador',
                     'modo rápido', 'sin voz']) {
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(200);
  const movio = await escribirEnElHilo(frase);
  await p.waitForTimeout(250);
  ok(movio === false && (await donde()) === 'nucleo',
     `«${frase}» lo entiende ella, no la app`,
     `terminó en «${await donde()}» (movió: ${movio})`);
}

console.log('\nLas dos puertas llevan al mismo sitio\n');
/* La bolita ya sabía hacerlo. Lo que se comprueba es que ahora el hilo hace lo
   MISMO — que era todo el problema: la misma frase, dos resultados, según en
   qué caja la escribieras. */
await p.evaluate(() => VETA.vista('nucleo'));
await p.waitForTimeout(250);
await p.evaluate(() => VETA.auraChip('llevame a cobrar'));
await p.waitForTimeout(500);
const porLaBurbuja = await donde();
await p.evaluate(() => VETA.vista('nucleo'));
await p.waitForTimeout(250);
await escribirEnElHilo('llevame a cobrar');
await p.waitForTimeout(400);
const porElHilo = await donde();
ok(porLaBurbuja === porElHilo && porElHilo === 'cobrar',
   'la misma frase, el mismo destino, se escriba donde se escriba',
   `la burbuja fue a «${porLaBurbuja}» y el hilo a «${porElHilo}»`);

console.log('\nLas órdenes de los botones no se pintan en el hilo\n');
/* Tocás «Pensadora», después la voz Sobria, y tu conversación quedaba con
   «modo pensador» y «hablame con voz sobria» metidos entre lo que le estabas
   preguntando, como si los hubieras escrito vos. Son botones de ajuste. */
await p.evaluate(() => VETA.vista('chat'));
await p.waitForTimeout(500);
/* El lazo: primero se pide desde la app y DESPUÉS se acepta. Al revés no hay
   nada que aceptar y el relevo sigue diciendo «hace falta que te acepte». */
await p.evaluate(() => CHAT.pedirAmistad('aura@ordenglobal.org'));
await post('/amistad/responder', { correo: 'aura@ordenglobal.org', llave: alta.llave,
  de: 'jose@ordenglobal.org', aceptar: true });
await p.evaluate(async () => {
  await CHAT.enviar('aura@ordenglobal.org', '¿Cuánto cuesta cobrar?');
  await CHAT.enviar('aura@ordenglobal.org', 'modo pensador');
  await CHAT.enviar('aura@ordenglobal.org', 'hablame con voz sobria');
  await CHAT.enviar('aura@ordenglobal.org', 'sin voz');
  await VETA.chatAbrir('aura@ordenglobal.org');
});
await p.waitForTimeout(1600);
const enElHilo = await p.evaluate(() =>
  [...document.querySelectorAll('#chat-msgs .cha-b:not(.cha-pensando)')]
    .map((b) => b.textContent.trim()));
const hay = (t) => enElHilo.some((x) => x.includes(t));
ok(hay('Cuánto cuesta cobrar'),
   'lo que preguntaste de verdad sigue ahí',
   `el hilo tiene: ${JSON.stringify(enElHilo)}`);
for (const orden of ['modo pensador', 'hablame con voz sobria', 'sin voz']) {
  ok(!hay(orden), `«${orden}» no ensucia la conversación`,
     `el hilo tiene: ${JSON.stringify(enElHilo)}`);
}
/* Y la confirmación de ELLA sí se queda: es la única señal de que el botón
   hizo algo. Se simula, que acá no hay asistente detrás. */
await post('/enviar', { correo: 'aura@ordenglobal.org', llave: alta.llave,
  para: 'jose@ordenglobal.org', texto: 'Listo, voz sobria: más lenta y más clara.' });
await p.evaluate(() => VETA.chatAbrir('aura@ordenglobal.org'));
await p.waitForTimeout(1400);
const conRespuesta = await p.evaluate(() =>
  [...document.querySelectorAll('#chat-msgs .cha-b:not(.cha-pensando)')]
    .map((b) => b.textContent.trim()));
ok(conRespuesta.some((x) => x.includes('voz sobria: más lenta')),
   'y la confirmación de ella sí se ve',
   `el hilo tiene: ${JSON.stringify(conRespuesta)}`);

await nav.close(); sv.close(); api.close();
try { relevo.kill(); } catch { /* ya no estaba */ }
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
