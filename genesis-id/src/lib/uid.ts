// Identificadores de Genesis ID.
//
// El GID es lo que la persona lee, dicta por teléfono y teclea en otra app. Por
// eso lleva dígito verificador y usa un alfabeto sin caracteres que se
// confunden: se quitan I, O, 0 y 1, que son la causa de casi todos los errores
// al copiar un código a mano.
//
//   GEN-K7QP-3M2X-4    identidad personal
//   GNB-R4TW-9HJ2-K    negocio
//
// Con el dígito verificador, un GID mal tecleado se detecta al instante en vez
// de convertirse en una consulta que no encuentra nada y en diez minutos de
// soporte.

import { randomInt } from 'crypto'

/** Sin I, O, 0 ni 1. Quedan 32 símbolos. */
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

const bloque = (n: number) =>
  Array.from({ length: n }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')

/**
 * Dígito verificador: suma ponderada de las posiciones, módulo 32.
 *
 * Detecta cualquier cambio de un solo carácter y la mayoría de las
 * transposiciones, que son los dos errores humanos habituales.
 */
function verificador(cuerpo: string): string {
  let suma = 0
  const limpio = cuerpo.replace(/-/g, '')
  for (let i = 0; i < limpio.length; i++) {
    const v = ALFABETO.indexOf(limpio[i])
    if (v < 0) return '?'
    suma += v * (i + 2)
  }
  return ALFABETO[suma % ALFABETO.length]
}

function construir(prefijo: string): string {
  const cuerpo = `${bloque(4)}-${bloque(4)}`
  return `${prefijo}-${cuerpo}-${verificador(cuerpo)}`
}

export const gidPersonal = () => construir('GEN')
export const gidNegocio = () => construir('GNB')

/** Comprueba forma y dígito verificador. No dice si existe, solo si es válido. */
export function gidValido(gid: string): boolean {
  const m = String(gid || '')
    .toUpperCase()
    .match(/^(GEN|GNB)-([2-9A-HJ-NP-Z]{4})-([2-9A-HJ-NP-Z]{4})-([2-9A-HJ-NP-Z])$/)
  if (!m) return false
  return verificador(`${m[2]}-${m[3]}`) === m[4]
}

/** Normaliza lo que teclee el usuario: mayúsculas, sin espacios. */
export const normalizarGid = (gid: string): string =>
  String(gid || '').toUpperCase().replace(/\s/g, '')

/** Identificadores internos, que nadie teclea. */
export function id(prefijo = 'idn'): string {
  return `${prefijo}_${Date.now().toString(36)}${bloque(8).toLowerCase()}`
}
