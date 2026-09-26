// SFSP v0.3 (§8.5, §11 y Apéndice A) en Genesis ID, contra el servidor de verdad.
//
// Tres cosas, las tres de la tarea 0.6 del plan:
//
//   · Los estados que se PUBLICAN son los seis del Apéndice A. Los cuatro pasos
//     del trámite salen como «pendiente»; ningún estado del motor queda sin
//     mapear (eso lo asegura además el compilador: el mapa es un Record).
//   · `vencida`: una verificada cuyo documento caducó deja de valer —sin GID
//     verificado, sin SSO— pero conserva el GID; vuelve por el camino normal,
//     y `aprobar()` no la re-aprueba con el mismo documento vencido.
//   · Todo vínculo lleva dirección de billetera válida. Sin ella, 422 con un
//     código claro. Es la condición del límite de exposición por Genesis ID.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Server } from 'http'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-v03-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
process.env.GENESIS_ADMIN_EMAIL = 'admin@prueba.local'
process.env.GENESIS_ADMIN_PASSWORD = 'contrasena-de-prueba-larga'
process.env.GENESIS_SSO_SECRETO = 'secreto-de-prueba'
delete process.env.GENESIS_MONGO_URL
delete process.env.GENESIS_VENCER_AUTO

const { default: app, arrancar } = await import('../index.js')
const { store } = await import('../store.js')
const ids = await import('../motor/identidades.js')
const { ESTADO_PUBLICADO, estadoPublicado, documentoVencido } = await import('../motor/estados.js')
const { normalizarDireccion } = await import('../lib/direccion.js')
const { gidPersonal } = await import('../lib/uid.js')
const { unaVuelta, _reiniciarParaPruebas } = await import('../aml/temporizador.js')

let servidor: Server
let base = ''
let clave = ''

const pedir = async (ruta: string, opciones: RequestInit = {}) => {
  const r = await fetch(base + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) as any }
}
const conClave = () => ({ 'X-API-Key': clave })

/** Una identidad YA verificada, puesta a mano: el KYC entero lo prueba flujo.test.ts. */
function verificada(email: string, vencimientoDocumento: string) {
  const i = ids.iniciar(email, 'prueba')
  i.nombreLegal = 'Anna Maria Eriksson'
  i.nacionalidad = 'HND'
  i.estado = 'verificada'
  i.gid = gidPersonal()
  i.verificadaEn = new Date().toISOString()
  i.vencimientoDocumento = vencimientoDocumento
  return i
}

const DIR_EIP55 = '0x52908400098527886E0F7030069857D2E4169EE7'
const DIR_MINUS = DIR_EIP55.toLowerCase()

