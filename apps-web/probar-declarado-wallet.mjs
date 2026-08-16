/* El precio declarado por la Junta, dentro de Veta Wallet.
 *
 *   node probar-declarado-wallet.mjs
 *
 * ONDK es el único instrumento del ecosistema que no cotiza en ningún sitio, y
 * la wallet le enseña un valor de cartera a gente real. Eso hace que el riesgo
 * aquí no sea que el número no salga: es que salga SIN decir de dónde viene.
 * Un precio declarado por la Junta pintado igual que el precio del oro se lee
 * como cotización, y ONDK no cotiza.
 *
 * Por eso se comprueban tres cosas y en este orden de importancia:
 *
 *  1. Que el precio SALGA ROTULADO en las dos pantallas donde se ve, y que
 *     AU-RA lo diga con sus palabras cuando se lo preguntan.
 *  2. Que NO lleve variación de 24 h. Un «+0,00 %» al lado diría que un
 *     mercado lo dejó quieto, y no hay mercado.
 *  3. Que sin resolución vigente vuelva al guion, sin inventarse nada.
 *
 * El API falso se sirve DESDE EL MISMO ORIGEN que la página a propósito: así
 * la petición pasa por el connect-src real de la wallet en vez de saltárselo,
 * que es justo el fallo que esta prueba cazó la primera vez que corrió.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'veta-wallet');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// Lo que contesta el API falso. Se cambia entre bloques.
let RESPUESTA = null;

const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0]);
  if (ruta.startsWith('/precio-declarado/')) {
    r.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    r.end(JSON.stringify(RESPUESTA));
    return;
  }
  try {
    const p = join(RAIZ, ruta.replace(/^\/$/, '/index.html'));
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
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 160)}`);
};

const ACTA = {
  token: 'ONDK', clase: 'declarado', moneda: 'USD',
  vigente: { id: '1', fecha: '2026-01-15T00:00:00.000Z', precio: 2.05,
             moneda: 'USD', acta: 'JD-2026-03', firmante: 'Secretario de la Junta', nota: null },
  serie: [],
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/* Abre la wallet ya con sesión y con la cartera cargada POR EL CAMINO REAL:
   se llama a CADENA.portafolio, que es quien pide el precio declarado. Sembrar
   una cartera a mano probaría el pintado y no la cadena entera. */
