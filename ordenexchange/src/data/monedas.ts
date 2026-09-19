// Ayudantes sobre las monedas del catálogo de países (data/latam.ts).

import { MONEDAS as MONEDAS_LATAM, PAISES, type MonedaPais } from './latam.js'

const USD: MonedaPais = { codigo: 'USD', nombre: 'Dólar estadounidense', nombreEn: 'US dollar', simbolo: '$', decimales: 2 }

/** Todas las monedas, con USD garantizado aunque ningún país del catálogo lo use. */
export const MONEDAS: MonedaPais[] = MONEDAS_LATAM.some((m) => m.codigo === 'USD')
  ? MONEDAS_LATAM
  : [...MONEDAS_LATAM, USD].sort((a, b) => a.codigo.localeCompare(b.codigo))

export function moneda(codigo: string): MonedaPais | undefined {
  return MONEDAS.find((m) => m.codigo === String(codigo || '').toUpperCase())
}

export const monedaValida = (codigo: unknown): boolean => typeof codigo === 'string' && Boolean(moneda(codigo))

export function decimalesMoneda(codigo: string): number {
  return moneda(codigo)?.decimales ?? 2
}

/** País → moneda; lanza si el país no existe. */
export function monedaDePais(iso2: string): MonedaPais | undefined {
  return PAISES.find((p) => p.iso2 === String(iso2 || '').toUpperCase())?.moneda
}
