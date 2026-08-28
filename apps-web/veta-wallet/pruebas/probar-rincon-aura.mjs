/* El rincón de AU-RA en el chat: distinto para ella, intacto para la gente.
 *
 * La charla con aura@ordenglobal.org es la única que no es con una persona, y
 * la interfaz lo tiene que decir: sin botones de llamada (llamar a un bot es
 * un timbre que nadie contesta), con su tira de modos y voz, y con el
 * micrófono convertido en dictado. Y lo segundo importa tanto como lo
 * primero: la charla con una PERSONA no puede haber cambiado ni un pelo.
 *
 * Se usa el gancho de pruebas _chatCon, que pinta el hilo sin relevo: aquí se
 * prueba la plantilla, no el protocolo (el protocolo tiene su propia suite en
 * infra/aura).
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';

/* El hilo solo se pinta con el relevo VIVO: sin el, el chat cae en su
   pantalla de error y esta prueba estaria midiendo esa pantalla (paso: seis
   FALLA que eran todos el mismo). Se levanta el relevo de verdad, como en
   probar-olvidar. */
const puertoLibre = () => new Promise((ok) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); });
});
const P_RELEVO = await puertoLibre();
const relevo = spawn('python3', ['/home/user/express-js-on-vercel/infra/mensajes/servidor.py'], {
  env: { ...process.env, MENSAJES_DATOS: join(mkdtempSync(join(tmpdir(), 'rincon-')), 'datos.json'),
         MENSAJES_PUERTO: String(P_RELEVO),
         HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  stdio: 'ignore',
});
await new Promise(r => setTimeout(r, 1300));

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
/* En 8899 y no en un puerto al azar: el relevo tiene lista de origenes y
   ese es el puerto de escritorio que la lista admite. En otro puerto, el
   navegador recibe la respuesta SIN el permiso de origen y la descarta —
   «Failed to fetch» con el relevo perfectamente vivo. */
await new Promise(ok => sv.listen(8899, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:8899/index.html`;

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

/* bypassCSP: la pagina trae una CSP que solo deja hablar con sus dominios
   reales; sin esto, el stub local es inalcanzable y TODO cae en la puerta
   de verificados — seis FALLA que eran uno solo. */
const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
await p.addInitScript(({ u, m }) => { window.OG_API = u; window.OG_MENSAJES_API = m; },
  { u: API, m: `http://127.0.0.1:${P_RELEVO}` });
await p.goto(BASE);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
});
await p.goto(BASE);
await p.waitForTimeout(1600);
await p.evaluate(() => { VETA.ir('app'); VETA.vista('chat'); });
/* La puerta del chat mira la identidad, y la identidad llega DESPUES por la
   red: la primera entrada cae en «para gente verificada». Entrar de nuevo
   cuando ya cargo —que es lo que haria una persona tocando la pestaña— abre
   la puerta de verdad. */
await p.waitForTimeout(2500);
await p.evaluate(() => VETA.vista('chat'));
await p.waitForTimeout(1800);

console.log('\nLa charla con AU-RA\n');
await p.evaluate(() => VETA._chatCon({ id: 'aura@ordenglobal.org', nombre: 'AU-RA' }));
await p.waitForSelector('.cha-hcab', { timeout: 8000 }).catch(() => null);
await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/claude-0/-home-user-express-js-on-vercel/0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad/rincon.png' });
const aura = await p.evaluate(() => ({
  tira: !!document.querySelector('.cha-aura-tira'),
  beta: document.querySelector('.cha-aura-beta')?.textContent || '',
  chips: [...document.querySelectorAll('.cha-aura-chip')].map(x => x.textContent.trim()),
  llamar: !!document.querySelector('#cha-llamar-voz') || !!document.querySelector('#cha-llamar-video'),
  sub: document.querySelector('#cha-linea')?.textContent || '',
  claseMsgs: document.querySelector('#chat-msgs')?.className || '',
  dictar: !!document.querySelector('.cha-dictar'),
  notaVoz: !!document.querySelector('.cha-mic:not(.cha-dictar)'),
  sello: document.querySelector('.cha-sello')?.textContent || '',
}));
ok(aura.tira, 'tiene su tira propia');
ok(/beta/i.test(aura.beta), 'con la insignia de beta a la vista');
ok(aura.chips.some(x => /Rápida|Fast/.test(x)) && aura.chips.some(x => /Pensadora|Thinker/.test(x)),
   'los dos modos de pensar son botones', aura.chips.join(' · '));
ok(aura.chips.some(x => /voz|voice/i.test(x)), 'el botón de voz está en la tira');

/* Ya no es un interruptor: son TRES voces. Se comprueba abriendo el cajón,
   que es lo que hace una persona, y contando lo que ve — no leyendo una
   variable de dentro. */
await p.evaluate(() => VETA.auraVozMenu());
await p.waitForTimeout(250);
const voces = await p.evaluate(() => ({
  ops: [...document.querySelectorAll('.cha-aura-vozop b')].map(x => x.textContent.trim()),
  razones: [...document.querySelectorAll('.cha-aura-vozop span')].map(x => x.textContent.trim()),
}));
ok(voces.ops.length === 4,
   'el cajón ofrece las tres voces más la opción de no usarla',
   voces.ops.join(' · '));
ok(['Cálida', 'Sobria', 'Ágil'].every(n => voces.ops.includes(n)),
   'y las tres tienen nombre propio, no «voz 1 / voz 2 / voz 3»',
   voces.ops.join(' · '));
ok(voces.razones.every(r => r.length > 3) && new Set(voces.razones).size === 4,
   'cada una dice para qué sirve, y ninguna repite la razón de otra',
   voces.razones.join(' | '));
await p.evaluate(() => VETA.auraVozMenu());
await p.waitForTimeout(200);
ok(!(await p.$('.cha-aura-vozop')), 'y el cajón se cierra con el mismo botón');

/* El modo de HABLAR, que es el pedido de fondo: «que pueda hablar con AURA y
   no tener que escribir». Se comprueba lo que la persona ve, no la variable
   de adentro: que exista el botón, que al tocarlo aparezca la tira que dice
   qué está pasando, y que se pueda apagar. */
ok(await p.$('.cha-aura-hablar'), 'hay un botón para HABLAR, no solo para escribir');
ok(!(await p.$('.cha-aura-charla')),
   'y apagado no ocupa lugar: la tira de conversación no está');
await p.evaluate(() => VETA.auraCharlarAlterna());
await p.waitForTimeout(400);
const charla = await p.evaluate(() => ({
  tira: !!document.querySelector('.cha-aura-charla'),
  dice: document.querySelector('.cha-aura-est')?.textContent.trim() || '',
  onda: document.querySelectorAll('.cha-aura-onda i').length,
  boton: document.querySelector('.cha-aura-hablar')?.getAttribute('aria-pressed'),
}));
ok(charla.tira, 'encendido aparece la tira de conversación');
ok(charla.dice.length > 10 && !/undefined/.test(charla.dice),
   'que dice EN PALABRAS qué está pasando, no un icono que late', charla.dice);
ok(charla.onda === 5, 'con su onda, que se mueve cuando hay algo que oír');
ok(charla.boton === 'true', 'y el botón queda marcado como encendido (accesible)');
await p.evaluate(() => VETA.auraCharlarAlterna());
await p.waitForTimeout(300);
ok(!(await p.$('.cha-aura-charla')), 'y se apaga con el mismo botón');
ok(!aura.llamar, 'SIN botones de llamar ni video: a un bot no se le timbra');
ok(/beta/i.test(aura.sub), 'el subtítulo dice qué es, no un correo');
ok(aura.claseMsgs.includes('cha-de-aura'), 'el hilo lleva su clase para el estilo');
ok(!aura.notaVoz, 'el micrófono de notas de voz no está (ella solo entiende texto)');
ok(/servidor|server/i.test(aura.sello) && !/punta a punta: ni nosotros|not even we/i.test(aura.sello),
   'el sello del hilo dice la VERDAD de este hilo: lo procesa el servidor',
   aura.sello.slice(0, 120));
console.log(`  (dictado disponible aquí: ${aura.dictar} — depende del navegador)`);

console.log('\nY la burbuja de ella se distingue\n');
const burbuja = await p.evaluate(() => {
  VETA._chatCon({ id: 'aura@ordenglobal.org', nombre: 'AU-RA' });
  return true;
});
ok(burbuja, 'el gancho de pruebas sigue vivo');

console.log('\nLa charla con una persona, intacta\n');
await p.evaluate(() => VETA._chatCon({ id: 'maria@ejemplo.com', nombre: 'María' }));
await p.waitForTimeout(300);
const gente = await p.evaluate(() => ({
  tira: !!document.querySelector('.cha-aura-tira'),
  claseMsgs: document.querySelector('#chat-msgs')?.className || '',
  sub: document.querySelector('#cha-linea')?.textContent || '',
  sello: document.querySelector('.cha-sello')?.textContent || '',
}));
ok(!gente.tira, 'sin tira de AU-RA');
ok(/punta a punta|end-to-end/i.test(gente.sello),
   'y su sello sigue prometiendo punta a punta, como corresponde');
ok(!gente.claseMsgs.includes('cha-de-aura'), 'sin la clase de ella');
ok(!/beta/i.test(gente.sub), 'el subtítulo es el de siempre');

await nav.close(); sv.close(); api.close(); relevo.kill();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
