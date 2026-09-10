/* UNA SOLA AU-RA: que la bola de la esquina deje de decir «no sé».
 *
 * Había dos AU-RA y no se conocían. La que se ve en toda la app es de reglas
 * —sabe llevarte a cobrar, dejar un envío listo, decir tu saldo— y a todo lo
 * demás contestaba «eso todavía no lo sé». La que SÍ sabe estaba escondida
 * dentro de una pestaña de chat.
 *
 * Lo que se prueba acá es el reparto, que es lo único que importa:
 *
 *   · lo que TOCA DINERO lo siguen resolviendo las reglas, en el acto y sin
 *     preguntarle a ningún modelo. Un envío no se le confía a algo que
 *     improvisa.
 *   · lo que las reglas NO reconocen ya no muere en «no sé»: se le pregunta
 *     a ella, por el hilo de siempre.
 *
 * El relevo es de VERDAD (levantado acá) y AU-RA es de mentira: una cuenta
 * que contesta sola. Así se comprueba el camino entero —enviar, esperar,
 * recibir, pintar— sin depender de que el nodo con GPU esté vivo.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';

const puertoLibre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});
const P_RELEVO = await puertoLibre();
const relevo = spawn('python3', ['/home/user/express-js-on-vercel/infra/mensajes/servidor.py'], {
  env: { ...process.env, MENSAJES_DATOS: join(mkdtempSync(join(tmpdir(), 'unasola-')), 'datos.json'),
         MENSAJES_PUERTO: String(P_RELEVO),
         HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  stdio: 'ignore',
});
await new Promise(r => setTimeout(r, 1300));

const REL = `http://127.0.0.1:${P_RELEVO}`;
const post = async (ruta, cuerpo) => {
  const r = await fetch(REL + ruta, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  return r.json().catch(() => ({}));
};

/* AU-RA de mentira: se da de alta, acepta a quien le escriba y contesta una
   frase reconocible. No hay modelo — se prueba el CAMINO, no lo que dice. */
const LA_FRASE = 'ESTO-LO-CONTESTO-EL-MODELO, no las reglas de la bola.';
const aura = await post('/alta', { correo: 'aura@ordenglobal.org', nombre: 'AU-RA' });
const yoAura = { correo: 'aura@ordenglobal.org', llave: aura.llave };
let viva = true;
(async () => {
  const visto = new Set();
  while (viva) {
    try {
      // el campo es `correo` (resumen_ficha), no `de`: mirándolo mal, la
      // AU-RA de mentira no aceptaba a nadie y todo caía en 403
      for (const s of (await post('/amistad/lista', yoAura)).recibidas || [])
        await post('/amistad/responder',
                   { ...yoAura, de: s.correo || s.de || s, aceptar: true });
      for (const c of (await post('/conversaciones', yoAura)).conversaciones || []) {
        const con = c.correo || c.con || c.id || c;
        for (const m of (await post('/bandeja', { ...yoAura, desde: con })).mensajes || []) {
          if (m.de === 'aura@ordenglobal.org' || visto.has(m.id)) continue;
          visto.add(m.id);
          await post('/enviar', { ...yoAura, para: con, texto: LA_FRASE });
        }
      }
    } catch { /* el relevo puede tardar en levantar */ }
    await new Promise(r => setTimeout(r, 400));
  }
})();

const RAIZ = '/home/user/express-js-on-vercel/apps-web/veta-wallet';
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
await new Promise(ok => api.listen(0, ok));
const API = `http://127.0.0.1:${api.address().port}`;

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise(ok => sv.listen(8899, '127.0.0.1', ok));

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
// Un error dentro de una función async del navegador no se ve desde acá: se
// traga solo y la prueba mide un silencio sin saber por qué. Se escuchan.
p.on('pageerror', (e) => console.log('   ⚠ error de página:', String(e).slice(0, 180)));
p.on('console', (m) => { const t = m.text();
  if (/AU-RA|aura/i.test(t) || (m.type() === 'error' && !/ERR_CONNECTION_RESET/.test(t)))
    console.log(`   ⚠ ${m.type()}: ${t.slice(0, 220)}`); });
await p.addInitScript(({ u, m }) => { window.OG_API = u; window.OG_MENSAJES_API = m; },
  { u: API, m: REL });
