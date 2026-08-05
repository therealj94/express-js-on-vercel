// Primitivas criptográficas de Genesis ID.
//
// Todo sale de `node:crypto`. No se añade ninguna dependencia: un motor de
// identidad es justamente donde menos conviene arrastrar paquetes de terceros
// que nadie audita.

import {
  createHmac,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Contraseñas de los operadores
// ─────────────────────────────────────────────────────────────────────────────

// scrypt con los parámetros que recomienda el RFC 7914 para uso interactivo.
// N=16384 tarda ~100 ms por intento, que es imperceptible para quien entra al
// panel y carísimo para quien intenta probar millones de contraseñas.
const SCRYPT_N = 16384
const SCRYPT_r = 8
const SCRYPT_p = 1
const LARGO_CLAVE = 64

/** Devuelve `scrypt$N$r$p$sal$hash`, todo lo necesario para verificar después. */
export function hashContrasena(clara: string): string {
  const sal = randomBytes(16)
  const hash = scryptSync(clara.normalize('NFKC'), sal, LARGO_CLAVE, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_r,
    SCRYPT_p,
    sal.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

/**
 * Comprueba una contraseña contra su hash.
 *
 * La comparación es en tiempo constante. Con `===` el tiempo de respuesta
 * depende de cuántos bytes coinciden al principio, y eso, medido muchas veces,
 * deja adivinar el hash byte a byte.
 */
export function verificarContrasena(clara: string, guardado: string): boolean {
  try {
    const [algo, n, r, p, salB64, hashB64] = guardado.split('$')
    if (algo !== 'scrypt') return false
    const sal = Buffer.from(salB64, 'base64')
    const esperado = Buffer.from(hashB64, 'base64')
    const calculado = scryptSync(clara.normalize('NFKC'), sal, esperado.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
    return timingSafeEqual(esperado, calculado)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens firmados (el GID que usan las apps del ecosistema)
// ─────────────────────────────────────────────────────────────────────────────

const b64url = (b: Buffer) => b.toString('base64url')
const deB64url = (s: string) => Buffer.from(s, 'base64url')

export interface Reclamos {
  /** A quién identifica: el UID de Genesis (GEN-…). */
  sub: string
  /** Para qué aplicación se emitió. */
  app: string
  /** Permisos concedidos. */
  alcances: string[]
  /** Emitido en / expira en, en segundos desde la época. */
  iat: number
  exp: number
  [extra: string]: unknown
}

/**
 * Firma un token compacto de tres partes, al estilo JWT con HMAC-SHA256.
 *
 * Se implementa a mano y no con una librería porque son treinta líneas y así
 * queda explícito lo único que importa de verdad: que la verificación NO se
 * fía del campo `alg` del propio token. Aceptar `alg` del token es el fallo
 * clásico de las librerías de JWT — quien manda el token elige `alg: none` y
 * entra sin firma.
 */
export function firmarToken(reclamos: Reclamos, secreto: string): string {
  const cabecera = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'GID' })))
  const cuerpo = b64url(Buffer.from(JSON.stringify(reclamos)))
  const firma = createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest()
  return `${cabecera}.${cuerpo}.${b64url(firma)}`
}

/** Devuelve los reclamos si la firma es válida y no expiró; si no, `null`. */
export function verificarToken(token: string, secreto: string): Reclamos | null {
  const partes = String(token || '').split('.')
  if (partes.length !== 3) return null
  const [cabecera, cuerpo, firma] = partes

  // El algoritmo lo decide el servidor, nunca el token.
  const esperada = createHmac('sha256', secreto).update(`${cabecera}.${cuerpo}`).digest()
  const recibida = deB64url(firma)
  if (recibida.length !== esperada.length) return null
  if (!timingSafeEqual(recibida, esperada)) return null

  try {
    const reclamos = JSON.parse(deB64url(cuerpo).toString()) as Reclamos
    if (typeof reclamos.exp !== 'number') return null
    if (reclamos.exp <= Math.floor(Date.now() / 1000)) return null
    return reclamos
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claves de API de las aplicaciones del ecosistema
// ─────────────────────────────────────────────────────────────────────────────

/** `gid_live_…`. Se muestra UNA sola vez; de ella solo se guarda el hash. */
export function generarClaveApi(entorno: 'live' | 'test' = 'live'): string {
  return `gid_${entorno}_${randomBytes(24).toString('base64url')}`
}

/**
 * Hash de una clave de API.
 *
 * Aquí sí basta SHA-256 y no hace falta scrypt: la clave la generamos nosotros
 * con 24 bytes al azar, así que no hay nada que adivinar por fuerza bruta. El
 * costo alto de scrypt solo tiene sentido contra contraseñas que eligen
 * personas, que son adivinables.
 */
export const hashClaveApi = (clave: string): string =>
  createHash('sha256').update(clave).digest('hex')

export function mismaClave(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

// ─────────────────────────────────────────────────────────────────────────────
// Bitácora encadenada
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eslabón de la cadena: hash del contenido más el hash del eslabón anterior.
 *
 * Así, alterar o borrar una entrada vieja rompe todos los hashes posteriores.
 * No impide que alguien con acceso a la base la modifique, pero sí que lo haga
 * sin dejar rastro, que es lo que exige una auditoría.
 */
export function eslabon(anterior: string, contenido: unknown): string {
  return createHash('sha256')
    .update(anterior)
    .update(JSON.stringify(contenido))
    .digest('hex')
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')

export const azar = (bytes = 16): string => randomBytes(bytes).toString('base64url')
