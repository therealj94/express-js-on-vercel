// Las velas de REFERENCIA: el metal de verdad, en dolares, siempre rotulado.
//
// ══ LA REGLA QUE MANDA SOBRE ESTE ARCHIVO ═══════════════════════════════════
//
// En esta casa hay DOS clases de vela y JAMAS se mezclan:
//
//  · Velas de TRATOS — salen de operaciones reales de Ordenex, van en ORIGEN,
//    viven en la coleccion `velas` y las escribe lib/velas.js desde el motor.
//    Hoy no hay ninguna: el libro esta recien abierto y todavia no se ha
//    calzado nada. Eso se DICE, no se disimula.
//
//  · Velas de REFERENCIA — salen del mercado REAL del oro y de la plata, van
//    en DOLARES, viven aparte (coleccion `velasRef`) y las escribe este
//    archivo. Salen SIEMPRE por una ruta propia y con `rotulo`, nunca por
//    /mercados/:par/velas.
//
// Una vela de referencia pintada como si fuera un trato es exactamente la
// mentira que esta casa no comete: le diria al usuario "aqui se opero a este
// precio" cuando nadie opero. Por eso son dos colecciones, dos rutas y dos
// unidades distintas — para que ni un descuido las pueda confundir.
//
// Y un activo que no tiene NI tratos NI referencia (los tokens de sector:
// MNKA, IBS, HARV, AUBEX, ASL, LOVE, REST, SOL, AIT, AGRO, POLITICAL, ONDK)
// no recibe aqui una linea plana de consuelo: la ruta contesta SIN_REFERENCIA
// y la grafica se dibuja entera pero vacia, con el motivo escrito. Un precio
// de relleno es un numero inventado, y el principio 2 del contrato lo prohibe.
//
// ══ POR QUE LA REFERENCIA SE SIRVE EN DOLARES ═══════════════════════════════
//
// La aritmetica de la casa (ya comprobada, no se recalcula aqui):
//
//   1 onza = 31,1035 g  ·  ORIGEN = gramo de oro / 55
//   AUKA (1 onza de oro) medida en ORIGEN = 31,1035 x 55 = 1710,69 — CONSTANTE.
//
// Las dos son oro: AUKA es la onza y ORIGEN es el gramin. Su ratio no se mueve
// NUNCA, pase lo que pase con el metal. Una grafica de AUKA/ORIGEN en unidades
// de ORIGEN seria una raya horizontal perfecta para siempre — verdadera, y
// completamente inutil. AGKA (la onza de plata) medida en ORIGEN si se mueve,
// porque es el ratio oro:plata, pero solo cuenta media historia.
//
// Donde el metal se mueve de verdad es contra el dolar. Por eso la referencia
// se guarda y se sirve en USD: es la unidad en la que el dato dice algo.
//
// ══ EL FEED ════════════════════════════════════════════════════════════════
//
// Las MISMAS fuentes que ya usa lib/referencia.js para el precio puntual, en
// su version OHLC — CoinGecko, sin clave:
//
//   oro:   /coins/pax-gold/ohlc?vs_currency=usd&days=N
//   plata: /coins/kinesis-silver/ohlc?vs_currency=usd&days=N
//
// El proveedor elige el paso segun `days`, y no se negocia: 1 dia da 48 velas
// de 30 min, 30 dias dan 180 de 4 h, 365 dan 92 de 4 dias. De ahi salen los
// tres marcos de esta casa: '30m', '4h' y '4d'. Devuelve [[t0,o,h,l,c], ...].
//
// ORIGEN no tiene feed propio ni lo necesita: es el gramo de oro entre 55, o
// sea el MISMO oro dividido por una constante. Se deriva de la vela de oro
// dividiendo o/h/l/c entre 31,1035 x 55 — misma fuente, misma hora, misma
// verdad, otra unidad.

const COINGECKO = 'https://api.coingecko.com/api/v3/coins';

// La aritmetica del gramin, la misma de referencia.js, cadena.js y
// origenPrice.js. El divisor se calcula una vez y se deja a la vista: es el
// 1710,69 del ensayo de arriba.
const ONZA_EN_GRAMOS = 31.1035;
const GRAMOS_POR_ORIGEN = 55;
const DIVISOR_ORIGEN = ONZA_EN_GRAMOS * GRAMOS_POR_ORIGEN; // 1710,6925

// Los tres rangos, con el marco que el proveedor devuelve para cada uno. El
// marco NO se pide: se sabe lo que contesta y se rotula en consecuencia.
const RANGOS = [
  { dias: 1, marco: '30m' },
  { dias: 30, marco: '4h' },
  { dias: 365, marco: '4d' },
];

