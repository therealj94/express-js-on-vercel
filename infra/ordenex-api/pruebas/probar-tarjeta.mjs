#!/usr/bin/env node
/**
 * RECARGAR LA TARJETA DESDE ORDENEX: LA PUERTA ENTRE LAS DOS CASAS.
 *
 * Vender ORIGEN por USDT y que el dinero caiga en la tarjeta de uno es, con
 * otras palabras, recargar la tarjeta desde Ordenex. Lo único nuevo respecto a
 * la venta que ya existía es que el destino salga PUESTO — y eso obliga a que
 * Ordenex le pregunte a la wallet, que es donde vive la llave de CryptoMate.
 *
 * ── LO QUE ESTA PRUEBA VIGILA, Y POR QUÉ ────────────────────────────────────
 *
 * 1. QUE SIN CLAVE NO SE ABRA. La puerta entre casas es una clave compartida.
 *    Si no está puesta, la puerta no puede existir — «todavía no le puse la
 *    clave» no puede ser un estado en el que funcione.
 *
 * 2. QUE NO SE INVENTE UNA DIRECCIÓN. Si la wallet no contesta, o contesta
 *    algo con forma rara, la respuesta correcta es «no se pudo saber». Una
 *    venta con el destino en blanco es un inconveniente; una con el destino
 *    equivocado es dinero que no vuelve.
 *
 * 3. QUE «SIN TARJETA» NO SEA UN ERROR. Mucha gente todavía no tiene, y la
 *    pantalla tiene que poder explicarlo con calma en vez de enseñar un fallo.
 *
 *     node pruebas/probar-tarjeta.mjs
 */
import { createServer } from 'node:http';
import { once } from 'node:events';

let fallos = 0;
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);
const decir = (ok, q, d) => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${q}${d ? `\n           ${d}` : ''}`); if (!ok) fallos++; };

const tarjeta = await import('../lib/tarjeta.js').then((m) => m.default || m);

const DIR = '0xd894df2b1eEdd017c7bb2b01D9A16391CcC4BDA5';
const RECARGA = '0x5609f8feA91bB58E79236f79b646b22F174344F9';

// ── Una wallet de mentira, que además comprueba la clave ────────────────────
/* La clave que la wallet de mentira ESPERA, fija y aparte de la que usa el
   cliente. Al principio la comparaba contra `process.env.CASA_CLAVE` — la
   misma que lee Ordenex— así que al poner una clave equivocada las dos
   cambiaban a la vez y la prueba de la puerta cerrada pasaba siempre. Una
   cerradura que se abre con la llave que traigas no prueba nada. */
const CLAVE_BUENA = 'clave-entre-casas-de-prueba-larga';
let vistas = [];
let queContestar = { estado: 200, cuerpo: { tiene: true, last4: '1954', titular: 'Medardo Ordonez', red: 'POLYGON', direccion: RECARGA, monedas: ['USDT', 'USDC'] } };
const wallet = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  vistas.push({ ruta: u.pathname, address: u.searchParams.get('address'), clave: req.headers['x-casa-clave'] || null });
  if ((req.headers['x-casa-clave'] || '') !== CLAVE_BUENA) {
    res.writeHead(403, { 'Content-Type': 'application/json' }); res.end('{"message":"Forbidden"}'); return;
  }
  if (queContestar.demora) { setTimeout(() => { res.writeHead(200); res.end('{}'); }, queContestar.demora); return; }
  res.writeHead(queContestar.estado, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(queContestar.cuerpo));
});
wallet.listen(0, '127.0.0.1');
await once(wallet, 'listening');
process.env.WALLET_URL = `http://127.0.0.1:${wallet.address().port}`;
process.env.CASA_CLAVE = CLAVE_BUENA;

// ── 1 · sin enlace ──────────────────────────────────────────────────────────
titulo('sin enlace entre casas');
{
  const url = process.env.WALLET_URL, cl = process.env.CASA_CLAVE;
  delete process.env.WALLET_URL;
  decir(tarjeta.hay() === false, 'sin WALLET_URL no hay enlace y se sabe');
  let r = await tarjeta.recargaDe(DIR);
  decir(r.tiene === false && /no está enlazado/.test(r.porQue), 'y se dice, en vez de devolver una dirección de la nada', r.porQue);

  process.env.WALLET_URL = url;
  delete process.env.CASA_CLAVE;
  decir(tarjeta.hay() === false, 'con dirección pero sin clave, tampoco hay enlace',
    '«todavía no le puse la clave» no puede ser un estado en el que funcione');
  process.env.CASA_CLAVE = cl;
  decir(tarjeta.hay() === true, 'con las dos, sí');
}

