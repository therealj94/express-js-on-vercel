// Bitácora encadenada.
//
// Cada entrada lleva el hash de la anterior. Alterar o borrar una vieja rompe
// todos los hashes posteriores, y `verificarCadena()` señala dónde. No impide
// la manipulación a quien controle la base, pero la hace evidente, que es lo
// que necesita un auditor.
//
// Nunca se anotan contraseñas, tokens ni imágenes.

import { store } from '../store.js'
import { sha256 } from '../lib/cripto.js'
import type { EntradaBitacora } from '../types.js'

const PROHIBIDAS = /contrasena|password|token|imagen|selfie|foto|clave/i

function limpiar(detalle: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(detalle || {})) {
    if (PROHIBIDAS.test(k)) continue
    salida[k] = typeof v === 'string' && v.length > 500 ? v.slice(0, 500) + '…' : v
  }
  return salida
}

export function registrar(actor: string, accion: string, objeto: string, detalle: Record<string, unknown> = {}): EntradaBitacora {
  const lista = store.todo().bitacora
  const anterior = lista.length ? lista[lista.length - 1].hash : 'genesis'
  const entrada: Omit<EntradaBitacora, 'hash'> = {
    n: lista.length + 1,
    hashAnterior: anterior,
    actor,
    accion,
    objeto,
    detalle: limpiar(detalle),
    en: new Date().toISOString(),
  }
  const hash = sha256(JSON.stringify(entrada))
  const completa: EntradaBitacora = { ...entrada, hash }
  lista.push(completa)
  store.guardar()
  return completa
}

export function verificarCadena(): { integra: boolean; rota: number | null } {
  const lista = store.todo().bitacora
  let anterior = 'genesis'
  for (const e of lista) {
    const { hash, ...resto } = e
    if (e.hashAnterior !== anterior || sha256(JSON.stringify(resto)) !== hash) {
      return { integra: false, rota: e.n }
    }
    anterior = hash
  }
  return { integra: true, rota: null }
}

export function listar(pagina = 1, porPagina = 50, q = ''): { entradas: EntradaBitacora[]; total: number } {
  const texto = q.trim().toLowerCase()
  const todas = store.todo().bitacora
  const filtradas = texto
    ? todas.filter((e) => `${e.actor} ${e.accion} ${e.objeto} ${JSON.stringify(e.detalle)}`.toLowerCase().includes(texto))
    : todas
  const desde = Math.max(0, filtradas.length - pagina * porPagina)
  const hasta = Math.max(0, filtradas.length - (pagina - 1) * porPagina)
  return { entradas: filtradas.slice(desde, hasta).reverse(), total: filtradas.length }
}
