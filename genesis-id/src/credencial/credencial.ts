/**
 * La credencial que se lleva la persona.
 *
 * ── QUE CAMBIA ─────────────────────────────────────────────────────────────
 *
 * Hoy, para saber si alguien está verificado hay que PREGUNTARNOS. Eso tiene
 * tres consecuencias que no se ven hasta que se enumeran:
 *
 *   - Genesis ID se entera de cada sitio donde esa persona se identifica. Nadie
 *     pidió ese poder y no hace falta para nada.
 *   - Si este servicio está caído, nadie puede identificarse en ninguna parte.
 *   - Y quien quiera aceptar identidades de Orden Global tiene que integrarse
 *     con nosotros primero. Es una barrera para ellos y un cuello para nosotros.
 *
 * Una credencial firmada que la persona guarda y enseña quita las tres. Quien
 * la recibe la comprueba solo, sin llamarnos, sin permiso y sin avisar a nadie.
 *
 * ── POR QUE SE FIRMA COMO FIRMA UNA BILLETERA, Y NO CON UN FORMATO PROPIO ──
 *
 * Se usa secp256k1 con keccak y el sobre del EIP-191 —exactamente lo que hace
 * `personal_sign`— y no un formato de credencial verificable de los que están
 * de moda. El motivo es práctico y pesa más que la elegancia:
 *
 *     `ethers.verifyMessage(mensaje, firma)` la comprueba, y devuelve una
 *     dirección. MetaMask la comprueba. Cualquier explorador de bloques la
 *     comprueba. Un contrato la comprueba con `ecrecover`, que es una función
 *     que ya está dentro de la máquina virtual.
 *
 * O sea: cero código nuestro en el lado del que verifica. Con un formato propio
 * —por bueno que fuera— habría que publicar una librería, mantenerla, y
 * convencer a cada integrador de instalarla. Con este, ya está instalada en
 * todas partes desde hace años.
 *
 * ── DONDE SE COMPRUEBA QUE LA FIRMA ES NUESTRA ─────────────────────────────
 *
 * Recuperar la dirección es fácil; lo difícil es saber si ESA dirección es la
 * de Genesis ID. Si la respuesta hay que pedírnosla, no hemos quitado la
 * llamada: solo la hemos movido.
 *
 * Por eso la dirección del emisor se publica EN LA CADENA 5550, escrita desde
 * la dirección del ancla. Quien verifica la lee de ahí y ya no depende de
 * nosotros para nada.
 *
 * ── LA LLAVE DE FIRMAR NO ES LA DEL ANCLA ──────────────────────────────────
 *
 * Son dos llaves y a propósito. La del ancla manda transacciones: tiene que
 * estar en el servidor, con gas, y se usa a diario. La de firmar credenciales
 * no toca la cadena nunca —solo firma texto— así que puede vivir más resguardada
 * y rotarse sin mover un centavo. Juntarlas sería darle a la llave que más se
 * usa el poder de emitir identidades.
 *
 * ── LO QUE NO RESUELVE, Y HAY QUE DECIRLO ──────────────────────────────────
 *
 * Una credencial firmada no se puede retirar del bolsillo de nadie. Contra eso
 * hay dos cosas, y ninguna es perfecta:
 *
 *   - VENCE. Noventa días por defecto. Es el único mecanismo que funciona sin
 *     conexión, y es la razón de que el plazo sea corto.
 *   - La lista de REVOCADAS se publica en la cadena. Quien quiera estar al día
 *     la lee de ahí —de la cadena, no de nosotros.
 *
 * Entre que se suspende a alguien y que la lista se publica hay una ventana. Es
 * real, se mide en horas, y por eso está escrita aquí en vez de en una nota al
 * pie de un contrato.
 */

import { createHash } from 'crypto'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import type { Identidad } from '../types.js'

const deHex = (s: string) => Uint8Array.from(Buffer.from(s.replace(/^0x/, ''), 'hex'))
const hex = (b: Uint8Array) => '0x' + Buffer.from(b).toString('hex')

/** Los atributos que se pueden pedir. Cada uno con lo que revela de verdad. */
export const ATRIBUTOS = {
  verificada: 'Que Genesis ID verificó a esta persona. Es el único que va siempre.',
  mayorDeEdad: 'Si tiene 18 o más. NO revela la fecha de nacimiento.',
  nacionalidad: 'El país del documento, en dos letras.',
  nombre: 'El nombre legal, tal y como sale en el documento.',
  nivelRiesgo: 'La clasificación de riesgo de cumplimiento.',
} as const