// ── 2 · el camino bueno ─────────────────────────────────────────────────────
titulo('la tarjeta sale puesta');
{
  vistas = [];
  const r = await tarjeta.recargaDe(DIR);
  decir(r.tiene === true, 'la wallet contesta y Ordenex la entiende');
  decir(r.direccion === RECARGA, 'con la dirección de recarga de esa tarjeta', r.direccion);
  decir(r.last4 === '1954' && r.red === 'POLYGON', 'y con los últimos cuatro y la red, para poder enseñarlo');
  decir(Array.isArray(r.monedas) && r.monedas.includes('USDT'),
    'y qué monedas acepta, dicho por CryptoMate y no adivinado por nosotros',
    'mandar la moneda equivocada a una dirección correcta se pierde igual');
  decir(vistas[0]?.clave === process.env.CASA_CLAVE, 'y la petición llevó la clave entre casas');
  decir(vistas[0]?.address === DIR, 'preguntando por la dirección que se le pasó y no por otra');
}

// ── 3 · la puerta cerrada ───────────────────────────────────────────────────
titulo('la puerta, cerrada');
{
  const buena = process.env.CASA_CLAVE;
  process.env.CASA_CLAVE = 'una-clave-que-no-es-la-buena-pero-larga';
  const r = await tarjeta.recargaDe(DIR);
  decir(r.tiene === false && /no reconoció la clave/.test(r.porQue),
    'con la clave equivocada, la wallet cierra y Ordenex lo cuenta claro', r.porQue);
  process.env.CASA_CLAVE = buena;
}

// ── 4 · lo que NO se acepta de vuelta ───────────────────────────────────────
titulo('no se inventa una dirección');
{
  queContestar = { estado: 200, cuerpo: { tiene: true, last4: '1954', direccion: 'no-es-una-direccion' } };
  let r = await tarjeta.recargaDe(DIR);
  decir(r.tiene === false && /forma rara/.test(r.porQue),
    'una dirección mal formada que llegue de la wallet se RECHAZA',
    'confiar sin mirar es cómo un error de la otra casa se convierte en dinero perdido en ésta');

  queContestar = { estado: 500, cuerpo: { message: 'se rompió' } };
  r = await tarjeta.recargaDe(DIR);
  decir(r.tiene === false, 'si la wallet se rompe, no hay tarjeta por defecto y punto', r.porQue);

  queContestar = { estado: 200, cuerpo: { tiene: false, porQue: 'esa cuenta todavía no tiene tarjeta' } };
  r = await tarjeta.recargaDe(DIR);
  decir(r.tiene === false && /todavía no tiene tarjeta/.test(r.porQue),
    'y no tener tarjeta se explica con calma: no es un error de nadie');

  r = await tarjeta.recargaDe('0x123');
  decir(r.tiene === false && /dirección custodiada válida/.test(r.porQue),
    'una dirección custodiada con forma mala se corta ANTES de molestar a la otra casa');
}

// ── 5 · que no se cuelgue ───────────────────────────────────────────────────
titulo('si la wallet no contesta');
{
  process.env.WALLET_PLAZO_MS = '400';
  queContestar = { demora: 3000 };
  const t0 = Date.now();
  const r = await tarjeta.recargaDe(DIR);
  const ms = Date.now() - t0;
  decir(r.tiene === false && /tardó más de/.test(r.porQue), 'se rinde y dice que fue por el plazo', r.porQue);
  decir(ms < 2000, 'sin colgar la pantalla esperando', `tardó ${ms} ms`);
}

// ── 6 · que la ruta pida la dirección de la SESIÓN ──────────────────────────
titulo('la de uno y ninguna más');
{
  const fs = await import('node:fs');
  const fuente = fs.readFileSync(new URL('../controllers/ventasController.js', import.meta.url), 'utf8');
  const bloque = fuente.slice(fuente.indexOf('async function miTarjeta'), fuente.indexOf('async function miTarjeta') + 900);
  decir(/usuario\.direccionWallet/.test(bloque),
    'la dirección sale del usuario de la SESIÓN');
  decir(!/req\.(body|query|params)/.test(bloque),
    'y NUNCA de la petición',
    'si el cliente pudiera pedir la de otro, cualquiera con cuenta iría descubriendo dónde se recarga la tarjeta de los demás');
}

wallet.close();
console.log(fallos ? `\n${fallos} en rojo.\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