await p.goto('http://127.0.0.1:8899/index.html');
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
});
await p.goto('http://127.0.0.1:8899/index.html');
await p.waitForTimeout(2200);
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(3000);

/* CONECTADA DESDE QUE ABRE EL DASHBOARD. Se comprueba sin tocar la pestaña
   del chat: entrar a la app tiene que dejar la sesión de chat lista, porque
   si no, la bola de la esquina le pregunta al modelo, se encuentra sin
   sesión y vuelve a contestar «eso todavía no lo sé» — la unificación
   existiría y no se notaría. */
console.log('\nConectada desde que abre, sin tocar la pestaña del chat\n');
ok(await p.evaluate(() => CHAT.listo()),
   'entrar al dashboard deja la sesión de chat lista',
   'sin esto la bola sigue muda para todo lo que no sean sus reglas');
ok(await p.evaluate(() => !!CHAT.quienSoy()?.correo),
   'y con identidad, no a medias');

await p.evaluate(() => CHAT.pedirAmistad('aura@ordenglobal.org')).catch(() => null);
await p.waitForTimeout(2200);

console.log('\nLo que toca dinero lo resuelven las REGLAS, no el modelo\n');

const reglas = await p.evaluate(async () => {
  VETA.auraChip('¿cuánto tengo?');
  await new Promise(r => setTimeout(r, 900));
  return document.querySelector('#aura-hilo')?.textContent || '';
});
ok(!reglas.includes('ESTO-LO-CONTESTO-EL-MODELO'),
   'el saldo NO pasa por el modelo: lo contesta código, en el acto',
   'un dato de dinero no se le confía a algo que improvisa');
ok(reglas.length > 20, 'y contesta algo, no se queda muda');

console.log('\nLo que las reglas no saben ya no muere en «no sé»\n');

const t0 = Date.now();
await p.evaluate(() => VETA.auraChip('recomendame una receta de tamales para el domingo'));
await p.waitForTimeout(700);
const mientras = await p.evaluate(() => ({
  puntos: !!document.querySelector('.aura-pensando'),
  texto: document.querySelector('#aura-hilo')?.textContent || '',
}));
ok(mientras.puntos,
   'mientras piensa se ven los tres puntos: el panel no se queda quieto',
   'cinco segundos sin señal es indistinguible de una app colgada');

await p.waitForFunction(
  () => (document.querySelector('#aura-hilo')?.textContent || '')
    .includes('ESTO-LO-CONTESTO-EL-MODELO'), null, { timeout: 30000 }
).catch(() => null);
const luego = await p.evaluate(() => ({
  texto: document.querySelector('#aura-hilo')?.textContent || '',
  puntos: !!document.querySelector('.aura-pensando'),
}));
ok(luego.texto.includes('ESTO-LO-CONTESTO-EL-MODELO'),
   'una pregunta que las reglas no entienden LLEGA al modelo y vuelve',
   `en ${((Date.now() - t0) / 1000).toFixed(1)}s · panel: ${luego.texto.slice(-90)}`);
ok(!luego.puntos, 'y al llegar la respuesta los puntos se van');
ok(!/todavía no lo sé|do not know that yet/i.test(luego.texto),
   'y NO dice «eso todavía no lo sé»: esa puerta cerrada se acabó');

console.log('\nEs la MISMA AU-RA: lo hablado en la burbuja queda en el hilo\n');

const enElHilo = await p.evaluate(async () => {
  const d = await CHAT.bandeja('aura@ordenglobal.org');
  return (d?.mensajes || []).map(
    m => `${m.de === 'aura@ordenglobal.org' ? 'AURA' : 'YO'}: ${m.texto}`);
});
ok(enElHilo.some(x => /tamales/.test(x)),
   'lo preguntado desde la bola aparece en PULSE2CHAT',
   'si viviera en otro canal serían dos AU-RA otra vez, con dos memorias');
ok(enElHilo.some(x => x.startsWith('AURA') && x.includes('ESTO-LO-CONTESTO')),
   'y su respuesta también: un solo hilo, una sola memoria');

await nav.close(); sv.close(); api.close(); viva = false; relevo.kill();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
