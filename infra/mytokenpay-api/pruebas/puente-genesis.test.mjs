// El puente de MyTokenPay con Genesis ID es EL MISMO que el de Veta Wallet.
//
//   node --test pruebas/puente-genesis.test.mjs
//
// La copia byte a byte la vigila la prueba de Veta
// (infra/veta-wallet-backend/pruebas/probar-puente-genesis.mjs). Esta comprueba
// lo único propio de MyTokenPay: que el adaptador de `src/routes/genesis.ts`
// monta ese puente detrás de la sesión de la casa, y QUÉ sesiones tienen el
// correo comprobado. El alta de MyTokenPay no verifica el correo, así que:
//
//   · con una sesión de contraseña no se ata la cuenta, no se piden pases de
//     SSO y no se escribe sobre una identidad ya verificada —si no, quien se
//     diera de alta con el correo de otra persona entraba como ella en
//     Ordenex, AuCorp y Ultron, o le cambiaba la foto de la credencial—;
//   · con una sesión abierta con un pase de Genesis ID (`/api/auth/sso`) para
//     el GID de la cuenta, sí;
//   · la dirección de billetera nunca sale del cuerpo de la petición.
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
// Una persona YA verificada en Genesis, con su billetera de Veta. Su correo es
// lo único que sabe quien intenta hacerse pasar por ella.
const VICTIMA = 'victima-' + Date.now() + '@prueba.test'
const GID_VICTIMA = 'GEN-VICT-IMA1-A'
const GID_OTRO = 'GEN-OTRO-GIDX-B'
const identidades = new Map([[VICTIMA, { id: 'idn-victima', gid: GID_VICTIMA, estado: 'verificada' }]])
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
      const correo = decodeURIComponent(ruta.slice('/api/v1/identidades/por-email/'.length)).toLowerCase()
      return contestar(200, { identidad: identidades.get(correo) ?? { id: 'idn-mtp', gid: null, estado: 'datos' } })
    }
    if (ruta === '/api/v1/vinculos') return contestar(200, { ok: true })
    if (/^\/api\/v1\/identidades\/[^/]+\/(foto|datos)$/.test(ruta)) return contestar(200, { ok: true, identidad: {} })
    // Un pase «de verdad» para el GID de la víctima: lo tendría ELLA, al venir
    // de Veta. El correo que acompaña al pase se comprueba contra por-email.
    if (ruta === '/api/v1/sso/verificar') {
      return json?.token === 'pase-de-la-victima'
        ? contestar(200, { valido: true, gid: GID_VICTIMA, perfil: { nombre: 'Víctima', apps: [{ app: 'veta-wallet', direccion: '0x1111111111111111111111111111111111111111' }] } })
        : contestar(401, { valido: false })
    }
    if (ruta === '/api/v1/sso/token') return contestar(200, { token: 'PASE-EMITIDO', eco: json })
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

test('/vincular con una dirección en el cuerpo: 422 VINCULO_DIRECCION_SIN_PRUEBA, y Genesis ni se entera', async () => {
  // Una dirección del cuerpo no prueba que sea de quien la manda: con ella se
  // ataba a un GID la billetera de otro y OrdenScan la enseñaba «verificada».
  const antes = vinculos().length
  for (const direccion of ['0x52908400098527886E0F7030069857D2E4169EE7', '0x1234']) {
    const r = await pedir('/genesis/vincular', { metodo: 'POST', token: TOKEN, cuerpo: { direccion, cuenta: 'la-de-otro' } })
    assert.equal(r.estado, 422, r.texto)
    assert.equal(r.datos.codigo, 'VINCULO_DIRECCION_SIN_PRUEBA')
  }
  assert.equal(vinculos().length, antes)
})

test('las rutas que a la copia vieja le faltaban ya existen (es el mismo puente)', async () => {
  // A medio trámite (sin GID), el trámite sigue abierto a la sesión de contraseña.
  const f = await pedir('/genesis/foto', { metodo: 'POST', token: TOKEN, cuerpo: { foto: 'x' } })
  assert.equal(f.estado, 200)
  const d = await pedir('/genesis/datos', { metodo: 'POST', token: TOKEN, cuerpo: { nombreCompleto: 'Prueba Puente' } })
  assert.equal(d.estado, 200)
  const s = await pedir('/genesis/status', { token: TOKEN })
  assert.equal(s.estado, 200)
})

// ── Con el correo de otra persona ───────────────────────────────────────────

