// La barrera de compilación de tienda (scripts/barrera-mock.js).
//
//   node --test pruebas/
//
// Se corre el script como lo corre EAS —un proceso aparte con el entorno del
// perfil— y se mira el código de salida. Antes daba verde a un perfil
// production sin API (la app caía en http://localhost:3001) y con el libro
// local de la billetera, las ventas y los retiros intacto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, '..', 'scripts', 'barrera-mock.js')
const require = createRequire(import.meta.url)

const LIMPIO = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(EAS_BUILD_PROFILE|EXPO_PUBLIC_|MTP_C6_)/.test(k)),
)
function correr(env) {
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...LIMPIO, ...env }, encoding: 'utf8' })
  return { codigo: r.status, salida: r.stdout + r.stderr }
}

test('production con los datos simulados apagados pero sin API: se detiene', () => {
  const r = correr({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_USE_MOCK_API: '0' })
  assert.equal(r.codigo, 1, r.salida)
  assert.match(r.salida, /EXPO_PUBLIC_API_URL/)
  assert.match(r.salida, /localhost:3001/)
})

test('production con los datos simulados encendidos: se detiene', () => {
  const r = correr({ EAS_BUILD_PROFILE: 'production' })
  assert.equal(r.codigo, 1, r.salida)
  assert.match(r.salida, /EXPO_PUBLIC_USE_MOCK_API/)
})

test('production con una API en http o en la red local: se detiene', () => {
  for (const url of ['http://api.ejemplo.com', 'https://localhost:3001', 'https://192.168.1.4:3001']) {
    const r = correr({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_USE_MOCK_API: '0', EXPO_PUBLIC_API_URL: url, MTP_C6_ACTA: 'acta' })
    assert.equal(r.codigo, 1, url)
    assert.match(r.salida, /EXPO_PUBLIC_API_URL tiene que ser una dirección pública en https/, url)
  }
})

test('production con todo puesto pero con el libro local de hoy: se detiene por C6', () => {
  const r = correr({
    EAS_BUILD_PROFILE: 'production',
    EXPO_PUBLIC_USE_MOCK_API: '0',
    EXPO_PUBLIC_API_URL: 'https://api.ejemplo.com',
    MTP_C6_ACTA: 'acta de prueba',
  })
  assert.equal(r.codigo, 1, r.salida)
  assert.match(r.salida, /C6: la app todavía lleva libro propio/)
  assert.match(r.salida, /src\/store\/wallet\.ts/)
  assert.match(r.salida, /src\/store\/business\.ts/)
})

test('sin el acta de C6 no sale aunque el libro local ya no esté', () => {
  const { revisar } = require(SCRIPT)
  const sinLibro = () => null
  const env = { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_USE_MOCK_API: '0', EXPO_PUBLIC_API_URL: 'https://api.ejemplo.com' }
  const { motivos } = revisar(env, sinLibro)
  assert.equal(motivos.length, 1)
  assert.match(motivos[0], /MTP_C6_ACTA/)
  assert.deepEqual(revisar({ ...env, MTP_C6_ACTA: 'D-xx firmada' }, sinLibro).motivos, [])
})

test('preview y local no cambian: siguen con los datos simulados', () => {
  for (const env of [{ EAS_BUILD_PROFILE: 'preview' }, {}]) {
    const r = correr(env)
    assert.equal(r.codigo, 0, r.salida)
    assert.match(r.salida, /datos simulados ENCENDIDOS/)
  }
})
