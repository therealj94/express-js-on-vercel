// La lista única de monedas: se toma de la plataforma, se respeta lo oculto y sin ella queda el respaldo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { monedas, refrescarMonedas, _olvidarMonedas } from '../directorio/monedas.js'

const V2 = '0x' + 'a2'.repeat(20)
const responde = (cuerpo: unknown) => (async () => ({ json: async () => cuerpo })) as unknown as typeof fetch

test('sin lista única queda la copia de respaldo', async () => {
  _olvidarMonedas()
  await refrescarMonedas((async () => { throw new Error('caída') }) as unknown as typeof fetch)
  const l = monedas()
  assert.equal(l.length, 15)
  assert.equal(l.find((m) => m.simbolo === 'AUKA')!.contrato, '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B')
})

test('con lista única: contrato vigente (v2) y sin las ocultas', async () => {
  _olvidarMonedas()
  await refrescarMonedas(responde({ monedas: [
    { simbolo: 'ORIGEN', nombre: 'ORIGEN', contrato: null, decimales: 18, visible: true },
    { simbolo: 'AUKA', nombre: 'Gold Kapital', contrato: V2, decimales: 18, visible: true },
    { simbolo: 'AUBEX', nombre: 'Aubex', contrato: '0xf1498640b27a66c0dc505093d70911c060e04fb0', decimales: 18, visible: false },
  ] }))
  assert.deepEqual(monedas().map((m) => [m.simbolo, m.contrato]), [['ORIGEN', null], ['AUKA', V2]])
  // Un fallo después no borra la última lista buena.
  await refrescarMonedas((async () => { throw new Error('caída') }) as unknown as typeof fetch)
  assert.equal(monedas().find((m) => m.simbolo === 'AUKA')!.contrato, V2)
  _olvidarMonedas()
})

test('GENESIS_MONEDAS manda sobre la lista única', async () => {
  _olvidarMonedas()
  process.env.GENESIS_MONEDAS = 'ORIGEN|Origen||18'
  try {
    await refrescarMonedas(responde({ monedas: [{ simbolo: 'AUKA', contrato: V2, visible: true }] }))
    assert.deepEqual(monedas().map((m) => m.simbolo), ['ORIGEN'])
  } finally { delete process.env.GENESIS_MONEDAS; _olvidarMonedas() }
})
