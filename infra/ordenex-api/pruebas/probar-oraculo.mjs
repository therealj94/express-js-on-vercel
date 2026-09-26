/* El oraculo unico de oro y plata (lib/oraculo.js). Sin red, sin reloj real.
 *
 *   node pruebas/probar-oraculo.mjs
 *
 * Lo que se castiga aqui:
 *
 *  - LA COPIA: lib/oraculo.js de Ordenex y el de la wallet
 *    (infra/veta-wallet-backend/lib/oraculo.js) son el MISMO archivo, byte a
 *    byte. Si alguien cambia uno y no el otro, esta prueba falla — dos
 *    oraculos son dos precios de ORIGEN.
 *  - La aritmetica: gramin = gramo de oro / 55; AUKA = 1.710,69 gramin.
 *  - El tiempo: cache de 30 s, edad maxima de 10 min, y despues null (guion),
 *    nunca el numero viejo.
 *  - El respaldo: si la principal no llega, o llega con una pata, el respaldo
 *    completa.
 *  - El historial en memoria.
 *  - referencia.js ya no lee feeds propios: consume el oraculo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import oraculo from '../lib/oraculo.js';
import referencia from '../lib/referencia.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);
const cerca = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Un reloj que se mueve a mano y fuentes que contestan lo que se les diga.
function banco() {
  let t = 1_000_000;
  const reloj = { ahora: () => t, avanzar: (ms) => { t += ms; } };
  const llamadas = { principal: 0, respaldo: 0 };
  const guion = { principal: null, respaldo: null };
  const fuente = (nombre) => ({
    nombre,
    leer: async () => {
      llamadas[nombre]++;
      const r = guion[nombre];
      if (r instanceof Error) throw r;
      return r;
    },
  });
  const o = oraculo.crearOraculo({ fuentes: [fuente('principal'), fuente('respaldo')], ahora: reloj.ahora });
  return { o, reloj, llamadas, guion };
}

decir('las dos copias del oraculo son la misma');
{
  const aqui = fs.readFileSync(path.join(AQUI, '..', 'lib', 'oraculo.js'));
  const otra = path.resolve(AQUI, '..', '..', 'veta-wallet-backend', 'lib', 'oraculo.js');
  const existe = fs.existsSync(otra);
  comprobar(existe, 'la copia de la wallet existe', otra);
  comprobar(
    existe && Buffer.compare(aqui, fs.readFileSync(otra)) === 0,
    'y es identica byte a byte a la de Ordenex',
    'lib/oraculo.js diverge entre ordenex-api y veta-wallet-backend: copie el bueno sobre el otro'
  );
}

decir('la aritmetica del gramin');
{
  comprobar(oraculo.ONZA_EN_GRAMOS === 31.1035, '1 onza troy = 31,1035 g');
  comprobar(oraculo.GRAMOS_POR_ORIGEN === 55, 'ORIGEN = gramo de oro / 55');
  comprobar(cerca(oraculo.GRAMIN_POR_ONZA, 1710.6925), 'una onza son 1.710,6925 gramin');
  comprobar(cerca(oraculo.graminDeOnza(4400), 4400 / 31.1035 / 55), 'onza a 4.400 → 4400/31,1035/55');
  comprobar(cerca(oraculo.graminDeOnza(4400), 2.5721, 1e-3), 'que son ~2,572 USD por ORIGEN');
  comprobar(
    [0, -1, NaN, null, undefined, 'x'].every((v) => oraculo.graminDeOnza(v) === null),
    'un oro que no es un numero positivo da null, no un precio'
  );
  comprobar(oraculo.FRESCO_MS === 30_000, 'cache de 30 s');
  comprobar(oraculo.EDAD_MAXIMA_MS === 600_000, 'edad maxima de 10 min');
}

decir('la cotizacion: ORIGEN, AUKA y AGKA');
{
  const { o, guion } = banco();
  guion.principal = { oro: 4400, plata: 52 };
  const c = await o.cotizacion();
  comprobar(c && cerca(c.origenUsd, 4400 / 1710.6925), 'origenUsd es el gramin', JSON.stringify(c));
  comprobar(c && c.aukaUsd === 4400 && c.agkaUsd === 52, 'AUKA es la onza de oro y AGKA la de plata');
  comprobar(c && cerca(c.aukaUsd / c.origenUsd, 1710.6925, 1e-6), '1 AUKA = 1.710,69 ORIGEN');
  comprobar(c && c.fuente === 'principal' && c.en === 1_000_000, 'rotulada con su fuente y su hora');
  comprobar(cerca(await o.precioOrigenUsd(), 4400 / 1710.6925), 'precioOrigenUsd da el mismo gramin');
}

decir('la cache: 30 s sin volver a preguntar');
{
  const { o, reloj, llamadas, guion } = banco();
  guion.principal = { oro: 4400, plata: 52 };
  await o.metales();
  reloj.avanzar(29_000);
  guion.principal = { oro: 5000, plata: 60 };
  const m = await o.metales();
  comprobar(llamadas.principal === 1 && m.oro === 4400, 'a los 29 s se sirve la cache, sin llamar', `llamadas ${llamadas.principal}`);
  reloj.avanzar(2_000);
  const m2 = await o.metales();
  comprobar(llamadas.principal === 2 && m2.oro === 5000, 'a los 31 s se vuelve a leer');

  // Veinte a la vez con la cache vencida: UNA llamada.
  reloj.avanzar(31_000);
  await Promise.all(Array.from({ length: 20 }, () => o.metales()));
  comprobar(llamadas.principal === 3, 'veinte peticiones a la vez viajan como una', `llamadas ${llamadas.principal}`);
}

decir('la edad maxima: 10 min y despues guion');
{
  const { o, reloj, llamadas, guion } = banco();
  guion.principal = { oro: 4400, plata: 52 };
  await o.metales();
  guion.principal = null;
  guion.respaldo = new Error('caido');
  reloj.avanzar(9 * 60_000);
  const m = await o.metales();
  comprobar(m && m.oro === 4400 && m.en === 1_000_000, 'feed caido a los 9 min: la ultima buena, con su hora');
  reloj.avanzar(61_000);
  const m2 = await o.metales();
  comprobar(m2 === null, 'a los 10 min y 1 s: null, no el numero viejo', JSON.stringify(m2));
  comprobar((await o.cotizacion()) === null, 'y la cotizacion tambien es null');
  comprobar((await o.precioOrigenUsd()) === null, 'y el precio de ORIGEN tambien');

  // Un feed caido tampoco se martillea: dentro de 30 s no se vuelve a llamar.
  const antes = llamadas.principal;
  reloj.avanzar(5_000);
  await o.metales();
  comprobar(llamadas.principal === antes, 'sin dato, dentro de 30 s no se vuelve a preguntar');

  // Y cuando vuelve, vuelve.
  guion.principal = { oro: 4500, plata: 53 };
  reloj.avanzar(30_000);
  comprobar((await o.metales())?.oro === 4500, 'cuando el feed vuelve, vuelve el precio');
}

decir('el respaldo');
{
  const { o, llamadas, guion } = banco();
  guion.principal = new Error('451');
  guion.respaldo = { oro: 4410, plata: 51 };
  const m = await o.metales();
  comprobar(m?.oro === 4410 && m?.fuente === 'respaldo', 'la principal cae: contesta el respaldo', JSON.stringify(m));
  comprobar(llamadas.respaldo === 1, 'y se le pregunto una vez');
}
{
  const { o, guion } = banco();
  guion.principal = { oro: 4400, plata: null };
  guion.respaldo = { oro: 9999, plata: 51 };
  const m = await o.metales();
  comprobar(m?.oro === 4400 && m?.plata === 51, 'la principal sin plata: el respaldo pone SOLO la plata', JSON.stringify(m));
  comprobar(m?.fuente === 'principal+respaldo', 'y la fuente dice las dos');
}
{
  const { o, llamadas, guion } = banco();
  guion.principal = { oro: 4400, plata: 52 };
  await o.metales();
  comprobar(llamadas.respaldo === 0, 'con la principal completa no se molesta al respaldo');
}
{
  const { o, guion } = banco();
  guion.principal = { oro: 0, plata: NaN };
  guion.respaldo = { oro: -3, plata: 'x' };
  comprobar((await o.metales()) === null, 'precios torcidos (cero, negativo, NaN) son falta de dato: null');
}

decir('el historial en memoria');
{
  const { o, reloj, guion } = banco();
  for (const oro of [4400, 4410, 4420]) {
    guion.principal = { oro, plata: 50 };
    await o.metales();
    reloj.avanzar(30_000);
  }
  guion.principal = null;
  await o.metales(); // una caida no se apunta
  const h = o.historial();
  comprobar(h.length === 3 && h.map((x) => x.oro).join(',') === '4400,4410,4420', 'las lecturas buenas, de vieja a nueva', JSON.stringify(h));
  h[0].oro = 1;
  comprobar(o.historial()[0].oro === 4400, 'lo que se entrega es una copia');

  const corto = oraculo.crearOraculo({
    fuentes: [{ nombre: 'f', leer: async () => ({ oro: 4400, plata: 50 }) }],
    ahora: reloj.ahora,
    historialMax: 2,
  });
  for (let i = 0; i < 5; i++) { await corto.metales(); reloj.avanzar(30_000); }
  comprobar(corto.historial().length === 2, 'y no crece sin limite');
}

decir('referencia.js consume el oraculo');
{
  const fuente = fs.readFileSync(path.join(AQUI, '..', 'lib', 'referencia.js'), 'utf8');
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  comprobar(/require\('\.\/oraculo'\)/.test(codigo), "carga lib/oraculo.js");
  comprobar(!/fetch\(|coingecko\.com|gold-api\.com/.test(codigo), 'y ya no lee ningun feed por su cuenta');
  comprobar(!/0,01 USD \(decision/.test(fuente), 'y el comentario de los 0,01 USD como precio ya no esta');

  const original = oraculo.metales;
  // referencia.js llama a oraculo.metales en cada peticion: se le cuelga uno fingido.
  const mod = (await import('../lib/oraculo.js')).default;
  mod.metales = async () => ({ oro: 4400, plata: 52, fuente: 'f', en: 7 });
  const r = await referencia.referenciaDe('AUKA-ORIGEN');
  comprobar(r?.usd === 4400 && cerca(r?.origenUsd, 4400 / 1710.6925) && cerca(r?.enOrigen, 1710.6925, 1e-6),
    'AUKA-ORIGEN: onza, gramin y 1.710,69', JSON.stringify(r));
  const s = await referencia.referenciaDe('AGKA-ORIGEN');
  comprobar(s?.usd === 52 && s?.rotulo === 'onza de plata', 'AGKA-ORIGEN: la onza de plata');
  mod.metales = async () => null;
  comprobar((await referencia.referenciaDe('AUKA-ORIGEN')) === null, 'sin dato del oraculo: null (guion)');
  mod.metales = original;
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
