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
  /* La casa madre se medía en NINGÚN sitio, pero el tablero la contaba entre
     las seis. Resultado: con todo el ecosistema perfectamente sano la pantalla
     decía «5 de 6 en pie» y encendía la alarma todos los días. Una alarma que
     está siempre encendida es una alarma que se deja de mirar, y entonces el
     día que se caiga una de verdad no lo nota nadie. Es el mismo fallo que ya
     se había corregido con la ruta de Genesis, repetido en otro sitio. */
  ordenglobal: {
    nombre: 'Orden Global · la casa madre',
    api: process.env.ORDENGLOBAL_WEB || 'https://ordenglobal.org',
    web: 'https://ordenglobal.org',
  },
};

const PLAZO_MS = Number(process.env.VIVO_PLAZO_MS || 9000);

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(PLAZO_MS), headers: { Accept: 'application/json' } });
  const t = await r.text();
  let d = null; try { d = JSON.parse(t); } catch { /* no era JSON */ }
  return { http: r.status, ok: r.ok, datos: d, ms: 0 };
}

/* La casa madre es una web, no una API: no hay `/salud` que preguntar. Se pide
   la portada y basta con que conteste. Sin `Accept: application/json`, porque
   pedirle JSON a una página puede sacar un 406 de un servidor bien educado. */
async function pagina(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(PLAZO_MS), redirect: 'follow' });
  await r.text();
  return { http: r.status, ok: r.ok, datos: null, ms: 0 };
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
  const [oxSalud, oxMercados, aucSalud, aucMonedas, wSalud, gSalud, scanTotal, ogWeb] = await Promise.all([
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
    pata('ordenglobal', () => pagina(CASAS.ordenglobal.api + '/')),
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
      /* Con `mejorVenta` y la referencia en ORIGEN. Los pares de la casa todavía
         no tienen operaciones —`ultimo` es nulo de verdad, no es un fallo de
         lectura—, así que sin esto el tablero solo podía enseñar rayas. Lo que
         sí existe es a cuánto se está ofreciendo y cuánto vale la referencia:
         eso es lo que contesta «¿a qué precio se puede vender hoy?».
         `mejorVenta` viene en la unidad mínima (18 decimales). */
      mercados: mercados.map((m) => ({
        mercado: m.mercado, ultimo: m.ultimo, vol24h: m.vol24h, conReferencia: !!m.referencia,
        mejorVenta: m.mejorVenta ? Number(m.mejorVenta) / 1e18 : null,
        mejorCompra: m.mejorCompra ? Number(m.mejorCompra) / 1e18 : null,
        enOrigen: m.referencia?.enOrigen ?? null,
      })),
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
    genesis: { ...CASAS.genesis, vivo: gSalud.ok, http: gSalud.http, ms: gSalud.ms, error: gSalud.error,
      /* Genesis dice en su /healthz qué le falta para estar en regla —la
         bitácora sin firmar, operadores sin segundo factor, roturas de la
         cadena selladas—. Se leía y se tiraba: lo único que se guardaba era
         «contesta / no contesta». Es la casa de la IDENTIDAD de la gente: lo
         que le falta para estar en regla es exactamente lo que la junta tiene
         que ver sin preguntar. */
      enRegla: gSalud.datos?.cumplimiento?.completo ?? null,
      leFalta: Array.isArray(gSalud.datos?.cumplimiento?.falta) ? gSalud.datos.cumplimiento.falta : null },
    ordenscan: {
      ...CASAS.ordenscan, vivo: scanTotal.ok, http: scanTotal.http, ms: scanTotal.ms, error: scanTotal.error,
      /* El campo se llama `blockTotal`. Aquí decía `totalBlock` —las mismas dos
         palabras al revés— así que la altura que trae OrdenScan salía en nulo SIEMPRE,
         y el tablero lo pintaba como «no leído» con OrdenScan contestando
         perfectamente. lib/herramientas.js ya usaba el nombre bueno: eran dos
         ficheros leyendo la misma casa con nombres distintos. */
      /* ES LA 5550. Este campo se llamó `bloque8532` como si OrdenScan explorara
         la cadena vieja: explora la 5550 —la altura coincide con la del RPC de
         la casa, que contesta chainId 5550— y José lo confirmó. La 8532 está
         congelada desde el 10 de agosto y no la lee nadie aquí. */
      bloqueScan: Number(scanTotal.datos?.blockTotal ?? scanTotal.datos?.totalBlock ?? scanTotal.datos?.total) || null,
    },
    ordenglobal: { ...CASAS.ordenglobal, vivo: ogWeb.ok, http: ogWeb.http, ms: ogWeb.ms, error: ogWeb.error },
  };
}