const MARCOS_REF = RANGOS.map((r) => r.marco);

// Los dos metales que si tienen mercado real. AUKA es la onza de oro y AGKA la
// de plata: se guardan TAL CUAL viene el feed, sin tocar un decimal. ORIGEN se
// deriva del oro (ver el ensayo de arriba) y por eso no tiene entrada propia.
const METALES = [
  { activo: 'AUKA', moneda: 'pax-gold' },
  { activo: 'AGKA', moneda: 'kinesis-silver' },
];

// Los tres activos que tienen referencia, y de donde sale cada uno. Lo que no
// este en esta tabla contesta SIN_REFERENCIA: es la lista blanca, no una lista
// negra — un activo nuevo no hereda referencia por descuido.
const REFERENCIAS = {
  AUKA: {
    rotulo: 'Referencia: onza de oro en el mercado real. No son tratos de Ordenex.',
    fuente: 'coingecko · pax-gold',
  },
  AGKA: {
    rotulo: 'Referencia: onza de plata en el mercado real. No son tratos de Ordenex.',
    fuente: 'coingecko · kinesis-silver',
  },
  ORIGEN: {
    rotulo:
      'Referencia: gramo de oro entre 55, derivado del oro del mercado real. No son tratos de Ordenex.',
    fuente: 'coingecko · pax-gold ÷ (31,1035 × 55)',
  },
};

// EL LIMITE DEL PROVEEDOR, MEDIDO — no supuesto.
//
// Un refresco son SEIS llamadas exactas: tres rangos por dos metales. Probando
// contra CoinGecko de verdad desde este entorno (16-ago-2026), seis llamadas
// espaciadas 2,5 s ya se comieron un 429, y un segundo refresco lanzado justo
// despues se comio los seis. La cuota gratuita de hoy es bastante mas dura que
// las "30 por minuto" de la documentacion vieja, y castiga sobre todo la
// rafaga. Asi que se espacian SIETE segundos: un refresco tarda ~35 s de reloj
// una vez cada quince minutos — un 4% del tiempo, nada— y el proveedor no nos
// ve nunca como una rafaga.
//
// El reintento no duplica llamadas dentro del refresco: si un rango fallo, lo
// vuelve a intentar el ciclo suave, y a los TRES minutos, no al minuto. Un
// reintento apurado contra un 429 solo consigue otro 429 — y mientras tanto la
// ruta sirve lo ultimo bueno con su hora, que es justo para lo que se guarda.
const ESPACIADO_MS = 7_000;
const PLAZO_MS = 8_000;
const CADA_MS = 15 * 60_000;
const REINTENTO_MS = 3 * 60_000;

// Requires perezosos, el mismo patron de velas.js y motor.js: probar la
// derivacion pura no puede exigir Mongo ni levantar mongoose.
let _modelos = null;
const losModelos = () => (_modelos ??= require('../models'));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ════════════════════════════════════════════════════════════════════════════
// LA PARTE PURA — sin red, sin Mongo, sin reloj
// ════════════════════════════════════════════════════════════════════════════

// Un numero de precio de verdad: finito y positivo. Un cero o un NaN colandose
// desde el proveedor pintaria una vela imposible, asi que la fila entera se
// descarta. Fail-closed tambien con el cartel informativo: preferimos una
// grafica con un hueco a una grafica con una mentira.
const precioValido = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Una fila cruda del proveedor ([t0,o,h,l,c]) a vela limpia, o null si no
 * pasa el filtro. No se "arregla" nada: lo que viene torcido se tira.
 */
function limpiar(fila) {
  if (!Array.isArray(fila) || fila.length < 5) return null;
  const [t0, o, h, l, c] = fila;
  if (!Number.isInteger(t0) || t0 <= 0) return null;
  if (![o, h, l, c].every(precioValido)) return null;
  return [t0, o, h, l, c];
}

/** Las filas crudas del proveedor a velas limpias y ordenadas por t0. */
function limpiarTodas(crudas) {
  if (!Array.isArray(crudas)) return [];
  return crudas
    .map(limpiar)
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);
}

// Los precios de referencia se redondean a seis decimales al derivar ORIGEN.
// Es cosmetico —quitarle a la division el ruido de coma flotante del tipo
// 2.5567999999999997— y es seguro: redondear es monotono, asi que si h >= o en
// dolares, sigue siendo h >= o despues de dividir y redondear. Ninguna vela
// queda con el maximo por debajo de la apertura.
const redondear = (n) => Math.round(n * 1e6) / 1e6;

