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
// LAS FUENTES
//
//   principal  CoinGecko, pax-gold y kinesis-silver (onza en USD).
//   respaldo   gold-api.com, XAU y XAG.
//
// Binance NO es respaldo: contesta 451 a las IP de Estados Unidos, que es
// donde corren los dos backends (medido el 12-ago-2026). Un respaldo que nunca
// responde sólo gasta sus cuatro segundos de espera.
//
// Si la principal trae una pata y no la otra (oro sí, plata no), la que falta
// se pide al respaldo. Y si tampoco el respaldo la trae, se conserva la de la
// lectura anterior (ver «cada pata con su hora», abajo): una lectura a medias
// no borra la pata buena que ya había.
//
// ══════════════════════════════════════════════════════════════════════════
// LA REGLA DEL TIEMPO
//
//   caché          30 s — refrescar más a menudo sólo regala el rate limit de
//                  CoinGecko sin clave (la IP es UNA para todos los clientes:
//                  cada 30 s son dos llamadas por minuto, miren diez o diez mil).
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

const COINGECKO =
  'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold,kinesis-silver&vs_currencies=usd';
const GOLD_API = 'https://api.gold-api.com/price/'; // + XAU | XAG

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

async function leerCoinGecko() {
  const r = await fetch(COINGECKO, { signal: AbortSignal.timeout(PLAZO_MS) });
  if (!r.ok) return null;
  const d = await r.json();
  return {
    oro: positivo(d?.['pax-gold']?.usd),
    plata: positivo(d?.['kinesis-silver']?.usd),
  };
}

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

const FUENTES_DE_VERDAD = [
  { nombre: 'coingecko', leer: leerCoinGecko },
  { nombre: 'gold-api', leer: leerGoldApi },
];

/**
 * Un oráculo. `crearOraculo()` sin argumentos es el de producción; las pruebas
 * le pasan fuentes y reloj fingidos para no tocar la red.
 *
 *   fuentes   [{ nombre, leer: async () => ({ oro, plata }) | null }], en orden
 *   ahora     () => milisegundos
 */
function crearOraculo(opciones = {}) {
  const fuentes = opciones.fuentes || FUENTES_DE_VERDAD;
  const ahora = opciones.ahora || Date.now;
  const frescoMs = opciones.frescoMs ?? FRESCO_MS;
  const edadMaximaMs = opciones.edadMaximaMs ?? EDAD_MAXIMA_MS;
  const historialMax = opciones.historialMax ?? HISTORIAL_MAX;

  // Cada pata por separado: { valor, fuente, en } | null. Ver «cada pata con
  // su hora» en la cabecera.
  let patas = { oro: null, plata: null };
  let intentoEn = null; // cuándo se preguntó por última vez a los feeds
  let vuelo = null;
  const registro = [];

  // Pregunta a las fuentes en orden hasta tener las dos patas o acabarlas.
  async function traer() {
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
      const o = oro == null ? positivo(l?.oro) : null;
      const p = plata == null ? positivo(l?.plata) : null;
      if (o != null) { oro = o; fuenteOro = f.nombre; }
      if (p != null) { plata = p; fuentePlata = f.nombre; }
      if (o != null || p != null) usadas.push(f.nombre);
      if (oro != null && plata != null) break;
    }
    if (oro == null && plata == null) return null;
    return { oro, plata, fuente: usadas.join('+'), en: ahora(), fuenteOro, fuentePlata };
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
            registro.push({ oro: lectura.oro, plata: lectura.plata, fuente: lectura.fuente, en: lectura.en });
            if (registro.length > historialMax) registro.splice(0, registro.length - historialMax);
          }
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

  /** Sólo pruebas: olvidar caché e historial. */
  function _reiniciar() {
    patas = { oro: null, plata: null };
    intentoEn = null;
    vuelo = null;
    registro.length = 0;
  }

  return { metales, cotizacion, precioOrigenUsd, historial, _reiniciar };
}

const deCasa = crearOraculo();

module.exports = {
  ONZA_EN_GRAMOS,
  GRAMOS_POR_ORIGEN,
  GRAMIN_POR_ONZA,
  FRESCO_MS,
  EDAD_MAXIMA_MS,
  HISTORIAL_MAX,
  graminDeOnza,
  crearOraculo,
  metales: deCasa.metales,
  cotizacion: deCasa.cotizacion,
  precioOrigenUsd: deCasa.precioOrigenUsd,
  historial: deCasa.historial,
  _reiniciar: deCasa._reiniciar,
};
