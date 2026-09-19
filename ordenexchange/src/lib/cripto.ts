// Contraseñas, sesiones y hashes.
//
// El secreto de las sesiones es OBLIGATORIO en producción. Con un secreto de
// desarrollo conocido, cualquiera que lea este archivo firma una sesión a
// nombre de cualquier cuenta y libera sus órdenes. Es preferible que el
// servidor no arranque a que arranque así.

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHash, createHmac, randomBytes } from 'crypto'

const EN_PRODUCCION = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) || Boolean(process.env.RENDER)

if (EN_PRODUCCION && !process.env.ORDENEX_JWT_SECRETO) {
  throw new Error('ORDENEX_JWT_SECRETO es obligatorio en producción: sin él cualquiera puede falsificar sesiones')
}

const SECRETO = process.env.ORDENEX_JWT_SECRETO || 'ordenexchange-desarrollo-cambiame'
const DURACION_SESION = process.env.ORDENEX_SESION || '30d'

export const hashContrasena = (c: string): string => bcrypt.hashSync(c, 10)
export const contrasenaCoincide = (c: string, hash: string): boolean => {
  try { return bcrypt.compareSync(c, hash) } catch { return false }
}

export function firmarSesion(usuarioId: string): string {
  return jwt.sign({ sub: usuarioId, tipo: 'usuario' }, SECRETO, { expiresIn: DURACION_SESION } as jwt.SignOptions)
}

export function leerSesion(token: string): string | null {
  try {
    const carga = jwt.verify(token, SECRETO, { algorithms: ['HS256'] }) as { sub?: string; tipo?: string }
    return carga.tipo === 'usuario' && typeof carga.sub === 'string' ? carga.sub : null
  } catch {
    return null
  }
}

export const sha256 = (texto: string): string => createHash('sha256').update(texto).digest('hex')
export const hmac = (clave: string, texto: string): string => createHmac('sha256', clave).update(texto).digest('hex')
export const azar = (bytes = 24): string => randomBytes(bytes).toString('base64url')

/** Hash del token de sesión de operador: en el almacén nunca va el token en claro. */
export const hashToken = (token: string): string => sha256(`sesion:${token}`)
