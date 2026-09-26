/* LOS ACTIVOS «SIN REFERENCIA» NO SON UN FEED CAÍDO, Y NO VALEN «$0.00».
 *
 *   node pruebas/probar-sin-referencia.cjs
 *
 * Al quitar los precios fijos (plan SFSP v0.3, C4) los tokens de sector
 * —HARV, IBS, AUBEX…— llegan siempre con precio null. SFSP v0.3 §10.5 pide
 * declararlos «sin referencia» en lugar de mostrar un valor. Dos cosas se
 * rompieron sin que nadie lo viera:
 *
 *   1. Enviar, la ficha de revisión que se lee ANTES DE FIRMAR, el selector
 *      de token y Cambiar pintaban «$0.00»: `tokensFromBalances` deja
 *      `price: 0` y esas pantallas no miraban `hasPrice`. «500 HARV ≈ $0.00
 *      USD» justo antes de mover dinero de verdad en la 5550.
 *   2. Inicio enseñaba para siempre «Reintenta en unos segundos»: un token
 *      sin referencia no va a tener precio por mucho que se reintente.
 *
 * data.js hace `require()` de las imágenes, así que no se importa: se evalúa
 * en un contexto aparte con un `require` falso que devuelve un número, que es
 * lo que devuelve Metro por cada imagen.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

let pasan = 0;
const fallos = [];
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { pasan += 1; return; }
  fallos.push(nombre + (detalle ? `  (${detalle})` : ''));
};

function cargarData() {
  const src = leer('src/data.js').replace(/^export (const|function|let) /gm, '$1 ');
  const ctx = { require: () => 1, console };
  return vm.runInNewContext(
    `${src}\n;({ tokensFromBalances, money, usdDe, moneyO, CON_REFERENCIA })`,
    ctx,
  );
}

const D = cargarData();

// ── 1. los datos ──────────────────────────────────────────────────────────
const filas = D.tokensFromBalances([
  { symbol: 'ORIGEN', qty: 10, priceUsd: 2.35 },
  { symbol: 'AUKA', qty: 1, priceUsd: null },     // feed caído
  { symbol: 'ONDK', qty: 3, priceUsd: null },     // precio por acta que no llegó
  { symbol: 'HARV', qty: 1000, priceUsd: null },  // sin referencia
  { symbol: 'IBS', qty: 5, priceUsd: null },      // sin referencia
]);
const de = (s) => filas.find((x) => x.s === s);

prueba('ORIGEN con precio no es «sin referencia»', de('ORIGEN').hasPrice && !de('ORIGEN').sinReferencia);
prueba('AUKA sin precio es un feed caído, no «sin referencia»', !de('AUKA').hasPrice && !de('AUKA').sinReferencia);
prueba('ONDK sin precio tampoco es «sin referencia»: su precio es por acta', !de('ONDK').sinReferencia);
prueba('HARV e IBS sin precio son «sin referencia»', de('HARV').sinReferencia && de('IBS').sinReferencia);

prueba('500 HARV no valen «$0.00»: no tienen valor en USD', D.usdDe(de('HARV'), 500) === null);
prueba('y se pintan con guion', D.moneyO(D.usdDe(de('HARV'), 500)) === '—');
prueba('2 ORIGEN a 2,35 sí se pintan en dólares', D.moneyO(D.usdDe(de('ORIGEN'), 2)) === '$4.70');
prueba('un token de reserva (sin hasPrice) también da guion', D.moneyO(D.usdDe({ s: 'ORIGEN', price: 0 }, 1)) === '—');

// ── 2. las pantallas de enviar y cambiar ─────────────────────────────────
const trade = leer('src/screens/Trade.js').replace(/\/\/[^\n]*/g, '');
prueba('el selector de token no multiplica por un precio 0', !/money\(t\.qty \* t\.price\)/.test(trade));
prueba('Enviar no calcula el USD con `tok.price || 0`', !/tok\.price \|\| 0/.test(trade));
prueba('Enviar calcula el USD con usdDe', /const usd = usdDe\(tok, amount\)/.test(trade));
prueba('la ficha de revisión, antes de firmar, pinta guion sin precio', /≈ \{moneyO\(data\.usd\)\} USD/.test(trade)
  && !/≈ \{money\(data\.usd\)\} USD<\/Text>\s*<\/View>/.test(trade));
prueba('Cambiar no pinta «$0.00» como precio', !/v=\{money\((origen|to)\.price\)\}/.test(trade));

// ── 3. inicio y ficha ─────────────────────────────────────────────────────
const home = leer('src/screens/Home.js');
prueba('«Reintenta» solo para un precio que se espera',
  /holdingNoPrice = list\.some\(\(t\) => t\.qty > 0 && !t\.hasPrice && !t\.sinReferencia\)/.test(home));
prueba('Inicio dice «sin referencia» y lo explica aparte',
  /t\.sinReferencia \? tr\('tok\.sinRef'\)/.test(home) && /tr\('home\.sinRefHint'\)/.test(home));
prueba('la ficha del token dice «sin referencia»',
  /t\.sinReferencia \? tr\('tok\.sinRef'\)/.test(leer('src/screens/TokenDetail.js')));

const i18n = leer('src/i18n.js');
for (const k of ['tok.sinRef', 'home.sinRefHint']) {
  prueba(`la clave ${k} está en los dos idiomas`, (i18n.match(new RegExp(`'${k.replace('.', '\\.')}':`, 'g')) || []).length === 2);
}

console.log(`\n${pasan} pasan · ${fallos.length} fallan`);
for (const f of fallos) console.log('  ✗ ' + f);
process.exit(fallos.length ? 1 : 0);
