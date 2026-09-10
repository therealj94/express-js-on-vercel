// Los precios de referencia informativos: oro y plata, en dolares.
//
// QUE SON Y QUE NO SON. La referencia se ENSEÑA AL LADO del mercado, rotulada
// como referencia — jamas como ultima operacion (principio 2 del contrato) y
// jamas dentro de un camino de dinero: el precio de un trato lo ponen las dos
// puntas del libro, y el de una solicitud fiat lo pactan las partes. Esto es
// el cartel de "la onza va a tanto" en la pared de la casa de cambio, no la
// caja registradora.
//
// El feed es EL MISMO que ya usa la wallet: CoinGecko con pax-gold y
// kinesis-silver (apps-web/veta-wallet/cadena.js, y el backend en
// lib/origenPrice.js usa el mismo pax-gold para el oro), y de respaldo
// gold-api.com con XAU/XAG, igual que cadena.js. Binance NO es respaldo aqui:
// contesta 451 a las IP de Estados Unidos, que es donde corre Heroku — medido
// el 12-ago-2026 en la wallet; un respaldo que nunca responde solo gasta sus
// cuatro segundos de espera.
//
// ORIGEN se referencia como gramo de oro / 55 (un gramin), que es lo que
// manda DISENO.md. Ojo: el backend de la wallet fija hoy el precio OPERATIVO
// de ORIGEN en 0,01 USD (decision de la Junta del 12-ago, lib/origenPrice.js)
// — pero aquel es un precio de caminos de dinero de la wallet y este es un
// cartel informativo; el contrato de Ordenex pide el gramin y aqui manda el
// contrato. Si la Junta cambia la referencia, se cambia DISENO.md primero.
//
// LA REGLA DE LA CACHE: si el feed no llega, guion — JAMAS un numero
// inventado. La lectura buena se guarda con su hora (`en`: todo lo que sale
// de aqui va rotulado con cuando se leyo) y se sirve hasta 10 minutos; mas
// vieja que eso, se tira y se contesta null. Un precio de hace media hora
// presentado como "referencia" es exactamente el numero inventado que el
// contrato prohibe.

const COINGECKO =
  'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold,kinesis-silver&vs_currencies=usd';
const GOLD_API = 'https://api.gold-api.com/price/'; // + XAU | XAG

// La aritmetica del gramin, la misma de cadena.js y origenPrice.js.
const ONZA_EN_GRAMOS = 31.1035;
const GRAMOS_POR_ORIGEN = 55;

// Fresco 3 minutos: /mercados se sondea cada pocos segundos por muchos
// clientes y CoinGecko sin clave corta a ~30 llamadas/min — refrescar cada
// vez seria regalarle el rate limit. Limite duro 10 minutos: de ahi en
// adelante la lectura vieja deja de servirse (ver el ensayo de arriba).
/* 30 segundos, no tres minutos. El oro se mueve y tres minutos de cache se
   notaban: el precio de la sala iba visiblemente atrasado del mercado.

   El miedo original era el rate limit de CoinGecko sin clave (~30 llamadas por
   minuto y por IP, y aqui la IP es UNA, la del dyno, para todos los clientes).
   Pero la cache no depende de cuantos miren: refrescar cada 30 s son DOS
   llamadas por minuto, pasen diez personas o diez mil. Sobra margen.

   El limite duro tambien baja: una lectura de mas de cinco minutos ya no se
   sirve como «referencia», se contesta guion. Diez minutos era demasiado para
   un numero que la gente mira para decidir. */
const FRESCO_MS = 30_000;
const LIMITE_MS = 5 * 60_000;
const PLAZO_MS = 4_000;

// La ultima lectura buena y el vuelo en curso. Un solo vuelo a la vez: si
// veinte peticiones llegan con la cache vencida, viaja UNA y las demas la
// esperan — el proveedor no tiene la culpa de nuestro sondeo.
let cache = null; // { oro, plata, fuente, en }
let vuelo = null;

async function traerDeCoinGecko() {
  const r = await fetch(COINGECKO, { signal: AbortSignal.timeout(PLAZO_MS) });
  if (!r.ok) return null;
  const d = await r.json();
  const oro = Number(d?.['pax-gold']?.usd);
  const plata = Number(d?.['kinesis-silver']?.usd);
  if (!(oro > 0) && !(plata > 0)) return null;
  return {
    oro: oro > 0 ? oro : null,
    plata: plata > 0 ? plata : null,
    fuente: 'coingecko',
    en: Date.now(),
  };
}

async function traerDeGoldApi() {
  const uno = async (simbolo) => {
    try {
      const r = await fetch(`${GOLD_API}${simbolo}`, { signal: AbortSignal.timeout(PLAZO_MS) });
      if (!r.ok) return null;
      const n = Number((await r.json())?.price);
      return n > 0 ? n : null;
    } catch {
      return null;
    }
  };
  const [oro, plata] = await Promise.all([uno('XAU'), uno('XAG')]);
  if (oro == null && plata == null) return null;
  return { oro, plata, fuente: 'gold-api', en: Date.now() };
}

async function traer() {
  try {
    const cg = await traerDeCoinGecko();
    if (cg) return cg;
  } catch {
    /* respaldo */
  }
  try {
    return await traerDeGoldApi();
  } catch {
    return null;
  }
}

/**
 * Los metales en USD: { oro, plata, fuente, en } — cada precio puede venir
 * null si SU pata del feed no llego. Devuelve null cuando no hay nada que
 * decir (ni lectura fresca ni cache dentro del limite). No lanza nunca: un
 * cartel informativo caido no puede tirar la lista de mercados.
 */
async function metales() {
  if (cache && Date.now() - cache.en < FRESCO_MS) return cache;

  if (!vuelo) {
    vuelo = traer().finally(() => {
      vuelo = null;
    });
  }
  const lectura = await vuelo;
  if (lectura) {
    cache = lectura;
    return cache;
  }
  // El feed no llego. La lectura anterior se sirve SOLO dentro del limite —
  // rotulada con su `en`, que para eso viaja — y despues, guion.
  if (cache && Date.now() - cache.en < LIMITE_MS) return cache;
  cache = null;
  return null;
}

/**
 * La referencia para UN mercado de la casa (`AUKA-ORIGEN`, ...), lista para
 * el campo `referencia` de GET /mercados:
 *
 *   { usd, rotulo, origenUsd, fuente, en } | null
 *
 *  - `usd`/`rotulo`: el activo base si sigue un metal — AUKA la onza de oro,
 *    AGKA la de plata. Los tokens de sector no llevan referencia aqui: sus
 *    precios "de referencia" fijos son cosa de la ficha de la wallet, no un
 *    feed vivo, y pintarlos junto a velas reales los disfrazaria de mercado.
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
