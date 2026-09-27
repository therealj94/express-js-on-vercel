// Las llaves de las cuentas de MyTokenPay: reseteo, sesiones y la contraseña
// del administrador.
//
//   node --import tsx --test pruebas/cuentas.test.mjs
//
// Lo que se cerró aquí (hallazgo de seguridad transversal, 26-sep-2026):
//
//   · `/forgot-password` entregaba el código de reseteo a cualquiera, también
//     para el correo del administrador, que está publicado. Con él se fijaba
//     una contraseña nueva y se entraba al panel que aprueba comercios y marca
//     retiros como pagados. Al administrador ya no se le entrega nunca.
//   · El código de reseteo servía TAMBIÉN de sesión (Bearer) durante sus quince
//     minutos, sin tocar la contraseña y sin que la dueña lo notara.
//   · Cambiar ADMIN_PASSWORD en Heroku no cambiaba nada: si la cuenta ya
//     existía, solo se le ponía el rol. Y las sesiones de treinta días no se
//     podían revocar.
//
// Levanta el API de verdad (almacén en memoria), sin red y sin claves reales.

import test, { after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer as crearNet } from 'node:net'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CASA = join(AQUI, '..')
const jwt = createRequire(join(CASA, 'package.json'))('jsonwebtoken')

const SECRETO = 'secreto-jwt-solo-de-esta-prueba'
const ADMIN_EMAIL = 'admin-cuentas@prueba.local'
const ADMIN_PASSWORD = 'clave-de-admin-de-prueba-larga'

async function puertoLibre() {
  return new Promise((ok) => {
    const s = crearNet()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => ok(p))
    })
  })
}

async function levantar(envExtra = {}) {
  const puerto = await puertoLibre()
  const base = `http://127.0.0.1:${puerto}`
  const api = spawn(process.execPath, [join(CASA, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(CASA, 'src', 'index.ts')], {
    cwd: CASA,
    env: {
      ...process.env,
      PORT: String(puerto),
      MONGODB_URI: '',
      NODE_ENV: 'test',
      JWT_SECRET: SECRETO,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      // Sin Genesis: la puerta del bloqueo no tiene a quién preguntar.
      GENESIS_URL: 'http://127.0.0.1:9',
      GENESIS_API_KEY: '',
      MTP_OCULTAR_TOKEN_RESETEO: '',
      ...envExtra,
    },
    stdio: 'ignore',
  })
  api.unref()
  after(() => api.kill())
  process.on('exit', () => api.kill())
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 250))
    try { if ((await fetch(base + '/healthz')).ok) break } catch { /* todavía no */ }
  }
  const pedir = async (ruta, { metodo = 'GET', cuerpo, token } = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    const texto = await r.text()
    let datos = null
    try { datos = texto ? JSON.parse(texto) : null } catch { /* HTML */ }
    return { estado: r.status, datos }
  }
  return pedir
}

const pedir = await levantar()
const alta = async (email, password = 'ClaveDePrueba1') => {
  const r = await pedir('/api/auth/signup', { metodo: 'POST', cuerpo: { email, password, fullName: 'Persona de Prueba' } })
  assert.equal(r.estado, 201, JSON.stringify(r.datos))
  return r.datos
}

