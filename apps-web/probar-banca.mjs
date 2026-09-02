/* La banca de AuCorp, de punta a punta y en un navegador de verdad.
 *
 *   node probar-banca.mjs
 *   PLAYWRIGHT=/ruta/a/playwright-core/index.mjs node probar-banca.mjs
 *
 * Levanta el API DE VERDAD (infra/aucorp-api) contra un Mongo en memoria, con
 * un Genesis fingido —fingido solo Genesis, que es de otra casa—, sirve la web
 * tal como se despliega, y hace el recorrido con el ratón: entrar con la llave
 * de la wallet, abrir una cuenta, ver el saldo que acreditó operaciones,
 * guardar un destino, transferir y ver el comprobante, pedir un retiro y ver
 * qué le falta, avisar un depósito, sacar el extracto del mes, y entrar
 * DESDE ADENTRO del marco de la wallet pidiendo la llave (sso-pedido).
 *
 * Lo que esta prueba caza y ninguna otra puede: que la pantalla y el API se
 * entiendan. Los dos pueden estar perfectos por separado y no hablarse — un
 * campo que se llama distinto, un dato que la vista espera y nadie envía — y
 * eso solo se ve cuando los dos corren juntos.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(AQUI, '..', 'infra', 'aucorp-api');

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT || 'playwright'));
} catch {
  console.log('playwright no está instalado: esta prueba NO corrió y NO probó nada. (PLAYWRIGHT=/ruta/a/playwright-core/index.mjs la apunta a una copia suelta.)');
  process.exit(0);
}
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
/* Con CAPTURAS=/carpeta se guarda una foto de cada pantalla que importa: es
   la forma de mirar el diseño sin abrir un navegador a mano. */
const foto = async (pag, nombre) => { if (process.env.CAPTURAS) await pag.screenshot({ path: path.join(process.env.CAPTURAS, nombre + '.png'), fullPage: true }); };

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
process.env.AUCORP_BARRIDO = 'no';
process.env.PORT = '0';
const PUERTO_WEB = 8877;
process.env.CORS_ORIGENES = `http://127.0.0.1:${PUERTO_WEB}`;

const api = (await import(path.join(API_DIR, 'app.js'))).default;
await new Promise((ok) => setTimeout(ok, 500));
const API = `http://127.0.0.1:${api.servidor.address().port}`;

