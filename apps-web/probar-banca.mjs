/* La banca de AuCorp, de punta a punta y en un navegador de verdad.
 *
 *   node probar-banca.mjs
 *
 * Levanta el API DE VERDAD (infra/aucorp-api) contra un Mongo en memoria, con
 * un Genesis fingido —fingido solo Genesis, que es de otra casa—, sirve la web
 * tal como se despliega, y hace el recorrido con el ratón: entrar con la llave
 * de la wallet, abrir una cuenta, ver el saldo que acreditó operaciones,
 * guardar un destino, transferir y pedir un retiro.
 *
 * Lo que esta prueba caza y ninguna otra puede: que la pantalla y el API se
 * entiendan. Los dos pueden estar perfectos por separado y no hablarse — un
 * campo que se llama distinto, un dato que la vista espera y nadie envía — y
 * eso solo se ve cuando los dos corren juntos.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(AQUI, '..', 'infra', 'aucorp-api');

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import(path.join(API_DIR, 'node_modules', 'mongodb-memory-server', 'index.js')));
} catch {
  console.log('mongodb-memory-server no está instalado en infra/aucorp-api: esta prueba NO corrió y NO probó nada.');
  process.exit(0);
}

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);
/* El texto de la pantalla, con los espacios aplastados: en el codigo las
   frases largas van partidas en varias lineas y textContent se las trae con
   los saltos puestos. Buscar la frase tal como la LEE una persona. */
const leer = async (pag) => (await pag.textContent('body')).replace(/\s+/g, ' ');

