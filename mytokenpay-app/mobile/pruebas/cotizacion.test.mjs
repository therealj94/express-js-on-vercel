// El cobro de MyTokenPay: la factura se cotiza en ORIGEN y, al salir de ella,
// el monto queda FIJO.
//
//   node --test pruebas/
//
// Antes el total en ORIGEN, el QR (`a=`) y la venta registrada se recalculaban
// en cada render con el precio del oro, que se relee cada minuto: el QR cambiaba
// mientras el cliente lo escaneaba, una cuenta dividida registraba un total que
// no era la suma de sus partes, y si el precio caducaba a media venta el QR
// pasaba a `a=0` y la última persona quedaba «Pagado» sin venta ni mensaje.
//
// La pantalla no se puede montar aquí (no hay marco de pruebas para React
// Native en este proyecto), así que se prueban las funciones puras con Node
// —que quita los tipos de commerce.ts— y se comprueba en la fuente que la
// pantalla las usa como debe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cotizar, repartirIgual, sumaPartes } from '../src/lib/commerce.ts'

const AQUI = dirname(fileURLToPath(import.meta.url))
const cobro = readFileSync(join(AQUI, '..', 'app', 'cobro.tsx'), 'utf8')

const FACTURA = [
  { item: { name: 'Cena romántica', priceUsd: 45 }, qty: 1 },
  { item: { name: 'Traslado', priceUsd: 7.5 }, qty: 2 },
]

test('sin precio no hay cotización', () => {
  assert.equal(cotizar(FACTURA, 10, null), null)
  assert.equal(cotizar(FACTURA, 10, 0), null)
})

test('la cotización lleva el precio con el que se hizo y sus montos', () => {
  const c = cotizar(FACTURA, 10, 2.35)
  assert.equal(c.origenUsd, 2.35)
  assert.equal(c.subtotalOr, 25.53)          // 60 USD / 2,35
  assert.equal(c.tipOr, 2.55)
  assert.equal(c.totalOr, 28.08)
  assert.deepEqual(c.items.map((i) => i.priceOrigen), [19.15, 3.19])
})

test('otra lectura del oro da otra cotización: por eso se fija al salir de la factura', () => {
  assert.notEqual(cotizar(FACTURA, 0, 2.35).totalOr, cotizar(FACTURA, 0, 2.3525).totalOr)
})

test('las partes iguales suman exactamente el total', () => {
  for (const [total, n] of [[25.53, 4], [28.08, 3], [0.05, 4], [100, 3]]) {
    const partes = repartirIgual(total, n)
    assert.equal(partes.length, n)
    assert.equal(sumaPartes(partes), total, `${total} entre ${n}`)
  }
})

test('la pantalla cobra con la cotización fijada, no con el precio del momento', () => {
  // El QR sale de la cotización fijada.
  assert.match(cobro, /const qrPayload = fijada \? `mtp:cobro\?[^`]*a=\$\{fijada\.totalOr\}`/)
  // Cada venta se registra con una cotización explícita.
  assert.match(cobro, /finishSale\('qr', 'Cliente con QR', fijada\)/)
  assert.match(cobro, /finishSale\('split', [^)]*fijada, sumaPartes\(/)
  // Salir de la factura fija; volver a ella la suelta.
  assert.match(cobro, /function salirDeLaFactura[\s\S]{0,200}setFijada\(c\)/)
  assert.match(cobro, /function volverALaFactura[\s\S]{0,80}setFijada\(null\)/)
})

test('el aviso de «no hay precio» no se guarda: se va solo cuando el precio vuelve', () => {
  assert.doesNotMatch(cobro, /setError\(SIN_PRECIO\)/)
})

test('las etapas QR y cuenta dividida enseñan los errores', () => {
  const qr = cobro.slice(cobro.indexOf("{stage === 'qr'"), cobro.indexOf('DIVIDIR CUENTA'))
  assert.match(qr, /<ErrorBox/)
  const personas = cobro.slice(cobro.indexOf("{stage === 'split' && fijada && qrPayload && splitPeople"), cobro.indexOf('ÉXITO'))
  assert.match(personas, /<ErrorBox/)
})
