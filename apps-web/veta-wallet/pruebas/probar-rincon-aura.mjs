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
await p.screenshot({ path: '/tmp/rincon.png' });
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
ok(!(await p.$('.aura-voz')), 'y apagado no ocupa lugar: la pantalla no está');

/* La pantalla de voz. El pedido fue explícito —«como ChatGPT cuando pongo
   modo voz y me sale la pelotita»— así que se comprueba lo que se ve:
   que sea una pantalla APARTE, que tenga su pelotita, que diga en qué
   estado está, y que al salir el hilo siga completo y escrito. */
await p.evaluate(() => VETA.auraVozPantalla());
await p.waitForTimeout(600);
const window_alto = await p.evaluate(() => window.innerHeight);
const vz = await p.evaluate(() => {
  const v = document.querySelector('.aura-voz');
  const msgs = document.querySelector('#chat-msgs');
  return {
    hay: !!v,
    delBody: !!v && v.parentElement === document.body,
    orbe: !!document.querySelector('.aura-pelota'),
    capas: document.querySelectorAll('.aura-pelota span').length,
    // que se VEA, no solo que exista: #aura-orbe ya estaba usado por el
    // botón flotante de AU-RA, y reusar ese id dejaba la pelotita de 64px
    // pegada a una esquina — existía y no se veía
    ancho: Math.round(document.querySelector('.aura-pelota')?.getBoundingClientRect().width || 0),
    fijo: getComputedStyle(document.querySelector('.aura-pelota') || document.body).position,
    estado: document.querySelector('.aura-voz-est')?.textContent.trim() || '',
    boton: document.querySelector('.aura-voz-b')?.textContent.trim() || '',
    pelotaToca: document.querySelector('.aura-pelota')?.tagName === 'BUTTON',
    salir: !!document.querySelector('.aura-voz-x'),
    nota: document.querySelector('.aura-voz-nota')?.textContent.trim() || '',
    // `fixed`: tiene que tapar también la barra de abajo. Media pantalla de
    // app asomando no es una pantalla de voz, es un panel.
    tapa: !!v && !!msgs && getComputedStyle(v).position === 'fixed',
    alto: Math.round(v?.getBoundingClientRect().height || 0),
  };
});
ok(vz.hay, 'tocando HABLAR se abre una pantalla de voz aparte');
ok(vz.orbe && vz.capas === 3, 'con su pelotita, que es lo único que hay que mirar');
ok(vz.ancho >= 120, 'y la pelotita se VE: mide lo que tiene que medir',
   `mide ${vz.ancho}px de ancho`);
ok(vz.fijo === 'relative',
   'no está pegada a una esquina: vive en el centro de su pantalla', vz.fijo);
// Quieta NO repite la instrucción arriba y abajo: el botón ya la dice, y
// decirla dos veces en la misma pantalla es ruido. Lo que se comprueba es
// que SIEMPRE haya algo que te diga qué hacer, no dónde está escrito.
ok(vz.boton.length > 2 && !/undefined|au\./.test(vz.boton),
   'siempre dice qué hacer, sin claves crudas', `botón: «${vz.boton}»`);
ok(!/undefined|au\./.test(vz.estado),
   'y la línea de estado nunca enseña una clave sin traducir', vz.estado);
ok(vz.pelotaToca, 'la pelotita se toca: es lo más grande y lo más obvio');
ok(vz.salir, 'con una salida clara');
// los DOS idiomas: la página se pinta en inglés en este navegador, y una
// comprobación atada a una sola lengua se pone roja sin que nada esté mal —
// ya me pasó una vez con esta misma suite
ok(/escrit|written/i.test(vz.nota),
   'y avisa que lo hablado queda escrito: es lo que hace que no dé miedo usarla',
   vz.nota);
ok(vz.tapa, 'la pantalla se pone ENCIMA de todo, no al costado');
// Que mida la pantalla ENTERA. Metida dentro del hilo medía 768 de 844 y
// dejaba la barra de abajo asomando: el contenedor del chat lleva
// `transform` para su animación, y un `fixed` dentro de un ancestro con
// transform se mide contra ese ancestro, no contra la pantalla.
ok(vz.alto >= window_alto - 2,
   'y ocupa la pantalla entera, sin dejar la barra asomando',
   `mide ${vz.alto}px de ${window_alto}`);
ok(vz.delBody, 'porque cuelga del body, no de un contenedor con transform');

await p.screenshot({ path: '/tmp/pantalla-voz.png' });

/* Y lo que más importa al salir: el hilo sigue ahí, con todo. */
await p.evaluate(() => VETA.auraVozCerrar());
await p.waitForTimeout(400);
ok(!(await p.$('.aura-voz')), 'se sale y la pantalla se va');
ok(!!(await p.$('#chat-msgs')),
   'y el hilo sigue completo: lo hablado nunca dejó de ser texto');
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

console.log('\nEl hilo dice que está pensando, y no abre vacío\n');
/* Dos cosas que el hilo de AU-RA no hacía y el chat entre personas sí:
   avisar de que está por contestar, y no recibirte con un cuadro vacío. */
await p.evaluate(() => VETA._chatCon({ id: 'aura@ordenglobal.org', nombre: 'AU-RA' }));
await p.waitForTimeout(400);
const sug = await p.evaluate(() =>
  [...document.querySelectorAll('#chat-msgs .cha-sugiere .aura-chip')]
    .map((b) => b.textContent.trim()));
ok(sug.length >= 3,
   'el hilo vacío de AU-RA ofrece qué preguntarle',
   `se vieron ${sug.length} sugerencias; antes era «Acá no hay nada todavía» y nada más`);
ok(!(await p.evaluate(() => !!document.querySelector('#chat-msgs .cha-pensando'))),
   'y sin nada en vuelo no dice que esté pensando');

/* `auraEsperar()` es lo que marca «le pregunté y estoy esperando»: lo llama
   el envío real. Se dispara a mano para mirar el globo sin un modelo detrás. */
await p.evaluate(() => VETA._chatCon({ id: 'aura@ordenglobal.org', nombre: 'AU-RA',
  __msgs: 1 }));
await p.evaluate(() => { VETA._auraEsperar(); });
await p.waitForTimeout(300);
ok(await p.evaluate(() => !!document.querySelector('#chat-msgs .cha-pensando')
   || !!document.querySelector('.cha-pensando')),
   'y cuando hay una pregunta en vuelo, lo dice',
   'entre mandar y recibir la pantalla se quedaba quieta cinco o diez segundos');

await nav.close(); sv.close(); api.close(); relevo.kill();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
