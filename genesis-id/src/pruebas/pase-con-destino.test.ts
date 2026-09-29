// El pase con destino: el que usan AU-RA y el chat.
//
// Un pase de siempre dice QUIÉN es la persona y vale en cualquier casa del
// ecosistema mientras no venza. Para AU-RA eso no alcanza: el pase vuelve al
// teléfono por un enlace (`ultronfp://…`) que otra app podría registrar, y una
// app que se quedara con él podría entrar en AU-RA —o en el chat— como otra
// persona. Así que el pase de AU-RA lleva tres cosas más, y aquí se prueba cada
// una contra el servidor de verdad:
//
//   · aud   — solo vale en las apps para las que se sacó.
//   · jti   — cada app lo gasta una vez; el segundo intento rebota.
//   · reto  — la huella de un verificador que solo tiene la app que lo pidió;
//             sin él, el pase interceptado no sirve. Y fallar el reto NO gasta
//             el pase (si lo gastara, un intruso se lo quemaría a su dueño).
//
// Y que los pases de siempre, sin destino, sigan exactamente igual: Ordenex,
// AuCorp y ULTRON los verifican sin saber nada de esto.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'crypto'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Server } from 'http'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-destino-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
process.env.GENESIS_ADMIN_EMAIL = 'admin@prueba.local'
process.env.GENESIS_ADMIN_PASSWORD = 'contrasena-de-prueba-larga'
process.env.GENESIS_SSO_SECRETO = 'secreto-de-prueba'
delete process.env.GENESIS_MONGO_URL

let servidor: Server
let base: string
let gid = ''
const claves: Record<string, string> = {}

const { default: app, arrancar } = await import('../index.js')
const { store } = await import('../store.js')

const pedir = async (ruta: string, clave: string, cuerpo: unknown) => {
  const r = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': clave },
    body: JSON.stringify(cuerpo),
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) as any }
}
const verificador = () => randomBytes(32).toString('base64url')
const huella = (v: string) => createHash('sha256').update(v).digest('base64url')
const pase = (cuerpo: Record<string, unknown>) =>
  pedir('/api/v1/sso/token', claves['veta-wallet'], { gid, cuenta: 'cuenta-1', ...cuerpo })
const verificar = (app: string, cuerpo: Record<string, unknown>) =>
  pedir('/api/v1/sso/verificar', claves[app], cuerpo)

before(async () => {
  await arrancar()
  await new Promise<void>((listo) => {
    servidor = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(servidor.address() as any).port}`
      listo()
    })
  })
  const { rotar } = await import('../auth/aplicaciones.js')
  for (const clave of ['veta-wallet', 'aura', 'pulse2chat', 'ordenex']) {
    const a = store.todo().aplicaciones.find((x) => x.clave === clave)
    assert.ok(a, `falta la app ${clave}: tendría que darse de alta sola al arrancar`)
    claves[clave] = rotar(a.id, 'prueba')!
  }

  const ids = await import('../motor/identidades.js')
  const { gidPersonal } = await import('../lib/uid.js')
  const identidad = ids.iniciar('persona@prueba.local', 'prueba')
  identidad.nombreLegal = 'Persona De Prueba'
  identidad.estado = 'verificada'
  identidad.gid = gidPersonal()
  identidad.verificadaEn = new Date().toISOString()
  identidad.vinculos = [{
    app: 'veta-wallet', cuenta: 'cuenta-1', direccion: null,
    vinculadaEn: new Date().toISOString(), ultimoAcceso: null,
  }]
  gid = identidad.gid
  await store.guardarYa()
})

after(() => {
  servidor?.close()
  rmSync(carpeta, { recursive: true, force: true })
})

describe('Las apps nuevas', () => {
  test('AU-RA y PULSE2CHAT se dan de alta con lo justo', () => {
    const aura = store.todo().aplicaciones.find((a) => a.clave === 'aura')!
    const chat = store.todo().aplicaciones.find((a) => a.clave === 'pulse2chat')!
    assert.deepEqual([...aura.alcances].sort(), ['gid.correo', 'gid.perfil', 'gid.verificar'])
    assert.deepEqual([...chat.alcances].sort(), ['gid.correo', 'gid.verificar'])
  })
})

describe('Pedir el pase', () => {
  test('un destino que no existe se rechaza', async () => {
    const r = await pase({ aud: ['aura', 'inventada'] })
    assert.equal(r.estado, 400)
    assert.match(r.cuerpo.error, /inventada/)
  })
  test('un reto que no es una huella SHA-256 se rechaza', async () => {
    const r = await pase({ aud: 'aura', reto: 'corto' })
    assert.equal(r.estado, 400)
  })
})

describe('Un pase para AU-RA y el chat', () => {
  test('cada destino lo gasta una vez, con el verificador, y ve el correo', async () => {
    const v = verificador()
    const p = await pase({ aud: ['aura', 'pulse2chat'], reto: huella(v) })
    assert.equal(p.estado, 200, JSON.stringify(p.cuerpo))

    const a = await verificar('aura', { token: p.cuerpo.token, verificador: v })
    assert.equal(a.estado, 200, JSON.stringify(a.cuerpo))
    assert.equal(a.cuerpo.gid, gid)
    assert.equal(a.cuerpo.correo, 'persona@prueba.local')
    assert.equal(a.cuerpo.perfil.verificada, true)
    assert.deepEqual(a.cuerpo.aud, ['aura', 'pulse2chat'])

    // El chat también puede, una vez, y no recibe el perfil (no tiene el alcance).
    const c = await verificar('pulse2chat', { token: p.cuerpo.token, verificador: v })
    assert.equal(c.estado, 200, JSON.stringify(c.cuerpo))
    assert.equal(c.cuerpo.correo, 'persona@prueba.local')
    assert.equal(c.cuerpo.perfil, undefined)

    const otraVez = await verificar('aura', { token: p.cuerpo.token, verificador: v })
    assert.equal(otraVez.estado, 401)
    assert.equal(otraVez.cuerpo.codigo, 'USADO')
  })

  test('en una app que no es su destino no vale', async () => {
    const v = verificador()
    const p = await pase({ aud: 'aura', reto: huella(v) })
    const r = await verificar('ordenex', { token: p.cuerpo.token, verificador: v })
    assert.equal(r.estado, 401)
    assert.equal(r.cuerpo.codigo, 'OTRA_APP')
  })

  test('sin el verificador no vale, y el intento no se lo quema a su dueño', async () => {
    const v = verificador()
    const p = await pase({ aud: 'aura', reto: huella(v) })
    const sin = await verificar('aura', { token: p.cuerpo.token })
    assert.equal(sin.estado, 401)
    assert.equal(sin.cuerpo.codigo, 'RETO')
    const otro = await verificar('aura', { token: p.cuerpo.token, verificador: verificador() })
    assert.equal(otro.cuerpo.codigo, 'RETO')

    const dueño = await verificar('aura', { token: p.cuerpo.token, verificador: v })
    assert.equal(dueño.estado, 200, JSON.stringify(dueño.cuerpo))
  })
})

describe('Los pases de siempre', () => {
  test('sin destino siguen valiendo donde sea y las veces que sea', async () => {
    const p = await pase({})
    assert.equal(p.estado, 200)
    for (let i = 0; i < 2; i++) {
      const r = await verificar('ordenex', { token: p.cuerpo.token })
      assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
      assert.equal(r.cuerpo.gid, gid)
      assert.equal(r.cuerpo.correo, undefined, 'Ordenex no tiene gid.correo')
      assert.equal(r.cuerpo.aud, undefined)
    }
  })
})
