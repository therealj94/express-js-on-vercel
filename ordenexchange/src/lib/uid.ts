// Identificadores.
//
// Los internos (`usr_…`, `ord_…`) no los teclea nadie. Los números de anuncio y
// de orden sí: van al chat de soporte, se dictan por teléfono, se pegan en
// una apelación. Por eso usan un alfabeto sin I, O, 0 ni 1 —los cuatro
// caracteres que causan casi todos los errores al copiar a mano— y el número
// de orden lleva la fecha, como en Binance, para que se ordene solo.

import { randomInt } from 'crypto'

/** Sin I, O, 0 ni 1. */
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

const bloque = (n: number) =>
  Array.from({ length: n }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')

/** Identificador interno: prefijo + tiempo + azar. Único y ordenable. */
export function id(prefijo: string): string {
  return `${prefijo}_${Date.now().toString(36)}${bloque(10).toLowerCase()}`
}

/** «A-7K2Q9M»: número de anuncio. */
export const numeroAnuncio = () => `A-${bloque(6)}`

/**
 * Número de orden: fecha + 10 caracteres. «20260919-K7QP3M2X4R».
 * Se ve de qué día es y no se confunde con nada más de la plataforma.
 */
export function numeroOrden(fecha = new Date()): string {
  const d = fecha.toISOString().slice(0, 10).replace(/-/g, '')
  return `${d}-${bloque(10)}`
}

/** Token opaco para sesiones de operador. */
export const tokenSesion = () => bloque(48)

/** Contraseña temporal legible, para operadores nuevos. */
export const contrasenaTemporal = () => `${bloque(4)}-${bloque(4)}-${bloque(4)}`

/** GID de demostración, con la forma real de Genesis ID pero prefijo propio. */
export const gidDemo = () => `GEN-${bloque(4)}-${bloque(4)}-D`
