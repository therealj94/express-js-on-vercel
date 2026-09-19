// Los activos que se cambian en OrdenExchange.
//
// Los contratos son los mismos que Genesis ID tiene comprobados contra la
// cadena 5550 (genesis-id/src/directorio/monedas.ts). ORIGEN es la moneda
// nativa: no tiene contrato.
//
// 1 ORIGEN = 1 gramín = 1/55 de gramo de oro en bóveda. 1 AUKA = 1 onza troy
// de oro. 1 AGKA = 1 onza troy de plata. De ahí sale el precio de referencia.

import type { Activo, DefinicionActivo } from '../types.js'

const GRAMOS_POR_ONZA_TROY = 31.1034768

export const ACTIVOS: DefinicionActivo[] = [
  {
    simbolo: 'ORIGEN', nombre: 'Origen', decimales: 8, contrato: null, decimalesCadena: 18,
    ancla: 'oro', onzasPorUnidad: (1 / 55) / GRAMOS_POR_ONZA_TROY,
  },
  {
    simbolo: 'AUKA', nombre: 'Gold Kapital', decimales: 8,
    contrato: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B', decimalesCadena: 18,
    ancla: 'oro', onzasPorUnidad: 1,
  },
  {
    simbolo: 'AGKA', nombre: 'AGKA Token', decimales: 8,
    contrato: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B', decimalesCadena: 18,
    ancla: 'plata', onzasPorUnidad: 1,
  },
]

export const SIMBOLOS: Activo[] = ACTIVOS.map((a) => a.simbolo)

export function activo(simbolo: string): DefinicionActivo | undefined {
  return ACTIVOS.find((a) => a.simbolo === String(simbolo || '').toUpperCase())
}

export const esActivo = (s: unknown): s is Activo => typeof s === 'string' && SIMBOLOS.includes(s.toUpperCase() as Activo)