/**
 * La vela de ORIGEN a partir de la vela de ORO, en dolares.
 *
 * ORIGEN es el gramo de oro entre 55, y una onza son 31,1035 gramos: el mismo
 * metal, otra unidad. Por eso ORIGEN no lleva feed propio — pedirle su precio
 * a otra fuente seria abrir la puerta a que las dos graficas se contradigan
 * cuando estan hechas del mismo oro. Se divide o/h/l/c entre 31,1035 x 55 y
 * el t0 se copia: misma hora, misma lectura.
 */
function derivarOrigen(velaOro) {
  const [t0, o, h, l, c] = velaOro;
  return [
    t0,
    redondear(o / DIVISOR_ORIGEN),
    redondear(h / DIVISOR_ORIGEN),
    redondear(l / DIVISOR_ORIGEN),
    redondear(c / DIVISOR_ORIGEN),
  ];
}

/**
 * El activo de referencia que le toca a un par de la casa, o null si no tiene.
 *
 * Se mira el activo BASE: 'AUKA-ORIGEN' sigue al oro, 'AGKA-ORIGEN' a la
 * plata, y 'ORIGEN' a secas al gramin. Los doce tokens de sector caen aqui en
 * null — y ese null es el que se convierte en SIN_REFERENCIA, no en una raya
 * plana.
 */
function activoDeReferencia(par) {
  const base = String(par || '').split('-')[0];
  return REFERENCIAS[base] ? base : null;
}

/** El marco que devuelve el proveedor para un rango de dias, o null. */
function marcoDeDias(dias) {
  return RANGOS.find((r) => r.dias === dias)?.marco ?? null;
}

// ════════════════════════════════════════════════════════════════════════════
// LA CASCARA — red y Mongo
// ════════════════════════════════════════════════════════════════════════════

// Cuando se guardo por ultima vez algo bueno. Va a la respuesta para que el
// rotulo pueda decir de cuando es el dato: una referencia sin hora es media
// referencia.
let ultimoRefresco = null;

let temporizador = null;
let reintento = null;
let refrescando = false;

/** UNA llamada al proveedor. Devuelve las filas crudas o null; no lanza. */
async function traerOhlc(moneda, dias) {
  const url = `${COINGECKO}/${moneda}/ohlc?vs_currency=usd&days=${dias}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(PLAZO_MS) });
    if (!r.ok) {
      // El 429 se canta distinto porque significa otra cosa: el feed no esta
      // roto, nos esta pidiendo calma. Si aparece seguido, lo que hay que
      // subir es ESPACIADO_MS — no reintentar mas rapido.
      const que = r.status === 429 ? 'HTTP 429 (cuota del proveedor)' : `HTTP ${r.status}`;
      console.error(`[referenciaVelas] ${moneda} ${dias}d: ${que}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error(`[referenciaVelas] ${moneda} ${dias}d: ${e.message}`);
    return null;
  }
}

/**
 * Guarda un lote de velas de un (activo, marco).
 *
 * Upsert por {activo, marco, t0} — la clave unica del indice: la vela en curso
 * llega otra vez en cada refresco con su maximo y su cierre ya movidos, y
 * tiene que PISAR a la anterior, no duplicarla.
 *
 * Y despues poda: se borra lo mas viejo que la ventana que el proveedor acaba
 * de servir. Esto es un cartel informativo, no un archivo historico — lo que
 * el proveedor ya no sirve tampoco lo podemos verificar ni corregir, y coserle
 * a la grafica un tramo viejo de otra lectura seria fabricar una continuidad
 * que nadie nos dio. Las velas de TRATOS, que si son memoria de la casa, no se
 * podan jamas: viven en otra coleccion y las escribe otro archivo.
 */
