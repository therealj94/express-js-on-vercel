// El oráculo único de oro y plata (SFSP v0.3 §10.5; plan v0.3 C5, fase 0.5).
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ UNO SOLO
//
// Hasta el 26-sep había lecturas independientes del oro: la de la wallet
// (`veta-wallet-backend/lib/origenPrice.js`, sin caché ni edad máxima) y la de
// Ordenex (`ordenex-api/lib/referencia.js`, caché de 30 s y máximo de 5 min).
// Dos lecturas son dos precios, y dos precios de ORIGEN en la misma casa son
// una diferencia que alguien aprovecha. Este archivo es EL oráculo: el mismo
// archivo, byte a byte, vive en los dos backends (son despliegues separados,
// igual que `lib/sfsp410.js`). Una prueba en cada backend
// (`pruebas/probar-oraculo.mjs`) falla si las dos copias divergen: se cambia
// una, se copia a la otra.
//
// ══════════════════════════════════════════════════════════════════════════
// LA ARITMÉTICA (decisión de la dirección del 26-sep-2026)
//
//     1 onza troy fina = 31,1035 g
//     ORIGEN = gramin  = gramo de oro / 55   = onza de oro / 1.710,6925
//     AUKA   = 1 onza de oro fino            = 1.710,69 gramin, SIEMPRE
//     AGKA   = 1 onza de plata fina          (en gramin se mueve con la razón
//                                             oro:plata, que es un dato real)
//
// Los 0,01 USD NO son el precio de ORIGEN: son la COMISIÓN por transacción.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS FUENTES (decisión de la dirección, 27-sep-2026: «el precio de Londres»)
//
//   precio vivo  gold-api.com, XAU y XAG: el spot del mercado de Londres (el
//                OTC de Londres, el que se cotiza como XAU/USD y XAG/USD).
//   guarda       el último fijo oficial de la LBMA (prices.lbma.org.uk: oro
//                AM y PM, plata), leído cada 6 h. Un spot que se aparta más de
//                DESVIO_MAXIMO (5 %) del fijo vigente (de menos de 5 días) se
//                DESCARTA: esa pata queda sin precio y la operación que la
//                necesita se bloquea. Si la LBMA no contesta, o su fijo es más
//                viejo que 5 días, el spot se sirve igual y la lectura lo dice
//                (`londres: 'sin-fijo'`).
//
// Sin conexión con Londres no hay precio: null, y quien mueve dinero bloquea.
// Fuera quedan CoinGecko (pax-gold, kinesis-silver: tokens que cotizan con
// prima o descuento sobre el metal, no el precio de Londres) y Binance
// (contesta 451 a las IP de Estados Unidos, medido el 12-ago-2026).
//
// Si una lectura trae una pata y no la otra (oro sí, plata no), se conserva la
// de la lectura anterior (ver «cada pata con su hora», abajo): una lectura a
// medias no borra la pata buena que ya había.
//
// ══════════════════════════════════════════════════════════════════════════
// LA REGLA DEL TIEMPO
//
//   caché          30 s — la IP del backend es UNA para todos los clientes:
//                  cada 30 s son dos llamadas por minuto al feed, miren diez o
//                  diez mil.
//   edad máxima    10 min — si el feed no llega, la última lectura buena se
//                  sirve, rotulada con su hora (`en`), mientras tenga menos de
//                  10 minutos. Más vieja que eso NO se sirve: se contesta null
//                  y la pantalla enseña un guion. Jamás un número viejo
//                  presentado como vigente, jamás un número inventado.
//   cada pata con su hora
//                  el oro y la plata se guardan por separado, cada uno con la
//                  hora de la lectura que lo trajo (`enOro`, `enPlata`) y su
//                  fuente, y cada uno caduca a los 10 min de SU lectura. Una
//                  lectura que trae sólo la plata renueva la plata y deja el
//                  oro de antes, con su hora, en vez de tirarlo: si no, una
//                  caída a medias dejaba al servicio peor que una total (sin
//                  oro 30 s aunque hubiera uno de hace segundos). `en` es la
//                  hora de la pata MÁS VIEJA que se sirve: el rótulo nunca
//                  presenta como más fresco lo que no lo es.
//
// Nada de aquí lanza: sin dato, null. Quien necesita el precio para mover
// dinero decide qué hacer con el null (bloquear la operación), nunca rellenarlo.
//
// ══════════════════════════════════════════════════════════════════════════
// EL HISTORIAL
//
// Cada lectura buena que llega de un feed se apunta en memoria (las últimas
// HISTORIAL_MAX). Sirve para auditar de dónde salió un precio en los últimos
// minutos; no se persiste y se pierde al reiniciar.
//
// Módulo CommonJS sin dependencias: Ordenex lo carga con require y la wallet
// con import (babel). Sólo usa fetch y AbortSignal.timeout, de Node ≥ 18.