/* ══ LA DESPENSA DEL ESTADO VIVO ═════════════════════════════════════════════
 * ── LO QUE COSTABA, MEDIDO ──────────────────────────────────────────────────
 * `leer()` sale a SEIS casas —Ordenex, AuCorp, Veta Wallet, Genesis, OrdenScan
 * y la web— con plazo de 9 s cada una. Genesis vive en Render y se duerme.
 * Y esto pasaba ANTES de que el modelo viera la pregunta, en los tres caminos:
 * el saludo, el turno del nodo y el turno de Claude.
 *
 * La caché duraba 30 segundos. Entre dos preguntas de junta pasan minutos, así
 * que casi siempre estaba fría: José preguntaba «¿cómo está el ORIGEN?» y el
 * nodo ni se enteraba mientras seis casas despertaban.
 *
 * ── LO QUE SE HACE AHORA: SE SIRVE LO QUE HAY, Y SE REFRESCA DETRÁS ─────────
 * `leerRapido()` NUNCA espera si hay algo guardado, aunque esté vencido: lo
 * devuelve y dispara el refresco para la próxima. Y no miente, porque el
 * propio texto que va al modelo lleva `Leído: …` y, si la lectura pasó de un
 * minuto y medio, lo dice con todas las letras.
 *
 * ── UNA SOLA LECTURA EN VUELO ───────────────────────────────────────────────
 * `enVuelo` es lo que evita la estampida: el panel pregunta cada pocos
 * segundos, el saludo pregunta al entrar y un turno pregunta a la vez. Sin
 * esto, tres peticiones en la misma ventana fría eran DIECIOCHO llamadas a las
 * casas en paralelo. Con esto, una.
 *
 * ── QUIÉN LLENA LA DESPENSA ─────────────────────────────────────────────────
 * El vigía, que ya despierta cada minuto y ya lee las seis casas. Antes tiraba
 * esa lectura; ahora la guarda aquí. Cero tráfico nuevo: se aprovecha el que
 * ya se pagaba. Por eso NO hay un reloj propio en este archivo — un segundo
 * reloj sería el doble de tráfico contra las casas y, sin `unref`, dejaría las
 * pruebas colgadas sin cerrar el proceso.
 */
let cache = null, cacheEn = 0, enVuelo = null;

/** Lee de verdad y llena la despensa. Una sola en vuelo. */
function refrescar() {
  if (!enVuelo) {
    /* `module.exports.leer` y no `leer` a secas: así una prueba que reemplaza
       la lectura —o el día de mañana una casa simulada— entra por el mismo
       sitio por el que entra el vigía. Con la llamada directa, sustituir la
       exportación no cambiaba nada y la prueba medía el código de verdad
       creyendo que medía el suyo. */
    enVuelo = module.exports.leer()
      .then((c) => { cache = c; cacheEn = Date.now(); return c; })
      .catch((e) => { console.warn('[vivo] no se pudo refrescar:', String(e?.message || e).slice(0, 120)); return cache; })
      .finally(() => { enVuelo = null; });
  }
  return enVuelo;
}

/** La de siempre: espera si no hay nada guardado y fresco. */
async function leerConCache(maxEdadMs = 30_000) {
  if (cache && Date.now() - cacheEn < maxEdadMs) return cache;
  return refrescar();
}

/**
 * La rápida, para el camino donde alguien está esperando a que ULTRON hable.
 * Devuelve lo guardado EN EL ACTO aunque esté vencido, y refresca detrás.
 * La primera de todas —el dyno recién arrancado, la despensa vacía— no puede
 * esperar nueve segundos: espera un segundo y sigue con lo que haya, que puede
 * ser nada. `paraElModelo(null)` dice «no leído», así que nadie inventa un
 * precio que no midió.
 */
