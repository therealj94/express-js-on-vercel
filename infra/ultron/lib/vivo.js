// EL ESTADO VIVO: lo que la casa está haciendo AHORA, no lo que tiene escrito.
//
// El saber compilado dice qué es Ordenex. Esto dice si Ordenex está de pie en
// este minuto, a cuánto está el oro y si la compra con USDT está abierta. Son
// las dos mitades de «conoce todo»: la que no cambia y la que cambia cada
// treinta segundos.
//
// Todo va con plazo corto y sin sesión: son las rutas públicas de cada casa,
// las mismas que ya leen los paneles. Y cada pata falla SOLA: si AuCorp no
// contesta, ULTRON sabe que AuCorp no contesta — que es un dato— y sigue con
// las demás. Un estado vivo que se cae entero porque una casa tardó no le
// sirve a nadie.

const CASAS = {
  ordenex: {
    nombre: 'Ordenex · la casa de cambio',
    api: process.env.ORDENEX_API || 'https://ordenex-api-ba4b27b8b51a.herokuapp.com',
    web: 'https://ordenexchange.link',
  },
  aucorp: {
    nombre: 'AuCorp · el lado fiat',
    api: process.env.AUCORP_API || 'https://aucorp-api-e70d3fd481ca.herokuapp.com',
    web: 'https://main.d2e55u6ls6v9xt.amplifyapp.com/banca',
  },
  wallet: {
    nombre: 'Veta Wallet · el backend',
    api: process.env.WALLET_API || 'https://vetawallet-1a2e38ac52b1.herokuapp.com',
    web: 'https://app.vetawallet.com',
  },
  genesis: {
    nombre: 'Genesis ID · identidad',
    api: process.env.GENESIS_API || 'https://genesis-id.onrender.com',
    web: 'https://genesis-id.onrender.com',
  },
  ordenscan: {
    nombre: 'OrdenScan · el explorador',
    api: process.env.ORDENSCAN_API || 'https://orden-global-scan-c4abe71e8024.herokuapp.com',
    web: 'https://ordenscan.com',
  },
};

const PLAZO_MS = Number(process.env.VIVO_PLAZO_MS || 9000);

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(PLAZO_MS), headers: { Accept: 'application/json' } });
  const t = await r.text();
  let d = null; try { d = JSON.parse(t); } catch { /* no era JSON */ }
  return { http: r.status, ok: r.ok, datos: d, ms: 0 };
}

/** Una pata, con reloj y sin lanzar nunca. */
async function pata(nombre, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { ...r, ms: Date.now() - t0, error: null };
  } catch (e) {
    return { ok: false, http: 0, datos: null, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 120) };
  }
}

/* ── El precio del ORIGEN, del mismo sitio que lo usa Ordenex ────────────────
   onza / 31,1035 / 55. Se lee de la referencia que Ordenex ya calculó; acá no
   se repite la cuenta. */
function precioDe(mercados) {
  for (const m of mercados || []) {
    const r = m?.referencia;
    if (r && Number(r.origenUsd) > 0) {
      return { origenUsd: Number(r.origenUsd), oroOnzaUsd: Number(r.usd) || null, fuente: r.fuente || null, leidoEn: r.en || null };
    }
  }
  return null;
}

