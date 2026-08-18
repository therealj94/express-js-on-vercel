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
  createCipheriv,
  createDecipheriv,
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

// ─────────────────────────────────────────────────────────────────────────────
// Cifrado del archivo de documentos
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Las imágenes del documento de identidad se conservan cinco años porque la
 * política publicada lo dice y porque la normativa de prevención de blanqueo lo
 * exige. Pero un montón de fotos de cédulas guardadas en claro es la peor carga
 * que puede tener esta casa: el día que alguien entre en la base, no se filtran
 * correos, se filtra la identidad de gente que confió.
 *
 * Así que se guardan cifradas, y la llave NO vive en la base: viene del entorno.
 * Quien consiga una copia de la base no consigue las caras.
 *
 * AES-256-GCM y no CBC: GCM autentica además de cifrar, así que un texto cifrado
 * manipulado falla al descifrar en vez de devolver basura que parece una imagen.
 */

const SAL_ARCHIVO = 'genesis-id/archivo-documentos/v1'

/* La derivación con scrypt cuesta ~100 ms, así que se hace UNA vez y se guarda.
   Hacerla por imagen convertiría abrir un expediente con dos caras en un cuarto
   de segundo de CPU regalado, y esto se llama desde una pantalla. */
let claveArchivo: Buffer | null | undefined

function clave(): Buffer | null {
  if (claveArchivo !== undefined) return claveArchivo
  const secreto = (process.env.GENESIS_ARCHIVO_CLAVE || '').trim()
  claveArchivo = secreto
    ? scryptSync(secreto.normalize('NFKC'), SAL_ARCHIVO, 32, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p })
    : null
  return claveArchivo
}

/** ¿Hay llave para cifrar el archivo? Si no la hay NO se conserva nada: antes
 *  que guardar documentos de identidad en claro, se borran como hasta ahora. */
export const archivoConfigurado = (): boolean => clave() !== null

/** Solo para las pruebas: olvida la llave derivada para poder cambiarla. */
export function olvidarClaveArchivo(): void { claveArchivo = undefined }

/** `v1.iv.tag.cifrado`, todo en base64. Devuelve null si no hay llave. */
export function cifrar(claro: string): string | null {
  const k = clave()
  if (!k) return null
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const datos = Buffer.concat([c.update(claro, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join('.')
}

/**
 * Descifra. Devuelve null si no hay llave, si el formato no es el esperado o si
 * el contenido fue manipulado.
 *
 * Lo que NO se rechaza es un valor que nunca se cifró: en la base hay imágenes
 * guardadas antes de que existiera el cifrado, y devolverlas tal cual es lo
 * correcto —ya están ahí, negarse a leerlas no las protege y sí deja a un
 * operador sin poder ver el documento que tiene que revisar—. Se distinguen por
 * el prefijo, no por adivinar.
 */
export function descifrar(guardado: string): string | null {
  if (!guardado.startsWith('v1.')) return guardado
  const k = clave()
  if (!k) return null
  const [, ivB64, tagB64, datosB64] = guardado.split('.')
  if (!ivB64 || !tagB64 || !datosB64) return null
  try {
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'))
    d.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([d.update(Buffer.from(datosB64, 'base64')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