async function guardar(activo, marco, velas) {
  if (velas.length === 0) return 0;
  const { VelaRef } = losModelos();

  await VelaRef.bulkWrite(
    velas.map(([t0, o, h, l, c]) => ({
      updateOne: {
        filter: { activo, marco, t0 },
        update: { $set: { o, h, l, c } },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  await VelaRef.deleteMany({ activo, marco, t0: { $lt: velas[0][0] } });
  return velas.length;
}

/**
 * Un refresco completo: los dos metales en los tres rangos, seis llamadas
 * espaciadas, y ORIGEN derivado del oro de cada rango.
 *
 * No lanza nunca y no aborta al primer tropiezo: si la plata de 365 dias no
 * llega, el oro de 365 dias ya guardado sigue sirviendo. Devuelve el parte
 * ({ escritas, fallos }) para que arrancar() decida si toca reintento suave.
 */
async function refrescar() {
  // Dos refrescos a la vez pedirian doce llamadas en el mismo minuto y se
  // pisarian los upserts. El mismo candado que usa el vigia.
  if (refrescando) return { escritas: 0, fallos: 0, saltado: true };
  refrescando = true;

  let escritas = 0;
  let fallos = 0;
  let primera = true;

  try {
    for (const { dias, marco } of RANGOS) {
      for (const metal of METALES) {
        // Espaciado ENTRE llamadas, no antes de la primera: el arranque no
        // tiene por que esperar dos segundos y medio para nada.
        if (!primera) await esperar(ESPACIADO_MS);
        primera = false;

        const velas = limpiarTodas(await traerOhlc(metal.moneda, dias));
        if (velas.length === 0) {
          fallos++;
          continue;
        }

        try {
          escritas += await guardar(metal.activo, marco, velas);
          // ORIGEN sale del ORO y solo del oro: mismo lote, mismas horas,
          // dividido entre 31,1035 x 55. La plata no lo toca.
          if (metal.activo === 'AUKA') {
            escritas += await guardar('ORIGEN', marco, velas.map(derivarOrigen));
          }
        } catch (e) {
          // Mongo caido o indice en construccion: este lote se pierde, el
          // refresco no. Nada a medias queda mal: el upsert es por vela.
          fallos++;
          console.error(`[referenciaVelas] no se pudo guardar ${metal.activo} ${marco}: ${e.message}`);
        }
      }
    }
  } finally {
    refrescando = false;
  }

  if (escritas > 0) ultimoRefresco = Date.now();
  console.log(`[referenciaVelas] refresco: ${escritas} velas, ${fallos} fallo(s)`);
  return { escritas, fallos, saltado: false };
}

/** Un ciclo con reintento suave: si algo fallo, se reintenta UNA vez al minuto. */
function ciclo() {
  return refrescar()
    .then((parte) => {
      if (parte.saltado) return;
      if (parte.fallos > 0 || parte.escritas === 0) programarReintento();
    })
    .catch((e) => {
      // refrescar() ya atrapa lo suyo; esto es la red de abajo para que un
      // fallo raro del cartel informativo jamas tumbe el proceso del exchange.
      console.error(`[referenciaVelas] refresco fallido: ${e.message}`);
      programarReintento();
    });
}

// Un solo reintento pendiente a la vez, y suelto (unref) para que no le
// impida al proceso terminar. Si tambien falla, no se encadena otro: el reloj
// de quince minutos vuelve a pasar y la ruta mientras tanto sirve lo ultimo
// bueno que haya, rotulado con su hora.
function programarReintento() {
  if (reintento || !temporizador) return;
  reintento = setTimeout(() => {
    reintento = null;
    refrescar().catch((e) => console.error(`[referenciaVelas] reintento fallido: ${e.message}`));
  }, REINTENTO_MS);
  if (typeof reintento.unref === 'function') reintento.unref();
}

/**
 * Arranca el refresco: uno ya, y despues cada quince minutos. Idempotente —
 * llamarlo dos veces no monta dos relojes. No lanza: el que llama (app.js) no
 * tiene que envolverlo en nada para estar a salvo, aunque igual lo hace.
 */
async function arrancar() {
  if (temporizador) return;
  temporizador = setInterval(() => {
    ciclo();
  }, CADA_MS);
  if (typeof temporizador.unref === 'function') temporizador.unref();
  console.log(`[referenciaVelas] refrescando oro y plata cada ${CADA_MS / 60_000} min`);
  await ciclo();
}

/** Para apagar limpio y para las pruebas. */
function detener() {
  if (temporizador) clearInterval(temporizador);
  if (reintento) clearTimeout(reintento);
  temporizador = null;
  reintento = null;
}

/**
 * Las velas de referencia de un (activo, marco), ordenadas de vieja a nueva —
 * que es el orden en que se pinta una grafica. Devuelve [] cuando no hay
 * nada: quien llama decide si eso es un 404 o una grafica vacia rotulada, y
 * en ninguno de los dos casos se inventa una vela.
 */
async function leer(activo, marco) {
  if (!REFERENCIAS[activo] || !MARCOS_REF.includes(marco)) return [];
  const { VelaRef } = losModelos();
  return VelaRef.find({ activo, marco }).sort({ t0: 1 }).lean();
}

/** Cuando se guardo el ultimo dato bueno en ESTE proceso (epoch ms), o null. */
const refrescadoEn = () => ultimoRefresco;

module.exports = {
  // La parte pura, la que castigan las pruebas.
  ONZA_EN_GRAMOS,
  GRAMOS_POR_ORIGEN,
  DIVISOR_ORIGEN,
  RANGOS,
  MARCOS_REF,
  REFERENCIAS,
  limpiar,
  limpiarTodas,
  derivarOrigen,
  activoDeReferencia,
  marcoDeDias,
  // La cascara.
  refrescar,
  arrancar,
  detener,
  leer,
  refrescadoEn,
};
