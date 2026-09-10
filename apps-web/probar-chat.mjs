/* PULSE2CHAT, el flujo entero de hoy: círculo, hilo, pago, grupo y campana.
 *
 *   node apps-web/probar-chat.mjs
 *
 * La versión anterior de esta prueba era de ANTES del círculo de contactos:
 * María le escribía a José sin que nadie la aceptara, y el relevo —con razón,
 * eso es exactamente lo que protege— contestaba 403. La prueba llevaba tiempo
 * enseñando listas vacías sin quejarse, porque solo imprimía. Y simulaba
 * window.prompt para crear un grupo, cuando la app hace años que usa su propio
 * modal: se quedaba esperando a un usuario que no existe hasta agotar el
 * tiempo.
 *
 * Esta versión ejercita el producto de verdad y AFIRMA, no imprime:
 *
 *   1. María pide amistad; a José le aparece la solicitud con su globo.
 *   2. José acepta EN LA PANTALLA, y solo entonces María puede escribirle.
 *   3. El mensaje llega, José contesta desde la caja, y la respuesta llega al
 *      relevo de María.
 *   4. Una tarjeta de pago se pinta como tarjeta, con su enlace a ordenscan.
 *   5. El grupo se crea con el modal real de la app, escribiendo en él.
 *   6. La campana de avisos está en la cabecera cuando el permiso está por
 *      decidir.
 *   7. En el teléfono, la lista y el hilo son dos pantallas.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { createServer } from 'node:http';
import { abrirNavegador } from './navegador.mjs';

const RAIZ = join(new URL('.', import.meta.url).pathname, 'veta-wallet');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const sv = createServer((q, r) => {
  const l = normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let f = join(RAIZ, l === '/' ? 'index.html' : l);
  if (!existsSync(f)) f = join(RAIZ, 'index.html');
  r.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
/* En el 8899 FIJO, no en uno al azar: el relevo tiene lista cerrada de
   origenes (CORS) y ese es el que esta permitido para las pruebas. En un
   puerto cualquiera el navegador bloquea hasta el /alta, y parece un fallo del
   chat cuando es la politica haciendo su trabajo. */
/* Los huerfanos de una corrida cortada no pueden contaminar esta: un relevo
   zombi con datos viejos contesta 401 a llaves recien acuñadas y el fallo
   parece de cualquier cosa menos de lo que es. El corchete en el patron evita
   que el pkill se mate a si mismo (su propia linea de comando tambien contiene
   el patron cuando va sin corchete — paso, y tumbaba la shell entera). */
try { execSync('pkill -f "[m]ensajes/servidor.py"'); } catch {}
try { execSync('fuser -k -TERM 8899/tcp 2>/dev/null'); } catch {}
await new Promise(r => setTimeout(r, 500));

await new Promise(r => sv.listen(8899, r));
const WEB = `http://127.0.0.1:8899/index.html`;

const dir = mkdtempSync(join(tmpdir(), 'relevo-'));
/* Puerto al azar para el relevo (la lista CORS restringe el origen de la WEB,
   que si es fijo en 8899; el puerto del relevo es libre). */
