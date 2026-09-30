// El pase de AU-RA de punta a punta, con las piezas DE VERDAD.
//
//   node --test pruebas/probar-sso-punta-a-punta.mjs
//
// Hace falta genesis-id/ con sus dependencias (`npm ci` allí) y python3.
//
//   wallet (este puente) ──X-API-Key──▶ Genesis ID (genesis-id/, en 127.0.0.1)
//   relevo del chat (infra/mensajes/servidor.py) ──▶ el mismo Genesis ID
//
// Lo que tiene que pasar, y aquí se comprueba sin ningún simulacro en medio:
//
//   · un pase para AU-RA o el chat SIN reto no sale (400 RETO_OBLIGATORIO);
//   · con reto sale, y el relevo solo lo canjea con SU verificador: con otro
//     no abre el chat;
//   · AU-RA lo canjea aparte, una vez, y recibe el cumpleaños sin el año;
//   · cada «no» llega a la app con su código: sin identidad (o solo la vacía),
//     a medias, cuenta sin atar, Genesis caído.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const GENESIS = path.join(AQUI, '..', '..', '..', 'genesis-id')
const RELEVO = path.join(AQUI, '..', '..', 'mensajes', 'servidor.py')

const hayGenesis = existsSync(path.join(GENESIS, 'node_modules', 'tsx'))
const saltar = hayGenesis ? false : 'falta genesis-id/node_modules (npm ci en genesis-id)'

let genesis, relevo, wallet, G, BASE, RELEVO_URL
const hijos = []

const puertoLibre = () => new Promise((listo) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => listo(p)) })
})
const verificador = () => randomBytes(32).toString('base64url')
const huella = (v) => createHash('sha256').update(v).digest('base64url')

async function arrancarGenesis() {
  const env = { ...process.env }
  delete env.PORT; delete env.RENDER; delete env.GENESIS_MONGO_URL
  const hijo = spawn(process.execPath, ['--import', 'tsx', path.join(AQUI, 'sso', 'genesis-de-prueba.mts')], {
    cwd: GENESIS, env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  hijos.push(hijo)
  let salida = ''
  let errores = ''
  hijo.stderr.on('data', (t) => { errores += t })
  return await new Promise((listo, falla) => {
    const reloj = setTimeout(() => falla(new Error('Genesis no arrancó: ' + errores.slice(-500))), 60000)
    hijo.stdout.on('data', (t) => {
      salida += t
      const linea = salida.split('\n').find((l) => l.startsWith('{"base"'))
      if (linea) { clearTimeout(reloj); listo({ hijo, ...JSON.parse(linea) }) }
    })
    hijo.on('exit', (c) => { clearTimeout(reloj); falla(new Error(`Genesis salió (${c}): ${errores.slice(-500)}`)) })
  })
}

before(async () => {
  if (saltar) return
  genesis = await arrancarGenesis()
  G = genesis.claves

  // El puente de la wallet, el de verdad, contra ese Genesis.
  process.env.GENESIS_URL = genesis.base
  process.env.GENESIS_API_KEY = G['veta-wallet']
  const { routerGenesis } = await import('../lib/genesisPuente.js')
  const app = express()
  app.use(express.json())
  const sesion = (req, _res, next) => { req.usuario = JSON.parse(req.get('x-usuario')); next() }
  app.use('/genesis', routerGenesis({ exigirSesion: sesion, correoVerificado: () => true }))
  wallet = app.listen(0, '127.0.0.1')
  await new Promise((listo) => wallet.once('listening', listo))
  BASE = `http://127.0.0.1:${wallet.address().port}`

  // El relevo del chat, el de verdad, contra el mismo Genesis.
  const puerto = await puertoLibre()
  const tmp = mkdtempSync(path.join(tmpdir(), 'relevo-punta-'))
  relevo = spawn('python3', [RELEVO], {
    env: {
      ...process.env,
      MENSAJES_DATOS: path.join(tmp, 'd.json'), MENSAJES_PUERTO: String(puerto),
      MENSAJES_ARCHIVOS: path.join(tmp, 'arch'), MENSAJES_GENESIS_URL: genesis.base,
      MENSAJES_GENESIS_CLAVE: G.pulse2chat, MENSAJES_ALTA_CON_PRUEBA: '1',
      MENSAJES_WALLET_URL: 'http://127.0.0.1:9',
    },
    stdio: 'ignore',
  })
  hijos.push(relevo)
  RELEVO_URL = `http://127.0.0.1:${puerto}`
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(RELEVO_URL + '/salud')).ok) break } catch { /* todavía no */ }
    await new Promise((r) => setTimeout(r, 250))
  }
})

