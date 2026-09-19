// Precios de referencia.
//
// El activo está anclado al metal: 1 ORIGEN es 1/55 de gramo de oro, 1 AUKA
// una onza de oro, 1 AGKA una onza de plata. Con el precio del metal en USD
// y la tasa USD→moneda local sale el precio de referencia en cada moneda, que
// es el «precio de mercado» que enseña el frontend y sobre el que trabajan los
// anuncios de precio flotante.
//
// El metal y las tasas los fija un operador desde el panel (o las variables
// de entorno al arrancar). Un precio de oro en cero no es un precio: mientras
// esté así, la referencia no existe y los anuncios flotantes no se pueden
// publicar. Es preferible que falte a que sea inventado.

import { store } from '../store.js'
import { ACTIVOS, activo as defActivo } from '../data/activos.js'
import { FX_SEMILLA } from '../data/fxSemilla.js'
import { MONEDAS, decimalesMoneda } from '../data/monedas.js'
import { Dec } from '../lib/decimal.js'
import { malaPeticion } from '../lib/errores.js'
import { registrar } from './bitacora.js'
import type { Activo, Precios } from '../types.js'

export function precios(): Precios {
  return store.todo().precios
}

/**
 * Deja los precios utilizables al arrancar: las tasas que falten se toman de
 * la semilla del código y el metal de las variables de entorno. Lo que un
 * operador haya fijado a mano no se pisa.
 */
export function prepararPrecios(): void {
  const p = store.todo().precios
  let cambio = false
  for (const m of MONEDAS) {
    if (!(m.codigo in p.fx) && FX_SEMILLA.usd[m.codigo]) {
      p.fx[m.codigo] = FX_SEMILLA.usd[m.codigo]
      cambio = true
    }
  }
  p.fx.USD = 1
  const oroEnv = Number(process.env.ORDENEX_ORO_USD_ONZA || 0)
  const plataEnv = Number(process.env.ORDENEX_PLATA_USD_ONZA || 0)
  if (!p.oroUsdOnza && oroEnv > 0) { p.oroUsdOnza = oroEnv; p.fuente = 'env'; cambio = true }
  if (!p.plataUsdOnza && plataEnv > 0) { p.plataUsdOnza = plataEnv; p.fuente = 'env'; cambio = true }
  if (cambio) {
    if (p.actualizadoEn === new Date(0).toISOString()) p.actualizadoEn = FX_SEMILLA.fecha
    store.guardar()
  }
}

export const hayPrecioMetal = (a: Activo): boolean => {
  const d = defActivo(a)!
  const p = precios()
  return d.ancla === 'oro' ? p.oroUsdOnza > 0 : p.plataUsdOnza > 0
}

/** Precio de referencia de una unidad del activo en USD, o null si no hay metal. */
export function referenciaUsd(a: Activo): number | null {
  const d = defActivo(a)
  if (!d) return null
  const p = precios()
  const metal = d.ancla === 'oro' ? p.oroUsdOnza : p.plataUsdOnza
  if (!(metal > 0)) return null
  return metal * d.onzasPorUnidad
}

export function tasa(moneda: string): number | null {
  const m = String(moneda || '').toUpperCase()
  if (m === 'USD') return 1
  const t = precios().fx[m]
  return t > 0 ? t : null
}

/** Precio de referencia en moneda local, redondeado a los decimales de esa moneda + 2 (para que el margen tenga con qué trabajar). */
export function referenciaFiat(a: Activo, moneda: string): string | null {
  const usd = referenciaUsd(a)
  const t = tasa(moneda)
  if (usd == null || t == null) return null
  return Dec.redondear(Dec.deNumero(usd * t, 12), decimalesMoneda(moneda) + 2)
}

/** Precio efectivo de un anuncio flotante: referencia × margen / 100. */
export function precioFlotante(a: Activo, moneda: string, margen: number): string | null {
  const ref = referenciaFiat(a, moneda)
  if (ref == null) return null
  return Dec.redondear(Dec.multiplicar(ref, Dec.deNumero(margen / 100, 8)), decimalesMoneda(moneda) + 2)
}

/** Cuánto vale en USD un monto en moneda local; null sin tasa. */
export function aUsd(monto: string, moneda: string): number | null {
  const t = tasa(moneda)
  if (t == null) return null
  return Dec.aNumero(monto) / t
}

export function resumenPrecios(moneda: string) {
  const p = precios()
  const m = String(moneda || 'USD').toUpperCase()
  const referencia: Record<string, { usd: string | null; fiat: string | null }> = {}
  for (const a of ACTIVOS) {
    const usd = referenciaUsd(a.simbolo)
    referencia[a.simbolo] = {
      usd: usd == null ? null : Dec.redondear(Dec.deNumero(usd, 12), 6),
      fiat: referenciaFiat(a.simbolo, m),
    }
  }
  return {
    moneda: m,
    oroUsdOnza: p.oroUsdOnza,
    plataUsdOnza: p.plataUsdOnza,
    fx: tasa(m),
    referencia,
    actualizadoEn: p.actualizadoEn,
    fuente: p.fuente,
  }
}

export function actualizarPrecios(
  entrada: { oroUsdOnza?: unknown; plataUsdOnza?: unknown; fx?: unknown },
  actor: string,
): Precios {
  const p = store.todo().precios
  const cambios: Record<string, unknown> = {}
  if (entrada.oroUsdOnza !== undefined) {
    const v = Number(entrada.oroUsdOnza)
    if (!(v > 0) || v > 1_000_000) throw malaPeticion('El precio del oro tiene que ser un número mayor que cero')
    p.oroUsdOnza = v
    cambios.oroUsdOnza = v
  }
  if (entrada.plataUsdOnza !== undefined) {
    const v = Number(entrada.plataUsdOnza)
    if (!(v > 0) || v > 1_000_000) throw malaPeticion('El precio de la plata tiene que ser un número mayor que cero')
    p.plataUsdOnza = v
    cambios.plataUsdOnza = v
  }
  if (entrada.fx !== undefined) {
    if (!entrada.fx || typeof entrada.fx !== 'object') throw malaPeticion('fx tiene que ser un objeto { MONEDA: tasa }')
    const fx: Record<string, number> = {}
    for (const [k, v] of Object.entries(entrada.fx as Record<string, unknown>)) {
      const codigo = k.toUpperCase()
      const n = Number(v)
      if (!MONEDAS.some((m) => m.codigo === codigo) && codigo !== 'USD') throw malaPeticion(`Moneda desconocida: ${codigo}`)
      if (!(n > 0) || !Number.isFinite(n)) throw malaPeticion(`Tasa inválida para ${codigo}`)
      fx[codigo] = n
    }
    Object.assign(p.fx, fx)
    p.fx.USD = 1
    cambios.fx = fx
  }
  if (!Object.keys(cambios).length) throw malaPeticion('No hay nada que actualizar')
  p.actualizadoEn = new Date().toISOString()
  p.fuente = 'manual'
  p.actualizadoPor = actor
  registrar(actor, 'precios.actualizados', 'precios', cambios)
  store.guardar()
  return p
}
