/**
 * El TOTP, contra los vectores de prueba del RFC 6238.
 *
 * Es la única forma seria de decir que una implementación de criptografía está
 * bien: no que «parece funcionar», sino que da exactamente los números que da
 * la norma. Si estos seis casos pasan, cualquier aplicación de autenticación
 * del mundo va a cuadrar con nosotros.
 *
 * Los vectores del RFC vienen a ocho dígitos; por eso `codigo()` acepta el
 * número de dígitos. En producción son seis.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  aBase32, deBase32, codigo, verificar, pasoDe, generarSecreto, uriOtpauth,
  generarCodigosRespaldo, normalizarRespaldo, PASO_S,
} from '../auth/totp.js'

/** El secreto del RFC 6238 para SHA-1: los ASCII "12345678901234567890". */
const SECRETO_RFC = aBase32(Buffer.from('12345678901234567890', 'ascii'))

/** Apéndice B del RFC 6238, la columna de SHA-1. */
const VECTORES: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
]

describe('TOTP · vectores del RFC 6238', () => {
  for (const [segundos, esperado] of VECTORES) {
    test(`T=${segundos} tiene que dar ${esperado}`, () => {
      const paso = Math.floor(segundos / PASO_S)
      assert.equal(codigo(SECRETO_RFC, paso, 8), esperado)
    })
  }
})

describe('Base32', () => {
  test('ida y vuelta sin perder nada', () => {
    const original = Buffer.from('12345678901234567890', 'ascii')
    assert.deepEqual(deBase32(aBase32(original)), original)
  })

  test('se acepta escrito a mano: minúsculas, espacios y guiones', () => {
    const limpio = aBase32(Buffer.from('hola mundo secreto!!', 'ascii'))
    const aMano = limpio.toLowerCase().replace(/(.{4})/g, '$1 ').trim()
    assert.deepEqual(deBase32(aMano), deBase32(limpio))
  })

  test('un carácter que no existe en el alfabeto se rechaza', () => {
    assert.throws(() => deBase32('ABC!DEF'), /base32/)
  })
})

describe('Verificación', () => {
  const secreto = generarSecreto()

  test('el código de ahora vale', () => {
    const ahora = Date.now()
    const c = codigo(secreto, pasoDe(ahora))
    assert.equal(verificar(secreto, c, { ahoraMs: ahora }), pasoDe(ahora))
  })

  test('el del paso anterior también, porque los relojes no van iguales', () => {
    const ahora = Date.now()
    const c = codigo(secreto, pasoDe(ahora) - 1)
    assert.equal(verificar(secreto, c, { ahoraMs: ahora }), pasoDe(ahora) - 1)
  })

  test('pero uno de hace cinco minutos ya no', () => {
    const ahora = Date.now()
    const viejo = codigo(secreto, pasoDe(ahora) - 10)
    assert.equal(verificar(secreto, viejo, { ahoraMs: ahora }), null)
  })

  test('un código de otro secreto no vale', () => {
    const ahora = Date.now()
    const ajeno = codigo(generarSecreto(), pasoDe(ahora))
    // Con mala suerte podrían coincidir (una entre un millón). Se descarta ese
    // caso en vez de dejar una prueba que falle sola de vez en cuando.
    if (ajeno === codigo(secreto, pasoDe(ahora))) return
    assert.equal(verificar(secreto, ajeno, { ahoraMs: ahora }), null)
  })

  test('lo que no sean seis dígitos se rechaza sin mirar', () => {
    for (const basura of ['', '12345', '1234567', 'abcdef', '12 34 56', null as any]) {
      assert.equal(verificar(secreto, basura), null, `«${basura}» no puede valer`)
    }
  })

  /* Devolver el PASO y no un `true` es lo que permite rechazar un código
     repetido: quien lo ve por encima del hombro tiene treinta segundos. Quien
     guarde el paso puede negarse a aceptar el mismo dos veces. */
  test('devuelve el paso, que es lo que permite no aceptar el mismo dos veces', () => {
    const ahora = Date.now()
    const p = pasoDe(ahora)
    assert.equal(verificar(secreto, codigo(secreto, p), { ahoraMs: ahora }), p)
  })
})

describe('La dirección del código QR', () => {
  test('lleva emisor, cuenta y los parámetros que espera el teléfono', () => {
    const uri = uriOtpauth('ABCDEF', 'ana@ordenglobal.org')
    assert.match(uri, /^otpauth:\/\/totp\/Genesis%20ID:ana%40ordenglobal\.org\?/)
    assert.match(uri, /secret=ABCDEF/)
    assert.match(uri, /issuer=Genesis%20ID/)
    assert.match(uri, /algorithm=SHA1/)
    assert.match(uri, /digits=6/)
    assert.match(uri, /period=30/)
  })
})

describe('Códigos de recuperación', () => {
  test('son diez y no se repite ninguno', () => {
    const cs = generarCodigosRespaldo()
    assert.equal(cs.length, 10)
    assert.equal(new Set(cs).size, 10)
  })

  test('se comparan igual escritos con guion o sin él', () => {
    const [c] = generarCodigosRespaldo(1)
    assert.equal(normalizarRespaldo(c), normalizarRespaldo(c.replace('-', '').toLowerCase()))
  })
})
