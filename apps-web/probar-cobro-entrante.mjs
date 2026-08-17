/* Llegar a la wallet desde Ordenex con el envío ya puesto.
 *
 *   node probar-cobro-entrante.mjs
 *
 * Existe por un fallo concreto y por su forma, que es lo que importa:
 *
 * El enlace #pagar<dir>?s=ONDK&m=1.5 rellenaba los campos TOCANDO EL DOM
 * después de pintar. Cualquier repintado posterior —la cartera que termina de
 * cargar y refresca los saldos de las fichas— los dejaba en blanco otra vez.
 * Se veía como «me lleva a la wallet pero no sale la dirección»: la moneda sí
 * quedaba elegida, porque eso es estado del módulo, y la dirección no, porque
 * eso era estado del DOM.
 *
 * Así que aquí no se comprueba «se rellenó»: se comprueba que SIGA RELLENO
 * después de forzar un repintado. Un valor que solo vive en el DOM se cae en
 * esa segunda mirada, que es justo la que no se hacía.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'veta-wallet');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((r) => sv.listen(0, r));
const BASE = `http://127.0.0.1:${sv.address().port}`;

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 130)}`);
};

const DIR = '0x1111111111111111111111111111111111111111';
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-HN' });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));

await p.addInitScript(() => {
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: 'x.' + btoa(JSON.stringify({ address: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
      exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y',
    correo: 'jose@ordenglobal.org', nombre: 'José Enamorado',
    direccion: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
  }));
});

await p.goto(`${BASE}/#pagar${DIR}?s=ONDK&m=1.5`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1600);

// La cartera de verdad no llega (no hay backend), así que se siembra y se
// vuelve a entrar al cobro: es exactamente lo que hace `arrancar` cuando la
// cartera termina de cargar.
await p.evaluate(([dir]) => {
  VETA._sembrar([
    { s: 'ORIGEN', n: 'Origen', cant: 20.95, precio: 2.55, nativo: true },
    { s: 'ONDK', n: 'ONDK', cant: 14.3, precio: null, contrato: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1' },
  ]);
  VETA._irACobro({ dir, monto: '1.5', sim: 'ONDK' });
}, [DIR]);
await p.waitForTimeout(500);

console.log('\n── el envío llega puesto ─────────────────────────────────────');
{
  const v = await p.evaluate(() => ({
    dir: document.getElementById('env-dir')?.value || '',
    monto: document.getElementById('env-monto')?.value || '',
    titulo: document.querySelector('.cab h2')?.textContent || '',
  }));
  decir(v.dir === DIR, 'la dirección de destino viene puesta', v.dir || '(vacía)');
  decir(v.monto === '1.5', 'y la cantidad también', v.monto || '(vacía)');
  decir(/ONDK/.test(v.titulo), 'y el activo elegido es el que pidió el enlace', v.titulo);
}

console.log('\n── Y SIGUE PUESTO DESPUÉS DE UN REPINTADO ────────────────────');
{
  /* Este es el bloque que importa. Un repintado pasa solo —la cartera termina
     de cargar, alguien toca otra ficha, cambia el idioma— y antes se llevaba
     por delante lo que el enlace había traído. */
  await p.evaluate(() => VETA.vista('enviar'));
  await p.waitForTimeout(300);
  const v = await p.evaluate(() => ({
    dir: document.getElementById('env-dir')?.value || '',
    monto: document.getElementById('env-monto')?.value || '',
  }));
  decir(v.dir === DIR, 'tras repintar, la dirección sigue ahí', v.dir || '(SE BORRÓ)');
  decir(v.monto === '1.5', 'y la cantidad sigue ahí', v.monto || '(SE BORRÓ)');

  // Y lo tecleado a mano tampoco se pierde: es el mismo estado.
  await p.fill('#env-dir', '0x2222222222222222222222222222222222222222');
  await p.evaluate(() => VETA.vista('enviar'));
  await p.waitForTimeout(300);
  const v2 = await p.evaluate(() => document.getElementById('env-dir')?.value || '');
  decir(v2 === '0x2222222222222222222222222222222222222222',
    'y lo que alguien estaba tecleando tampoco se borra al repintar', v2 || '(SE BORRÓ)');
}

console.log('\n── el modo ventana ───────────────────────────────────────────');
{
  const src = await readFile(new URL('./veta-wallet/app.js', import.meta.url), 'utf8');
  decir(/ORIGENES_QUE_PUEDEN_ABRIR/.test(src), 'solo los orígenes de la lista reciben el aviso');
  decir(!/postMessage\([^)]*, ?'\*'\)/.test(src), 'y no hay ni un postMessage con comodín');
  decir(/document\.referrer/.test(src),
    'de dónde viene se toma del referrer, no de la propia URL — eso lo escribe quien arma el enlace');
}

decir(errores.length === 0, 'sin errores de consola', errores.slice(0, 2).join(' · '));

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