before(async () => {
  await arrancar()
  await new Promise<void>((listo) => {
    servidor = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(servidor.address() as any).port}`
      listo()
    })
  })
  const { rotar } = await import('../auth/aplicaciones.js')
  const veta = store.todo().aplicaciones.find((a) => a.clave === 'veta-wallet')!
  clave = rotar(veta.id, 'prueba')!
})

after(() => {
  servidor?.close()
  rmSync(carpeta, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Estados publicados (Apéndice A del SFSP v0.3)', () => {
  test('los cuatro pasos del trámite salen como «pendiente»', () => {
    for (const e of ['iniciada', 'datos', 'documento', 'biometria'] as const) {
      assert.equal(estadoPublicado(e), 'pendiente', e)
    }
  })

  test('el resto coincide y el conjunto es exactamente el de los seis', () => {
    for (const e of ['en-revision', 'verificada', 'rechazada', 'vencida', 'suspendida'] as const) {
      assert.equal(estadoPublicado(e), e)
    }
    assert.deepEqual(
      [...new Set(Object.values(ESTADO_PUBLICADO))].sort(),
      ['en-revision', 'pendiente', 'rechazada', 'suspendida', 'vencida', 'verificada'],
    )
  })

  test('un estado desconocido nunca se publica como algo que abra puertas', () => {
    assert.equal(estadoPublicado('inventado'), 'pendiente')
  })

  test('el perfil que ven las apps lleva el estado publicado', async () => {
    const i = verificada('publicado@prueba.local', '2099-01-01')
    i.estado = 'biometria'
    await store.guardarYa()
    assert.equal(ids.perfilPublico(i).estado, 'biometria')
    assert.equal(ids.perfilPublico(i).estadoPublicado, 'pendiente')
    i.estado = 'verificada'
  })
})

describe('Documento vencido', () => {
  test('vence al terminar el día que dice el documento, en UTC', () => {
    const d = { vencimientoDocumento: '2026-09-26' }
    assert.equal(documentoVencido(d, new Date('2026-09-26T23:00:00Z')), false)
    assert.equal(documentoVencido(d, new Date('2026-09-27T00:00:01Z')), true)
    assert.equal(documentoVencido({ vencimientoDocumento: null }), false)
    assert.equal(documentoVencido({ vencimientoDocumento: 'basura' }), false)
  })
})

describe('verificada → vencida', () => {
  test('con el documento vigente no vence; si no está verificada, tampoco', async () => {
    const vigente = verificada('vigente@prueba.local', '2099-12-31')
    assert.equal(ids.vencer(vigente.id, 'prueba').ok, false)
    assert.equal(vigente.estado, 'verificada')

    const enRevision = verificada('revision@prueba.local', '2000-01-01')
    enRevision.estado = 'en-revision'
    assert.equal(ids.vencer(enRevision.id, 'prueba').ok, false)
    assert.equal(enRevision.estado, 'en-revision')
  })

  test('vence, conserva el GID y deja de valer para el ecosistema', async () => {
    const i = verificada('caducada@prueba.local', '2020-05-01')
    i.vinculos = [{
      app: 'veta-wallet', cuenta: 'cuenta-v', direccion: DIR_MINUS,
      vinculadaEn: new Date().toISOString(), ultimoAcceso: null,
    }]
    const gid = i.gid!
    await store.guardarYa()

    // Antes: el SSO se emite.
    const antes = await pedir('/api/v1/sso/token', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ gid, cuenta: 'cuenta-v' }),
    })
    assert.equal(antes.estado, 200)

    const r = ids.vencer(i.id, 'sistema:prueba')
    assert.equal(r.ok, true)
    assert.equal(i.estado, 'vencida')
    assert.equal(i.gid, gid, 'el GID se conserva para la trazabilidad')
    assert.equal(i.decisiones.at(-1)?.estado, 'vencida')

    const g = await pedir(`/api/v1/gid/${gid}`, { headers: conClave() })
    assert.equal(g.estado, 200)
    assert.equal(g.cuerpo.verificada, false)
    assert.equal(g.cuerpo.estadoPublicado, 'vencida')

    const d = await pedir(`/api/v1/direccion/${DIR_EIP55}`, { headers: conClave() })
    assert.equal(d.cuerpo.verificada, false)

    const despues = await pedir('/api/v1/sso/token', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ gid, cuenta: 'cuenta-v' }),
    })
    assert.equal(despues.estado, 403)
  })

  test('aprobar() no la re-aprueba con el mismo documento vencido', async () => {
    const i = verificada('reaprobar@prueba.local', '2019-01-01')
    assert.equal(ids.vencer(i.id, 'prueba').ok, true)
    const operador = store.todo().operadores.find((o) => o.email === 'admin@prueba.local')!
    const r = await ids.aprobar(i.id, operador, 'Re-verificación de prueba', 'Justificación suficientemente larga para anular')
    assert.equal(r.ok, false)
    assert.match(r.motivo!, /vencido/)
    assert.equal(i.estado, 'vencida')
  })

  test('con documento nuevo vuelve al trámite normal (publicado: pendiente)', () => {
    const i = verificada('vuelve@prueba.local', '2018-01-01')
    assert.equal(ids.vencer(i.id, 'prueba').ok, true)
    const TD3 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10'
    ids.adjuntarDocumento(i.id, TD3, 'prueba')
    assert.equal(i.estado, 'documento')
    assert.equal(estadoPublicado(i.estado), 'pendiente')
  })

  test('el temporizador solo vence si GENESIS_VENCER_AUTO está encendido', async () => {
    let llamadas = 0
    const piezas = {
      bajar: async () => ({ registros: 1, conAlias: 1, fuente: 'de-mentira' }),
      retamizar: () => ({ revisadas: 0, conCoincidencias: 0 }),
      vencer: () => { llamadas++; return { revisadas: 0, vencidas: 0 } },
    }
    _reiniciarParaPruebas()
    await unaVuelta('prueba', piezas as any)
    assert.equal(llamadas, 0, 'apagado por defecto: desplegar no cambia datos existentes')

    process.env.GENESIS_VENCER_AUTO = 'si'
    try {
      _reiniciarParaPruebas()
      const r = await unaVuelta('prueba', piezas as any)
      assert.equal(llamadas, 1)
      assert.equal(r.ok, true)
    } finally {
      delete process.env.GENESIS_VENCER_AUTO
    }
  })

  test('vencerCaducadas solo toca verificadas con documento caducado', () => {
    const caducada = verificada('lote-caducada@prueba.local', '2015-01-01')
    const vigente = verificada('lote-vigente@prueba.local', '2099-01-01')
    const rechazada = verificada('lote-rechazada@prueba.local', '2015-01-01')
    rechazada.estado = 'rechazada'
    const r = ids.vencerCaducadas('prueba')
    assert.ok(r.vencidas >= 1)
    assert.equal(caducada.estado, 'vencida')
    assert.equal(vigente.estado, 'verificada')
    assert.equal(rechazada.estado, 'rechazada')
  })
})

describe('El vínculo exige dirección de billetera', () => {
  let idn = ''
  before(async () => {
    const i = ids.iniciar('vinculo@prueba.local', 'prueba')
    idn = i.id
    await store.guardarYa()
  })
  const vincular = (extra: Record<string, unknown>) => pedir('/api/v1/vinculos', {
    method: 'POST', headers: conClave(),
    body: JSON.stringify({ identidadId: idn, cuenta: 'cuenta-dir', email: 'vinculo@prueba.local', ...extra }),
  })

  test('sin dirección: 422 VINCULO_SIN_DIRECCION y no se ata nada', async () => {
    for (const extra of [{}, { direccion: null }, { direccion: '' }]) {
      const r = await vincular(extra)
      assert.equal(r.estado, 422, JSON.stringify(extra))
      assert.equal(r.cuerpo.codigo, 'VINCULO_SIN_DIRECCION')
    }
    assert.equal(ids.porId(idn)!.vinculos.length, 0)
  })

  test('dirección inválida: 422 VINCULO_DIRECCION_INVALIDA', async () => {
    const malaSuma = DIR_EIP55.slice(0, -1) + 'e' // la última letra, de caja cambiada
    for (const direccion of ['0xabc', 'hola', DIR_MINUS.slice(2), '0x' + '0'.repeat(40), malaSuma, 42]) {
      const r = await vincular({ direccion })
      assert.equal(r.estado, 422, String(direccion))
      assert.equal(r.cuerpo.codigo, 'VINCULO_DIRECCION_INVALIDA')
    }
    assert.equal(ids.porId(idn)!.vinculos.length, 0)
  })

  test('con dirección EIP-55 válida se ata y se guarda en minúsculas', async () => {
    // Otra del ejemplo de la EIP-55: la de arriba ya la tiene la «caducada».
    const otra = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
    const r = await vincular({ direccion: otra })
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    const v = ids.porId(idn)!.vinculos.find((x) => x.cuenta === 'cuenta-dir')!
    assert.equal(v.direccion, otra.toLowerCase())
    assert.equal(ids.porDireccion(otra)?.id, idn)
  })

  test('la regla es la misma que la del puente de las apps', () => {
    assert.equal(normalizarDireccion(DIR_EIP55), DIR_MINUS)
    assert.equal(normalizarDireccion(DIR_EIP55.toUpperCase().replace('0X', '0x')), DIR_MINUS)
    assert.equal(normalizarDireccion(DIR_EIP55.slice(0, -1) + 'e'), null)
  })
})
