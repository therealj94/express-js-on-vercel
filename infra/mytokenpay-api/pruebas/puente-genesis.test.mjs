// El puente de MyTokenPay con Genesis ID es EL MISMO que el de Veta Wallet.
//
//   node --test pruebas/puente-genesis.test.mjs
//
// La copia byte a byte la vigila la prueba de Veta
// (infra/veta-wallet-backend/pruebas/probar-puente-genesis.mjs). Esta comprueba
// lo único propio de MyTokenPay: que el adaptador de `src/routes/genesis.ts`
// monta ese puente detrás de la sesión de la casa, y que con él `/vincular`
// por fin funciona —manda el correo que Genesis exige— y exige la dirección
// de billetera (SFSP v0.3 §11).
//
// Levanta el API de verdad (almacén en memoria) apuntando a un Genesis ID DE
// MENTIRA en 127.0.0.1. Ninguna red ni clave de verdad.

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as crearNet } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CASA = join(AQUI, '..')
const CLAVE = 'gid_test_solo_para_esta_prueba'

async function puertoLibre() {
  return new Promise((ok) => {
    const s = crearNet()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => ok(p))
    })
  })
}

// ── El Genesis de mentira ───────────────────────────────────────────────────
const recibido = []
const genesis = createServer((req, res) => {
  let cuerpo = ''
  req.on('data', (d) => { cuerpo += d })
  req.on('end', () => {
    const ruta = req.url.split('?')[0]
    let json = null
    try { json = cuerpo ? JSON.parse(cuerpo) : null } catch { /* no era JSON */ }
    recibido.push({ metodo: req.method, ruta, clave: req.headers['x-api-key'], cuerpo: json })
    const contestar = (estado, datos) => {
      res.writeHead(estado, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(datos))
    }
    if (ruta.startsWith('/api/v1/identidades/por-email/')) {
      return contestar(200, { identidad: { id: 'idn-mtp', gid: null, estado: 'datos' } })
    }
    if (ruta === '/api/v1/vinculos') return contestar(200, { ok: true })
    if (ruta === '/api/v1/identidades/idn-mtp/foto') return contestar(200, { ok: true })
    // Todo lo demás que el API le pregunte al arrancar (telemetría, directorio).
    return contestar(200, {})
  })
})
await new Promise((r) => genesis.listen(0, '127.0.0.1', r))
const GENESIS = `http://127.0.0.1:${genesis.address().port}`

// ── El API de verdad ────────────────────────────────────────────────────────
const puerto = await puertoLibre()
const BASE = `http://127.0.0.1:${puerto}`
const api = spawn(process.execPath, [join(CASA, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(CASA, 'src', 'index.ts')], {
  cwd: CASA,
  env: {
    ...process.env,
    PORT: String(puerto),
    MONGODB_URI: '',
    NODE_ENV: 'test',
    GENESIS_URL: GENESIS,
    GENESIS_API_KEY: CLAVE,
  },
  stdio: 'ignore',
})
api.unref()
after(() => { api.kill(); genesis.close() })
process.on('exit', () => api.kill())

let vivo = false
for (let i = 0; i < 80 && !vivo; i++) {
  await new Promise((r) => setTimeout(r, 250))
  try { vivo = (await fetch(BASE + '/healthz')).ok } catch { /* todavía no */ }
}
if (!vivo) throw new Error(`El API no levantó en ${BASE}. ¿npm install en infra/mytokenpay-api?`)

async function pedir(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const texto = await r.text()
  let datos = null
  try { datos = texto ? JSON.parse(texto) : null } catch { /* HTML */ }
  return { estado: r.status, datos, texto }
}

const email = `puente-${Date.now()}@prueba.test`
const alta = await pedir('/api/auth/signup', { metodo: 'POST', cuerpo: { email, password: 'Clave12345', fullName: 'Prueba Puente' } })
assert.equal(alta.estado, 201, JSON.stringify(alta.datos))
const TOKEN = alta.datos.token
const ID = alta.datos.user.id
const vinculos = () => recibido.filter((x) => x.ruta === '/api/v1/vinculos')

test('sin la sesión de MyTokenPay el puente no deja pasar', async () => {
  assert.equal((await pedir('/genesis/estado')).estado, 401)
  assert.equal((await pedir('/genesis/vincular', { metodo: 'POST', cuerpo: {} })).estado, 401)
})

test('/vincular sin dirección: 422 VINCULO_SIN_DIRECCION, y Genesis ni se entera', async () => {
  const antes = vinculos().length
  const r = await pedir('/genesis/vincular', { metodo: 'POST', token: TOKEN, cuerpo: {} })
  assert.equal(r.estado, 422)
  assert.equal(r.datos.codigo, 'VINCULO_SIN_DIRECCION')
  assert.equal(vinculos().length, antes)
})

test('/vincular con dirección inválida: 422 VINCULO_DIRECCION_INVALIDA', async () => {
  const r = await pedir('/genesis/vincular', { metodo: 'POST', token: TOKEN, cuerpo: { direccion: '0x1234' } })
  assert.equal(r.estado, 422)
  assert.equal(r.datos.codigo, 'VINCULO_DIRECCION_INVALIDA')
})

test('/vincular con dirección: manda cuenta, correo y dirección normalizada', async () => {
  const r = await pedir('/genesis/vincular', {
    metodo: 'POST', token: TOKEN,
    cuerpo: { direccion: '0x52908400098527886E0F7030069857D2E4169EE7', cuenta: 'la-de-otro' },
  })
  assert.equal(r.estado, 200, r.texto)
  const v = vinculos().at(-1)
  assert.equal(v.cuerpo.cuenta, ID)
  assert.equal(v.cuerpo.email, email)
  assert.equal(v.cuerpo.direccion, '0x52908400098527886e0f7030069857d2e4169ee7')
  assert.equal(v.clave, CLAVE)
  assert.ok(!r.texto.includes(CLAVE))
})

test('las rutas que a la copia vieja le faltaban ya existen (es el mismo puente)', async () => {
  const f = await pedir('/genesis/foto', { metodo: 'POST', token: TOKEN, cuerpo: { foto: 'x' } })
  assert.equal(f.estado, 200)
  const s = await pedir('/genesis/status', { token: TOKEN })
  assert.equal(s.estado, 200)
})
