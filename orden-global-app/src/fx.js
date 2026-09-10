// Feed de tasas de cambio en vivo para el simulador de Remesas.
//
// Fuente: open.er-api.com (free, sin API key, sin registro). Devuelve
// todas las monedas del mundo con base USD. Se cachea 30 minutos en
// memoria para no golpear la API en cada tap; si la red falla se cae
// a la caché última o a las tasas estáticas de referencia.

const URL = 'https://open.er-api.com/v6/latest/USD';
const TTL = 30 * 60 * 1000; // 30 min

const CACHE = { at: 0, rates: null, updatedAt: null };

// Respaldo estático — se usan solo si nunca se pudo llamar al feed.
// Actualizados con la mejor referencia disponible; el feed los reemplaza
// en el arranque.
export const STATIC_RATES = {
  HNL: 25.50,
  GTQ: 7.77,
  NIO: 36.60,
  CRC: 512,
  MXN: 18.50,
  COP: 4050,
  USD: 1,
};

export async function fetchRates(force = false) {
  if (!force && CACHE.rates && Date.now() - CACHE.at < TTL) {
    return { rates: CACHE.rates, updatedAt: CACHE.updatedAt, source: 'cache' };
  }
  try {
    const r = await fetch(URL);
    const d = await r.json();
    if (d?.result === 'success' && d?.rates && typeof d.rates.HNL === 'number') {
      CACHE.rates = d.rates;
      CACHE.at = Date.now();
      CACHE.updatedAt = d.time_last_update_utc || new Date().toUTCString();
      return { rates: CACHE.rates, updatedAt: CACHE.updatedAt, source: 'live' };
    }
  } catch (e) {}
  // Sin feed: devolvemos lo último bueno, o los estáticos como último recurso.
  return CACHE.rates
    ? { rates: CACHE.rates, updatedAt: CACHE.updatedAt, source: 'cache' }
    : { rates: STATIC_RATES, updatedAt: null, source: 'static' };
}
