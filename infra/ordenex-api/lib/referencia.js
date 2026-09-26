// Los precios de referencia informativos: oro y plata, en dolares.
//
// QUE SON Y QUE NO SON. La referencia se ENSEÑA AL LADO del mercado, rotulada
// como referencia — jamas como ultima operacion (principio 2 del contrato) y
// jamas dentro de un camino de dinero: el precio de un trato lo ponen las dos
// puntas del libro, y el de una solicitud fiat lo pactan las partes. Esto es
// el cartel de "la onza va a tanto" en la pared de la casa de cambio, no la
// caja registradora.
//
// EL FEED ES EL ORACULO UNICO (lib/oraculo.js, SFSP v0.3 §10.5, plan v0.3
// C5): el mismo archivo, byte a byte, que usa el backend de la wallet a traves
// de su lib/origenPrice.js. CoinGecko (pax-gold, kinesis-silver) de principal
// y gold-api.com (XAU/XAG) de respaldo; cache de 30 s y edad maxima de 10 min.
// Aqui ya no se lee ningun feed por cuenta propia.
//
// ORIGEN se referencia como gramo de oro / 55 (un gramin), que es lo que
// manda DISENO.md y lo que decidio la direccion el 26-sep-2026 para toda la
// casa: la wallet cotiza el ORIGEN con el MISMO gramin, asi que Veta y Ordenex
// dan el mismo numero y no queda diferencia que aprovechar. Los 0,01 USD NO
// son el precio de ORIGEN: son la COMISION por transaccion
// (veta-wallet-backend/lib/comision.js). Si la Junta cambia la referencia, se
// cambia DISENO.md primero y despues lib/oraculo.js en los dos backends.
//
// LA REGLA DE LA CACHE: si el feed no llega, guion — JAMAS un numero
// inventado. La lectura buena se guarda con su hora (`en`: todo lo que sale
// de aqui va rotulado con cuando se leyo) y se sirve hasta 10 minutos; mas
// vieja que eso, se tira y se contesta null. Un precio de hace media hora
// presentado como "referencia" es exactamente el numero inventado que el
// contrato prohibe.

const oraculo = require('./oraculo');

// La aritmetica del gramin, la del oraculo.
const { ONZA_EN_GRAMOS, GRAMOS_POR_ORIGEN } = oraculo;

/**
 * Los metales en USD: { oro, plata, fuente, en } — cada precio puede venir
 * null si SU pata del feed no llego. Devuelve null cuando no hay nada que
 * decir (ni lectura fresca ni cache dentro del limite). No lanza nunca: un
 * cartel informativo caido no puede tirar la lista de mercados.
 */
async function metales() {
  return oraculo.metales();
}

/**
 * La referencia para UN mercado de la casa (`AUKA-ORIGEN`, ...), lista para
 * el campo `referencia` de GET /mercados:
 *
 *   { usd, rotulo, origenUsd, fuente, en } | null
 *
 *  - `usd`/`rotulo`: el activo base si sigue un metal — AUKA la onza de oro,
 *    AGKA la de plata. Los tokens de sector no llevan referencia: se declaran
 *    «sin referencia» (SFSP v0.3 §10.5) y se enseñan con guion, en ninguna
 *    parte con un precio fijo. ONDK es la excepcion: su precio declarado por
 *    acta (lib/preciosDeclarados.js).
 *  - `origenUsd`: el gramin (gramo de oro / 55) — la pata comun de todos los
 *    mercados, para que la web pueda rotular a cuanto esta el ORIGEN.
 *  - `en`: cuando se leyo el feed. El rotulo no es opcional: es la promesa.
 *
 * null cuando no hay ni una pata que decir con verdad.
 */
async function referenciaDe(mercado) {
  const m = await metales();
  if (!m) return null;

  const base = String(mercado).split('-')[0];
  const origenUsd = m.oro != null ? m.oro / ONZA_EN_GRAMOS / GRAMOS_POR_ORIGEN : null;

  let usd = null;
  let rotulo = null;
  if (base === 'AUKA' && m.oro != null) {
    usd = m.oro;
    rotulo = 'onza de oro';
  } else if (base === 'AGKA' && m.plata != null) {
    usd = m.plata;
    rotulo = 'onza de plata';
  } else if (base === 'ONDK') {
    // ONDK no tiene feed: tiene ACTAS. El precio declarado por la Junta es un
    // hecho comprobable, asi que sirve de referencia igual que el metal — con
    // su rotulo propio, para que nadie lo confunda con una cotizacion.
    const decl = await vigenteDeclarado('ONDK');
    if (decl) { usd = decl.precio; rotulo = `precio declarado · acta ${decl.acta}`; }
  }

  if (usd == null && origenUsd == null) return null;

  /* ── EL PRECIO DE REFERENCIA DEL PAR, EN ORIGEN ───────────────────────────
     Todos los mercados de esta casa se pagan en ORIGEN, y hasta hoy la lista
     enseñaba la referencia solo en dolares: el numero estaba en otra unidad
     que la columna de al lado, y quien miraba tenia que hacer la division de
     cabeza.

     `enOrigen` es esa division, y NO es un numero inventado: son dos precios
     medidos (o uno medido y uno declarado) divididos el uno por el otro.

       AUKA/ORIGEN  = onza de oro / gramin  = 31,1035 x 55 = 1710,69 SIEMPRE,
                      con cualquier precio del oro, porque los dos son oro.
       AGKA/ORIGEN  = onza de plata / gramin — este SI se mueve, con la razon
                      oro:plata, que es un dato real del mercado.
       ONDK/ORIGEN  = precio declarado / gramin.

     Sigue siendo REFERENCIA y no `ultimo`: el ultimo es lo que se pago en el
     libro de esta casa, y mientras no haya un trato eso es null y se enseña
     un guion. Los dos numeros conviven en la lista, cada uno con su nombre. */
  const enOrigen = (usd != null && origenUsd > 0) ? usd / origenUsd : null;

  return { usd, rotulo, origenUsd, enOrigen, fuente: m.fuente, en: m.en };
}

/* El precio declarado vigente, pedido tarde para no atar este modulo —que es
   de feeds— al de las actas al cargar. Si Mongo no contesta, null y guion. */
async function vigenteDeclarado(token) {
  try {
    const { vigente } = require('./preciosDeclarados');
    return await vigente(token);
  } catch { return null; }
}

module.exports = { metales, referenciaDe };
