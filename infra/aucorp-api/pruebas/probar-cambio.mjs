/* Las tasas de cambio, contra la fuente DE VERDAD.
 *
 *   node pruebas/probar-cambio.mjs
 *
 * Se llama a la fuente real a propósito. Un fingido diría que todo funciona el
 * día que la fuente cambie de formato o deje de publicar una moneda, y eso se
 * descubriría con un cliente delante.
 *
 * Lo que se persigue:
 *  1. Que estén las veintiuna monedas de la casa, no «casi todas».
 *  2. Que la conversión sea exacta y no pierda un céntimo por truncar.
 *  3. Que sin tasa NO haya conversión — ni un 1:1 de relleno.
 */
import cambio from '../lib/cambio.js';
import monedas from '../lib/monedas.js';
const { cotizar, convertir, ESCALA } = cambio;
const { MONEDAS, aTexto } = monedas;

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 62 - q.length))}`);

decir('la fuente cubre TODAS las monedas de la casa');
{
  const faltan = [];
  for (const m of MONEDAS) {
    const c = await cotizar('USD', m.c);
    if (!c) faltan.push(m.c);
  }
  comprobar(faltan.length === 0,
    `las ${MONEDAS.length} monedas tienen tasa real`, faltan.length ? `sin tasa: ${faltan.join(', ')}` : '');
}

decir('una cotización viene con fecha y con su origen dicho');
{
  const c = await cotizar('USD', 'HNL');
  if (!c) {
    comprobar(false, 'la fuente no contestó: esta prueba NO probó nada');
  } else {
    comprobar(c.cuando !== null, 'trae la fecha en que la FUENTE la publicó', c.cuando);
    comprobar(/no precio de ejecución/.test(c.origen),
      'y dice que es una tasa de referencia, no un precio de ejecución');
    comprobar(c.media === c.aplicada && c.margenBps === 0,
      'sin AUCORP_MARGEN_BPS configurado el margen es CERO, no uno por defecto',
      `media=${c.media} aplicada=${c.aplicada} bps=${c.margenBps}`);
    const lps = Number(c.aplicada) / Number(ESCALA);
    comprobar(lps > 15 && lps < 40, 'y el dólar en lempiras cae donde tiene que caer', String(lps));
  }
}

decir('la conversión no pierde céntimos');
{
  // 100.00 USD a 25.00 exactos por dólar → 2500.00 HNL, sin sobra.
  const tasa25 = (25n * BigInt(ESCALA)).toString();
  const r = convertir('10000', 'USD', 'HNL', tasa25);
  comprobar(r === '250000', '100.00 USD a 25 exactos son 2500.00 HNL', aTexto(r, 'HNL'));

  // A una moneda SIN decimales: 100.00 USD a 900 por dólar → 90000 CLP, no
  // 9000000. Aquí es donde el «todas tienen dos decimales» reventaría.
  const tasa900 = (900n * BigInt(ESCALA)).toString();
  const clp = convertir('10000', 'USD', 'CLP', tasa900);
  comprobar(clp === '90000', '100.00 USD a 900 son 90000 pesos chilenos enteros', clp);

  // Y de vuelta desde una moneda sin decimales.
  const tasaInv = (BigInt(ESCALA) / 900n).toString();
  const usd = convertir('90000', 'CLP', 'USD', tasaInv);
  comprobar(usd === '10000', 'y 90000 CLP vuelven a 100.00 USD', aTexto(usd, 'USD'));

  /* El redondeo es al más cercano, no truncando. Truncar siempre favorece a la
     casa, y a lo largo de un millón de operaciones eso es plata de verdad
     sacada de bolsillos ajenos medio céntimo cada vez. */
  const medio = convertir('1', 'USD', 'HNL', (BigInt(ESCALA) * 15n / 10n).toString());
  comprobar(medio === '2', '0.01 USD a 1.5 da 0.02, no 0.01 truncado hacia la casa', medio);
}

decir('SIN TASA NO HAY CONVERSIÓN');
{
  for (const [t, por] of [['0', 'tasa cero'], ['', 'tasa vacía'], ['abc', 'tasa que no es número']]) {
    let msg = null;
    try { convertir('10000', 'USD', 'HNL', t); } catch (e) { msg = e.message; }
    comprobar(msg !== null, `con ${por} truena en vez de adivinar`, String(msg));
  }
  let msg = null;
  try { convertir('100.50', 'USD', 'HNL', (25n * BigInt(ESCALA)).toString()); } catch (e) { msg = e.message; }
  comprobar(msg !== null, 'y un monto con coma tampoco entra', String(msg));

  comprobar(await cotizar('USD', 'XXX') === null,
    'una moneda que la casa no maneja no tiene cotización — devuelve null, no 1');
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
