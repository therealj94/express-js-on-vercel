/* EL HILO NO SE MUEVE SOLO.
 *
 * «cuando recibo mensaje no sé por qué el chat se sube aunque baje, se sube
 *  solo y sigue pasando» — reportado dos veces.
 *
 * La causa: cada refresco termina repintando el hilo con `innerHTML`, que no
 * lo mueve sino que lo DESTRUYE y construye otro, y el nuevo nace con el
 * scroll en cero. Y el primer arreglo lo dejó peor: dejó de irse al fondo y
 * empezó a irse ARRIBA, que es la misma interrupción con otro destino.
 *
 * Se prueba lo que la persona siente, no la variable de adentro:
 *   · subo a releer, llega un mensaje, y NO me muevo de donde estaba;
 *   · pero se me avisa que llegó algo, para no perdérmelo;
 *   · y si estaba abajo, sí me sigue llevando abajo, que es lo que quiero.
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
  env: { ...process.env, MENSAJES_DATOS: join(mkdtempSync(join(tmpdir(), 'quieto-')), 'datos.json'),
         MENSAJES_PUERTO: String(P_RELEVO),
         HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  stdio: 'ignore',
});
await new Promise(r => setTimeout(r, 1300));

const REL = `http://127.0.0.1:${P_RELEVO}`;
const post = async (ruta, cuerpo) => (await fetch(REL + ruta, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })).json();

/* Una amiga que escribe mucho: hace falta un hilo LARGO para poder subir. */
const ana = await post('/alta', { correo: 'ana@prueba.local', nombre: 'Ana' });
const yoAna = { correo: 'ana@prueba.local', llave: ana.llave };

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
await p.addInitScript(({ u, m }) => { window.OG_API = u; window.OG_MENSAJES_API = m; },
  { u: API, m: REL });
await p.goto('http://127.0.0.1:8899/index.html');
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
});
await p.goto('http://127.0.0.1:8899/index.html');
await p.waitForTimeout(2200);
await p.evaluate(() => VETA.ir('app'));
await p.waitForTimeout(2000);
await p.evaluate(() => CHAT.alta({ correo: 'jose@ordenglobal.org', nombre: 'José',
                                   direccion: '0xaaaa' }));
await p.waitForTimeout(500);
await p.evaluate(() => CHAT.pedirAmistad('ana@prueba.local')).catch(() => null);
await post('/amistad/responder', { ...yoAna, de: 'jose@ordenglobal.org', aceptar: true });

/* Treinta mensajes: sin hilo largo no hay nada que subir, y la prueba pasaría
   sin medir nada. */
for (let i = 1; i <= 30; i++)
  await post('/enviar', { ...yoAna, para: 'jose@ordenglobal.org',
                          texto: `Mensaje viejo número ${i} de la conversación de antes.` });

await p.evaluate(() => { VETA.vista('chat'); });
await p.waitForTimeout(2500);
await p.evaluate(() => VETA._chatCon({ id: 'ana@prueba.local', nombre: 'Ana' }));
await p.waitForTimeout(2500);

console.log('\nSubo a releer y llega un mensaje\n');

// Se ESPERA a que haya contenido, no se mide y se cruza los dedos: medir
// antes de que el hilo se pinte da cero recorrido y la prueba pasa sin haber
// probado nada — me pasó en el primer intento.
await p.waitForFunction(() => {
  const m = document.querySelector('#chat-msgs');
  return m && m.scrollHeight - m.clientHeight > 300;
}, null, { timeout: 25000 }).catch(() => null);
const alto = await p.evaluate(() => {
  const m = document.querySelector('#chat-msgs');
  return m ? m.scrollHeight - m.clientHeight : 0;
});
ok(alto > 200, 'el hilo es largo de verdad: hay a dónde subir',
   `sólo ${alto}px de recorrido — la prueba no mediría nada`);

// subo a la mitad, como quien vuelve a leer algo
await p.evaluate(() => { document.querySelector('#chat-msgs').scrollTop = 200; });
await p.waitForTimeout(300);
const antes = await p.evaluate(() => document.querySelector('#chat-msgs').scrollTop);

await post('/enviar', { ...yoAna, para: 'jose@ordenglobal.org',
                        texto: 'Y este llega mientras vos estás leyendo arriba.' });
// dos refrescos completos: el fallo aparecía justo en el repintado
await p.waitForTimeout(7000);

const despues = await p.evaluate(() => ({
  donde: document.querySelector('#chat-msgs').scrollTop,
  aviso: !!document.querySelector('.cha-nuevos'),
  llego: (document.querySelector('#chat-msgs')?.textContent || '')
    .includes('mientras vos estás leyendo'),
}));
ok(despues.llego, 'el mensaje nuevo llegó al hilo');
ok(Math.abs(despues.donde - antes) < 40,
   'y NO me movió: sigo donde estaba leyendo',
   `estaba en ${antes}px y quedé en ${despues.donde}px`);
ok(despues.donde > 40,
   'en particular NO me tiró arriba del todo, que es el fallo nuevo',
   `quedé en ${despues.donde}px`);
ok(despues.aviso, 'pero me avisa que llegó algo, para no perdérmelo');

console.log('\nSi estaba abajo, sí me sigue llevando abajo\n');

await p.evaluate(() => VETA.chatBajar());
await p.waitForTimeout(400);
await post('/enviar', { ...yoAna, para: 'jose@ordenglobal.org',
                        texto: 'Otro más, con vos ya mirando el final del hilo.' });
await p.waitForTimeout(7000);
const abajo = await p.evaluate(() => {
  const m = document.querySelector('#chat-msgs');
  return { pegado: m.scrollHeight - m.scrollTop - m.clientHeight <= 80,
           aviso: !!document.querySelector('.cha-nuevos') };
});
ok(abajo.pegado, 'estando al final, un mensaje nuevo sí me lleva al final');
ok(!abajo.aviso, 'y ahí el aviso sobra: ya lo estoy viendo');

await nav.close(); sv.close(); api.close(); relevo.kill();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
