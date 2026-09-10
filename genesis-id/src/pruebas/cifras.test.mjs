/* Las cifras del panel, sin ambigüedad.
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * «20.000» y «20,000» son la misma cifra escrita de dos maneras y significan
 * cosas distintas según quién lo lea. En el panel de cumplimiento se mira un
 * monto para decidir si se abre un caso; leer veinte mil donde dice veinte es
 * un error caro, y al revés también.
 *
 * El formato de la casa: los MILES con espacio fino indivisible, el DECIMAL
 * siempre con coma. Así el punto no aparece nunca y no hay nada que adivinar.
 *
 * El código vive dentro de `public/admin.html`, que no es un módulo. Se saca
 * de ahí y se evalúa: probar la copia pegada en la prueba no probaría nada.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const html = readFileSync(join(raiz, 'public', 'admin.html'), 'utf8')

function sacar(nombre, hasta) {
  const desde = html.indexOf(nombre)
  assert.notEqual(desde, -1, `no se encontró ${nombre} en admin.html`)
  return html.slice(desde, html.indexOf(hasta, desde) + hasta.length)
}

const fuente = [
  sacar("const MILES =", "\n"),
  sacar("function cifra(", "\n}"),
  sacar("function decimalesDe(", "\n}"),
  sacar("const dinero =", "\n"),
].join('\n')
const { cifra, dinero, MILES } = new Function(`${fuente}\nreturn { cifra, dinero, MILES }`)()

test('el punto no aparece nunca: los miles van con espacio y el decimal con coma', () => {
  assert.equal(cifra(20000), `20${MILES}000`)
  assert.equal(cifra(20000.5), `20${MILES}000,5`)
  assert.equal(cifra(20), '20')
  assert.equal(cifra(0.5), '0,5')
  assert.equal(cifra(1234567), `1${MILES}234${MILES}567`)
  for (const n of [20, 20.5, 20000, 1234567.89, 0.000001]) {
    assert.ok(!cifra(n).includes('.'), `«${cifra(n)}» todavía lleva un punto`)
  }
})

test('no se recortan decimales: en cumplimiento, recortar es esconder dinero', () => {
  assert.equal(cifra(1.532505), '1,532505')
  assert.equal(cifra(0.000001), '0,000001')
})

test('un monto redondo no se ensucia con ceros', () => {
  assert.equal(cifra(300), '300')
  assert.equal(cifra(300.0), '300')
})

test('los dólares llevan siempre sus dos decimales', () => {
  // El formato anterior tiraba los decimales y medio dólar se leía «USD 0»:
  // un movimiento de cero donde había dinero de verdad.
  assert.equal(dinero(0.5), `USD${MILES}0,50`)
  assert.equal(dinero(1234.5), `USD${MILES}1${MILES}234,50`)
  assert.equal(dinero(0), `USD${MILES}0,00`)
})

test('lo que no es un número se dice, no se inventa un cero', () => {
  assert.equal(cifra(undefined), '—')
  assert.equal(cifra(null), '—')
  assert.equal(cifra('hola'), '—')
  assert.equal(cifra(NaN), '—')
  assert.equal(cifra(Infinity), '—')
  assert.equal(cifra(''), '—')
  // Pero el cero de verdad sí se pinta: no es lo mismo «no hay dato» que «cero».
  assert.equal(cifra(0), '0')
  assert.equal(dinero(0), `USD${MILES}0,00`)
})

test('los negativos llevan el signo menos de verdad, no un guion', () => {
  assert.equal(cifra(-20000.5), `−20${MILES}000,5`)
})