describe('olvidé mi contraseña', () => {
  test('al ADMINISTRADOR no se le entrega código: la misma respuesta que a un correo que no existe', async () => {
    const admin = await pedir('/api/auth/forgot-password', { metodo: 'POST', cuerpo: { email: ADMIN_EMAIL } })
    const nadie = await pedir('/api/auth/forgot-password', { metodo: 'POST', cuerpo: { email: 'nadie@prueba.local' } })
    assert.equal(admin.estado, 200)
    assert.equal(admin.datos.demoResetToken, undefined)
    assert.deepEqual(admin.datos, nadie.datos)
  })

  test('ni con un código firmado a mano (o de antes del cambio) se resetea al administrador', async () => {
    const login = await pedir('/api/auth/login', { metodo: 'POST', cuerpo: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
    assert.equal(login.estado, 200)
    const falso = jwt.sign({ sub: login.datos.user.id, purpose: 'reset' }, SECRETO, { expiresIn: '15m' })
    const r = await pedir('/api/auth/reset-password', { metodo: 'POST', cuerpo: { token: falso, newPassword: 'OtraClave123' } })
    assert.equal(r.estado, 400)
    const sigue = await pedir('/api/auth/login', { metodo: 'POST', cuerpo: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
    assert.equal(sigue.estado, 200, 'la contraseña del administrador no cambió')
  })

  test('el código de reseteo NO es una sesión', async () => {
    const { user } = await alta(`reseteo-sesion-${Date.now()}@prueba.local`)
    const r = await pedir('/api/auth/forgot-password', { metodo: 'POST', cuerpo: { email: user.email } })
    assert.ok(r.datos.demoResetToken, 'a una cuenta normal se le sigue entregando (la app lo usa)')
    const me = await pedir('/api/auth/me', { token: r.datos.demoResetToken })
    assert.equal(me.estado, 401)
  })

  test('el código sirve una sola vez, y el reseteo cierra las sesiones de antes', async () => {
    const { user, token: sesionVieja } = await alta(`reseteo-unico-${Date.now()}@prueba.local`)
    assert.equal((await pedir('/api/auth/me', { token: sesionVieja })).estado, 200)
    const { datos } = await pedir('/api/auth/forgot-password', { metodo: 'POST', cuerpo: { email: user.email } })
    const codigo = datos.demoResetToken
    const r1 = await pedir('/api/auth/reset-password', { metodo: 'POST', cuerpo: { token: codigo, newPassword: 'ClaveNueva123' } })
    assert.equal(r1.estado, 200)
    const r2 = await pedir('/api/auth/reset-password', { metodo: 'POST', cuerpo: { token: codigo, newPassword: 'OtraMas12345' } })
    assert.equal(r2.estado, 400, 'el mismo código no se usa dos veces')
    assert.equal((await pedir('/api/auth/me', { token: sesionVieja })).estado, 401, 'la sesión de antes del reseteo ya no vale')
    const login = await pedir('/api/auth/login', { metodo: 'POST', cuerpo: { email: user.email, password: 'ClaveNueva123' } })
    assert.equal(login.estado, 200)
  })
})

describe('sesiones de antes del cambio', () => {
  test('la de una cuenta normal sigue valiendo (nadie sale al desplegar)', async () => {
    const { user } = await alta(`legado-${Date.now()}@prueba.local`)
    const vieja = jwt.sign({ sub: user.id }, SECRETO, { expiresIn: '30d' })
    assert.equal((await pedir('/api/auth/me', { token: vieja })).estado, 200)
  })

  test('la del ADMINISTRADOR no: su contraseña estuvo publicada, tiene que volver a entrar', async () => {
    const login = await pedir('/api/auth/login', { metodo: 'POST', cuerpo: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
    const vieja = jwt.sign({ sub: login.datos.user.id }, SECRETO, { expiresIn: '30d' })
    assert.equal((await pedir('/api/admin/resumen', { token: vieja })).estado, 401)
    assert.equal((await pedir('/api/admin/resumen', { token: login.datos.token })).estado, 200)
  })
})

describe('rotar la contraseña del administrador', () => {
  test('ADMIN_PASSWORD manda también cuando la cuenta ya existe', async () => {
    // En el mismo proceso, contra el almacén en memoria: es lo que hace el
    // arranque (src/index.ts) cada vez que Heroku reinicia el dyno.
    const { db } = await import('../src/lib/db.ts')
    const { verifyPassword } = await import('../src/lib/auth.ts')
    const email = 'admin-rotacion@prueba.local'
    await db.asegurarAdministrador(email, 'la-publicada-en-git')
    const antes = await db.findUserByEmail(email)
    await db.asegurarAdministrador(email, 'la-nueva-de-heroku')
    const despues = await db.findUserByEmail(email)
    assert.equal(despues.role, 'admin')
    assert.equal(verifyPassword('la-publicada-en-git', despues.passwordHash), false)
    assert.equal(verifyPassword('la-nueva-de-heroku', despues.passwordHash), true)
    assert.notEqual(antes.passwordHash, despues.passwordHash)
    // Reiniciar con la MISMA variable no reescribe nada (ni echa a nadie).
    await db.asegurarAdministrador(email, 'la-nueva-de-heroku')
    assert.equal((await db.findUserByEmail(email)).passwordHash, despues.passwordHash)
  })

  test('una cuenta registrada antes con el correo del administrador pierde su contraseña al ascender', async () => {
    const { db } = await import('../src/lib/db.ts')
    const { verifyPassword, hashPassword } = await import('../src/lib/auth.ts')
    const email = 'admin-ocupado@prueba.local'
    await db.createUser({ email, passwordHash: hashPassword('la-del-que-se-adelanto'), fullName: 'X' })
    await db.asegurarAdministrador(email, 'la-de-heroku-123')
    const u = await db.findUserByEmail(email)
    assert.equal(verifyPassword('la-del-que-se-adelanto', u.passwordHash), false)
  })
})

describe('MTP_OCULTAR_TOKEN_RESETEO', () => {
  test('encendida, nadie recibe el código en la respuesta', async () => {
    const otra = await levantar({ MTP_OCULTAR_TOKEN_RESETEO: 'si' })
    const email = `oculto-${Date.now()}@prueba.local`
    assert.equal((await otra('/api/auth/signup', { metodo: 'POST', cuerpo: { email, password: 'ClaveDePrueba1', fullName: 'X' } })).estado, 201)
    const r = await otra('/api/auth/forgot-password', { metodo: 'POST', cuerpo: { email } })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.demoResetToken, undefined)
  })
})
