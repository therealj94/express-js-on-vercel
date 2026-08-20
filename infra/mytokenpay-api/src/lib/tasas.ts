// ─────────────────────────────────────────────────────────────────────────────
// Cuántos lempiras vale un ORIGEN.
//
// ORIGEN se ancla al oro: un ORIGEN es un «gramín», la cincuentaicincoava parte
// de un gramo. Así que el precio sale de una cadena de tres pasos que cualquiera
// puede rehacer con una calculadora:
//
//     onza de oro (USD)  ÷ 31,1035  =  gramo de oro (USD)
//     gramo de oro (USD) ÷ 55       =  1 ORIGEN (USD)
//     1 ORIGEN (USD)     × USD/HNL  =  1 ORIGEN (HNL)
//
// El precio del oro se lee del mercado, no lo fijamos nosotros. Eso importa: el
// día que alguien pregunte por qué su almuerzo costó lo que costó, la respuesta
// es una cotización pública y no una decisión de la casa.
// ─────────────────────────────────────────────────────────────────────────────

const GRAMOS_POR_ONZA = 31.1035
const GRAMINES_POR_GRAMO = 55

/** Cuánto se puede reutilizar una cotización antes de volver a pedirla. */
const VIGENCIA_MS = 5 * 60 * 1000

export interface Cotizacion {
  onzaOroUsd: number
  usdPorOrigen: number
  hnlPorUsd: number
  hnlPorOrigen: number
  leidaEn: string
  /** De dónde salió. Se enseña al usuario: un precio sin origen no es un precio. */
  fuente: string
}

let cache: Cotizacion | null = null
let cacheEn = 0

/**
 * Tipo de cambio dólar-lempira.
 *
 * Va por variable de entorno a propósito. Es un dato que cambia despacio y que
 * la organización debe poder fijar —normalmente al valor del banco central—
 * en vez de heredarlo de una fuente cualquiera de internet que un día devuelva
 * otra cosa y descuadre todos los cobros del día.
 */
function hnlPorUsd(): number {
  const v = Number(process.env.HNL_POR_USD)
  return Number.isFinite(v) && v > 0 ? v : 26.2
}

async function leerOnzaOro(): Promise<{ precio: number; fuente: string }> {
  const intentos: Array<{ url: string; extraer: (d: any) => number; fuente: string }> = [
    {
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd',
      extraer: (d) => Number(d?.['pax-gold']?.usd),
      fuente: 'CoinGecko · PAX Gold',
    },
    {
      url: 'https://api.gold-api.com/price/XAU',
      extraer: (d) => Number(d?.price),
      fuente: 'gold-api.com · XAU',
    },
  ]

  for (const intento of intentos) {
    try {
      const r = await fetch(intento.url, { signal: AbortSignal.timeout(6000) })
      if (!r.ok) continue
      const precio = intento.extraer(await r.json())
      if (Number.isFinite(precio) && precio > 0) return { precio, fuente: intento.fuente }
    } catch {
      // Se prueba la siguiente fuente.
    }
  }

  throw new Error('No se pudo leer el precio del oro en ninguna fuente')
}

/**
 * Cotización vigente.
 *
 * Si ninguna fuente responde LANZA en vez de devolver un número inventado. Un
 * cobro calculado con una tasa falsa es peor que un cobro que no se puede
 * crear: el segundo se nota en el acto, el primero se descubre al cuadrar caja.
 */
export async function cotizacion(): Promise<Cotizacion> {
  if (cache && Date.now() - cacheEn < VIGENCIA_MS) return cache

  const { precio, fuente } = await leerOnzaOro()
  const usdPorOrigen = precio / GRAMOS_POR_ONZA / GRAMINES_POR_GRAMO
  const cambio = hnlPorUsd()

  cache = {
    onzaOroUsd: precio,
    usdPorOrigen,
    hnlPorUsd: cambio,
    hnlPorOrigen: usdPorOrigen * cambio,
    leidaEn: new Date().toISOString(),
    fuente,
  }
  cacheEn = Date.now()
  return cache
}

/** Redondeo a seis decimales, que es la precisión con la que se guarda ORIGEN. */
export function aOrigen(montoHnl: number, hnlPorOrigen: number): number {
  return Math.round((montoHnl / hnlPorOrigen) * 1e6) / 1e6
}

export function aHnl(montoOrigen: number, hnlPorOrigen: number): number {
  return Math.round(montoOrigen * hnlPorOrigen * 100) / 100
}