async function leerRapido(maxEdadMs = 30_000) {
  if (cache) {
    if (Date.now() - cacheEn >= maxEdadMs) refrescar();
    return cache;
  }
  return Promise.race([
    refrescar(),
    new Promise((ok) => { const t = setTimeout(() => ok(null), 1200); t.unref?.(); }),
  ]);
}

/** Cuántos segundos tiene la lectura que hay guardada (null si no hay). */
const edadDeLaCache = () => (cache ? Math.round((Date.now() - cacheEn) / 1000) : null);

/** Texto para el modelo: corto, con lo que decide cosas. */
function paraElModelo(v) {
  if (!v) return 'Estado vivo: no leído todavía. Si hace falta un dato de una casa, pedilo con estado_vivo en vez de suponerlo.';
  const l = [];
  /* CUÁNDO se leyó, y en segundos cuando ya tiene edad. Con la despensa
     sirviendo lecturas vencidas, decir solo la hora no basta: el modelo tiene
     que poder avisar «esto es de hace cuatro minutos» en vez de cantarlo como
     de ahora mismo. */
  const edad = (() => { const t = Date.parse(v.leidoEn); return Number.isFinite(t) ? Math.round((Date.now() - t) / 1000) : null; })();
  l.push(`Leído: ${v.leidoEn}${edad !== null && edad > 90 ? ` (hace ${edad >= 120 ? `${Math.round(edad / 60)} minutos` : `${edad} segundos`}: si la cifra pesa, decí de cuándo es o volvé a leer con estado_vivo)` : ''}`);
  if (v.origen) l.push(`ORIGEN: $${v.origen.origenUsd.toFixed(6)} (onza de oro $${v.origen.oroOnzaUsd?.toFixed(2) ?? '?'}, fuente ${v.origen.fuente || '?'})`);
  else l.push('ORIGEN: precio no disponible ahora');
  l.push(`Ordenex: ${v.ordenex.vivo ? 'VIVA' : 'NO CONTESTA'} · cadena ${v.ordenex.cadena} · mongo ${v.ordenex.mongo} · bloque 5550 ${v.ordenex.bloque5550} · compra con USDT ${v.ordenex.compraUsdt ?? '?'} · mercados ${v.ordenex.mercados.map((m) => m.mercado).join(', ') || 'ninguno'}`);
  l.push(`AuCorp: ${v.aucorp.vivo ? 'VIVA' : 'NO CONTESTA'} · tasas ${v.aucorp.tasas} (${v.aucorp.tasasCuando || '?'}) · sanciones ${v.aucorp.sanciones?.registros ?? '?'} registros del ${v.aucorp.sanciones?.fechaDescarga || '?'} · ${v.aucorp.monedas?.length ?? '?'} monedas`);
  if (v.aucorp.naturaleza) l.push(`AuCorp es: ${v.aucorp.naturaleza}`);
  l.push(`Veta Wallet backend: ${v.wallet.vivo ? 'VIVO' : 'NO CONTESTA'} (${v.wallet.http})`);
  /* Y lo que le falta a Genesis para estar en regla, con todas las letras: es
     la casa de la identidad de la gente y ULTRON tiene que poder decirlo sin
     que se lo pregunten (regla 7). */
  l.push(`Genesis ID: ${v.genesis.vivo ? 'VIVO' : 'NO CONTESTA'} (${v.genesis.http})${v.genesis.enRegla === false && v.genesis.leFalta?.length ? ` · LE FALTA para estar en regla: ${v.genesis.leFalta.join('; ')}` : v.genesis.enRegla === true ? ' · en regla' : ''}`);
  l.push(`OrdenScan (explorador de la 5550): ${v.ordenscan.vivo ? 'VIVO' : 'NO CONTESTA'} · bloque ${v.ordenscan.bloqueScan ?? '?'}`);
  return l.join('\n');
}

module.exports = { leer, leerConCache, leerRapido, refrescar, edadDeLaCache, paraElModelo, CASAS, _adentro: { precioDe } };
