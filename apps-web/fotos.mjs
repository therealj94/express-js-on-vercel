// Fotos de las vistas de la billetera, para mirarlas de verdad.
//   node .fotos.mjs <carpeta> <destino>
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const RAIZ = process.argv[2], SALIDA = process.argv[3];
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg' };
const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise(ok => sv.listen(0, ok));
const base = `http://127.0.0.1:${sv.address().port}`;

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const pg = await nav.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-HN' });
await pg.goto(base, { waitUntil: 'domcontentloaded' });

// Una sesion de mentira y unos saldos de mentira: aqui no hay salida a la red,
// y lo que se quiere mirar es como queda la pantalla llena, no si el RPC anda.
await pg.evaluate(() => {
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: 'x.' + btoa(JSON.stringify({ address: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2', exp: 2e9 })) + '.y',
    correo: 'jose@ordenglobal.org', nombre: 'José Enamorado',
    direccion: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
  }));
});
await pg.goto(base, { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(2500);

const CANT = { ORIGEN: 1284.5512, AUKA: 0.842, AGKA: 12.5, ONDK: 340, MNKA: 55,
               IBS: 210, HARV: 0, AUBEX: 8, ASL: 130, LOVE: 4200,
               REST: 15, SOL: 900, AIT: 62, AGRO: 33, POLITICAL: 0 };
const PRECIO = { ORIGEN: 2.5406, AUKA: 4344.63, AGKA: 63.29, ONDK: 2.1, MNKA: null };
// Aqui no hay salida a la red, asi que la cartera llega vacia. Se arma a mano
// desde el propio registro de tokens para poder mirar la pantalla llena.
const llenar = ([cant, precio]) => {
  const V = (0, eval)('VETA');
  const e = V._estado();
  const lista = (e.cartera && e.cartera.length) ? e.cartera
    : CADENA.TOKENS.map(t => ({ s: t.s, ...CADENA.META[t.s], contrato: t.contrato || null,
                                nativo: !!t.nativo, cant: 0, precio: null, chg: null }));
  lista.forEach(x => {
    x.cant = cant[x.s] ?? 0;
    x.precio = (x.s in precio) ? precio[x.s] : (x.precio ?? 1.5);
    if (x.precio != null) x.chg = ((x.s.length * 7) % 9) - 3.5;
  });
  e.cartera = lista;
  V._sembrar(lista);
};
await pg.evaluate(llenar, [CANT, PRECIO]);

// La tarjeta tiene tres estados y aqui no hay emisor al que preguntarle:
// se fuerzan a mano para poder mirar los tres.
const ESTADOS = {
  'tarjeta-sin': { falta: true },
  'tarjeta-activa': { status: 'ACTIVE', last4: '4417', balance: 842.5 },
  'tarjeta-congelada': { status: 'FROZEN', last4: '4417', balance: 842.5 },
};
for (const [nombre, est] of Object.entries(ESTADOS)) {
  await pg.evaluate(e => { const V = (0, eval)('VETA'); V._tarjeta(e); V.vista('tarjeta'); }, est);
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: `${SALIDA}/${nombre}.png`, fullPage: true });
}

for (const [v, dato] of [['billetera'], ['token', 'AUKA'], ['cambiar'], ['ajustes'], ['actividad']]) {
  await pg.evaluate(([v, d]) => (0, eval)('VETA').vista(v, d), [v, dato]);
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${SALIDA}/${v}${dato ? '-' + dato : ''}.png`, fullPage: true });
}
// y como se ve en un telefono
const tel = await nav.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-HN' });
await tel.goto(base, { waitUntil: 'domcontentloaded' });
await tel.evaluate(() => {
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: 'x.' + btoa(JSON.stringify({ address: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2', exp: 2e9 })) + '.y',
    correo: 'jose@ordenglobal.org', nombre: 'José Enamorado',
    direccion: '0x8f2a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2',
  }));
});
await tel.goto(base, { waitUntil: 'domcontentloaded' });
await tel.waitForTimeout(2500);
await tel.evaluate(llenar, [CANT, PRECIO]);
await tel.evaluate(() => (0, eval)('VETA').vista('billetera'));
await tel.waitForTimeout(400);
await tel.screenshot({ path: `${SALIDA}/telefono.png`, fullPage: true });

await nav.close(); sv.close();
console.log('fotos listas');
