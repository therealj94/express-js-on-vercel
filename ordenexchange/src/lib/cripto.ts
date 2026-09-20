// Contraseñas, sesiones y hashes.
//
// El secreto de las sesiones es OBLIGATORIO en producción. Con un secreto de
// desarrollo conocido, cualquiera que lea este archivo firma una sesión a
// nombre de cualquier cuenta y libera sus órdenes. Es preferible que el
// servidor no arranque a que arranque así.

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHash, createHmac, randomBytes, randomInt } from 'crypto'
import { EN_PRODUCCION } from './entorno.js'

if (EN_PRODUCCION && !process.env.ORDENEX_JWT_SECRETO) {
  throw new Error('ORDENEX_JWT_SECRETO es obligatorio en producción: sin él cualquiera puede falsificar sesiones')
}

const SECRETO = process.env.ORDENEX_JWT_SECRETO || 'ordenexchange-desarrollo-cambiame'
const DURACION_SESION = process.env.ORDENEX_SESION || '7d'

export const hashContrasena = (c: string): string => bcrypt.hashSync(c, 10)

/**
 * Hash de una contraseña que nadie tiene. Cuando la cuenta no existe se
 * compara contra este igualmente, para que la respuesta tarde lo mismo que
 * con una cuenta real: si no, el tiempo delata qué correos están registrados.
 */
const HASH_FICTICIO = bcrypt.hashSync(randomBytes(16).toString('hex'), 10)

export const contrasenaCoincide = (c: string, hash: string | null | undefined): boolean => {
  try {
    const ok = bcrypt.compareSync(c, hash || HASH_FICTICIO)
    return Boolean(hash) && ok
  } catch {
    return false
  }
}

/**
 * El instante de emisión va en milisegundos (`emitida`), aparte del `iat` en
 * segundos del estándar: revocar «todo lo anterior a este momento» y emitir
 * el token nuevo pasan en el mismo segundo, y con la precisión del `iat` no
 * se podrían distinguir.
 */
export function firmarSesion(usuarioId: string): string {
  return jwt.sign({ sub: usuarioId, tipo: 'usuario', emitida: Date.now() }, SECRETO, { expiresIn: DURACION_SESION } as jwt.SignOptions)
}

/** Devuelve el usuario y cuándo se emitió, para poder revocar sesiones anteriores a un momento. */
export function leerSesion(token: string): { usuarioId: string; emitidaEn: number } | null {
  try {
    const carga = jwt.verify(token, SECRETO, { algorithms: ['HS256'] }) as { sub?: string; tipo?: string; iat?: number; emitida?: number }
    if (carga.tipo !== 'usuario' || typeof carga.sub !== 'string' || typeof carga.iat !== 'number') return null
    const emitidaEn = typeof carga.emitida === 'number' ? carga.emitida : carga.iat * 1000
    return { usuarioId: carga.sub, emitidaEn }
  } catch {
    return null
  }
}

export const sha256 = (texto: string): string => createHash('sha256').update(texto).digest('hex')
export const hmac = (clave: string, texto: string): string => createHmac('sha256', clave).update(texto).digest('hex')
export const azar = (bytes = 24): string => randomBytes(bytes).toString('base64url')

/** Hash del token de sesión de operador: en el almacén nunca va el token en claro. */
export const hashToken = (token: string): string => sha256(`sesion:${token}`)

/** Código de seis dígitos para confirmar el correo. */
export const codigoNumerico = (): string => String(randomInt(0, 1000000)).padStart(6, '0')

/** Firma corta para URLs que no pueden llevar cabecera (imágenes del chat). */
export const firmaCorta = (texto: string): string => hmac(SECRETO, texto).slice(0, 32)
