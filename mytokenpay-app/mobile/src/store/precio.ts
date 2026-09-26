import { useEffect, useState } from 'react'
import { create } from 'zustand'

// El precio de ORIGEN en USD, leído del oro en vivo.
//
// 1 ORIGEN = 1 gramin = gramo de oro / 55 (decisión de la dirección del
// 26-sep-2026). Fuente principal CoinGecko (pax-gold), respaldo gold-api (XAU),
// con las reglas del oráculo único de la casa (plan SFSP v0.3, C5): caché de
// 30 s y edad máxima de 10 min. Sin dato fresco el precio es null: la pantalla
// enseña «—» y lo que dependa del precio (convertir un menú en USD a ORIGEN)
// se bloquea con un mensaje. Aquí hubo un ORIGEN_USD = 2,35 fijo que se usaba
// como si fuera el precio del día. No persiste: un precio guardado en el
// teléfono de ayer no es un precio.

export const ONZA_EN_GRAMOS = 31.1035
export const GRAMOS_POR_ORIGEN = 55
export const PRECIO_FRESCO_MS = 30_000
export const PRECIO_EDAD_MAX_MS = 10 * 60_000

export const SIN_PRECIO =
  'No hay precio del oro en este momento, así que no se puede calcular el monto en ORIGEN. Intenta de nuevo en un minuto.'

interface PrecioState {
  /** Último gramin leído (USD por ORIGEN), o null. */
  usd: number | null
  /** Cuándo se leyó (ms). */
  en: number
  /** Cuándo se preguntó por última vez a los feeds (ms). */
  pedido: number
  refrescar: () => Promise<void>
}

const PLAZO_MS = 4_000

async function leerJson(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), PLAZO_MS)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

async function onzaDeOro(): Promise<number | null> {
  try {
    const d = (await leerJson('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd')) as
      | { 'pax-gold'?: { usd?: number } }
      | null
    const oz = Number(d?.['pax-gold']?.usd)
    if (oz > 0) return oz
  } catch {}
  try {
    const d = (await leerJson('https://api.gold-api.com/price/XAU')) as { price?: number } | null
    const oz = Number(d?.price)
    if (oz > 0) return oz
  } catch {}
  return null
}

export const usePrecioStore = create<PrecioState>()((set, get) => ({
  usd: null,
  en: 0,
  pedido: 0,
  refrescar: async () => {
    if (Date.now() - get().pedido < PRECIO_FRESCO_MS) return
    set({ pedido: Date.now() })
    const oz = await onzaDeOro()
    if (oz != null) set({ usd: oz / ONZA_EN_GRAMOS / GRAMOS_POR_ORIGEN, en: Date.now() })
  },
}))

/** El gramin si tiene menos de 10 minutos; si no, null. */
export function precioVigente(s: { usd: number | null; en: number }, ahora = Date.now()): number | null {
  return s.usd != null && s.usd > 0 && ahora - s.en < PRECIO_EDAD_MAX_MS ? s.usd : null
}

/**
 * El precio de 1 ORIGEN en USD para una pantalla, o null sin dato fresco.
 * Lo pide al montar y cada minuto, y vuelve a mirar su edad en cada vuelta
 * para que un precio caducado pase a «—» aunque el feed no conteste.
 */
export function useOrigenUsd(): number | null {
  const usd = usePrecioStore((s) => s.usd)
  const en = usePrecioStore((s) => s.en)
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const vuelta = () => {
      setAhora(Date.now())
      void usePrecioStore.getState().refrescar()
    }
    vuelta()
    const id = setInterval(vuelta, 60_000)
    return () => clearInterval(id)
  }, [])
  return precioVigente({ usd, en }, Math.max(ahora, en))
}