// ── la web, servida como se despliega ───────────────────────────────────────
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const web = http.createServer((req, res) => {
  let r = decodeURIComponent(req.url.split('?')[0]);
  if (r.endsWith('/')) r += 'index.html';
  /* La wallet fingida: una página que enmarca la banca y contesta el
     sso-pedido como lo hace la de verdad (sólo al origen que enmarcó). */
  if (r === '/wallet-fingida.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><meta charset="utf-8"><title>wallet</title>
      <iframe class="marco-hoja" src="/banca/" style="width:900px;height:700px"></iframe>
      <script>
        window.__pedidos = 0;
        addEventListener('message', (ev) => {
          if (!ev.data || ev.data.og !== 'sso-pedido') return;
          const suyo = new URL(document.querySelector('.marco-hoja').src).origin;
          if (ev.origin !== suyo) return;
          window.__pedidos++;
          ev.source.postMessage({ og: 'sso-token', token: 'gid-ana' }, suyo);
        });
      </script>`);
  }
  const f = path.join(AQUI, 'aucorp', r);
  if (!f.startsWith(path.join(AQUI, 'aucorp'))) { res.statusCode = 403; return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.statusCode = 404; return res.end('no'); }
    res.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream');
    /* La CSP de la pagina no conoce el puerto del API de pruebas. Se ajusta
       AQUI, sirviendo el HTML ya con el origen puesto, y no interceptando en
       el navegador. El resto de la CSP se respeta tal cual. */
    if (path.extname(f) === '.html') {
      d = Buffer.from(String(d).replace(/connect-src [^;]+;/, `connect-src 'self' ${API};`));
    }
    res.end(d);
  });
});
await new Promise((ok) => web.listen(PUERTO_WEB, '127.0.0.1', ok));
const WEB = `http://127.0.0.1:${PUERTO_WEB}`;

// ── el navegador ────────────────────────────────────────────────────────────
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'es', colorScheme: 'dark' });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.addInitScript(({ api, web }) => { window.AUCORP_API = api; window.AUC_WALLET = web; }, { api: API, web: WEB });

const admin = async (ruta, cuerpo, metodo = 'POST') => {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': 'clave-de-operaciones' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return r.json();
};
// La lista de sanciones, sin la cual ningún destino bancario se guarda.
await admin('/tesoreria/sanciones/importar', {
  texto: fs.readFileSync(path.join(API_DIR, 'pruebas', 'listas', 'sdn-prueba.csv'), 'utf8'), fuente: 'prueba' });

decir('la puerta: sin llave no se ve nada, y se dice qué es esta casa');
{
  await p.goto(`${WEB}/banca/`);
  await p.waitForTimeout(400);
  const txt = await leer(p);
  comprobar(/Entrar con Genesis ID/.test(txt), 'la puerta es la identidad del ecosistema');
  comprobar(/sesión de Veta Wallet/.test(txt), 'y dice el viaje entero: dónde se confirma que sos vos');
  comprobar(!/\d+[.,]\d\d/.test(txt), 'y sin sesión no se enseña ni una cifra', txt.match(/\d+[.,]\d\d/)?.[0] || '');
  comprobar(/No es un banco con licencia bancaria/.test(txt), 'la puerta ya dice que AuCorp NO es un banco con licencia');
  const manifiesto = await fetch(`${WEB}/banca/manifest.webmanifest`).then((r) => r.json()).catch(() => null);
  comprobar(manifiesto?.display === 'standalone' && manifiesto.icons?.length >= 3, 'el manifiesto de la app está y tiene íconos');
  const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  comprobar(fondo === 'rgb(21, 26, 32)', 'la banca viste pizarra, no el verde de la billetera ni el hueso del sitio', fondo);
}

decir('entrar con la llave que trae la wallet');
{
  await p.goto('about:blank');
  await p.goto(`${WEB}/banca/#sso=gid-ana`);
  await p.waitForTimeout(3500);
  comprobar(await p.locator('.riel').isVisible(), 'entra y aparece la navegación');
  comprobar(!/#sso=/.test(p.url()), 'y la llave DESAPARECE de la barra de direcciones', p.url());
  const t0 = await leer(p);
  comprobar(/Ninguna cuenta abierta/.test(t0), 'sin cuentas todavía, lo dice en vez de enseñar un cero', t0.slice(0, 220));
  comprobar(/Hola, Ana/.test(t0), 'y saluda con el nombre');
  await foto(p, '01-puerta-inicio-vacio');
}

decir('abrir una cuenta y ver entrar el dinero');
{
  await p.click('[data-ir="nueva"]');
  await p.waitForTimeout(700);
  await p.selectOption('#n-mon', 'USD');
  await p.click('[data-form="nueva"] button[type=submit]');
  await p.waitForTimeout(1200);
  comprobar(/Tu cuenta en USD está abierta/.test(await leer(p)), 'la cuenta en dólares queda abierta y se dice');

  const d = await admin('/tesoreria/deposito', { gid: 'gid-ana', moneda: 'USD',
    monto: '1,500.00', ref: 'deposito-prueba-0001', comprobante: 'Extracto #1' });
  comprobar(d.monto?.texto === '1500.00', 'operaciones acredita 1500.00 contra el extracto');

  await p.reload();
  await p.waitForTimeout(1500);
  const txt = await leer(p);
  comprobar(/1 500\.00/.test(txt), 'y la pantalla lo enseña, con los miles separados', txt.match(/[\d ]+\.\d\d/g)?.slice(0, 3).join(' | '));
  comprobar(/1 500\.00 ?USD/.test(txt), 'con el total en dólares calculado por el servidor');
}

decir('guardar un destino, transferir y ver el comprobante');
{
  await fetch(API + '/auth/sso', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'gid-beto' }) });

  await p.click('[data-ir="mover"]');
  await p.waitForTimeout(700);
  await p.click('.cab [data-ir="destinos"]');
  await p.waitForTimeout(800);
  await p.fill('#d-alias', 'Beto');
  await p.selectOption('#d-tipo', 'interno');
  await p.waitForTimeout(200);
  await p.selectOption('#d-mon', 'USD');
  await p.fill('#d-gid', 'gid-beto');
  await p.click('[data-form="destino"] button[type=submit]');
  await p.waitForTimeout(1000);
  comprobar(/Destino guardado/.test(await leer(p)), 'el destino queda guardado y a la vista');

  await p.click('[data-ir="mover"]');
  await p.waitForTimeout(900);
  await p.selectOption('#t-ben', { index: 1 });
  await p.fill('#t-monto', '250,50');
  await p.click('[data-form="transferir"] button[type=submit]');
  await p.waitForTimeout(1600);
  const txt = await leer(p);
  comprobar(/Enviaste 250\.50 USD a Beto/.test(txt), 'se transfiere escribiendo a la europea y el aviso lo confirma', txt.match(/Enviaste[^.]*\./)?.[0] || '');
  comprobar(await p.locator('.papel').isVisible(), 'y aterriza en el COMPROBANTE del movimiento');
  comprobar(/Saldo antes ?1 500\.00 USD/.test(txt) && /saldo después: 1 249\.50 USD/.test(txt),
    'que dice el saldo antes y el saldo después', txt.match(/saldo después: [^U]+USD/)?.[0] || '');
  comprobar(/Huella SHA-256/.test(txt) && /[0-9a-f]{64}/.test(txt), 'y lleva su huella');
  comprobar(/#comprobante=/.test(p.url()), 'con su dirección propia, para volver o compartir', p.url());
  await foto(p, '03-comprobante');
  const imprimible = await p.evaluate(() => {
    const hoja = [...document.styleSheets].find((s) => s.href === null);
    return [...hoja.cssRules].some((r) => r.media && /print/.test(r.media.mediaText) && /\.riel/.test(r.cssText) && /display: none/.test(r.cssText));
  });
  comprobar(imprimible, 'al imprimir sólo queda el papel: el riel y la barra se esconden');
}

