// Las tasas de cambio de AuCorp.
//
// ══ LA REGLA DE LA CASA: NI UN DATO INVENTADO ══════════════════════════════
//
// Si no hay tasa real, no hay tasa. `tasa()` devuelve null y la pantalla pinta
// un guion. Nunca un 1.00 de relleno, nunca la última que se recuerde sin
// decir de cuándo es, nunca un cero. Una tasa inventada no es un número feo en
// una pantalla: es el precio al que alguien acaba de cambiar su sueldo.
//
// Por eso cada cotización sale SIEMPRE con su sello de tiempo y su origen, y
// `convertir()` truena en vez de adivinar cuando le falta la tasa.
//
// ══ EL ORIGEN ══════════════════════════════════════════════════════════════
//
// open.er-api.com, que publica una tasa de referencia diaria contra el dólar y
// cubre las veintiuna monedas de la casa sin pedir llave. Es una tasa de
// REFERENCIA, no el precio al que un banco corresponsal ejecuta de verdad:
// cuando AuCorp tenga corresponsal en cada plaza, el precio de ejecución sale
// de ahí y esto queda solo para pintar. Mientras tanto se dice lo que es, y
// por eso `origen` viaja pegado a la tasa hasta la pantalla.
//
// ══ EL MARGEN ══════════════════════════════════════════════════════════════
//
// AuCorp cobra un margen sobre la tasa media. Va en AUCORP_MARGEN_BPS (puntos
// base, 100 = 1%) y por defecto es CERO: un margen que aparece solo porque
// nadie configuró nada es un cobro que nadie decidió. Y la cotización devuelve
// las dos cosas —la media y la aplicada— para que el margen se vea, en vez de
// esconderse dentro de un número peor.
//
// ══ EL REDONDEO ════════════════════════════════════════════════════════════
//
// Convertir entre monedas casi nunca da entero. El sobrante no se tira ni se
// guarda callado: el asiento anota cada pata por su monto exacto y la
// diferencia queda en `posicion.cambio`, que es una cuenta que se puede mirar.
// Céntimo que se pierde en un redondeo es céntimo que alguien pagó sin saberlo.

const { moneda, REFERENCIA } = require('./monedas');

const FUENTE = 'https://open.er-api.com/v6/latest/USD';
const PLAZO_MS = 12000;
// La fuente publica una vez al día; pedirla más seguido no trae nada nuevo.
// Diez minutos es para que un reinicio no herede una tasa vieja, no para
// perseguir un movimiento que no existe.
const VIGENCIA_MS = 10 * 60 * 1000;
// Las tasas se guardan como enteros escalados: 1 USD = 26.799112 HNL se anota
// 2679911200. Nada de coma flotante en el camino del dinero.
const ESCALA = 100000000n;   // 1e8

let cache = null;   // { tasas: Map<cod, BigInt>, cuando: Date, pedido: number }

function aEscalada(x) {
  if (typeof x !== 'number' || !isFinite(x) || x <= 0) return null;
  const s = x.toFixed(8);
  const [ent, dec] = s.split('.');
  try { return BigInt(ent) * ESCALA + BigInt(dec); } catch { return null; }
}

/** Trae las tasas de la fuente. Truena si no se pudo: no inventa. */
async function traer() {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), PLAZO_MS);
  try {
    const r = await fetch(FUENTE, { signal: control.signal });
    if (!r.ok) throw new Error(`la fuente respondió ${r.status}`);
    const j = await r.json();
    if (j?.result !== 'success' || !j.rates) throw new Error('la fuente no devolvió tasas');

    const tasas = new Map([[REFERENCIA, ESCALA]]);
    for (const [cod, v] of Object.entries(j.rates)) {
      if (!moneda(cod)) continue;              // solo las que la casa maneja
      const e = aEscalada(v);
      if (e) tasas.set(cod, e);
    }
    // `time_last_update_utc` es cuándo la FUENTE la publicó, no cuándo la
    // pedimos nosotros. Es lo que hay que enseñar: «hace 3 minutos» sobre una
    // tasa de ayer es una mentira con reloj.
    const cuando = j.time_last_update_utc ? new Date(j.time_last_update_utc) : null;
    if (!tasas.size) throw new Error('ninguna tasa utilizable');
    return { tasas, cuando, pedido: Date.now() };
  } finally {
    clearTimeout(reloj);
  }
}

