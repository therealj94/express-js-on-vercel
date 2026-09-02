// La guarda de precio: cuanto se aleja una orden limite de la referencia del
// oro, y que se hace con eso.
//
// POR QUE EXISTE. Hubo una orden de 4365,3 AUKA tecleada con el precio de la
// onza EN DOLARES en un campo que pide ORIGEN por AUKA. La referencia de ese
// par es 1710,69 ORIGEN (onza de oro entre gramin: las dos cosas son oro, la
// razon no se mueve nunca), asi que aquel precio se alejaba un 155 % de la
// referencia y nadie lo paro. Esta guarda es lo que lo habria parado.
//
// DOS UMBRALES, LOS DOS EN CONFIGURACION:
//
//   ORDENEX_DESVIO_AVISO_PCT    (X, por omision 5)   a partir de aqui la orden
//                               solo entra si el cliente dice EXPRESAMENTE que
//                               vio el desvio (`aceptoDesvio: true`). La
//                               pantalla lo enseña en rojo y lo hace marcar.
//   ORDENEX_DESVIO_BLOQUEO_PCT  (Y, por omision 25)  a partir de aqui la orden
//                               NO entra, la acepte quien la acepte.
//
// Por que 5 y 25. El 5 es el ruido normal de un mercado chico contra un feed:
// una orden a 1 700 cuando la referencia dice 1 710 es alguien negociando, no
// alguien equivocandose de unidad. El 25 es donde ya no hay negociacion que
// lo explique: nadie ofrece el oro a un cuarto mas caro que el oro; a esa
// distancia lo que hay es un cero de mas, una coma corrida o la unidad
// equivocada — que es exactamente el caso de las 4365,3 AUKA. Los dos numeros
// son de la Junta si quiere otros: se cambian en Heroku, no aqui.
//
// A QUE MERCADOS APLICA. A los que TIENEN una referencia con la que comparar:
// AUKA y AGKA (siguen un metal, lib/referenciaVelas.js) y ONDK (precio
// declarado por acta, lib/preciosDeclarados.js). IBS y HARV no tienen
// referencia —su precio nace en el libro— y ahi no hay contra que medir:
// la guarda los deja pasar y lo dice (`nivel: 'libre'`).
//
// FAIL-CLOSED CON EL DINERO. Si un mercado con referencia se queda sin ella
// —el feed caido mas de cinco minutos, o ONDK sin acta— la orden limite NO
// entra: sin referencia no se puede decir si el precio es razonable, y
// «dejar pasar mientras tanto» es dejar pasar justo en el momento en que
// nadie mira. Se contesta SIN_REFERENCIA_AHORA y se pide probar en un rato.
//
// Aqui no hay Mongo ni red: `juzgar` es pura y se prueba sin levantar nada.
// Quien la llama (ordenesController) le trae la referencia que ya tiene.

const WEI = 10n ** 18n;

const AVISO_POR_OMISION = 5;
const BLOQUEO_POR_OMISION = 25;

/* Un porcentaje de la configuracion: numero finito, mayor que cero y menor
   que 1000. Cualquier otra cosa se ignora y se cae al valor por omision, con
   aviso por consola — una variable mal escrita no puede apagar la guarda ni
   ponerla en cero. */
function pctDe(nombre, porOmision) {
  const crudo = process.env[nombre];
  if (crudo == null || crudo === '') return porOmision;
  const n = Number(crudo);
  if (!Number.isFinite(n) || n <= 0 || n >= 1000) {
    console.error(`[guardaPrecio] ${nombre}="${crudo}" no es un porcentaje valido: se usa ${porOmision}`);
    return porOmision;
  }
  return n;
}

/** Los dos umbrales vigentes, { avisoPct, bloqueoPct }. Se leen en cada
 *  llamada —son dos lecturas de process.env— para que una prueba pueda
 *  cambiarlos sin reiniciar nada. Si el aviso queda por encima del bloqueo
 *  se avisa y se baja al bloqueo: un aviso que llega despues del bloqueo no
 *  avisa de nada. */
function umbrales() {
  let avisoPct = pctDe('ORDENEX_DESVIO_AVISO_PCT', AVISO_POR_OMISION);
  const bloqueoPct = pctDe('ORDENEX_DESVIO_BLOQUEO_PCT', BLOQUEO_POR_OMISION);
  if (avisoPct > bloqueoPct) {
    console.error(`[guardaPrecio] el aviso (${avisoPct} %) esta por encima del bloqueo (${bloqueoPct} %): se iguala`);
    avisoPct = bloqueoPct;
  }
  return { avisoPct, bloqueoPct };
}