decir('un monto mal escrito se marca en su campo');
{
  await p.click('[data-ir="mover"]');
  await p.waitForTimeout(900);
  await p.selectOption('#t-ben', { index: 1 });
  await p.fill('#t-monto', '1.2.3.4');
  await p.click('[data-form="transferir"] button[type=submit]');
  await p.waitForTimeout(1000);
  const err = await p.locator('[data-form="transferir"] .error-campo').textContent().catch(() => '');
  comprobar(/no se entiende/.test(err || '') && /decimales/.test(err || ''), 'el error del API aparece al lado del monto, con cómo escribirlo', err);
}

decir('la cotización se ve ANTES de cambiar');
{
  await p.selectOption('#c-de', 'USD');
  await p.selectOption('#c-a', 'HNL');
  await p.fill('#c-monto', '100');
  await p.waitForTimeout(2200);
  const caja = await p.textContent('[data-cotiza]');
  comprobar(/Recibís [\d ]+[\d.,]+ HNL/.test(caja), 'dice cuánto se recibe antes de tocar nada', caja);
  comprobar(/Tasa de referencia/.test(caja) && /margen/.test(caja), 'y de qué día es la tasa y qué margen lleva');
}

decir('un retiro se PIDE, y se ve qué le falta');
{
  await p.click('.cab [data-ir="destinos"]');
  await p.waitForTimeout(800);
  await p.fill('#d-alias', 'Mi banco');
  await p.selectOption('#d-tipo', 'bancario');
  await p.waitForTimeout(200);
  await p.selectOption('#d-mon', 'USD');
  await p.fill('#d-banco', 'Banco Atlántida');
  await p.fill('#d-tit', 'Ana Pérez');
  await p.fill('#d-num', '01234567890123');
  await p.click('[data-form="destino"] button[type=submit]');
  await p.waitForTimeout(1200);
  comprobar(/···0123/.test(await leer(p)), 'el número de cuenta se enseña enmascarado');

  await p.click('[data-ir="mover"]');
  await p.waitForTimeout(900);
  await p.selectOption('#r-ben', { index: 1 });
  await p.fill('#r-monto', '300');
  await p.click('[data-form="retirar"] button[type=submit]');
  await p.waitForTimeout(1600);
  const txt = await leer(p);
  comprobar(/Pediste retirar 300\.00/.test(txt), 'se dice qué se pidió');
  comprobar(/Esperando pago/.test(txt), 'y queda esperando a que operaciones lo pague');
  comprobar(/Qué falta: Operaciones tiene que pagar el retiro/.test(txt), 'con lo que le falta, dicho para una persona');
  comprobar(/Solicitud de retiro/.test(txt) && await p.locator('.papel').isVisible(), 'en una constancia imprimible');
  await foto(p, '04-constancia-retiro');
}

