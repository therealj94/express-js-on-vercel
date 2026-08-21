/**
 * El generador de códigos QR, contra una implementación independiente.
 *
 * Un QR mal hecho no falla: simplemente el teléfono no lee nada, y nadie sabe
 * por qué. No se puede dar por bueno mirándolo. Así que cada caso de acá genera
 * la matriz con nuestro código y la compara CUADRO POR CUADRO contra la que
 * produce la biblioteca `qrcode` de Python, que no comparte una sola línea con
 * la nuestra. Si difiere un solo módulo, esto se pone en rojo.
 *
 * Si Python o la biblioteca no están, las pruebas se saltan en vez de fallar:
 * una prueba que se cae por el entorno enseña a ignorar el rojo.
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..', '..')

// El módulo se escribió para el navegador, así que se carga como texto y se
// evalúa. Es la misma pieza exacta que va a correr en el panel.
const fuente = readFileSync(join(raiz, 'public', 'qr-core.js'), 'utf8')
const ambito = {}
new Function('globalThis', fuente).call(ambito, ambito)
const QR = ambito.QR

let hayPython = false
before(() => {
  try {
    execFileSync('python3', ['-c', 'import qrcode'], { stdio: 'pipe' })
    hayPython = true
  } catch { hayPython = false }
})

/**
 * La matriz de referencia, en filas de puntos y almohadillas.
 *
 * Se le PIDE modo byte explícitamente, y no es para tapar una diferencia: es
 * para comparar lo mismo con lo mismo. La biblioteca de Python parte el texto
 * en segmentos y mezcla modos, así que un `secret=MFRG...` en mayúsculas se lo
 * codifica en modo alfanumérico y le sale un QR más chico. Los dos son válidos
 * y los dos se leen; simplemente no son el mismo dibujo.
 *
 * El nuestro es byte a secas a propósito: la optimización por segmentos son
 * unas cuantas decisiones más que se pueden equivocar, y lo único que ahorra es
 * un par de milímetros en un código que se mira tres segundos.
 */
function referencia(texto) {
  const guion = `
import sys, qrcode
from qrcode.util import QRData, MODE_8BIT_BYTE
q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=1, border=0)
q.add_data(QRData(sys.argv[1], mode=MODE_8BIT_BYTE))
q.make(fit=True)
for fila in q.get_matrix():
    print(''.join('#' if c else '.' for c in fila))
`
  return execFileSync('python3', ['-c', guion, texto], { encoding: 'utf8' }).trim().split('\n')
}

const nuestra = (texto) =>
  QR.matriz(texto).map((f) => f.map((c) => (c ? '#' : '.')).join(''))

const CASOS = [
  ['una dirección otpauth de verdad, que es para lo que existe esto',
    'otpauth://totp/Genesis%20ID:ana%40ordenglobal.org?secret=JBSWY3DPEHPK3PXP' +
    '&issuer=Genesis%20ID&algorithm=SHA1&digits=6&period=30'],
  ['un texto corto, que cae en una versión chica', 'HOLA'],
  ['un secreto de veinte bytes en base32, como los nuestros',
    'otpauth://totp/Genesis%20ID:operador%40ordenglobal.org' +
    '?secret=MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43UOZ3G6&issuer=Genesis%20ID' +
    '&algorithm=SHA1&digits=6&period=30'],
  ['un correo largo, que empuja a una versión más grande',
    'otpauth://totp/Genesis%20ID:cumplimiento.operaciones%40ordenglobal.org' +
    '?secret=MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43UOZ3G6&issuer=Genesis%20ID' +
    '&algorithm=SHA1&digits=6&period=30'],
  ['acentos y eñes, para que el UTF-8 no se rompa', 'Verificación de identidad · año'],
]

describe('QR · cuadro por cuadro contra la biblioteca de Python', () => {
  for (const [nombre, texto] of CASOS) {
    test(nombre, (t) => {
      if (!hayPython) return t.skip('no hay python3 con qrcode en este entorno')

      const suya = referencia(texto)
      const mia = nuestra(texto)

      assert.equal(mia.length, suya.length,
        `el lado no coincide: nuestro ${mia.length}, el suyo ${suya.length}`)
      for (let i = 0; i < suya.length; i++) {
        assert.equal(mia[i], suya[i], `la fila ${i} no coincide`)
      }
    })
  }
})

describe('QR · lo que se dibuja', () => {
  test('el SVG sale entero y con margen', () => {
    const s = QR.svg('otpauth://totp/x?secret=AAAA', 200)
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(s, /width="200" height="200"/)
    assert.match(s, /<\/svg>$/)
    // Fondo blanco explícito: sobre un panel oscuro, un QR sin fondo no se lee.
    assert.match(s, /<rect[^>]*fill="#fff"/)
  })

  test('un texto que no cabe se rechaza en vez de salir mal', () => {
    assert.throws(() => QR.matriz('x'.repeat(400)), /no cabe/)
  })

  test('el mismo texto da siempre el mismo dibujo', () => {
    const a = QR.svg('otpauth://totp/x?secret=AAAA')
    const b = QR.svg('otpauth://totp/x?secret=AAAA')
    assert.equal(a, b)
  })
})