const pedidosA = (r) => recibido.filter((x) => x.ruta === r).length
const alta2 = await pedir('/api/auth/signup', { metodo: 'POST', cuerpo: { email: VICTIMA.toUpperCase(), password: 'ClaveDelIntruso1', fullName: 'Intruso' } })
assert.equal(alta2.estado, 201, 'el alta sigue sin verificar el correo: eso no lo cambia este arreglo')
const INTRUSO = alta2.datos.token

test('alta con el correo de una verificada: no hay pase de SSO a su nombre', async () => {
  const antes = pedidosA('/api/v1/sso/token')
  const r = await pedir('/genesis/sso/token', { metodo: 'POST', token: INTRUSO, cuerpo: {} })
  assert.equal(r.estado, 403, r.texto)
  assert.equal(r.datos.codigo, 'CORREO_NO_VERIFICADO')
  assert.ok(!r.texto.includes('PASE-EMITIDO'))
  assert.equal(pedidosA('/api/v1/sso/token'), antes, 'Genesis ni se enteró')
})

test('alta con el correo de una verificada: no ata la cuenta ni toca su identidad', async () => {
  const antes = recibido.length
  const v = await pedir('/genesis/vincular', { metodo: 'POST', token: INTRUSO, cuerpo: { direccion: '0x2222222222222222222222222222222222222222' } })
  assert.equal(v.estado, 422)
  for (const [ruta, cuerpo] of [['/genesis/foto', { foto: 'x' }], ['/genesis/datos', { nombreCompleto: 'X' }], ['/genesis/biometria', { selfie: 'x' }]]) {
    const r = await pedir(ruta, { metodo: 'POST', token: INTRUSO, cuerpo })
    assert.equal(r.estado, 403, ruta)
    assert.equal(r.datos.codigo, 'CORREO_NO_VERIFICADO', ruta)
  }
  const escrituras = recibido.slice(antes).filter((x) => x.metodo === 'POST')
  assert.deepEqual(escrituras.map((x) => x.ruta), [], 'a Genesis solo le llegaron lecturas')
})

test('la dueña entra con su pase de Genesis: su sesión SÍ pide pases; la contraseña del intruso, no', async () => {
  // Entra por SSO. Su cuenta es la que el intruso creó con su correo (se ata
  // por correo): justo por eso la contraseña de esa cuenta no puede bastar.
  const sso = await pedir('/api/auth/sso', { metodo: 'POST', cuerpo: { token: 'pase-de-la-victima', email: VICTIMA } })
  assert.equal(sso.estado, 200, sso.texto)
  const DUENA = sso.datos.token
  const ok = await pedir('/genesis/sso/token', { metodo: 'POST', token: DUENA, cuerpo: {} })
  assert.equal(ok.estado, 200, ok.texto)
  assert.equal(ok.datos.token, 'PASE-EMITIDO')
  assert.deepEqual(ok.datos.eco, { gid: GID_VICTIMA, cuenta: alta2.datos.user.id })

  // El intruso vuelve a entrar con su contraseña: la cuenta ya tiene GID, pero
  // su sesión no se abrió con un pase.
  const login = await pedir('/api/auth/login', { metodo: 'POST', cuerpo: { email: VICTIMA, password: 'ClaveDelIntruso1' } })
  assert.equal(login.estado, 200)
  const r = await pedir('/genesis/sso/token', { metodo: 'POST', token: login.datos.token, cuerpo: {} })
  assert.equal(r.estado, 403)
  assert.equal(r.datos.codigo, 'CORREO_NO_VERIFICADO')
  const f = await pedir('/genesis/foto', { metodo: 'POST', token: login.datos.token, cuerpo: { foto: 'x' } })
  assert.equal(f.estado, 403)
})

test('sesión de SSO, pero el correo ya lleva a OTRO GID: 403 SESION_GID_AJENO', async () => {
  const sso = await pedir('/api/auth/sso', { metodo: 'POST', cuerpo: { token: 'pase-de-la-victima', email: VICTIMA } })
  assert.equal(sso.estado, 200)
  identidades.set(VICTIMA, { id: 'idn-otra', gid: GID_OTRO, estado: 'verificada' })
  try {
    const r = await pedir('/genesis/sso/token', { metodo: 'POST', token: sso.datos.token, cuerpo: {} })
    assert.equal(r.estado, 403)
    assert.equal(r.datos.codigo, 'SESION_GID_AJENO')
  } finally {
    identidades.set(VICTIMA, { id: 'idn-victima', gid: GID_VICTIMA, estado: 'verificada' })
  }
})