after(() => {
  wallet?.close()
  for (const h of hijos) { try { h.kill('SIGKILL') } catch { /* ya salió */ } }
})

const ANA = { id: 'cuenta-ana', email: 'ana@prueba.local' }
async function pase(cuerpo, usuario = ANA) {
  const r = await fetch(BASE + '/genesis/sso/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-usuario': JSON.stringify(usuario) },
    body: JSON.stringify(cuerpo),
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) }
}
async function post(url, cuerpo, clave) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(clave ? { 'X-API-Key': clave } : {}) },
    body: JSON.stringify(cuerpo),
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) }
}

test('un pase para AU-RA y el chat SIN reto no sale: 400 RETO_OBLIGATORIO', { skip: saltar }, async () => {
  const r = await pase({ aud: ['aura', 'pulse2chat'] })
  assert.equal(r.estado, 400, JSON.stringify(r.cuerpo))
  assert.equal(r.cuerpo.codigo, 'RETO_OBLIGATORIO')
})

test('con reto sale; el relevo solo lo canjea con SU verificador; AU-RA aparte, con el cumpleaños sin año', { skip: saltar }, async () => {
  const v = verificador()
  const p = await pase({ aud: ['aura', 'pulse2chat'], reto: huella(v) })
  assert.equal(p.estado, 200, JSON.stringify(p.cuerpo))
  const token = p.cuerpo.token

  const intruso = await post(RELEVO_URL + '/alta', { pase: token, verificador: verificador() })
  assert.equal(intruso.estado, 409, JSON.stringify(intruso.cuerpo))
  assert.equal(intruso.cuerpo.motivo, 'pase-no-vale')
  const sinVerif = await post(RELEVO_URL + '/alta', { pase: token })
  assert.equal(sinVerif.cuerpo.motivo, 'pase-no-vale')

  const chat = await post(RELEVO_URL + '/alta', { pase: token, verificador: v, nombre: 'Ana' })
  assert.equal(chat.estado, 200, JSON.stringify(chat.cuerpo))
  assert.equal(chat.cuerpo.correo, 'ana@prueba.local')
  assert.ok(chat.cuerpo.llave)

  // AU-RA canjea el mismo pase por su lado (su servidor, con su clave).
  const aura = await post(genesis.base + '/api/v1/sso/verificar', { token, verificador: v }, G.aura)
  assert.equal(aura.estado, 200, JSON.stringify(aura.cuerpo))
  assert.equal(aura.cuerpo.gid, genesis.gidAna)
  assert.equal(aura.cuerpo.perfil.cumple, '07-04')
  assert.ok(!JSON.stringify(aura.cuerpo).includes('1990'), 'el año no viaja')
  const otraVez = await post(genesis.base + '/api/v1/sso/verificar', { token, verificador: v }, G.aura)
  assert.equal(otraVez.cuerpo.codigo, 'USADO')
})

test('cada «no» llega con su código', { skip: saltar }, async () => {
  const conReto = { aud: ['aura', 'pulse2chat'], reto: huella(verificador()) }
  const casos = [
    [{ id: 'u-nadie', email: 'nadie@prueba.local' }, 'GID_SIN_IDENTIDAD'],
    [{ id: 'u-vacia', email: 'vacia@prueba.local' }, 'GID_SIN_IDENTIDAD'],
    [{ id: 'u-amedias', email: 'amedias@prueba.local' }, 'GID_PENDIENTE'],
    [{ id: 'u-sinvinculo', email: 'sinvinculo@prueba.local' }, 'CUENTA_NO_VINCULADA'],
  ]
  for (const [usuario, codigo] of casos) {
    const r = await pase(conReto, usuario)
    assert.equal(r.estado, 403, `${usuario.email}: ${JSON.stringify(r.cuerpo)}`)
    assert.equal(r.cuerpo.codigo, codigo, usuario.email)
  }
})

test('con Genesis caído: GENESIS_RED, no «sin Genesis ID»', { skip: saltar }, async () => {
  genesis.hijo.kill('SIGKILL')
  await new Promise((r) => setTimeout(r, 300))
  const r = await pase({ aud: ['aura', 'pulse2chat'], reto: huella(verificador()) })
  assert.ok(r.estado >= 500, String(r.estado))
  assert.equal(r.cuerpo.codigo, 'GENESIS_RED')
})
