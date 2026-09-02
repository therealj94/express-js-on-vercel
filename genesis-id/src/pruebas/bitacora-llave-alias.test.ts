// La llave de la bitácora con el nombre de la documentación de despliegue.
//
// Render puede tener `GENESIS_BITACORA_LLAVE` en vez de `_CLAVE`; si el motor
// solo aceptara uno, la bitácora quedaría sin firmar en silencio. Se prueba
// que el alias firma y que una llave corta no cuenta, con cualquiera de los
// dos nombres.

import { test } from 'node:test'
import assert from 'node:assert/strict'

delete process.env.GENESIS_BITACORA_CLAVE
process.env.GENESIS_BITACORA_LLAVE = 'llave-de-prueba-larga-para-la-bitacora-0123456789'

const cripto = await import('../lib/cripto.js')

test('GENESIS_BITACORA_LLAVE firma igual que GENESIS_BITACORA_CLAVE', () => {
  cripto.olvidarClaveBitacora()
  assert.equal(cripto.bitacoraFirmable(), true)
  const firma = cripto.firmarEslabon('abc')
  assert.ok(firma && firma.length === 64)
  assert.equal(cripto.firmaCuadra('abc', firma!), true)
  assert.equal(cripto.firmaCuadra('abd', firma!), false)
})

test('una llave corta no firma, con cualquiera de los dos nombres', () => {
  process.env.GENESIS_BITACORA_LLAVE = 'corta'
  cripto.olvidarClaveBitacora()
  assert.equal(cripto.bitacoraFirmable(), false)
  assert.equal(cripto.firmarEslabon('abc'), null)
  delete process.env.GENESIS_BITACORA_LLAVE
  cripto.olvidarClaveBitacora()
})
