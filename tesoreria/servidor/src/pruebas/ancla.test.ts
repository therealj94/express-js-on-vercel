// El anclaje se prueba sin red y sin fondos: se construye y firma la
// transacción y se comprueba que, descodificada, dice lo que debe decir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirAncla, leerAncla, cargaAncla, CADENA_ID } from '../ancla.js'

const CLAVE = '0x' + '11'.repeat(32)   // llave de prueba, sin fondos en ninguna cadena

test('el ancla firmada se descodifica con el sello, los asientos y la cadena 5550', async () => {
  const carga = cargaAncla('A'.repeat(64), 123, '2026-09-20T00:00:00.000Z')
  const { raw, hash, de } = await construirAncla(CLAVE, carga, 7)
  assert.match(hash, /^0x[0-9a-f]{64}$/)
  const leida = leerAncla(raw)
  assert.equal(leida.chainId, CADENA_ID)
  assert.equal(leida.de, de)
  assert.deepEqual(leida.carga, carga)
})

test('una transacción cualquiera no pasa por ancla', async () => {
  const { raw } = await construirAncla(CLAVE, { t: 'otra' } as any, 1)
  assert.equal(leerAncla(raw).carga, null)
})
