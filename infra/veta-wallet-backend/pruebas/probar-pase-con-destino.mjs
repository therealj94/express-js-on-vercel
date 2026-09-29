// El puente de la wallet le pasa a Genesis el destino y el reto del pase.
//
// AU-RA pide su pase con `aud` y `reto` (ver genesis-id, pase-con-destino).
// Aquí solo se comprueba lo que le toca al puente: que los lleve tal cual,
// que rechace lo que no tiene forma antes de molestar a Genesis, y que sin
// ellos el pase se pida exactamente como siempre.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'

let genesis, wallet, base
const recibido = []

before(async () => {
  genesis = http.createServer((req, res) => {
    let datos = ''
    req.on('data', (t) => { datos += t })
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url.startsWith('/api/v1/identidades/por-email/')) {
        return res.end(JSON.stringify({ identidad: { id: 'id-1', gid: 'GEN-1234-5678-9', estado: 'verificada' } }))
      }
      if (req.url === '/api/v1/sso/token') {
        recibido.push(JSON.parse(datos))
        return res.end(JSON.stringify({ token: 'pase', expiraEnSegundos: 900 }))
      }
      res.statusCode = 404
      res.end('{}')
    })
  })
  await new Promise((listo) => genesis.listen(0, '127.0.0.1', listo))
  process.env.GENESIS_URL = `http://127.0.0.1:${genesis.address().port}`
  process.env.GENESIS_API_KEY = 'clave-de-prueba'
  const { routerGenesis } = await import('../lib/genesisPuente.js')
  const app = express()
  app.use(express.json())
  const sesion = (req, _res, next) => { req.usuario = { id: 'u1', email: 'persona@prueba.local' }; next() }
  app.use('/genesis', routerGenesis({ exigirSesion: sesion, correoVerificado: () => true }))
  wallet = app.listen(0, '127.0.0.1')
  await new Promise((listo) => wallet.once('listening', listo))
  base = `http://127.0.0.1:${wallet.address().port}`
})

after(() => { genesis?.close(); wallet?.close() })

const pedir = async (cuerpo) => {
  const r = await fetch(base + '/genesis/sso/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  })
  return { estado: r.status, cuerpo: await r.json() }
}
const RETO = 'a'.repeat(43)

test('sin destino, el pase se pide como siempre', async () => {
  const r = await pedir({})
  assert.equal(r.estado, 200)
  assert.deepEqual(recibido.at(-1), { gid: 'GEN-1234-5678-9', cuenta: 'u1' })
})

test('con destino y reto, viajan tal cual', async () => {
  const r = await pedir({ aud: ['aura', 'pulse2chat'], reto: RETO })
  assert.equal(r.estado, 200)
  assert.deepEqual(recibido.at(-1), { gid: 'GEN-1234-5678-9', cuenta: 'u1', aud: ['aura', 'pulse2chat'], reto: RETO })
})

test('un destino solo también vale', async () => {
  await pedir({ aud: 'aura' })
  assert.deepEqual(recibido.at(-1).aud, ['aura'])
})

test('lo que no tiene forma no llega a Genesis', async () => {
  const antes = recibido.length
  for (const malo of [{ aud: [] }, { aud: ['AURA!'] }, { aud: ['a', 'b', 'c', 'd', 'e'] }, { reto: 'corto' }, { reto: 5 }]) {
    const r = await pedir(malo)
    assert.equal(r.estado, 400, JSON.stringify(malo))
  }
  assert.equal(recibido.length, antes)
})
