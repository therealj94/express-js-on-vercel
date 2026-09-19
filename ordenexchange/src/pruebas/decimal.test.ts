// La aritmética de los montos. Si esto falla, nada de lo demás vale.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Dec } from '../lib/decimal.js'

describe('Dec', () => {
  test('suma y resta exactas donde la coma flotante falla', () => {
    assert.equal(Dec.sumar('0.1', '0.2'), '0.3')
    assert.equal(Dec.restar('1', '0.9'), '0.1')
    assert.equal(Dec.sumar('123456789012345.123456789', '0.000000001'), '123456789012345.12345679')
  })

  test('normaliza ceros y signos', () => {
    assert.equal(Dec.n('012.500'), '12.5')
    assert.equal(Dec.n('-0'), '0')
    assert.equal(Dec.n('0.0'), '0')
    assert.equal(Dec.negar('5'), '-5')
    assert.equal(Dec.abs('-5.25'), '5.25')
  })

  test('multiplica y divide con 18 decimales, truncando', () => {
    assert.equal(Dec.multiplicar('2.5', '4'), '10')
    assert.equal(Dec.multiplicar('1000', '26.1'), '26100')
    assert.equal(Dec.dividir('1', '3'), '0.333333333333333333')
    assert.equal(Dec.dividir('10', '4'), '2.5')
    assert.throws(() => Dec.dividir('1', '0'), /cero/)
  })

  test('truncar nunca crea dinero; redondear es comercial', () => {
    assert.equal(Dec.truncar('1.999999999', 8), '1.99999999')
    assert.equal(Dec.truncar('0.123456789', 2), '0.12')
    assert.equal(Dec.redondear('0.125', 2), '0.13')
    assert.equal(Dec.redondear('0.124', 2), '0.12')
    assert.equal(Dec.redondear('2.5', 0), '3')
    assert.equal(Dec.fijar('5', 2), '5.00')
    assert.equal(Dec.fijar('5.1', 0), '5')
  })

  test('compara', () => {
    assert.equal(Dec.comparar('1.10', '1.1'), 0)
    assert.equal(Dec.mayor('2', '1.999999'), true)
    assert.equal(Dec.menor('-1', '0'), true)
    assert.equal(Dec.esCero('0.000'), true)
    assert.equal(Dec.esPositivo('0.00000001'), true)
    assert.equal(Dec.min('3', '2.5'), '2.5')
    assert.equal(Dec.max('3', '2.5'), '3')
  })

  test('rechaza lo que no es un decimal', () => {
    assert.equal(Dec.esValido('12.5'), true)
    assert.equal(Dec.esValido('1e5'), false)
    assert.equal(Dec.esValido('abc'), false)
    assert.equal(Dec.esValido(''), false)
    assert.equal(Dec.esValido(null), false)
    assert.throws(() => Dec.n('1,5'))
    assert.throws(() => Dec.n('0x10'))
    assert.throws(() => Dec.n('1.0000000000000000001'), /decimales/)
  })

  test('convierte desde wei', () => {
    assert.equal(Dec.deWei('0xde0b6b3a7640000'), '1')       // 1e18
    assert.equal(Dec.deWei(1500000000000000000n), '1.5')
    assert.equal(Dec.deWei('1000000', 6), '1')
  })

  test('deNumero y decimalesDe', () => {
    assert.equal(Dec.deNumero(0.1 + 0.2, 8), '0.3')
    assert.equal(Dec.decimalesDe('1.2300'), '1.23'.length - 2)
    assert.equal(Dec.decimalesDe('7'), 0)
  })
})