'use strict';

const ONZA_EN_GRAMOS = 31.1035;
const GRAMOS_POR_ORIGEN = 55;
// Cuántos gramin tiene una onza troy: 31,1035 × 55 = 1.710,6925.
const GRAMIN_POR_ONZA = ONZA_EN_GRAMOS * GRAMOS_POR_ORIGEN;

const FRESCO_MS = 30_000;
const EDAD_MAXIMA_MS = 10 * 60_000;
const PLAZO_MS = 4_000;
const HISTORIAL_MAX = 120;

const GOLD_API = 'https://api.gold-api.com/price/'; // + XAU | XAG
const LBMA = 'https://prices.lbma.org.uk/json/'; // + gold_am | gold_pm | silver .json
const LBMA_ARCHIVOS = { oro: ['gold_am', 'gold_pm'], plata: ['silver'] };
const LBMA_REFRESCO_MS = 6 * 3_600_000;
const FIJO_VIGENCIA_MS = 5 * 86_400_000;
const DESVIO_MAXIMO = 0.05;
const PLAZO_LBMA_MS = 15_000;

const positivo = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** El gramin (precio de 1 ORIGEN en USD) a partir de la onza de oro, o null. */
function graminDeOnza(onzaOro) {
  const oz = positivo(onzaOro);
  return oz == null ? null : oz / GRAMIN_POR_ONZA;
}

// ── las fuentes de verdad ───────────────────────────────────────────────────

async function leerGoldApi() {
  const uno = async (simbolo) => {
    try {
      const r = await fetch(`${GOLD_API}${simbolo}`, { signal: AbortSignal.timeout(PLAZO_MS) });
      if (!r.ok) return null;
      return positivo((await r.json())?.price);
    } catch {
      return null;
    }
  };
  const [oro, plata] = await Promise.all([uno('XAU'), uno('XAG')]);
  return { oro, plata };
}

const FUENTES_DE_VERDAD = [{ nombre: 'londres-spot', leer: leerGoldApi }];

/**
 * El último fijo oficial de la LBMA del metal, en USD por onza:
 * { valor, dia (ms), archivo } | null. De oro se toman AM y PM y gana el más
 * reciente (a igual día, el PM). No lanza.
 */
async function leerFijoLbma(metal) {
  let mejor = null;
  for (const archivo of LBMA_ARCHIVOS[metal] || []) {
    try {
      const r = await fetch(`${LBMA}${archivo}.json`, { signal: AbortSignal.timeout(PLAZO_LBMA_MS) });
      if (!r.ok) continue;
      const serie = await r.json();
      if (!Array.isArray(serie)) continue;
      for (let i = serie.length - 1; i >= 0; i--) {
        const valor = positivo(serie[i]?.v?.[0]);
        const dia = Date.parse(serie[i]?.d);
        if (valor == null || !Number.isFinite(dia)) continue;
        const orden = dia + (archivo.endsWith('pm') ? 1 : 0);
        if (!mejor || orden > mejor.orden) mejor = { valor, dia, archivo, orden };
        break;
      }
    } catch {
      // la LBMA caída no tumba el precio: el spot se sirve «sin-fijo»
    }
  }
  return mejor && { valor: mejor.valor, dia: mejor.dia, archivo: mejor.archivo };
}

/**
 * Un oráculo. `crearOraculo()` sin argumentos es el de producción; las pruebas
 * le pasan fuentes y reloj fingidos para no tocar la red.
 *
 *   fuentes   [{ nombre, leer: async () => ({ oro, plata }) | null }], en orden
 *   fijo      async (metal) => ({ valor, dia }) | null — el fijo de Londres que
 *             hace de guarda. Por omisión, la LBMA; si la prueba pasa sus
 *             propias fuentes y no pasa `fijo`, no hay guarda (no toca la red).
 *   ahora     () => milisegundos
 */
