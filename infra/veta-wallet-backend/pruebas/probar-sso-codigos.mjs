// Por qué no sale un pase de SSO, dicho con un código.
//
//   node --test pruebas/probar-sso-codigos.mjs
//
// Antes todo era un 403 con una frase, y la web y la app lo leían entero como
// «Genesis no verificado»: a quien tenía el trámite en revisión, o la cuenta
// sin atar, se le mandaba a verificarse otra vez, y a AU-RA le llegaba siempre
// `sin-gid`. Aquí, contra un Genesis DE MENTIRA, se prueba cada motivo con su
// código (ver CODIGOS_SSO en lib/genesisPuente.js), que un Genesis caído no se
// confunde con «no tienes Genesis ID», y que ninguna negativa cuenta nada de
// la identidad (ni el GID, ni el nombre, ni por qué se la rechazó).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'

const GID = 'GEN-SECR-ETO1-X'
const NOMBRE = 'Persona Secreta'
/* Lo que contesta el Genesis de mentira, por correo. `idn` es la identidad de
   `/por-email` (null → 404, número → ese estado HTTP); `pase` es la respuesta
   de `/sso/token` como [estado, cuerpo]. */
const CASOS = {
  'nadie@x.test': { idn: null },
  'caido@x.test': { idn: 503 },
  'lleno@x.test': { idn: 429 },
  'iniciada@x.test': { idn: { id: 'i1', gid: null, estado: 'iniciada' } },
  'datos@x.test': { idn: { id: 'i1b', gid: null, estado: 'datos' } },
  'revision@x.test': { idn: { id: 'i2', gid: null, estado: 'en-revision' } },
  'vencida@x.test': { idn: { id: 'i3', gid: GID, estado: 'vencida', nombreLegal: NOMBRE } },
  'suspendida@x.test': { idn: { id: 'i4', gid: GID, estado: 'suspendida', nombreLegal: NOMBRE } },
  'rechazada@x.test': { idn: { id: 'i5', gid: null, estado: 'rechazada' } },
  'bloqueada@x.test': { idn: { id: 'i6', gid: GID, estado: 'verificada', bloqueada: true, nombreLegal: NOMBRE } },
  'ok@x.test': { idn: { id: 'i7', gid: GID, estado: 'verificada' }, pase: [200, { token: 'pase', expiraEnSegundos: 900 }] },
  'sinvinculo@x.test': { idn: { id: 'i8', gid: GID, estado: 'verificada' },
    pase: [403, { error: 'Esa cuenta no está atada a este GID en esta aplicación', codigo: 'CUENTA_NO_VINCULADA' }] },
  // Un Genesis de antes de los códigos: solo la frase.
  'sinvinculo-viejo@x.test': { idn: { id: 'i9', gid: GID, estado: 'verificada' },
    pase: [403, { error: 'Esa cuenta no está atada a este GID en esta aplicación' }] },
  'carrera@x.test': { idn: { id: 'i10', gid: GID, estado: 'verificada' },
    pase: [403, { error: 'El GID no corresponde a una identidad verificada', codigo: 'GID_NO_VERIFICADO' }] },
  'bloq-genesis@x.test': { idn: { id: 'i11', gid: GID, estado: 'verificada' },
    pase: [403, { error: 'El acceso de esta identidad está bloqueado', codigo: 'IDENTIDAD_BLOQUEADA' }] },
  'limite@x.test': { idn: { id: 'i12', gid: GID, estado: 'verificada' }, pase: [429, { error: 'Demasiadas' }] },
  'error@x.test': { idn: { id: 'i13', gid: GID, estado: 'verificada' }, pase: [500, { error: 'pila con /ruta/interna.ts' }] },
  'sinreto@x.test': { idn: { id: 'i14', gid: GID, estado: 'verificada' },
    pase: [400, { error: 'Un pase para aura necesita el reto', codigo: 'RETO_OBLIGATORIO' }] },
  'apagado@x.test': { idn: { id: 'i15', gid: GID, estado: 'verificada' }, pase: 'cortar' },
}

let genesis, wallet, base
const pases = []