/* La referencia en ORIGEN llega como NUMERO (es la division de dos precios
   del feed, ver referencia.js). Se pasa a wei por TEXTO —toFixed y no x1e18—
   para no arrastrar la basura binaria del flotante, igual que hace la web.
   Devuelve null ante cualquier cosa que no sea un precio. */
function aWei(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  const [ent, dec = ''] = n.toFixed(12).split('.');
  try {
    return BigInt(ent) * WEI + BigInt(dec.padEnd(18, '0').slice(0, 18));
  } catch {
    return null;
  }
}

/**
 * El desvio de un precio contra su referencia, en por ciento con signo:
 * +155 es «un 155 % por encima», -40 «un 40 % por debajo». Se calcula en
 * BigInt sobre wei (partes por millon) y recien al final se pasa a Number,
 * que es un rotulo y no dinero. null si falta alguno de los dos.
 */
function desvioPct(precioWei, referenciaWei) {
  let p;
  try { p = BigInt(precioWei); } catch { return null; }
  const r = typeof referenciaWei === 'bigint' ? referenciaWei : aWei(referenciaWei);
  if (r == null || r <= 0n || p <= 0n) return null;
  const ppm = ((p - r) * 1000000n) / r; // trunca hacia cero: no se exagera un desvio
  return Number(ppm) / 10000;
}

/**
 * La decision sobre una orden limite.
 *
 *   juzgar({ precio, referenciaEnOrigen, conReferencia, aceptoDesvio })
 *     -> { nivel, desvioPct, referencia, avisoPct, bloqueoPct }
 *
 *   nivel:
 *     'libre'          el mercado no tiene referencia: nada que comparar
 *     'sinReferencia'  DEBERIA tenerla y no llego: la orden no entra
 *     'ok'             dentro del ruido
 *     'aviso'          pasa del aviso; entra SOLO con aceptoDesvio === true
 *     'bloqueo'        pasa del bloqueo: no entra
 *
 *  `conReferencia` lo decide quien llama (AUKA/AGKA/ONDK), `referenciaEnOrigen`
 *  es el numero de referencia.js (o null si no llego). `referencia` sale como
 *  string de wei, que es como viajan los precios de esta casa.
 */
function juzgar({ precio, referenciaEnOrigen, conReferencia, aceptoDesvio }) {
  const { avisoPct, bloqueoPct } = umbrales();
  const base = { avisoPct, bloqueoPct, desvioPct: null, referencia: null };
  if (!conReferencia) return { ...base, nivel: 'libre' };

  const refWei = aWei(referenciaEnOrigen);
  if (refWei == null) return { ...base, nivel: 'sinReferencia' };

  const d = desvioPct(precio, refWei);
  if (d == null) return { ...base, nivel: 'sinReferencia' };

  const salida = { ...base, desvioPct: d, referencia: refWei.toString() };
  const abs = Math.abs(d);
  if (abs > bloqueoPct) return { ...salida, nivel: 'bloqueo' };
  if (abs > avisoPct) return { ...salida, nivel: aceptoDesvio === true ? 'ok' : 'aviso', avisado: true };
  return { ...salida, nivel: 'ok' };
}

/* ¿Este mercado tiene una referencia con la que medir? Se pregunta a las
   DOS fuentes que ya existen —el metal y las actas— y no a una lista nueva:
   una tercera copia de «quien tiene referencia» es la que un dia se queda
   vieja. Los require son perezosos para que este modulo siga siendo puro
   de cargar (las pruebas lo importan sin Mongo). */
function mercadoConReferencia(mercado) {
  const base = String(mercado || '').split('-')[0];
  try {
    const { activoDeReferencia } = require('./referenciaVelas');
    if (activoDeReferencia(mercado) != null) return true;
  } catch { /* sin modulo de velas: se sigue con las actas */ }
  try {
    const { esDeclarable } = require('./preciosDeclarados');
    if (esDeclarable(base)) return true;
  } catch { /* idem */ }
  return false;
}

module.exports = {
  AVISO_POR_OMISION, BLOQUEO_POR_OMISION,
  umbrales, desvioPct, juzgar, mercadoConReferencia, aWei,
};