function crearOraculo(opciones = {}) {
  const fuentes = opciones.fuentes || FUENTES_DE_VERDAD;
  const ahora = opciones.ahora || Date.now;
  const frescoMs = opciones.frescoMs ?? FRESCO_MS;
  const edadMaximaMs = opciones.edadMaximaMs ?? EDAD_MAXIMA_MS;
  const historialMax = opciones.historialMax ?? HISTORIAL_MAX;
  const leerFijo = opciones.fijo || (opciones.fuentes ? async () => null : leerFijoLbma);
  const desvioMaximo = opciones.desvioMaximo ?? DESVIO_MAXIMO;

  // El fijo de Londres por metal, con su propia caché de 6 h y un vuelo a la vez.
  const fijos = { oro: null, plata: null };
  const fijoEn = { oro: null, plata: null };
  const fijoVuelo = { oro: null, plata: null };
  async function fijoDe(metal) {
    const t = ahora();
    if (fijoEn[metal] !== null && t - fijoEn[metal] < LBMA_REFRESCO_MS) return fijos[metal];
    if (!fijoVuelo[metal]) {
      fijoVuelo[metal] = Promise.resolve()
        .then(() => leerFijo(metal))
        .catch(() => null)
        .then((f) => {
          fijoEn[metal] = ahora();
          if (f && positivo(f.valor) != null) fijos[metal] = f;
          return fijos[metal];
        })
        .finally(() => {
          fijoVuelo[metal] = null;
        });
    }
    return fijoVuelo[metal];
  }

  // ¿El spot está dentro de Londres? { ok, londres: 'dentro'|'fuera'|'sin-fijo' }
  async function contraLondres(metal, valor) {
    const f = await fijoDe(metal);
    if (!f || !Number.isFinite(f.dia) || ahora() - f.dia > FIJO_VIGENCIA_MS) return { ok: true, londres: 'sin-fijo' };
    const desvio = Math.abs(valor - f.valor) / f.valor;
    return desvio <= desvioMaximo ? { ok: true, londres: 'dentro' } : { ok: false, londres: 'fuera', desvio, fijo: f.valor };
  }

  // Cada pata por separado: { valor, fuente, en } | null. Ver «cada pata con
  // su hora» en la cabecera.
  let patas = { oro: null, plata: null };
  let intentoEn = null; // cuándo se preguntó por última vez a los feeds
  let vuelo = null;
  const registro = [];
  const rechazos = []; // spots descartados por la guarda de Londres (auditoría)

  // Pregunta a las fuentes en orden hasta tener las dos patas o acabarlas.
  async function traer() {
    const londres = { oro: null, plata: null };
    let oro = null;
    let plata = null;
    let fuenteOro = null;
    let fuentePlata = null;
    const usadas = [];
    for (const f of fuentes) {
      let l = null;
      try {
        l = await f.leer();
      } catch {
        l = null;
      }
      let o = oro == null ? positivo(l?.oro) : null;
      let p = plata == null ? positivo(l?.plata) : null;
      // La guarda de Londres: un spot que se aparta del fijo LBMA no se usa.
      if (o != null) {
        const g = await contraLondres('oro', o);
        londres.oro = g.londres;
        if (!g.ok) { rechazos.push({ metal: 'oro', valor: o, fijo: g.fijo, fuente: f.nombre, en: ahora() }); o = null; }
      }
      if (p != null) {
        const g = await contraLondres('plata', p);
        londres.plata = g.londres;
        if (!g.ok) { rechazos.push({ metal: 'plata', valor: p, fijo: g.fijo, fuente: f.nombre, en: ahora() }); p = null; }
      }
      if (o != null) { oro = o; fuenteOro = f.nombre; }
      if (p != null) { plata = p; fuentePlata = f.nombre; }
      if (o != null || p != null) usadas.push(f.nombre);
      if (oro != null && plata != null) break;
    }
    if (oro == null && plata == null) return null;
    return { oro, plata, fuente: usadas.join('+'), en: ahora(), fuenteOro, fuentePlata, londres };
  }

  // Una lectura renueva SÓLO las patas que trae; la otra se queda como estaba.
  function apuntar(lectura) {
    if (lectura.oro != null) patas.oro = { valor: lectura.oro, fuente: lectura.fuenteOro, en: lectura.en };
    if (lectura.plata != null) patas.plata = { valor: lectura.plata, fuente: lectura.fuentePlata, en: lectura.en };
  }

  // Lo que se puede servir ahora: cada pata mientras tenga menos de 10 min.
  function vigente() {
    const t = ahora();
    const sirve = (p) => (p && t - p.en < edadMaximaMs ? p : null);
    const oro = sirve(patas.oro);
    const plata = sirve(patas.plata);
    if (!oro && !plata) return null;
    const servidas = [oro, plata].filter(Boolean);
    return {
      oro: oro ? oro.valor : null,
      plata: plata ? plata.valor : null,
      // Las fuentes de las patas servidas, en el orden de las fuentes.
      fuente: fuentes
        .map((f) => f.nombre)
        .filter((n) => servidas.some((p) => p.fuente === n))
        .join('+'),
      // La hora de la pata MÁS VIEJA que se sirve.
      en: Math.min(...servidas.map((p) => p.en)),
      enOro: oro ? oro.en : null,
      enPlata: plata ? plata.en : null,
    };
  }

  /**
   * Los metales en USD por onza troy:
   *
   *   { oro, plata, fuente, en, enOro, enPlata }
   *
   * Cada pata puede venir null si no hay una de menos de 10 minutos; `enOro` y
   * `enPlata` son la hora de la lectura que trajo cada una, y `en` la de la
   * más vieja de las dos. null cuando no hay ninguna pata de menos de
   * 10 minutos. Un solo vuelo a la vez: veinte peticiones con la caché vencida
   * esperan UNA llamada al proveedor. No lanza nunca.
   */
  async function metales() {
    // Dentro de los 30 s no se vuelve a preguntar, haya llegado algo o no: un
    // feed caído tampoco se martillea.
    if (intentoEn !== null && ahora() - intentoEn < frescoMs) return vigente();

    if (!vuelo) {
      vuelo = traer()
        .catch(() => null)
        .then((lectura) => {
          intentoEn = ahora();
          if (lectura) {
            apuntar(lectura);
            // Al historial va la lectura tal como llegó, sin rellenar.
            registro.push({ oro: lectura.oro, plata: lectura.plata, fuente: lectura.fuente, en: lectura.en, londres: lectura.londres });
            if (registro.length > historialMax) registro.splice(0, registro.length - historialMax);
          }
          if (rechazos.length > historialMax) rechazos.splice(0, rechazos.length - historialMax);
          return lectura;
        })
        .finally(() => {
          vuelo = null;
        });
    }
    await vuelo;
    const v = vigente();
    if (!v) patas = { oro: null, plata: null };
    return v;
  }

  /**
   * La cotización de la casa, toda en USD:
   *
   *   { origenUsd, aukaUsd, agkaUsd, oroOnzaUsd, plataOnzaUsd,
   *     fuente, en, enOro, enPlata } | null
   *
   *  - origenUsd  el gramin: gramo de oro / 55.
   *  - aukaUsd    la onza de oro fino (= 1.710,69 gramin).
   *  - agkaUsd    la onza de plata fina.
   * Una pata sin dato es null; si no hay ninguna, null entero. Las horas,
   * como en metales().
   */
  async function cotizacion() {
    const m = await metales();
    if (!m) return null;
    return {
      origenUsd: graminDeOnza(m.oro),
      aukaUsd: m.oro,
      agkaUsd: m.plata,
      oroOnzaUsd: m.oro,
      plataOnzaUsd: m.plata,
      fuente: m.fuente,
      en: m.en,
      enOro: m.enOro,
      enPlata: m.enPlata,
    };
  }

  /** El precio de 1 ORIGEN en USD (el gramin), o null sin dato fresco. */
  async function precioOrigenUsd() {
    const m = await metales();
    return m ? graminDeOnza(m.oro) : null;
  }

  /** Las últimas lecturas buenas, de vieja a nueva (copia). */
  function historial() {
    return registro.map((l) => ({ ...l }));
  }

  /** Los spots descartados por la guarda de Londres (copia). */
  function descartados() {
    return rechazos.map((r) => ({ ...r }));
  }

  /** El fijo LBMA vigente que hace de guarda, por metal (sin tocar la red si está en caché). */
  async function fijoLondres(metal) {
    return fijoDe(metal);
  }

  /** Sólo pruebas: olvidar caché e historial. */
  function _reiniciar() {
    patas = { oro: null, plata: null };
    intentoEn = null;
    vuelo = null;
    registro.length = 0;
    rechazos.length = 0;
    for (const m of ['oro', 'plata']) { fijos[m] = null; fijoEn[m] = null; fijoVuelo[m] = null; }
  }

  return { metales, cotizacion, precioOrigenUsd, historial, descartados, fijoLondres, _reiniciar };
}

const deCasa = crearOraculo();

module.exports = {
  ONZA_EN_GRAMOS,
  GRAMOS_POR_ORIGEN,
  GRAMIN_POR_ONZA,
  FRESCO_MS,
  EDAD_MAXIMA_MS,
  HISTORIAL_MAX,
  DESVIO_MAXIMO,
  FIJO_VIGENCIA_MS,
  graminDeOnza,
  leerFijoLbma,
  crearOraculo,
  metales: deCasa.metales,
  cotizacion: deCasa.cotizacion,
  precioOrigenUsd: deCasa.precioOrigenUsd,
  historial: deCasa.historial,
  descartados: deCasa.descartados,
  fijoLondres: deCasa.fijoLondres,
  _reiniciar: deCasa._reiniciar,
};