async function abrir() {
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-HN' });
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.googleapis|Failed to load resource|ERR_/.test(m.text())) errores.push(m.text());
  });
  // El API de Ordenex apunta a este mismo servidor: así la petición pasa por
  // el connect-src de verdad.
  await p.addInitScript(([base]) => {
    window.ONX_API = base;
    localStorage.setItem('veta.sesion', JSON.stringify({
      token: 'x.' + btoa(JSON.stringify({ address: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
        exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y',
      correo: 'jose@ordenglobal.org', nombre: 'José Enamorado',
      direccion: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
    }));
  }, [BASE]);
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  const cartera = await p.evaluate(async () =>
    await CADENA.portafolio('0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2', null));
  await p.evaluate((c) => { VETA._sembrar(c); VETA.vista('billetera'); }, cartera);
  await p.waitForTimeout(400);
  return { p, cartera, errores };
}

console.log('\n── la resolución llega y ONDK deja de estar sin precio ────────');
RESPUESTA = ACTA;
{
  const { p, cartera, errores } = await abrir();
  const ondk = cartera.find(x => x.s === 'ONDK');

  decir(ondk.precio === 2.05, 'ONDK toma el precio de la resolución', `precio=${ondk.precio}`);
  decir(!!ondk.declarado && ondk.declarado.acta === 'JD-2026-03',
    'y el acta viaja PEGADA al precio, no aparte', JSON.stringify(ondk.declarado));
  decir(ondk.chg === null,
    'sin variación de 24 h: no se movió en un mercado, lo firmó la Junta', `chg=${ondk.chg}`);

  // Ningún otro token se contagia.
  const otros = cartera.filter(x => x.s !== 'ONDK' && x.declarado);
  decir(otros.length === 0, 'y ningún otro token se lleva un precio declarado',
    otros.map(x => x.s).join(', '));

  // ── la fila de la lista ────────────────────────────────────────────────
  const fila = await p.evaluate(() => {
    const b = [...document.querySelectorAll('#lienzo .moneda')]
      .find(el => el.getAttribute('aria-label')?.includes('ONDK'));
    return b ? b.innerText : null;
  });
  decir(fila && /2\.05/.test(fila), 'la fila de la lista enseña 2.05', fila);
  decir(fila && /declarado/i.test(fila),
    'y lleva la palabra «declarado» pegada al número', fila);

  // ── la ficha del token ─────────────────────────────────────────────────
  await p.evaluate(() => VETA.vista('token', 'ONDK'));
  await p.waitForTimeout(300);
  const ficha = await p.evaluate(() => document.getElementById('lienzo').innerText);
  decir(/declarado por la junta/i.test(ficha), 'la ficha titula «Precio declarado por la Junta»');
  decir(/JD-2026-03/.test(ficha), 'y cita el acta', (ficha.match(/Acta[^\n]*/) || [''])[0]);
  decir(/15\/01\/2026/.test(ficha), 'con la fecha de vigencia y el año entero');
  decir(/no cotiza todav[ií]a/i.test(ficha),
    'y explica por qué ese número no es una cotización');
  decir(!/24 h/.test(ficha), 'sin ninguna variación de 24 h en la ficha');

  // ── AU-RA ──────────────────────────────────────────────────────────────
  await p.evaluate(() => VETA.auraChip('a cuanto esta el ondk'));
  await p.waitForTimeout(600);
  const dicho = await p.evaluate(() => {
    const b = [...document.querySelectorAll('.aura-b:not(.mio)')];
    return b.length ? b[b.length - 1].innerText : '';
  });
  decir(/junta directiva/i.test(dicho) && /JD-2026-03/.test(dicho),
    'AU-RA contesta nombrando a la Junta y el acta', dicho);
  decir(/no cotiza/i.test(dicho), 'y dice que ONDK no cotiza en ningún lado');
  decir(!/es el precio con el que se calcula/i.test(dicho),
    'y NO usa la frase del precio de mercado');

  decir(errores.length === 0, 'sin errores de consola', errores.join(' | '));
  await p.close();
}

console.log('\n── sin resolución vigente, vuelve el guion ───────────────────');
RESPUESTA = { token: 'ONDK', clase: 'declarado', moneda: 'USD', vigente: null, serie: [] };
{
  const { p, cartera, errores } = await abrir();
  const ondk = cartera.find(x => x.s === 'ONDK');
  decir(ondk.precio === null, 'ONDK se queda sin precio', `precio=${ondk.precio}`);
  decir(ondk.declarado === null, 'y sin acta que enseñar', `${ondk.declarado}`);

  const ficha = await p.evaluate(() => { VETA.vista('token', 'ONDK'); return null; });
  await p.waitForTimeout(300);
  const txt = await p.evaluate(() => document.getElementById('lienzo').innerText);
  decir(/sin precio de mercado/i.test(txt), 'la ficha dice que no hay precio de mercado');
  decir(!/2\.05|2,05/.test(txt), 'y no se acuerda del precio de antes', txt.slice(0, 120));
  void ficha;
  decir(errores.length === 0, 'sin errores de consola', errores.join(' | '));
  await p.close();
}

console.log('\n── una resolución coja no se pinta ───────────────────────────');
{
  // Las cuatro maneras de que una resolución no sea comprobable. Ninguna
  // debe acabar en la pantalla de nadie: sin acta, sin fecha legible, con
  // precio cero o sin `vigente`, ONDK vuelve al guion.
  const cojas = [
    { que: 'sin acta', v: { fecha: '2026-01-15T00:00:00.000Z', precio: 2.05 } },
    { que: 'con acta en blanco', v: { fecha: '2026-01-15T00:00:00.000Z', precio: 2.05, acta: '  ' } },
    { que: 'con fecha ilegible', v: { fecha: 'el martes', precio: 2.05, acta: 'JD-X' } },
    { que: 'con precio cero', v: { fecha: '2026-01-15T00:00:00.000Z', precio: 0, acta: 'JD-X' } },
  ];
  for (const c of cojas) {
    RESPUESTA = { token: 'ONDK', clase: 'declarado', moneda: 'USD', vigente: c.v, serie: [] };
    const { p, cartera } = await abrir();
    const ondk = cartera.find(x => x.s === 'ONDK');
    decir(ondk.precio === null && ondk.declarado === null,
      `una resolución ${c.que} no llega a la pantalla`, `precio=${ondk.precio}`);
    await p.close();
  }
}

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