decir('un depósito se AVISA y aparece en trámite');
{
  await admin('/tesoreria/corresponsal', { moneda: 'USD', banco: 'Banco de prueba', titular: 'AuCorp LLC', numero: '9999-0000-1111' });
  await p.click('[data-ir="solicitudes"]');
  await p.waitForTimeout(900);
  await p.selectOption('#a-mon', 'USD');
  await p.fill('#a-monto', '500');
  await p.fill('#a-ref', 'TRF-777');
  await p.click('[data-form="aviso"] button[type=submit]');
  await p.waitForTimeout(1400);
  const txt = await leer(p);
  comprobar(/Aviso registrado: 500\.00 USD/.test(txt), 'el aviso queda registrado y se dice');
  comprobar(/Esperando acreditación/.test(txt), 'en trámite, esperando a que operaciones lo encuentre');
  comprobar(/En trámite/.test(txt) && /Retiro a Mi banco/.test(txt), 'junto al retiro pendiente');
}

decir('los movimientos con filtros, y el extracto del mes');
{
  await p.click('[data-ir="movimientos"]');
  await p.waitForTimeout(1000);
  let txt = await leer(p);
  comprobar(/3 movimientos/.test(txt), 'se ven los tres (depósito, transferencia, retiro apartado)', txt.match(/\d+ movimientos?/)?.[0]);
  await p.selectOption('#f-cl', 'deposito');
  await p.click('[data-form="filtros"] button[type=submit]');
  await p.waitForTimeout(1000);
  txt = await leer(p);
  comprobar(/1 movimiento con este filtro/.test(txt) && /Depósito/.test(txt), 'filtrando por tipo queda sólo el depósito');
  await p.click('[data-limpiar]');
  await p.waitForTimeout(900);
  await p.click('.libro li.toca >> nth=0');
  await p.waitForTimeout(1000);
  comprobar(await p.locator('.papel').isVisible(), 'tocar una línea del libro abre su comprobante');

  await p.click('[data-ir="movimientos"]');
  await p.waitForTimeout(900);
  await p.click('.cab [data-ir="extracto"]');
  await p.waitForTimeout(1200);
  txt = await leer(p);
  const mes = new Date().toISOString().slice(0, 7);
  comprobar(new RegExp(`Extracto ?${mes} · USD`).test(txt), 'el extracto del mes actual sale solo', txt.match(/Extracto ?[^·]+· USD/)?.[0]);
  comprobar(/Saldo inicial ?0\.00/.test(txt) && /Saldo final ?949\.50/.test(txt), 'cuadra: de 0 a 949.50', txt.match(/Saldo final ?[\d .]+/)?.[0]);
  comprobar(/Entradas ?\+ 1 500\.00/.test(txt) && /Salidas ?− 550\.50/.test(txt), 'con entradas y salidas');
  await foto(p, '05-extracto');
  const [descarga] = await Promise.all([
    p.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    p.click('[data-csv]'),
  ]);
  comprobar(descarga && /aucorp-extracto-USD-\d{4}-\d{2}\.csv/.test(descarga.suggestedFilename()), 'el CSV se descarga con su nombre', descarga?.suggestedFilename());
  if (descarga) {
    const csv = fs.readFileSync(await descarga.path(), 'utf8');
    comprobar(/Fecha,Número,Tipo,Concepto,Entra,Sale,Saldo/.test(csv) && /949\.50/.test(csv), 'y trae las columnas y el saldo final');
  }
}

