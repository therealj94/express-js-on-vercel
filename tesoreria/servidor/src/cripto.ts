// Primitivas criptográficas de la Tesorería. Todo sale de node:crypto, igual
// que en Genesis ID: un servidor que decide cuánto dinero existe es el último
// sitio donde conviene arrastrar paquetes de terceros que nadie audita.

import {
  createHash, randomBytes, scryptSync, timingSafeEqual,
  generateKeyPairSync, sign as firmarBytes, verify as verificarBytes, createPrivateKey, createPublicKey,
} from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Contraseñas (scrypt, parámetros interactivos del RFC 7914)
// ─────────────────────────────────────────────────────────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1 }

export function hashContrasena(clara: string): string {
  const sal = randomBytes(16)
  const hash = scryptSync(clara.normalize('NFKC'), sal, 64, SCRYPT)
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64'), hash.toString('base64')].join('$')
}

/** Comparación en tiempo constante: el tiempo de respuesta no debe revelar cuántos bytes coinciden. */
export function verificarContrasena(clara: string, guardado: string): boolean {
  try {
    const [algo, n, r, p, salB64, hashB64] = guardado.split('$')
    if (algo !== 'scrypt') return false
    const esperado = Buffer.from(hashB64, 'base64')
    const calculado = scryptSync(clara.normalize('NFKC'), Buffer.from(salB64, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) })
    return timingSafeEqual(esperado, calculado)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Libro sellado
// ─────────────────────────────────────────────────────────────────────────────

/** SHA-256 en hexadecimal mayúsculas. Es el `hash` que reciben las reglas en el servidor. */
export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex').toUpperCase()

export const azar = (bytes = 16): string => randomBytes(bytes).toString('base64url')

// ─────────────────────────────────────────────────────────────────────────────
// Firmas del Consejo (Ed25519)
// ─────────────────────────────────────────────────────────────────────────────
//
// Cada consejero tiene un par de llaves. La firma de una solicitud es la firma
// Ed25519 del texto canónico de esa solicitud (id, token, cantidad, precio,
// respaldo pedido y fecha): nada que pueda cambiar después. Cualquiera con la
// llave pública puede verificar que ESE consejero firmó ESA solicitud.
//
// CUSTODIA: hoy la llave privada la guarda el servidor, cifrada en el almacén,
// y solo la usa cuando el consejero tiene sesión abierta. Es el mismo modelo de
// confianza que una firma electrónica avanzada custodiada. El paso siguiente es
// llevar la llave al dispositivo del consejero (WebAuthn / llave de hardware);
// el formato de la firma no cambia, solo quién la produce.

export function generarLlaves(): { clavePublica: string; clavePrivada: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    clavePublica: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    clavePrivada: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url'),
  }
}

export function firmar(clavePrivada: string, texto: string): string {
  const llave = createPrivateKey({ key: Buffer.from(clavePrivada, 'base64url'), type: 'pkcs8', format: 'der' })
  return firmarBytes(null, Buffer.from(texto), llave).toString('base64url')
}

export function verificarFirma(clavePublica: string, texto: string, firma: string): boolean {
  try {
    const llave = createPublicKey({ key: Buffer.from(clavePublica, 'base64url'), type: 'spki', format: 'der' })
    return verificarBytes(null, Buffer.from(texto), llave, Buffer.from(firma, 'base64url'))
  } catch {
    return false
  }
}