// ── el Genesis fingido ──────────────────────────────────────────────────────
const genesis = http.createServer((req, res) => {
  let c = '';
  req.on('data', (d) => { c += d; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/sso/verificar') {
      const { token } = JSON.parse(c || '{}');
      return res.end(JSON.stringify({ valido: true, gid: token, perfil: {
        verificada: true, nombre: 'Ana Pérez',
        apps: [{ app: 'veta-wallet', direccion: '0x' + 'a'.repeat(40) }] } }));
    }
    if (req.url === '/api/v1/movimientos') return res.end(JSON.stringify({ ok: true }));
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((ok) => genesis.listen(0, ok));

// ── el API de verdad ────────────────────────────────────────────────────────
const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
process.env.GENESIS_URL = `http://127.0.0.1:${genesis.address().port}`;
process.env.GENESIS_API_KEY = 'clave-de-prueba';
process.env.AUCORP_TOKEN = 'secreto-largo-de-prueba-para-firmar-sesiones';
process.env.AUCORP_ADMIN_KEY = 'clave-de-operaciones';
process.env.PORT = '0';
// Sin este origen el navegador bloquearía cada llamada y la pantalla quedaría
// en blanco sin decir por qué — que es exactamente el fallo que esta prueba
// existe para no repetir en producción.
const PUERTO_WEB = 8877;
process.env.CORS_ORIGENES = `http://127.0.0.1:${PUERTO_WEB}`;

const api = (await import(path.join(API_DIR, 'app.js'))).default;
await new Promise((ok) => setTimeout(ok, 500));
const API = `http://127.0.0.1:${api.servidor.address().port}`;

// ── la web, servida como se despliega ───────────────────────────────────────
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const web = http.createServer((req, res) => {
  let r = decodeURIComponent(req.url.split('?')[0]);
  if (r.endsWith('/')) r += 'index.html';
  const f = path.join(AQUI, 'aucorp', r);
  if (!f.startsWith(path.join(AQUI, 'aucorp'))) { res.statusCode = 403; return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.statusCode = 404; return res.end('no'); }
    res.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream');
    /* La CSP de la pagina no conoce el puerto del API de pruebas. Se ajusta
       AQUI, sirviendo el HTML ya con el origen puesto, y no interceptando en
       el navegador: la interceptacion de Playwright deja las peticiones que
       hace la propia pagina esperando para siempre, y el sintoma —una pantalla
       que se queda en «Entrando…»— no se parece en nada a la causa.
       El resto de la CSP se respeta tal cual, que es justo lo que se prueba. */
    if (path.extname(f) === '.html') {
      d = Buffer.from(String(d).replace(/connect-src [^;]+;/, `connect-src 'self' ${API};`));
    }
    res.end(d);
  });
});
await new Promise((ok) => web.listen(PUERTO_WEB, '127.0.0.1', ok));
const WEB = `http://127.0.0.1:${PUERTO_WEB}`;

// ── el navegador ────────────────────────────────────────────────────────────
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
// La CSP de la página no conoce el puerto del API de pruebas; se le añade al
// vuelo. En producción la lista es la de verdad y por eso allí no hace falta.
await p.addInitScript((api) => { window.AUCORP_API = api; }, API);

const admin = async (ruta, cuerpo, metodo = 'POST') => {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': 'clave-de-operaciones' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return r.json();
};

decir('la puerta: sin llave no se ve nada, y se dice qué es esta casa');
{
  await p.goto(`${WEB}/banca/`);
  await p.waitForTimeout(400);
  const txt = await leer(p);
  comprobar(/Entrar con Genesis ID/.test(txt), 'la puerta es la identidad del ecosistema');
  comprobar(/sesión de Veta Wallet/.test(txt),
    'y dice el viaje entero: dónde se confirma que sos vos');
  comprobar(!/\d+[.,]\d\d/.test(txt), 'y sin sesión no se enseña ni una cifra',
    txt.match(/\d+[.,]\d\d/)?.[0] || '');
  comprobar(/No es un banco con licencia bancaria/.test(txt),
    'la puerta ya dice que AuCorp NO es un banco con licencia');
}

decir('entrar con la llave que trae la wallet');
{
  /* Se pasa por about:blank a proposito. Ir de /banca/ a /banca/#sso=… es un
     cambio de HASH: el navegador no recarga el documento y el script no vuelve
     a correr, asi que la llave nunca se leeria. En la vida real la persona
     llega desde la wallet, que es una navegacion de verdad. */
  await p.goto('about:blank');
  await p.goto(`${WEB}/banca/#sso=gid-ana`);
  await p.waitForTimeout(4000);
  comprobar(await p.locator('.riel').isVisible(), 'entra y aparece la navegación');
  comprobar(!/#sso=/.test(p.url()),
    'y la llave DESAPARECE de la barra de direcciones — un token pegado en un chat es una sesión regalada',
    p.url());
  const t0 = await leer(p);
  comprobar(/Ninguna cuenta abierta/.test(t0),
    'sin cuentas todavía, lo dice en vez de enseñar un cero', t0.slice(0, 220));
}

decir('abrir una cuenta y ver entrar el dinero');
{
  await p.click('[data-abrir="nueva"]');
  await p.waitForTimeout(700);
  await p.selectOption('#n-mon', 'USD');
  await p.click('[data-form="nueva"] button[type=submit]');
  await p.waitForTimeout(900);
  comprobar(/USD/.test(await leer(p)), 'la cuenta en dólares queda abierta');

  // Operaciones acredita un depósito, como pasaría de verdad.
  const d = await admin('/tesoreria/deposito', { gid: 'gid-ana', moneda: 'USD',
    monto: '1,500.00', ref: 'deposito-prueba-0001', comprobante: 'Extracto #1' });
  comprobar(d.monto?.texto === '1500.00', 'operaciones acredita 1500.00 contra el extracto');

  await p.reload();
  await p.waitForTimeout(1200);
  const txt = await leer(p);
  comprobar(/1500\.00/.test(txt), 'y la pantalla lo enseña', txt.match(/[\d,]+\.\d\d/g)?.slice(0, 3).join(' '));
  comprobar(/\$ 1500\.00/.test(txt), 'con el total en dólares calculado por el servidor');
}

decir('guardar un destino y transferir');
{
  await admin('/auth/sso', null, 'GET');   // ruido: no existe, no debe romper nada
  // Beto tiene que existir para poder recibir.
  await fetch(API + '/auth/sso', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'gid-beto' }) });

  await p.click('[data-ir="bancos"]');
  await p.waitForTimeout(800);
  await p.fill('#d-alias', 'Beto');
  await p.selectOption('#d-tipo', 'interno');
  await p.waitForTimeout(200);
  await p.selectOption('#d-mon', 'USD');
  await p.fill('#d-gid', 'gid-beto');
  await p.click('[data-form="destino"] button[type=submit]');
  await p.waitForTimeout(1000);
  comprobar(/Beto/.test(await leer(p)), 'el destino queda guardado y a la vista');

  await p.click('[data-ir="mover"]');
  await p.waitForTimeout(900);
  await p.selectOption('#t-ben', { index: 1 });
  await p.fill('#t-monto', '250,50');
  await p.click('[data-form="transferir"] button[type=submit]');
  await p.waitForTimeout(1400);
  const txt = await leer(p);
  comprobar(/Enviaste 250\.50 USD a Beto/.test(txt),
    'se transfiere escribiendo a la europea y el aviso lo confirma en claro',
    txt.match(/Enviaste[^.]*\./)?.[0] || '');
  comprobar(/1249\.50/.test(txt), 'y el saldo baja exactamente lo que salió');
}

decir('la cotización se ve ANTES de cambiar');
{
  await p.click('[data-ir="mover"]');
  await p.waitForTimeout(900);
  await p.selectOption('#c-de', 'USD');
  await p.selectOption('#c-a', 'HNL');
  await p.fill('#c-monto', '100');
  await p.waitForTimeout(2200);
  const caja = await p.textContent('[data-cotiza]');
  comprobar(/Recibís [\d.,]+ HNL/.test(caja), 'dice cuánto se recibe antes de tocar nada', caja);
  comprobar(/Tasa de referencia/.test(caja) && /margen/.test(caja),
    'y de qué día es la tasa y qué margen lleva — nada escondido dentro del número');
}