before(async () => {
  genesis = http.createServer((req, res) => {
    let datos = ''
    req.on('data', (t) => { datos += t })
    req.on('end', () => {
      const contestar = (estado, cuerpo) => {
        res.statusCode = estado
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(cuerpo))
      }
      const m = req.url.match(/^\/api\/v1\/identidades\/por-email\/(.+)$/)
      if (m) {
        const c = CASOS[decodeURIComponent(m[1])]
        if (!c || c.idn === null) return contestar(404, { error: 'Identidad no encontrada' })
        if (typeof c.idn === 'number') return contestar(c.idn, { error: 'no' })
        return contestar(200, { identidad: c.idn })
      }
      if (req.url === '/api/v1/sso/token') {
        const cuerpo = JSON.parse(datos || '{}')
        pases.push(cuerpo)
        const c = casoActual
        if (c?.pase === 'cortar') return req.socket.destroy()
        return contestar(...(c?.pase || [500, {}]))
      }
      contestar(404, {})
    })
  })
  await new Promise((listo) => genesis.listen(0, '127.0.0.1', listo))
  process.env.GENESIS_URL = `http://127.0.0.1:${genesis.address().port}`
  process.env.GENESIS_API_KEY = 'clave-de-prueba'
  const { routerGenesis } = await import('../lib/genesisPuente.js')
  const app = express()
  app.use(express.json())
  const sesion = (req, _res, next) => { req.usuario = JSON.parse(req.get('x-usuario')); next() }
  app.use('/genesis', routerGenesis({ exigirSesion: sesion, correoVerificado: (req) => req.usuario.correoOk !== false }))
  // Como lo monta MyTokenPay: la sesión no prueba el correo.
  app.use('/mtp', routerGenesis({ exigirSesion: sesion, exigirGidDeSesion: true, correoVerificado: (req) => Boolean(req.usuario.gid) }))
  wallet = app.listen(0, '127.0.0.1')
  await new Promise((listo) => wallet.once('listening', listo))
  base = `http://127.0.0.1:${wallet.address().port}`
})

after(() => { genesis?.close(); wallet?.close() })