/** Todo el estado, en paralelo. Nunca lanza. */
async function leer() {
  const [oxSalud, oxMercados, aucSalud, aucMonedas, wSalud, gSalud, scanTotal] = await Promise.all([
    pata('ordenex', () => json(CASAS.ordenex.api + '/salud')),
    pata('ordenex', () => json(CASAS.ordenex.api + '/mercados')),
    pata('aucorp', () => json(CASAS.aucorp.api + '/salud')),
    pata('aucorp', () => json(CASAS.aucorp.api + '/monedas')),
    pata('wallet', () => json(CASAS.wallet.api + '/salud')),
    /* `/healthz`, no `/api/publico/salud`: esa ruta no existe y nunca existió.
       Genesis contestaba 404 a cada lectura, así que el tablero la pintaba
       caída y el saludo de la mañana decía «Genesis ID no contesta» todos los
       días con Genesis perfectamente viva. Una alarma que siempre suena es una
       alarma que se deja de mirar, y entonces el día que se caiga de verdad no
       lo va a notar nadie. (lib/herramientas.js ya usaba la ruta buena: eran
       dos sitios diciendo cosas distintas de la misma casa.) */
    pata('genesis', () => json(CASAS.genesis.api + '/healthz')),
    pata('ordenscan', () => json(CASAS.ordenscan.api + '/block/totalBlock')),
  ]);

  const mercados = Array.isArray(oxMercados.datos) ? oxMercados.datos : [];
  return {
    leidoEn: new Date().toISOString(),
    origen: precioDe(mercados),
    ordenex: {
      ...CASAS.ordenex,
      vivo: oxSalud.ok, http: oxSalud.http, ms: oxSalud.ms, error: oxSalud.error,
      cadena: oxSalud.datos?.cadena ?? null, mongo: oxSalud.datos?.mongo ?? null,
      bloque5550: oxSalud.datos?.bloque ?? null,
      // La compra con USDT: abierta o cerrada. Con la variable sin poner el
      // servidor se niega, y ULTRON tiene que saberlo para no decirle a nadie
      // que mande dinero.
      compraUsdt: oxSalud.datos?.entrega === true ? 'abierta' : (oxSalud.datos ? 'cerrada' : null),
      mercados: mercados.map((m) => ({ mercado: m.mercado, ultimo: m.ultimo, vol24h: m.vol24h, conReferencia: !!m.referencia })),
    },
    aucorp: {
      ...CASAS.aucorp,
      vivo: aucSalud.ok, http: aucSalud.http, ms: aucSalud.ms, error: aucSalud.error,
      tasas: aucSalud.datos?.tasas ?? null, tasasCuando: aucSalud.datos?.tasasCuando ?? null,
      sanciones: aucSalud.datos?.sanciones ?? null,
      naturaleza: aucSalud.datos?.naturaleza ?? null,
      monedas: Array.isArray(aucMonedas.datos?.monedas) ? aucMonedas.datos.monedas.map((m) => m.codigo) : null,
    },
    wallet: { ...CASAS.wallet, vivo: wSalud.ok, http: wSalud.http, ms: wSalud.ms, error: wSalud.error, datos: wSalud.datos },
    genesis: { ...CASAS.genesis, vivo: gSalud.ok, http: gSalud.http, ms: gSalud.ms, error: gSalud.error },
    ordenscan: {
      ...CASAS.ordenscan, vivo: scanTotal.ok, http: scanTotal.http, ms: scanTotal.ms, error: scanTotal.error,
      bloque8532: Number(scanTotal.datos?.totalBlock ?? scanTotal.datos?.total ?? scanTotal.datos) || null,
    },
  };
}

/* Memoria corta: el panel pregunta cada pocos segundos y el modelo pregunta a
   mitad de un razonamiento. Treinta segundos de caché evitan martillar cinco
   APIs sin perder nada que importe. */
let cache = null, cacheEn = 0;
async function leerConCache(maxEdadMs = 30_000) {
  if (cache && Date.now() - cacheEn < maxEdadMs) return cache;
  cache = await leer(); cacheEn = Date.now();
  return cache;
}

/** Texto para el modelo: corto, con lo que decide cosas. */
function paraElModelo(v) {
  if (!v) return 'Estado vivo: no leído.';
  const l = [];
  l.push(`Leído: ${v.leidoEn}`);
  if (v.origen) l.push(`ORIGEN: $${v.origen.origenUsd.toFixed(6)} (onza de oro $${v.origen.oroOnzaUsd?.toFixed(2) ?? '?'}, fuente ${v.origen.fuente || '?'})`);
  else l.push('ORIGEN: precio no disponible ahora');
  l.push(`Ordenex: ${v.ordenex.vivo ? 'VIVA' : 'NO CONTESTA'} · cadena ${v.ordenex.cadena} · mongo ${v.ordenex.mongo} · bloque 5550 ${v.ordenex.bloque5550} · compra con USDT ${v.ordenex.compraUsdt ?? '?'} · mercados ${v.ordenex.mercados.map((m) => m.mercado).join(', ') || 'ninguno'}`);
  l.push(`AuCorp: ${v.aucorp.vivo ? 'VIVA' : 'NO CONTESTA'} · tasas ${v.aucorp.tasas} (${v.aucorp.tasasCuando || '?'}) · sanciones ${v.aucorp.sanciones?.registros ?? '?'} registros del ${v.aucorp.sanciones?.fechaDescarga || '?'} · ${v.aucorp.monedas?.length ?? '?'} monedas`);
  if (v.aucorp.naturaleza) l.push(`AuCorp es: ${v.aucorp.naturaleza}`);
  l.push(`Veta Wallet backend: ${v.wallet.vivo ? 'VIVO' : 'NO CONTESTA'} (${v.wallet.http})`);
  l.push(`Genesis ID: ${v.genesis.vivo ? 'VIVO' : 'NO CONTESTA'} (${v.genesis.http})`);
  l.push(`OrdenScan (cadena 8532): ${v.ordenscan.vivo ? 'VIVO' : 'NO CONTESTA'} · bloque ${v.ordenscan.bloque8532 ?? '?'}`);
  return l.join('\n');
}

module.exports = { leer, leerConCache, paraElModelo, CASAS, _adentro: { precioDe } };