/** Las tasas vigentes, o null si no se pudieron conseguir. */
async function tasas() {
  if (cache && Date.now() - cache.pedido < VIGENCIA_MS) return cache;
  try {
    cache = await traer();
    return cache;
  } catch (e) {
    console.error(`[cambio] no se pudieron traer las tasas: ${e.message}`);
    // Si hay una tanda anterior se devuelve TAL CUAL, con su fecha vieja a la
    // vista. Quien la pinte decide si una tasa de ayer sirve para lo que va a
    // hacer — lo que no se hace es disfrazarla de fresca.
    return cache || null;
  }
}

/**
 * La cotización de `de` → `a`, o null si falta alguna tasa real.
 *
 * Devuelve { media, aplicada, margenBps, cuando, origen } con las tasas como
 * strings escalados a 1e8. `null` significa exactamente eso: no se sabe.
 */
async function cotizar(de, a) {
  const mDe = moneda(de);
  const mA = moneda(a);
  if (!mDe || !mA) return null;

  const t = await tasas();
  if (!t) return null;
  const rDe = t.tasas.get(mDe.c);
  const rA = t.tasas.get(mA.c);
  if (!rDe || !rA) return null;

  // Las dos vienen contra el dólar: de → USD → a.
  const media = (rA * ESCALA) / rDe;
  const bps = BigInt(Math.max(0, Math.min(1000, parseInt(process.env.AUCORP_MARGEN_BPS || '0', 10) || 0)));
  // El margen siempre en contra de quien cambia, que es como cobra una casa de
  // cambio — pero DICHO, no metido dentro de la tasa media.
  const aplicada = (media * (10000n - bps)) / 10000n;

  return {
    de: mDe.c, a: mA.c,
    media: media.toString(),
    aplicada: aplicada.toString(),
    escala: ESCALA.toString(),
    margenBps: Number(bps),
    cuando: t.cuando ? t.cuando.toISOString() : null,
    origen: 'open.er-api.com — tasa de referencia diaria, no precio de ejecución',
  };
}

/**
 * Convierte un monto en unidades mínimas de `de` a unidades mínimas de `a`.
 *
 * `tasaEscalada` es obligatoria y viene de `cotizar()`: esta función NO va a
 * buscarla sola a propósito. Quien convierte tiene que haber visto la tasa,
 * su fecha y su margen, y haberlos guardado en el asiento. Una conversión con
 * una tasa que nadie miró es una conversión que nadie puede auditar después.
 */
function convertir(montoMin, de, a, tasaEscalada) {
  const mDe = moneda(de);
  const mA = moneda(a);
  if (!mDe || !mA) throw new Error('moneda desconocida');
  if (!/^\d+$/.test(String(montoMin))) throw new Error('el monto va en unidades mínimas enteras');
  if (!/^\d+$/.test(String(tasaEscalada)) || BigInt(tasaEscalada) <= 0n) {
    throw new Error('sin tasa real no hay conversión');
  }

  const monto = BigInt(montoMin);
  const num = monto * BigInt(tasaEscalada) * 10n ** BigInt(mA.dec);
  const den = 10n ** BigInt(mDe.dec) * ESCALA;
  // Redondeo al más cercano, medio hacia arriba. Explícito porque el redondeo
  // por defecto de una división entera (truncar) siempre favorece a la casa, y
  // eso a lo largo de un millón de operaciones es plata de verdad.
  return ((2n * num + den) / (2n * den)).toString();
}

module.exports = { tasas, cotizar, convertir, ESCALA: ESCALA.toString() };