const PUERTO = 8300 + Math.floor(Math.random() * 180);
const rel = spawn('python3', [join(new URL('.', import.meta.url).pathname, '..', 'infra/mensajes/servidor.py')], {
  env: { ...process.env, MENSAJES_DATOS: join(dir, 'datos.json'),
         MENSAJES_PUERTO: String(PUERTO), MENSAJES_ARCHIVOS: join(dir, 'arch') },
});
const BASE = `http://127.0.0.1:${PUERTO}`;
const post = async (ruta, cuerpo) => {
  const r = await fetch(BASE + ruta, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  return { code: r.status, d: await r.json().catch(() => ({})) };
};
await new Promise(r => setTimeout(r, 1400));

let fallos = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? `\n           ${String(extra).replace(/\s+/g, ' ').slice(0, 110)}` : ''}`);
};
const fin = (codigo) => { try { rel.kill(); } catch {} sv.close(); process.exit(codigo); };
setTimeout(() => { console.log('FALLO: se pasó de tiempo'); fin(1); }, 180000).unref();
/* Un crash o una señal (timeout, Ctrl-C) también limpian: sin esto, cada
   corrida cortada dejaba relevo y servidor huérfanos para la siguiente. */
process.on('uncaughtException', e => { console.log('FALLO:', e.message); fin(1); });
process.on('unhandledRejection', e => { console.log('FALLO:', e?.message || e); fin(1); });
process.on('SIGTERM', () => fin(1));
process.on('SIGINT', () => fin(1));

const yo = 'jose@prueba.local', otra = 'maria@prueba.local';
const kOtra = (await post('/alta', { correo: otra, nombre: 'María Fuentes', gid: 'OG-9K2M-77', addr: '0xaaaa' })).d.llave;

const b = await abrirNavegador();
const err = [];
const p = await b.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2,
  reducedMotion: 'reduce', bypassCSP: true });
p.on('pageerror', e => err.push('pageerror: ' + e.message));
await p.addInitScript(pt => { window.OG_MENSAJES_API = 'http://127.0.0.1:' + pt; }, PUERTO);
await p.goto(WEB);
await p.waitForTimeout(900);
await p.evaluate(correo => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  VETA.idioma('es');
  VETA._sembrar([{ s: 'ORIGEN', n: 'Origen', cant: 10, precio: .4, nativo: true }]);
  VETA._sesion({ correo, nombre: 'José Enamorado', direccion: '0xbbbb' });
  VETA._identidad({ estado: 'verificada', gid: 'OG-1A2B-33' });
  VETA.ir('app'); VETA.vista('chat');
}, yo);
await p.waitForTimeout(1800);

console.log('\n── el círculo: primero la solicitud, después la palabra ──────');
{
  // Sin amistad, el relevo no deja escribir. Es la regla, no un fallo.
  const cerrado = await post('/enviar', { correo: otra, llave: kOtra, para: yo, texto: 'hola' });
  decir(cerrado.code === 403, 'sin aceptar, María no puede escribirle a José', `HTTP ${cerrado.code}`);

  /* El alta de José la hace la app al entrar al chat, y es asíncrona: se
     insiste hasta que el relevo lo conozca, en vez de apostar a un sleep. */
  let pedido = { code: 0 };
  for (let i = 0; i < 20 && pedido.code !== 200; i++) {
    pedido = await post('/amistad/pedir', { correo: otra, llave: kOtra, para: yo, nota: 'Soy María, del mercado' });
    if (pedido.code !== 200) await new Promise(r => setTimeout(r, 500));
  }
  decir(pedido.code === 200, 'la solicitud de María entra al relevo', `HTTP ${pedido.code}`);
  // El latido del chat trae el círculo; se fuerza recargando la vista.
  await p.evaluate(() => VETA.vista('chat'));
  await p.waitForTimeout(2200);
  const globo = await p.evaluate(() => document.querySelector('.p2c-globo')?.textContent || '');
  decir(globo === '1', 'a José le aparece la solicitud con su globo en GENTE', `globo «${globo}»`);

  await p.evaluate(() => VETA.p2cTab('gente'));
  await p.waitForTimeout(400);
  const nota = await p.evaluate(() => document.body.textContent.includes('Soy María, del mercado'));
  decir(nota, 'y la nota de María se lee, para saber quién pide');

  // Aceptar EN LA PANTALLA, que es el flujo de la persona.
  await p.evaluate(o => VETA.p2cResponder(o, true), otra);
  await p.waitForTimeout(1200);
  const abierto = await post('/enviar', { correo: otra, llave: kOtra, para: yo, texto: '¿Llegó el envío?' });
  decir(abierto.code === 200, 'aceptada, María ya puede escribir', `HTTP ${abierto.code}`);
}

console.log('\n── el hilo: llega, se contesta, y la respuesta viaja ─────────');
{
  await p.evaluate(o => VETA.chatAbrir(o), otra);
  await p.waitForTimeout(1200);
  const burb = await p.evaluate(() => [...document.querySelectorAll('.cha-globo p')].map(x => x.textContent));
  decir(burb.some(x => /Llegó el envío/.test(x)), 'el mensaje de María está en el hilo', burb.join(' · '));

  await p.fill('#chat-txt', 'Sí, ya salió. Mirá el comprobante.');
  await p.click('.cha-manda');
  await p.waitForTimeout(1200);
  const eco = await p.evaluate(() => [...document.querySelectorAll('.cha-globo p')].map(x => x.textContent));
  decir(eco.some(x => /ya salió/.test(x)), 'la respuesta de José se pinta en el hilo');

  const bandeja = await post('/bandeja', { correo: otra, llave: kOtra, desde: yo });
  decir((bandeja.d.mensajes || []).some(m => /ya salió/.test(m.texto || '')),
    'y llega de verdad al relevo de María', `${(bandeja.d.mensajes || []).length} mensajes`);
}

console.log('\n── la tarjeta de pago ────────────────────────────────────────');
{
  await post('/pago', { correo: otra, llave: kOtra, para: yo, monto: '12.5', moneda: 'ORIGEN',
                        hash: '0x' + 'ab'.repeat(32), nota: 'Por el pedido' });
  await p.evaluate(o => VETA.chatAbrir(o), otra);
  await p.waitForTimeout(1200);
  const monto = await p.evaluate(() => document.querySelector('.cha-pago b')?.textContent || '');
  const enlace = await p.evaluate(() => document.querySelector('.cha-pago a')?.getAttribute('href') || '');
  decir(/12.5/.test(monto), 'el pago se pinta como tarjeta con su monto', monto);
  decir(enlace.startsWith('https://ordenscan.com/tx/0x'), 'y el comprobante apunta a ordenscan', enlace.slice(0, 40));
  await p.screenshot({ path: 'chat-hilo.png' });
}

console.log('\n── el grupo, con el modal de verdad ──────────────────────────');
{
  // La version vieja simulaba window.prompt. La app usa su propio modal desde
  // hace tiempo: se escribe en EL, como la persona.
  const promesa = p.evaluate(() => { VETA.chatGrupo(); });
  await p.waitForTimeout(500);
  await p.fill('#chat-hoja-txt', 'Los del mercado');
  // el «crear» es el submit del formulario de la hoja, sin id propio
  await p.click('.chaf-acciones button[type="submit"]');
  await promesa;
  await p.waitForTimeout(1400);
  const cab = await p.evaluate(() => document.querySelector('.cha-quien b')?.textContent || '');
  decir(cab === 'Los del mercado', 'el grupo queda creado y abierto', cab);
}

console.log('\n── la campana de avisos ──────────────────────────────────────');
{
  const campana = await p.evaluate(() => ({
    hay: Boolean(document.querySelector('#cha-avisos')),
    permiso: typeof Notification !== 'undefined' ? Notification.permission : 'no-hay',
  }));
  decir(campana.permiso !== 'default' || campana.hay,
    'con el permiso por decidir, la campana está en la cabecera', JSON.stringify(campana));
}

console.log('\n── el teléfono: lista e hilo son dos pantallas ───────────────');
{
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    reducedMotion: 'reduce', bypassCSP: true });
  await m.addInitScript(pt => { window.OG_MENSAJES_API = 'http://127.0.0.1:' + pt; }, PUERTO);
  await m.goto(WEB);
  await m.waitForTimeout(800);
  await m.evaluate(() => {
    localStorage.setItem('veta.bienvenida.v1', '1'); VETA.idioma('es');
    VETA._sembrar([{ s: 'ORIGEN', n: 'Origen', cant: 10, precio: .4, nativo: true }]);
    VETA._sesion({ correo: 'maria@prueba.local', nombre: 'María', direccion: '0xaaaa' });
    VETA._identidad({ estado: 'verificada', gid: 'OG-9K2M-77' });
    VETA.ir('app'); VETA.vista('chat');
  });
  await m.waitForTimeout(2000);
  await m.screenshot({ path: 'chat-movil-lista.png' });
  await m.evaluate(() => VETA.chatAbrir('jose@prueba.local'));
  await m.waitForTimeout(900);
  /* La clase de la lista es .p2c-casa desde la marca nueva; la vieja
     .chat-lista ya no existe y la prueba se caia con un TypeError en vez de
     decir que quedo vieja. */
  const oculta = await m.evaluate(() => {
    const casa = document.querySelector('.p2c-casa');
    return Boolean(casa) && getComputedStyle(casa).display === 'none';
  });
  decir(oculta, 'con el hilo abierto, la lista se aparta', '');
  await m.screenshot({ path: 'chat-movil-hilo.png' });
}

const errsReales = err.filter(e => !/ERR_CONNECTION|Failed to load resource/.test(e));
decir(errsReales.length === 0, 'sin errores de página', errsReales.join(' | '));

if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron`); fin(1); }
console.log('\nTodo en verde');
fin(0);