decir('un retiro se PIDE, y se ve esperando');
{
  await p.click('[data-ir="bancos"]');
  await p.waitForTimeout(800);
  await p.fill('#d-alias', 'Mi banco');
  await p.selectOption('#d-tipo', 'bancario');
  await p.waitForTimeout(200);
  await p.selectOption('#d-mon', 'USD');
  await p.fill('#d-banco', 'Banco Atlántida');
  await p.fill('#d-tit', 'Ana Pérez');
  await p.fill('#d-num', '01234567890123');
  await p.click('[data-form="destino"] button[type=submit]');
  await p.waitForTimeout(1000);
  comprobar(/···0123/.test(await leer(p)),
    'el número de cuenta se enseña enmascarado');

  await p.click('[data-ir="mover"]');
  await p.waitForTimeout(900);
  await p.selectOption('#r-ben', { index: 1 });
  await p.fill('#r-monto', '300');
  await p.click('[data-form="retirar"] button[type=submit]');
  await p.waitForTimeout(1400);
  const txt = await leer(p);
  comprobar(/Esperando pago/.test(txt), 'queda esperando a que operaciones lo pague',
    txt.match(/Esperando pago/)?.[0] || '');
  comprobar(/Pediste retirar 300\.00/.test(txt), 'y se dice qué se pidió');
}

decir('los límites se ven, y el extracto también');
{
  await p.click('[data-ir="limites"]');
  await p.waitForTimeout(900);
  const txt = await leer(p);
  comprobar(/Nivel 1/.test(txt), 'el nivel de la cuenta está a la vista');
  comprobar(/de 1000\.00 USD/.test(txt), 'y cuánto puede mover hoy', txt.match(/de [\d.]+ USD/)?.[0] || '');
  comprobar(/Verificada/.test(txt), 'con el estado de su identidad');

  await p.click('[data-ir="extracto"]');
  await p.waitForTimeout(900);
  const ext = await leer(p);
  comprobar(/Depósito USD/.test(ext) && /Transferencia/.test(ext),
    'el extracto trae cada movimiento con su explicación');
  comprobar(/\+ 1500\.00 USD/.test(ext) && /− 250\.50 USD/.test(ext),
    'con el signo de cada uno, no solo el color');
}

decir('la portada de carga: marca primero, plataforma después');
{
  // SIN movimiento reducido: la portada tiene que aparecer y luego irse sola.
  const s = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await s.addInitScript((api) => { window.AUCORP_API = api; }, API);
  await s.goto(`${WEB}/banca/`);
  await s.waitForTimeout(250);
  comprobar(await s.locator('.abriendo').isVisible(), 'al abrir aparece el sello de AuCorp cargando');
  await s.waitForTimeout(1700);
  comprobar(!(await s.locator('.abriendo').isVisible()), 'y se va sola en un momento');
  comprobar(/Entrar con Genesis ID/.test(await leer(s)), 'dejando la puerta a la vista');
  await s.close();
}

decir('la tarjeta y los bancos se enseñan sin fingir');
{
  await p.click('[data-ir="tarjeta"]');
  await p.waitForTimeout(700);
  const t = await leer(p);
  comprobar(/aún no se emite/.test(t), 'la tarjeta dice con letras que aún no se emite');
  comprobar(/···· ···· ···· ····/.test(t), 'y el plástico lleva puntos, no un número fingido');
  comprobar(!/En camino|Próximamente|Coming soon/i.test(t),
    'sin pastillas de «en camino»: la honestidad va en prosa, no en etiqueta');

  await p.click('[data-ir="bancos"]');
  await p.waitForTimeout(700);
  const bt = await leer(p);
  comprobar(/Hoy/.test(bt) && /Lo que sigue/.test(bt),
    'bancos separa el puente de hoy de lo que sigue, sin pastillas');

  await p.click('[data-ir="inicio"]');
  await p.waitForTimeout(800);
  const it = await leer(p);
  comprobar(/Hola, Ana/.test(it), 'Inicio saluda con el nombre', it.slice(0, 80));
  comprobar(/Veta Wallet/.test(it) && /Ordenex/.test(it), 'y enseña el ecosistema entero');
  comprobar(/Lo último/.test(it), 'con los últimos movimientos a la vista');
}

decir('el teléfono');
{
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await m.addInitScript((api) => { window.AUCORP_API = api; }, API);
  await m.goto(`${WEB}/banca/#sso=gid-ana`);
  await m.waitForTimeout(1400);
  comprobar(await m.locator('.barra').isVisible(), 'en el teléfono aparece la barra de abajo');
  comprobar(!(await m.locator('.riel').isVisible()), 'y el riel del escritorio se va');
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  comprobar(ancho <= 391, 'nada se sale de la pantalla a lo ancho', String(ancho));
  await m.close();
}

comprobar(errores.length === 0, 'ni un error de página en todo el recorrido', errores.join(' · '));

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
await b.close();
web.close();
genesis.close();
await mongo.stop();
process.exit(fallos ? 1 : 0);