let casoActual = null
async function pase(email, { cuerpo = {}, ruta = '/genesis', usuario = {} } = {}) {
  casoActual = CASOS[email]
  const r = await fetch(`${base}${ruta}/sso/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-usuario': JSON.stringify({ id: 'u1', email, ...usuario }) },
    body: JSON.stringify(cuerpo),
  })
  const texto = await r.text()
  return { estado: r.status, cuerpo: JSON.parse(texto || '{}'), texto }
}

/** Ninguna negativa cuenta nada de la identidad. */
function sinFugas(r) {
  for (const fuga of [GID, NOMBRE, 'suspend', 'rechaz', 'bloquead', 'clave-de-prueba', '/ruta/interna']) {
    assert.ok(!r.texto.toLowerCase().includes(fuga.toLowerCase()), `la negativa filtró «${fuga}»: ${r.texto}`)
  }
}

test('sin identidad en Genesis, o solo la «iniciada» vacía: 403 GID_SIN_IDENTIDAD', async () => {
  // `iniciada` es «existe el correo, nada más»: la crea `/estado` al abrir la
  // wallet. Quien está ahí no empezó nada y no tiene Genesis ID.
  for (const email of ['nadie@x.test', 'iniciada@x.test']) {
    const r = await pase(email)
    assert.equal(r.estado, 403, email)
    assert.equal(r.cuerpo.codigo, 'GID_SIN_IDENTIDAD', email)
    sinFugas(r)
  }
})

test('trámite a medias, en revisión o vencido: 403 GID_PENDIENTE', async () => {
  for (const email of ['datos@x.test', 'revision@x.test', 'vencida@x.test']) {
    const r = await pase(email)
    assert.equal(r.estado, 403, email)
    assert.equal(r.cuerpo.codigo, 'GID_PENDIENTE', email)
    sinFugas(r)
  }
})

test('rechazada, suspendida o bloqueada: 403 GID_NO_DISPONIBLE, sin decir cuál', async () => {
  const antes = pases.length
  const frases = new Set()
  for (const email of ['rechazada@x.test', 'suspendida@x.test', 'bloqueada@x.test']) {
    const r = await pase(email)
    assert.equal(r.estado, 403, email)
    assert.equal(r.cuerpo.codigo, 'GID_NO_DISPONIBLE', email)
    sinFugas(r)
    frases.add(r.cuerpo.error)
  }
  assert.equal(frases.size, 1, 'las tres dicen lo mismo')
  assert.equal(pases.length, antes, 'y a Genesis no se le pide un pase que no va a dar')
})

test('verificada pero la cuenta sin atar: 403 CUENTA_NO_VINCULADA (con Genesis nuevo y viejo)', async () => {
  for (const email of ['sinvinculo@x.test', 'sinvinculo-viejo@x.test']) {
    const r = await pase(email)
    assert.equal(r.estado, 403, email)
    assert.equal(r.cuerpo.codigo, 'CUENTA_NO_VINCULADA', email)
    sinFugas(r)
  }
})

test('lo que niega Genesis al emitir se traduce: carrera de estado y bloqueo', async () => {
  const c = await pase('carrera@x.test')
  assert.equal(c.cuerpo.codigo, 'GID_PENDIENTE')
  const b = await pase('bloq-genesis@x.test')
  assert.equal(b.cuerpo.codigo, 'GID_NO_DISPONIBLE')
  sinFugas(b)
})

test('429 de Genesis: 429 LIMITE', async () => {
  const r = await pase('limite@x.test')
  assert.equal(r.estado, 429)
  assert.equal(r.cuerpo.codigo, 'LIMITE')
})

test('Genesis caído o con un 5xx: GENESIS_RED, nunca «no tienes Genesis ID»', async () => {
  const e = await pase('error@x.test')
  assert.equal(e.estado, 500)
  assert.equal(e.cuerpo.codigo, 'GENESIS_RED')
  sinFugas(e)
  const cortado = await pase('apagado@x.test')
  assert.equal(cortado.estado, 504)
  assert.equal(cortado.cuerpo.codigo, 'GENESIS_RED')
  // Al buscar la identidad también: un 503 no es un 404.
  const buscar = await pase('caido@x.test')
  assert.equal(buscar.estado, 503)
  assert.equal(buscar.cuerpo.codigo, 'GENESIS_RED')
  const lleno = await pase('lleno@x.test')
  assert.equal(lleno.estado, 429)
  assert.equal(lleno.cuerpo.codigo, 'LIMITE')
})

test('los 400 de Genesis (reto obligatorio) pasan tal cual', async () => {
  const r = await pase('sinreto@x.test', { cuerpo: { aud: ['aura'] } })
  assert.equal(r.estado, 400)
  assert.equal(r.cuerpo.codigo, 'RETO_OBLIGATORIO')
})

test('verificada y atada: el pase sale', async () => {
  const r = await pase('ok@x.test', { cuerpo: { aud: ['aura', 'pulse2chat'], reto: 'a'.repeat(43) } })
  assert.equal(r.estado, 200)
  assert.equal(r.cuerpo.token, 'pase')
})

test('correo sin comprobar: sigue siendo CORREO_NO_VERIFICADO, sin preguntarle nada a Genesis', async () => {
  const r = await pase('ok@x.test', { usuario: { correoOk: false } })
  assert.equal(r.estado, 403)
  assert.equal(r.cuerpo.codigo, 'CORREO_NO_VERIFICADO')
})

test('MyTokenPay (la sesión no prueba el correo): no se distingue a medias de sin identidad', async () => {
  for (const email of ['nadie@x.test', 'datos@x.test', 'revision@x.test']) {
    const r = await pase(email, { ruta: '/mtp' })
    assert.equal(r.estado, 403, email)
    assert.equal(r.cuerpo.codigo, 'GID_SIN_IDENTIDAD', email)
  }
  // Y de una identidad con GID ajeno a la sesión no se dice ni el estado.
  const v = await pase('vencida@x.test', { ruta: '/mtp' })
  assert.equal(v.cuerpo.codigo, 'CUENTA_NO_ATADA')
  sinFugas(v)
  // La que probó su GID sí sabe el suyo.
  const propia = await pase('vencida@x.test', { ruta: '/mtp', usuario: { gid: GID } })
  assert.equal(propia.cuerpo.codigo, 'GID_PENDIENTE')
})