export type Atributo = keyof typeof ATRIBUTOS

export interface Credencial {
  v: 1
  /** `og-credencial` para que nadie confunda esta firma con otra cosa. */
  t: 'og-credencial'
  gid: string
  emitidaEn: string
  expiraEn: string
  atributos: Partial<Record<Atributo, unknown>>
}

/**
 * El sobre del EIP-191, que es lo que hace `personal_sign`.
 *
 * El prefijo no es decorativo: impide que una firma de un texto cualquiera se
 * pueda presentar como si fuera una transacción, y al revés. Sin él, hacer
 * firmar «hola» a alguien podría ser hacerle firmar un traspaso.
 */
function sobreEip191(mensaje: string): Uint8Array {
  const cuerpo = new TextEncoder().encode(mensaje)
  const prefijo = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${cuerpo.length}`)
  return keccak_256(Uint8Array.from([...prefijo, ...cuerpo]))
}

/** La firma en el formato de 65 bytes que entienden las billeteras: r‖s‖v. */
export function firmarMensaje(mensaje: string, llavePrivada: string): string {
  const f = secp256k1.sign(sobreEip191(mensaje), deHex(llavePrivada), { prehash: false })
  const r = f.r.toString(16).padStart(64, '0')
  const s = f.s.toString(16).padStart(64, '0')
  /* 27 + recuperación, no 0/1. Es la convención de Ethereum, y una firma con
     `v` en 0/1 la rechazan muchas librerías —incluida la de las billeteras. */
  const v = (27 + f.recovery).toString(16).padStart(2, '0')
  return '0x' + r + s + v
}

/** Qué dirección firmó. Lo mismo que hace `ethers.verifyMessage`. */
export function quienFirmo(mensaje: string, firma: string): string | null {
  try {
    const b = deHex(firma)
    if (b.length !== 65) return null
    const v = b[64] >= 27 ? b[64] - 27 : b[64]
    if (v !== 0 && v !== 1) return null
    const punto = secp256k1.Signature
      .fromCompact(b.slice(0, 64))
      .addRecoveryBit(v)
      .recoverPublicKey(sobreEip191(mensaje))
    return hex(keccak_256(punto.toRawBytes(false).slice(1)).slice(-20))
  } catch {
    return null
  }
}

export function direccionDelEmisor(): string | null {
  const llave = process.env.GENESIS_CREDENCIAL_LLAVE?.trim()
  if (!llave) return null
  try {
    const pub = secp256k1.getPublicKey(deHex(llave), false).slice(1)
    return hex(keccak_256(pub).slice(-20))
  } catch { return null }
}

/**
 * El texto que se firma.
 *
 * Se firma UNA CADENA DE TEXTO y no un objeto, y esa cadena viaja con la
 * credencial. Es la única forma de que quien verifica firme exactamente los
 * mismos bytes: si tuviera que reconstruir el JSON por su cuenta, cualquier
 * diferencia de orden de claves o de espacios rompería la firma y parecería una
 * credencial falsa. Es el error clásico de todo esquema de firma sobre JSON.
 */
export const mensajeDe = (c: Credencial): string => JSON.stringify(c)

export interface CredencialFirmada {
  /** El texto exacto que se firmó. Se comprueba sobre ESTO, tal cual. */
  mensaje: string
  firma: string
  emisor: string
  /** Lo mismo que hay dentro de `mensaje`, ya leído, por comodidad. */
  credencial: Credencial
  comoSeComprueba: string
}

const edad = (nacimiento: string | null): number | null => {
  if (!nacimiento) return null
  const d = Date.parse(nacimiento)
  if (!Number.isFinite(d)) return null
  return Math.floor((Date.now() - d) / 31_557_600_000)
}

export function emitir(
  identidad: Identidad, pedidos: Atributo[], dias = 90,
): { ok: true; credencial: CredencialFirmada } | { ok: false; error: string } {
  const llave = process.env.GENESIS_CREDENCIAL_LLAVE?.trim()
  if (!llave) return { ok: false, error: 'La emisión de credenciales no está configurada' }
  if (identidad.estado !== 'verificada' || !identidad.gid) {
    return { ok: false, error: 'Solo se emiten credenciales de identidades verificadas' }
  }

  /* `verificada` va siempre; el resto solo si se pide. Una credencial que
     lleva todo lo que se sabe de alguien «por si acaso» es un documento que la
     persona enseña sin saber qué está enseñando. */
  const atributos: Partial<Record<Atributo, unknown>> = { verificada: true }
  for (const a of pedidos) {
    if (a === 'mayorDeEdad') {
      const e = edad(identidad.fechaNacimiento)
      /* La gracia entera: sale un `true`, no una fecha. Un bar que necesita
         saber si alguien es mayor no necesita saber su cumpleaños, y hasta hoy
         la única forma de contestar era enseñar el documento entero. */
      if (e !== null) atributos.mayorDeEdad = e >= 18
    } else if (a === 'nacionalidad') {
      if (identidad.nacionalidad) atributos.nacionalidad = identidad.nacionalidad
    } else if (a === 'nombre') {
      if (identidad.nombreLegal) atributos.nombre = identidad.nombreLegal
    } else if (a === 'nivelRiesgo') {
      if (identidad.riesgo?.nivel) atributos.nivelRiesgo = identidad.riesgo.nivel
    }
  }

  const ahora = Date.now()
  const credencial: Credencial = {
    v: 1,
    t: 'og-credencial',
    gid: identidad.gid,
    emitidaEn: new Date(ahora).toISOString(),
    expiraEn: new Date(ahora + dias * 86_400_000).toISOString(),
    atributos,
  }
  const mensaje = mensajeDe(credencial)

  return {
    ok: true,
    credencial: {
      mensaje,
      firma: firmarMensaje(mensaje, llave),
      emisor: direccionDelEmisor()!,
      credencial,
      comoSeComprueba:
        'ethers.verifyMessage(mensaje, firma) tiene que devolver `emisor`, y `emisor` '
        + 'tiene que ser la dirección publicada en la cadena 5550 por la dirección del '
        + 'ancla. Compruebe además `expiraEn` y la lista de revocadas.',
    },
  }
}

/**
 * Comprobar una credencial. Vive aquí aunque quien la use esté fuera.
 *
 * `emisorEsperado` NO tiene valor por defecto a propósito. Si lo tuviera, quien
 * llamara sin pasarlo comprobaría una firma contra sí misma —recuperar una
 * dirección de una firma siempre da ALGUNA dirección— y una credencial firmada
 * por cualquiera pasaría por buena. Es el fallo más común de todo esto, y aquí
 * el tipo lo impide.
 */
export function comprobar(
  mensaje: string, firma: string, emisorEsperado: string,
  revocadas: string[] = [],
): { vale: boolean; motivo?: string; credencial?: Credencial; firmadaPor?: string | null } {
  const firmadaPor = quienFirmo(mensaje, firma)
  if (!firmadaPor) return { vale: false, motivo: 'La firma no se puede leer' }
  if (firmadaPor.toLowerCase() !== emisorEsperado.toLowerCase()) {
    return { vale: false, motivo: 'La firmó otra dirección, no el emisor esperado', firmadaPor }
  }

  let c: Credencial
  try { c = JSON.parse(mensaje) } catch { return { vale: false, motivo: 'El mensaje no es una credencial', firmadaPor } }
  if (c?.t !== 'og-credencial' || c?.v !== 1) {
    return { vale: false, motivo: 'No es una credencial de Orden Global', firmadaPor }
  }
  if (Date.parse(c.expiraEn) < Date.now()) {
    return { vale: false, motivo: `Venció el ${c.expiraEn.slice(0, 10)}`, credencial: c, firmadaPor }
  }
  if (revocadas.map((g) => g.toUpperCase()).includes(String(c.gid).toUpperCase())) {
    return { vale: false, motivo: 'Ese GID está revocado', credencial: c, firmadaPor }
  }
  return { vale: true, credencial: c, firmadaPor }
}

/**
 * El renglón de revocadas que se escribe en la cadena.
 *
 * Lleva los GID enteros y no un hash de la lista: con un hash, para saber si el
 * suyo está dentro habría que pedirnos la lista — y volveríamos justo al
 * problema que la credencial vino a quitar. Son ocho caracteres por revocación
 * y esta es nuestra propia cadena; el ahorro no compensa la dependencia.
 */
export function renglonRevocadas(gids: string[], fecha = new Date().toISOString()): string {
  const orden = [...gids].sort()
  return `GENESIS-ID/REVOCADAS/1 ${fecha} n=${orden.length} ${orden.join(' ')}`.trim()
}

/** Para saber si la lista cambió sin guardarla entera dos veces. */
export const huellaDeRevocadas = (gids: string[]): string =>
  createHash('sha256').update([...gids].sort().join(',')).digest('hex').slice(0, 16)

export function renglonEmisor(direccion: string, fecha = new Date().toISOString()): string {
  return `GENESIS-ID/EMISOR/1 ${fecha} alg=secp256k1-keccak-eip191 dir=${direccion}`
}
