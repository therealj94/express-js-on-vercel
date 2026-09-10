/**
 * Segundo factor para los operadores (RFC 6238, TOTP).
 *
 * POR QUE HACIA FALTA
 *
 * Un operador entraba con correo y contraseña, y con eso podía aprobar
 * identidades, leer las cédulas y los pasaportes de todo el padrón y sacar
 * reportes. Una contraseña reutilizada en otro sitio, o pescada por correo,
 * abría el expediente completo de gente real. Los mitigantes que ya había
 * —bloqueo por intentos, sesiones de ocho horas, permisos por rol— reducen el
 * ruido, pero ninguno detiene a quien tiene la contraseña buena.
 *
 * POR QUE ESCRITO A MANO Y NO CON UNA LIBRERIA
 *
 * TOTP entero son cuarenta líneas de `node:crypto`: un HMAC-SHA1, un truncado y
 * un módulo. Traer una dependencia para eso significa meter en la ruta de
 * autenticación de un sistema que guarda documentos de identidad un paquete que
 * hay que auditar, actualizar y vigilar por si lo secuestran. Cuarenta líneas
 * que se leen de una sentada valen más acá que un `npm install`.
 *
 * Está comprobado contra los vectores de prueba del propio RFC 6238, que es la
 * única forma seria de decir que una implementación de criptografía es correcta.
 *
 * SHA-1 NO ES UN DESCUIDO. El RFC 6238 lo fija como el algoritmo por defecto y
 * es el único que aceptan todas las aplicaciones de autenticación (Google
 * Authenticator, Authy, 1Password). Acá no se usa por su resistencia a
 * colisiones, sino dentro de un HMAC con una llave secreta, que es un uso que
 * sigue siendo sólido. Cambiarlo por SHA-256 rompería la compatibilidad con los
 * teléfonos de los operadores sin ganar nada real.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/** Alfabeto base32 del RFC 4648. Es el que leen las aplicaciones del teléfono. */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Cada cuánto cambia el código. Treinta segundos es lo que espera todo el mundo. */
export const PASO_S = 30

/** Dígitos del código. Seis, como cualquier aplicación de autenticación. */
const DIGITOS = 6

// ─────────────────────────────────────────────────────────────────────────────
// Base32
// ─────────────────────────────────────────────────────────────────────────────

export function aBase32(datos: Buffer): string {
  let bits = 0, valor = 0, salida = ''
  for (const byte of datos) {
    valor = (valor << 8) | byte
    bits += 8
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31]
  return salida
}

export function deBase32(texto: string): Buffer {
  // Se acepta con espacios y en minúsculas: la gente copia el secreto a mano.
  const limpio = String(texto || '').toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0, valor = 0
  const salida: number[] = []
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c)
    if (i < 0) throw new Error('El secreto no está en base32')
    valor = (valor << 5) | i
    bits += 5
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(salida)
}

// ─────────────────────────────────────────────────────────────────────────────
// El código
// ─────────────────────────────────────────────────────────────────────────────

/** Un secreto nuevo. 20 bytes es lo que recomienda el RFC 4226 para SHA-1. */
export const generarSecreto = (): string => aBase32(randomBytes(20))

/** El paso de tiempo en el que estamos. */
export const pasoDe = (ms = Date.now()): number => Math.floor(ms / 1000 / PASO_S)

/**
 * El código de un paso concreto.
 *
 * `digitos` solo se mueve en las pruebas: los vectores del RFC 6238 vienen a
 * ocho dígitos y hay que poder compararlos tal cual.
 */
export function codigo(secreto: string, paso: number, digitos = DIGITOS): string {
  const llave = deBase32(secreto)

  // El contador va como entero de 8 bytes, big-endian. `writeBigUInt64BE` evita
  // el clásico desbordamiento de hacerlo con enteros de 32 bits.
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(paso))

  const h = createHmac('sha1', llave).update(contador).digest()

  // Truncado dinámico del RFC 4226: los cuatro bits bajos del último byte dicen
  // desde dónde leer, y el bit alto se descarta para que el número no salga
  // negativo al interpretarlo con signo.
  const desde = h[h.length - 1] & 0x0f
  const numero = ((h[desde] & 0x7f) << 24) | (h[desde + 1] << 16) |
    (h[desde + 2] << 8) | h[desde + 3]

  return String(numero % 10 ** digitos).padStart(digitos, '0')
}

/**
 * ¿Es válido este código?
 *
 * Devuelve el paso en el que cuadró, o `null`. Devolver el paso y no un simple
 * `true` es lo que permite rechazar el mismo código dos veces: quien lo mira
 * por encima del hombro tiene treinta segundos para reutilizarlo, y sin esto
 * los aprovecha.
 *
 * `ventana: 1` acepta el paso anterior y el siguiente. Es lo normal, y hace
 * falta: el reloj del teléfono del operador nunca va exactamente igual que el
 * del servidor, y sin holgura la mitad de los intentos fallarían sin motivo.
 */
export function verificar(
  secreto: string,
  entregado: string,
  opciones: { ventana?: number; ahoraMs?: number } = {},
): number | null {
  const { ventana = 1, ahoraMs = Date.now() } = opciones
  const limpio = String(entregado || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(limpio)) return null

  const ahora = pasoDe(ahoraMs)
  for (let d = -ventana; d <= ventana; d++) {
    const esperado = codigo(secreto, ahora + d)
    // En tiempo constante. Los dos tienen siempre seis dígitos, así que la
    // comparación de longitud de arriba ya garantiza que no lance.
    if (timingSafeEqual(Buffer.from(esperado), Buffer.from(limpio))) return ahora + d
  }
  return null
}

/**
 * La dirección `otpauth://` que se convierte en código QR.
 *
 * El emisor y la cuenta son lo que el operador ve en su teléfono. Si los dos
 * salen vacíos acaba con seis entradas llamadas «Cuenta» y no sabe cuál es.
 */
export function uriOtpauth(secreto: string, cuenta: string, emisor = 'Genesis ID'): string {
  const e = encodeURIComponent(emisor)
  const c = encodeURIComponent(cuenta)
  return `otpauth://totp/${e}:${c}?secret=${secreto}&issuer=${e}` +
    `&algorithm=SHA1&digits=${DIGITOS}&period=${PASO_S}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Códigos de recuperación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Diez códigos de un solo uso, para cuando se pierde el teléfono.
 *
 * Sin esto, un operador que cambia de móvil se queda fuera y hay que quitarle
 * el segundo factor a mano desde la base, que es exactamente el agujero que el
 * segundo factor venía a cerrar.
 *
 * Se devuelven en claro UNA sola vez —quien los pide tiene que apuntarlos en
 * ese momento— y se guardan hasheados, igual que una contraseña.
 */
export function generarCodigosRespaldo(cuantos = 10): string[] {
  return Array.from({ length: cuantos }, () => {
    const bruto = randomBytes(5).toString('hex').toUpperCase() // 10 caracteres
    return `${bruto.slice(0, 5)}-${bruto.slice(5)}`
  })
}

/** Normaliza para comparar: la gente los escribe con o sin guion, en minúsculas. */
export const normalizarRespaldo = (c: string): string =>
  String(c || '').toUpperCase().replace(/[^0-9A-F]/g, '')
