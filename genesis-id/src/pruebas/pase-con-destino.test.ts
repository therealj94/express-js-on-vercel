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
let persona: any = null
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
  persona = identidad
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
    assert.deepEqual([...aura.alcances].sort(), ['gid.correo', 'gid.cumple', 'gid.perfil', 'gid.verificar'])
    assert.deepEqual([...chat.alcances].sort(), ['gid.correo', 'gid.verificar'])
  })

  test('la app AU-RA que ya existe en producción recibe gid.cumple al arrancar', async () => {
    const { alinearAlcances } = await import('../auth/aplicaciones.js')
    const aura = store.todo().aplicaciones.find((a) => a.clave === 'aura')!
    // Como la dejó el despliegue anterior: sin el alcance nuevo.
    aura.alcances = aura.alcances.filter((a) => a !== 'gid.cumple')
    const tocadas = alinearAlcances()
    assert.ok(tocadas.some((t) => t.startsWith('aura:') && t.includes('gid.cumple')), JSON.stringify(tocadas))
    assert.ok(aura.alcances.includes('gid.cumple'))
    // Y no se lo da a nadie más.
    const chat = store.todo().aplicaciones.find((a) => a.clave === 'pulse2chat')!
    assert.ok(!chat.alcances.includes('gid.cumple'))
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

  // Un pase de AU-RA o del chat vuelve por un enlace que otra app puede
  // interceptar: sin reto, quien lo intercepte entra como la persona.
  test('para AU-RA o el chat, SIN reto no se emite (400 RETO_OBLIGATORIO)', async () => {
    for (const aud of ['aura', 'pulse2chat', ['aura', 'pulse2chat'], ['ordenex', 'aura']]) {
      const r = await pase({ aud })
      assert.equal(r.estado, 400, `${JSON.stringify(aud)} → ${JSON.stringify(r.cuerpo)}`)
      assert.equal(r.cuerpo.codigo, 'RETO_OBLIGATORIO')
      assert.match(r.cuerpo.error, /reto/)
    }
  })

  test('otros destinos siguen pudiendo pedirlo sin reto (compatibilidad)', async () => {
    const r = await pase({ aud: 'ordenex' })
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    const v = await verificar('ordenex', { token: r.cuerpo.token })
    assert.equal(v.estado, 200, JSON.stringify(v.cuerpo))
    assert.deepEqual(v.cuerpo.aud, ['ordenex'])
  })

  test('las negativas dicen QUÉ falta con un código', async () => {
    const sinVinculo = await pedir('/api/v1/sso/token', claves['veta-wallet'], { gid, cuenta: 'otra-cuenta' })
    assert.equal(sinVinculo.estado, 403)
    assert.equal(sinVinculo.cuerpo.codigo, 'CUENTA_NO_VINCULADA')

    const antes = persona.estado
    persona.estado = 'en-revision'
    try {
      const pendiente = await pase({})
      assert.equal(pendiente.estado, 403)
      assert.equal(pendiente.cuerpo.codigo, 'GID_NO_VERIFICADO')
    } finally {
      persona.estado = antes
    }
  })
})

describe('Un pase de AU-RA sin reto emitido antes de exigirlo', () => {
  test('no se canjea aunque la firma valga', async () => {
    const { firmarToken } = await import('../lib/cripto.js')
    const ahora = Math.floor(Date.now() / 1000)
    for (const app of ['aura', 'pulse2chat']) {
      const viejo = firmarToken({
        sub: gid, app: 'veta-wallet', alcances: ['perfil'], iat: ahora, exp: ahora + 600,
        aud: ['aura', 'pulse2chat'], jti: randomBytes(16).toString('base64url'),
      }, 'secreto-de-prueba')
      const r = await verificar(app, { token: viejo, verificador: verificador() })
      assert.equal(r.estado, 401, JSON.stringify(r.cuerpo))
      assert.equal(r.cuerpo.codigo, 'RETO')
    }
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

describe('El cumpleaños (gid.cumple)', () => {
  /** Un pase nuevo para AU-RA y su perfil tal como lo recibe. */
  const perfilEn = async (app: string, fechas: { fechaNacimiento?: string | null; fechaNacimientoDeclarada?: string | null }) => {
    persona.fechaNacimiento = fechas.fechaNacimiento ?? null
    persona.fechaNacimientoDeclarada = fechas.fechaNacimientoDeclarada ?? null
    const v = verificador()
    const p = await pase({ aud: app, reto: huella(v) })
    assert.equal(p.estado, 200, JSON.stringify(p.cuerpo))
    const r = await verificar(app, { token: p.cuerpo.token, verificador: v })
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    return r.cuerpo
  }

  test('AU-RA recibe mes y día del documento verificado, sin el año', async () => {
    const c = await perfilEn('aura', { fechaNacimiento: '1990-07-04', fechaNacimientoDeclarada: '1990-07-05' })
    assert.equal(c.perfil.cumple, '07-04')
    assert.ok(!JSON.stringify(c).includes('1990'), 'el año no puede viajar en ninguna parte de la respuesta')
    assert.equal(c.cumple, undefined, 'va dentro del perfil, no suelto')
  })

  test('si el trámite no dejó la del documento, sale la declarada', async () => {
    const c = await perfilEn('aura', { fechaNacimiento: null, fechaNacimientoDeclarada: '1985-12-31' })
    assert.equal(c.perfil.cumple, '12-31')
  })

  test('sin ninguna fecha, el campo no viene', async () => {
    const c = await perfilEn('aura', {})
    assert.equal(c.perfil.verificada, true)
    assert.ok(!('cumple' in c.perfil))
  })

  test('una fecha que no es un día de verdad cuenta como que no hay', async () => {
    const malas = await perfilEn('aura', { fechaNacimiento: '1990-04-31', fechaNacimientoDeclarada: '17/04/1991' })
    assert.ok(!('cumple' in malas.perfil), JSON.stringify(malas.perfil))
    // La del documento mala no tapa una declarada buena.
    const cae = await perfilEn('aura', { fechaNacimiento: '1990-13-01', fechaNacimientoDeclarada: '1991-04-17' })
    assert.equal(cae.perfil.cumple, '04-17')
    // El 29 de febrero vale solo en año bisiesto.
    assert.equal((await perfilEn('aura', { fechaNacimiento: '2000-02-29' })).perfil.cumple, '02-29')
    assert.ok(!('cumple' in (await perfilEn('aura', { fechaNacimiento: '2001-02-29' })).perfil))
  })

  test('el formato es siempre MM-DD con ceros', async () => {
    const c = await perfilEn('aura', { fechaNacimiento: '1979-01-09' })
    assert.match(c.perfil.cumple, /^\d{2}-\d{2}$/)
    assert.equal(c.perfil.cumple, '01-09')
  })

  test('una app sin el alcance no lo ve aunque tenga el perfil', async () => {
    const c = await perfilEn('ordenex', { fechaNacimiento: '1990-07-04' })
    assert.equal(c.perfil.verificada, true)
    assert.ok(!('cumple' in c.perfil))
    assert.ok(!JSON.stringify(c).includes('07-04'))
    // Y el chat, que no tiene ni perfil, tampoco.
    const chat = await perfilEn('pulse2chat', { fechaNacimiento: '1990-07-04' })
    assert.equal(chat.perfil, undefined)
    assert.ok(!JSON.stringify(chat).includes('07-04'))
  })
})
