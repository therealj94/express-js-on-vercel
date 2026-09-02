/* La confirmación antes de colocar y el precio único por par, SIN navegador.
 *
 *   node apps-web/ordenex/pruebas/probar-confirmacion.mjs
 *
 * Se cargan cadena.js y mercado.js en un contexto de vm con lo mínimo que
 * esperan de la página (window, document, localStorage, DATOS, ONX) y se
 * prueban las funciones PURAS que la sala expone en _puros: la cuenta del
 * desvío, el nivel que le toca, el resumen de la confirmación y la línea de
 * fuente del precio. Lo que se castiga:
 *
 *  1. LA ORDEN: 4365,3 ORIGEN por AUKA —la onza en dólares tecleada donde va
 *     el precio en ORIGEN— sale 'bloqueo' con los umbrales de la casa, y
 *     1700 sale 'ok'. La misma cuenta que hace el servidor, en BigInt.
 *  2. Pasado el aviso el nivel es 'aviso' (pide casilla); sin /limites es
 *     'sinLimites' (pide casilla y decide el servidor); sin referencia en un
 *     mercado que la tiene, 'sinRef' (no se confirma); IBS es 'libre'.
 *  3. El resumen dice qué das y qué recibís con la comisión descontada de lo
 *     recibido, como el motor.
 *  4. Un precio nunca viaja sin fuente ni hora: la referencia dice de dónde
 *     y de cuándo, el trato dice su hora, y sin ninguno lo dice también.
 *  5. Los diccionarios es/en tienen las mismas claves nuevas.
 */
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (!ok && extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 300)}`);
};
const titulo = (q) => console.log(`\n── ${q} ${'─'.repeat(Math.max(2, 58 - q.length))}`);

// ── el mundo mínimo que los guiones esperan ──────────────────────────────────
const almacen = new Map();
const ctx = {
  console,
  localStorage: { getItem: k => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: k => almacen.delete(k) },
  navigator: { language: 'es' },
  document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {}, body: { insertAdjacentHTML: () => {} } },
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  crypto: { getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = i; return b; } },
  fetch: () => Promise.reject(new Error('sin red en la prueba')),
  DATOS: { haySesion: () => false, usuario: () => null, sondeo: () => () => {}, terminosAceptados: () => false },
  ONX: {
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    jsTxt: s => JSON.stringify(String(s)),
    deWei: (s, dec = 4) => {
      if (s == null || s === '') return null;
      let n; try { n = BigInt(s); } catch { return null; }
      const ent = (n / 10n ** 18n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const cola = (n % 10n ** 18n).toString().padStart(18, '0').slice(0, dec).replace(/0+$/, '');
      return ent + (cola ? '.' + cola : '');
    },
    aWei: txt => {
      const s = String(txt == null ? '' : txt).trim().replace(',', '.');
      if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
      const [e, d = ''] = s.split('.');
      return (BigInt(e) * 10n ** 18n + BigInt((d + '000000000000000000').slice(0, 18))).toString();
    },
    avisar: () => {},
  },
  VELAS: {},
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
/* Cada guion declara su const léxica (CADENA, VMERCADO); en un vm eso no cae
   como propiedad del contexto, así que se cuelga a mano al final del mismo
   guion — es lo que en un navegador hace el ámbito global compartido. */
for (const [f, nombre] of [['cadena.js', 'CADENA'], ['mercado.js', 'VMERCADO']]) {
  vm.runInContext(await readFile(join(WEB, f), 'utf8') + `\n;globalThis.${nombre} = ${nombre};`, ctx, { filename: f });
}
const P = ctx.VMERCADO._puros;
const TXT = ctx.VMERCADO._txt();

const U = 10n ** 18n;
const wei = n => (BigInt(Math.round(n * 1e6)) * U / 1000000n).toString();
const REF = 31.1035 * 55; // 1710,6925: la onza entre el gramin, siempre
const ORO = 4374.21;
const mercadoAUKA = (extra = {}) => ({
  mercado: 'AUKA-ORIGEN', ultimo: null, cambio24h: null, vol24h: null,
  referencia: { usd: ORO, rotulo: 'onza de oro', origenUsd: ORO / REF, enOrigen: REF, fuente: 'coingecko', en: Date.UTC(2026, 8, 2, 14, 32, 5) },
  ...extra,
});
const LIMITES = { desvio: { avisoPct: 5, bloqueoPct: 25 }, terminos: { version: '2026-09-02', terminos: 'legal.html#terminos', riesgo: 'legal.html#riesgo' } };
const TARIFA = { comisionPpm: 2500, sobre: 'recibido' };
const orden = (precio, cantidad = 1, extra = {}) => ({ mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'limite', precio: wei(precio), cantidad: wei(cantidad), ...extra });

titulo('la cuenta del desvío, en BigInt, como el servidor');
{
  const ref = BigInt(wei(REF));
  decir(P.desvioPct(BigInt(wei(REF)), ref) === 0, 'al precio de la referencia, 0 %');
  const d = P.desvioPct(BigInt(wei(4365.3)), ref);
  decir(d > 150 && d < 160, 'LA ORDEN: 4365,3 es +155 % contra 1710,69', String(d));
  decir(Math.abs(P.desvioPct(BigInt(wei(1283.019375)), ref) + 25) < 1e-3, '1283,02 es −25 %');
  decir(P.desvioPct(null, ref) === null && P.desvioPct(BigInt(wei(1)), null) === null, 'sin precio o sin referencia, null');
}

titulo('el nivel: ok, aviso, bloqueo, sinRef, sinLimites, libre');
{
  decir(P.nivelDesvio(2, true, LIMITES) === 'ok', '+2 % es ok');
  decir(P.nivelDesvio(-11, true, LIMITES) === 'aviso', '−11 % es aviso: pide casilla');
  decir(P.nivelDesvio(155, true, LIMITES) === 'bloqueo', '+155 % es bloqueo');
  decir(P.nivelDesvio(null, true, LIMITES) === 'sinRef', 'sin referencia en un mercado que la tiene: sinRef');
  decir(P.nivelDesvio(155, false, LIMITES) === 'libre', 'un mercado sin referencia: libre, aunque el número sea grande');
  decir(P.nivelDesvio(2, true, null) === 'sinLimites', 'sin /limites: sinLimites, no un ok de consuelo');
}

titulo('el resumen de LA ORDEN: 4365,3 AUKA en dólares');
{
  const r = P.resumenDe(orden(4365.3, 4365.3), mercadoAUKA(), null, TARIFA, LIMITES);
  decir(r.nivel === 'bloqueo', 'sale bloqueo', JSON.stringify({ nivel: r.nivel, desvio: r.desvio }));
  decir(r.desvio > 150, 'con el +155 % escrito', String(r.desvio));
  decir(r.das.sim === 'ORIGEN' && r.recibis.sim === 'AUKA', 'comprando: das ORIGEN, recibís AUKA');
  decir(r.das.wei === (BigInt(wei(4365.3)) * BigInt(wei(4365.3))) / U, 'y lo que darías es cantidad × precio: la cifra que habría que haber visto', String(r.das.wei));
  decir(r.refWei === BigInt(wei(REF)) && r.conRef === true, 'con la referencia del par en wei al lado');
  decir(r.terminosVersion === '2026-09-02', 'y la versión de los términos que hay que tener aceptada');
}

titulo('el resumen de una orden normal');
{
  const r = P.resumenDe(orden(1700, 2), mercadoAUKA(), null, TARIFA, LIMITES);
  decir(r.nivel === 'ok' && Math.abs(r.desvio + 0.625) < 0.01, '1700 por AUKA: ok, −0,62 %', JSON.stringify({ nivel: r.nivel, desvio: r.desvio }));
  decir(r.das.wei === BigInt(wei(3400)), 'das 3400 ORIGEN');
  decir(r.recibis.comisionWei === BigInt(wei(2)) * 2500n / 1000000n, 'la comisión es 0,25 % de lo recibido (AUKA), como el motor');
  decir(r.recibis.wei === BigInt(wei(2)) - r.recibis.comisionWei, 'y recibís lo que queda');

  const v = P.resumenDe(orden(1700, 2, { lado: 'venta' }), mercadoAUKA(), null, TARIFA, LIMITES);
  decir(v.das.sim === 'AUKA' && v.das.wei === BigInt(wei(2)) && v.recibis.sim === 'ORIGEN', 'vendiendo: das AUKA, recibís ORIGEN');
  decir(v.recibis.comisionWei === BigInt(wei(3400)) * 2500n / 1000000n, 'con la comisión sobre el ORIGEN recibido');

  const sinTarifa = P.resumenDe(orden(1700, 2), mercadoAUKA(), null, null, LIMITES);
  decir(sinTarifa.recibis.comisionWei === null && sinTarifa.recibis.wei === BigInt(wei(2)), 'sin tarifa leída no se inventa un cero: comisión null');
}

titulo('a mercado: el precio es el promedio del libro y se compara igual');
{
  const libro = { compras: [], ventas: [[wei(1720), wei(1)], [wei(1740), wei(1)]] };
  const r = P.resumenDe({ mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'mercado', cantidad: wei(2) }, mercadoAUKA(), libro, TARIFA, LIMITES);
  decir(r.aprox === true && r.cubre === true, 'estimado y el libro cubre');
  decir(r.das.wei === BigInt(wei(3460)), 'das 1720 + 1740 = 3460 ORIGEN', String(r.das.wei));
  decir(r.precioWei === BigInt(wei(1730)), 'precio promedio 1730', String(r.precioWei));
  decir(r.nivel === 'ok', 'y contra la referencia, ok');
  const loco = { compras: [], ventas: [[wei(4365.3), wei(5)]] };
  const rl = P.resumenDe({ mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'mercado', cantidad: wei(2) }, mercadoAUKA(), loco, TARIFA, LIMITES);
  decir(rl.nivel === 'bloqueo', 'un libro con una venta a 4365,3 tampoco se cruza a ciegas: bloqueo');
  const sinLibro = P.resumenDe({ mercado: 'AUKA-ORIGEN', lado: 'compra', tipo: 'mercado', cantidad: wei(2) }, mercadoAUKA(), null, TARIFA, LIMITES);
  decir(sinLibro.das.wei === null && sinLibro.nivel === 'sinRef', 'sin libro leído no hay total ni precio: no se confirma');
}

titulo('sin referencia y sin referencia posible');
{
  const r = P.resumenDe(orden(1700), mercadoAUKA({ referencia: null }), null, TARIFA, LIMITES);
  decir(r.nivel === 'sinRef', 'AUKA sin feed: sinRef (fail-closed)');
  const ibs = P.resumenDe({ ...orden(9), mercado: 'IBS-ORIGEN' }, { mercado: 'IBS-ORIGEN', referencia: { usd: null, origenUsd: 2.55, enOrigen: null } }, null, TARIFA, LIMITES);
  decir(ibs.nivel === 'libre' && ibs.desvio === null, 'IBS: libre, el precio nace en el libro');
}

titulo('un precio nunca viaja sin fuente ni hora');
{
  const ref = P.precioUnico(mercadoAUKA(), null);
  decir(ref.ref === true && ref.txt === '1,710.6925', 'sin tratos, el precio es la referencia en ORIGEN: 1,710.6925', ref.txt);
  decir(/coingecko/.test(ref.fuente) && /14:32/.test(ref.fuente) && /onza de oro/.test(ref.fuente), 'y la línea dice rótulo, fuente y hora', ref.fuente);
  decir(/4374\.21/.test(ref.detalle) && /2\.5570/.test(ref.detalle), 'con el detalle en dólares: la onza y el gramín', ref.detalle);

  const trato = P.precioUnico(mercadoAUKA({ ultimo: wei(1705) }), [{ precio: wei(1705), cantidad: wei(1), lado: 'compra', en: Date.UTC(2026, 8, 2, 15, 0, 0) }]);
  decir(trato.ref === false && trato.txt === '1,705', 'con trato, manda el trato', trato.txt);
  decir(/15:00/.test(trato.fuente) && /trato/i.test(trato.fuente), 'y su hora', trato.fuente);

  const nada = P.precioUnico({ mercado: 'IBS-ORIGEN', ultimo: null, referencia: null }, null);
  decir(nada.txt === null && /Sin precio/.test(nada.fuente), 'sin nada, se dice que no hay', nada.fuente);
}

titulo('los diccionarios: las claves nuevas están en los dos idiomas');
{
  const nuevas = ['fuenteTrato', 'fuenteRef', 'fuenteNada', 'refDetalle', 'cf.t', 'cf.das', 'cf.recibis', 'cf.desvioAviso', 'cf.desvioBloqueo',
    'cf.desvioCheck', 'cf.sinRef', 'cf.terminosCheck', 'cf.confirmar', 'ePrecioDesviado', 'eDesvioSinAceptar', 'eTerminos', 'eSinRefAhora'];
  decir(nuevas.every(k => typeof TXT.es[k] === 'string' && typeof TXT.en[k] === 'string'), 'todas en es y en en',
    nuevas.filter(k => !TXT.es[k] || !TXT.en[k]).join(' '));
  decir(/no en dólares/.test(TXT.es['cf.desvioAviso']) && /not in dollars/.test(TXT.en['cf.desvioAviso']), 'el aviso dice lo que pasó de verdad: la unidad');
  const todo = JSON.stringify(TXT);
  decir(!/regulad/i.test(todo) && !/respaldad[oa] por el oro/i.test(todo), 'y sin palabras que la casa no puede decir');
}

console.log(malas ? `\n${malas} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(malas ? 1 : 0);