decir('el perfil');
{
  await p.click('[data-ir="perfil"]');
  await p.waitForTimeout(1000);
  const txt = await leer(p);
  comprobar(/Ana Pérez/.test(txt) && /gid-ana/.test(txt), 'dice quién es');
  await foto(p, '02-perfil');
  comprobar(/Verificada en Genesis ID/.test(txt), 'con el estado de su identidad');
  comprobar(/Nivel 1/.test(txt) && /de 1 000\.00 USD/.test(txt), 'cuánto puede mover hoy', txt.match(/de [\d ]+\.\d\d USD/)?.[0]);
  comprobar(/0xaaaa/.test(txt), 'y su Veta Wallet');
  comprobar(/No es un banco con licencia bancaria/.test(txt), 'y qué es esta casa');
  await p.click('[data-tema="claro"]');
  await p.waitForTimeout(300);
  const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  comprobar(fondo === 'rgb(243, 241, 237)', 'la apariencia clara cambia el papel', fondo);
  await p.click('[data-tema=""]');
}

decir('DENTRO DE LA WALLET: la banca pide la llave, no viaja');
{
  const w = await b.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce', locale: 'es', colorScheme: 'dark' });
  w.on('pageerror', (e) => errores.push('marco: ' + e.message));
  if (process.env.DEPURAR) w.on('console', (m) => console.log('   [consola]', m.text().slice(0, 160)));
  await w.addInitScript(({ api, web }) => { window.AUCORP_API = api; window.AUC_WALLET = web; }, { api: API, web: WEB });
  await w.goto(`${WEB}/wallet-fingida.html`);
  await w.waitForTimeout(1500);
  const marco = w.frames().find((f) => /\/banca\//.test(f.url()));
  comprobar(!!marco, 'la banca carga dentro del marco');
  const antes = marco.url();
  await marco.click('[data-entrar]');
  await w.waitForTimeout(3000);
  comprobar(await w.evaluate(() => window.__pedidos) >= 1, 'y al tocar «Entrar» le PIDE la llave a la wallet');
  const despues = w.frames().find((f) => /\/banca\//.test(f.url()))?.url();
  comprobar(despues && despues.startsWith(antes.split('#')[0]), 'el marco NO se fue a la wallet', despues);
  comprobar(/Hola, Ana/.test((await marco.textContent('body')).replace(/\s+/g, ' ')), 'y entra con la llave que llegó por el canal');
  await w.close();
}

decir('el teléfono');
{
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'es', colorScheme: 'dark' });
  m.on('pageerror', (e) => errores.push('móvil: ' + e.message));
  await m.addInitScript(({ api, web }) => { window.AUCORP_API = api; window.AUC_WALLET = web; }, { api: API, web: WEB });
  await m.goto(`${WEB}/banca/#sso=gid-ana`);
  await m.waitForTimeout(2500);
  comprobar(await m.locator('.barra').isVisible(), 'en el teléfono aparece la barra de abajo');
  comprobar(!(await m.locator('.riel').isVisible()), 'y el riel del escritorio se va');
  comprobar(await m.locator('.techo').isVisible(), 'con la marca chica arriba');
  let ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  comprobar(ancho <= 391, 'nada se sale de la pantalla a lo ancho en Inicio', String(ancho));
  await foto(m, '06-movil-inicio');
  for (const v of ['movimientos', 'mover', 'solicitudes', 'perfil']) {
    await m.click(`.barra [data-ir="${v}"]`);
    await m.waitForTimeout(900);
    ancho = await m.evaluate(() => document.documentElement.scrollWidth);
    comprobar(ancho <= 391, `ni en ${v}`, String(ancho));
    await foto(m, '07-movil-' + v);
  }
  await m.click('.barra [data-ir="movimientos"]');
  await m.waitForTimeout(900);
  await m.click('.libro li.toca >> nth=0');
  await m.waitForTimeout(1000);
  ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  comprobar(await m.locator('.papel').isVisible() && ancho <= 391, 'el comprobante cabe en el teléfono', String(ancho));
  await foto(m, '08-movil-comprobante');
  await m.goBack();
  await m.waitForTimeout(800);
  comprobar(/movimientos?/.test(await leer(m)) && !(await m.locator('.papel').isVisible()), '«atrás» del teléfono vuelve a los movimientos, no a la wallet');
  await m.close();
}

comprobar(errores.length === 0, 'ni un error de página en todo el recorrido', errores.join(' · '));

await b.close();
web.close();
genesis.close();
api.servidor.close();
await mongo.stop();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
