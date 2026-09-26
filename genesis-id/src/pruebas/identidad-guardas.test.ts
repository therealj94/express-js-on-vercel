// Guardas de la identidad que la revisión del v0.3 encontró abiertas.
//
//   · Una VERIFICADA no reescribe su nombre legal ni su vencimiento subiendo
//     otro documento: 409, y nada cambia.
//   · Una VENCIDA que vuelve con documento nuevo repite la prueba de vida: el
//     cotejo viejo se hizo contra OTRO documento.
//   · aprobar() no re-aprueba con el documento caducado a quien ya estuvo
//     verificada, pase por el estado que pase (vencer → suspender → aprobar).
//   · La rama corta de /gid/:gid (solo `gid.verificar`) dice sí o no, sin la
//     categoría del estado.
//   · Una dirección de billetera no se ata a dos identidades, y cambiarla deja
//     rastro.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Server } from 'http'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-guardas-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
process.env.GENESIS_ADMIN_EMAIL = 'admin@prueba.local'
process.env.GENESIS_ADMIN_PASSWORD = 'contrasena-de-prueba-larga'
process.env.GENESIS_SSO_SECRETO = 'secreto-de-prueba'
delete process.env.GENESIS_MONGO_URL
delete process.env.GENESIS_VENCER_AUTO
delete process.env.GENESIS_DOCUMENTO_EXIGE_REINICIO
delete process.env.GENESIS_VINCULO_DIRECCION_AJENA
for (const v of ['GENESIS_AWS_ACCESS_KEY_ID', 'GENESIS_AWS_SECRET_ACCESS_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'GENESIS_BIOMETRIA_URL']) {
  delete process.env[v]
}

const { default: app, arrancar } = await import('../index.js')
const { store } = await import('../store.js')
const ids = await import('../motor/identidades.js')
const { gidPersonal } = await import('../lib/uid.js')
const { digitoControl } = await import('../kyc/mrz.js')
const { leerFotos } = await import('../kyc/fotosDocumento.js')

let servidor: Server
let base = ''
let claveVeta = ''
let claveOrdenscan = ''

const pedir = async (ruta: string, clave: string, cuerpo?: unknown) => {
  const r = await fetch(base + ruta, {
    method: cuerpo === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': clave },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) as any }
}

// Un TD3 de otro titular, vigente hasta 2034 y con los dígitos recalculados:
// cualquiera lo fabrica, no lleva firma.
function td3(apellido: string, nombres: string, vence: string): string {
  const doc = 'L898902C3', nac = '740812', per = 'ZE184226B<<<<<'
  const l2 = `${doc}${digitoControl(doc)}UTO${nac}${digitoControl(nac)}F${vence}${digitoControl(vence)}${per}${digitoControl(per)}`
  const compuesto = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
  const l1 = `P<UTO${apellido}<<${nombres.replace(/ /g, '<')}`.padEnd(44, '<')
  return `${l1}\n${l2}${digitoControl(compuesto)}`
}
const MRZ_AJENA = td3('ERIKSSON', 'ANNA MARIA', '341215')
const IMAGEN = 'data:image/jpeg;base64,' + 'A'.repeat(1200)

/** Una identidad YA verificada, puesta a mano: el KYC entero lo prueba flujo.test.ts. */
function verificada(email: string, vencimientoDocumento: string) {
  const i = ids.iniciar(email, 'prueba')
  i.nombreDeclarado = 'Persona Original'
  i.nombreLegal = 'Persona Original'
  i.fechaNacimiento = '1980-01-01'
  i.nacionalidad = 'HND'
  i.numeroDocumento = 'ORIGINAL1'
  i.estado = 'verificada'
  i.gid = gidPersonal()
  i.verificadaEn = new Date().toISOString()
  i.vencimientoDocumento = vencimientoDocumento
  i.biometria = { estado: 'ok', proveedor: 'prueba', parecido: 0.99, vivacidad: 0.99 } as any
  return i
}
const operador = () => store.todo().operadores.find((o) => o.email === 'admin@prueba.local')!

before(async () => {
  await arrancar()
  await new Promise<void>((listo) => {
    servidor = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(servidor.address() as any).port}`
      listo()
    })
  })
  const { rotar } = await import('../auth/aplicaciones.js')
  const apps = store.todo().aplicaciones
  claveVeta = rotar(apps.find((a) => a.clave === 'veta-wallet')!.id, 'prueba')!
  claveOrdenscan = rotar(apps.find((a) => a.clave === 'ordenscan')!.id, 'prueba')!
})

after(() => {
  servidor?.close()
  rmSync(carpeta, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Una verificada no cambia sus datos subiendo otro documento', () => {
  test('por la ruta: 409 IDENTIDAD_YA_VERIFICADA y nada cambia', async () => {
    const i = verificada('verificada-doc@prueba.local', '2020-01-01')
    await store.guardarYa()
    const vencibles = ids.verificadasConDocumentoVencido().length

    const r = await pedir(`/api/v1/identidades/${i.id}/documento`, claveVeta, { mrz: MRZ_AJENA })
    assert.equal(r.estado, 409, JSON.stringify(r.cuerpo))
    assert.equal(r.cuerpo.codigo, 'IDENTIDAD_YA_VERIFICADA')

    assert.equal(i.estado, 'verificada')
    assert.equal(i.nombreLegal, 'Persona Original')
    assert.equal(i.numeroDocumento, 'ORIGINAL1')
    assert.equal(i.vencimientoDocumento, '2020-01-01', 'el vencimiento no se alarga desde fuera')
    assert.equal(ids.verificadasConDocumentoVencido().length, vencibles)
    assert.equal(ids.perfilPublico(i).nombre, 'Persona Original')
  })

  test('por el motor: adjuntarDocumento no toca una verificada', () => {
    const i = verificada('verificada-motor@prueba.local', '2020-01-01')
    ids.adjuntarDocumento(i.id, MRZ_AJENA, 'app:veta-wallet')
    assert.equal(i.estado, 'verificada')
    assert.equal(i.nombreLegal, 'Persona Original')
    assert.equal(i.vencimientoDocumento, '2020-01-01')
    assert.equal(i.documento, null)
  })

  test('por las dos fotos: 409 y las fotos ni se guardan', async () => {
    const i = verificada('verificada-fotos@prueba.local', '2099-01-01')
    await store.guardarYa()
    const r = await pedir(`/api/v1/identidades/${i.id}/documento-fotos`, claveVeta, { anverso: IMAGEN, reverso: IMAGEN })
    assert.equal(r.estado, 409, JSON.stringify(r.cuerpo))
    assert.equal(r.cuerpo.codigo, 'IDENTIDAD_YA_VERIFICADA')
    assert.equal(await leerFotos(i.id), null)
    assert.equal(i.documento, null)
  })

  test('suspendida o rechazada: pasa como hasta hoy, salvo con GENESIS_DOCUMENTO_EXIGE_REINICIO=si', async () => {
    const s = verificada('suspendida-doc@prueba.local', '2099-01-01')
    await ids.suspender(s.id, operador(), 'Suspensión de prueba')
    const hoy = await pedir(`/api/v1/identidades/${s.id}/documento`, claveVeta, { mrz: MRZ_AJENA })
    assert.equal(hoy.estado, 200, 'sin la bandera no cambia nada para quien ya usa «volver a intentarlo»')

    const r = verificada('rechazada-doc@prueba.local', '2099-01-01')
    await ids.rechazar(r.id, operador(), 'Rechazo de prueba')
    process.env.GENESIS_DOCUMENTO_EXIGE_REINICIO = 'si'
    try {
      for (const x of [s, r]) {
        const antes = x.nombreLegal
        const c = await pedir(`/api/v1/identidades/${x.id}/documento`, claveVeta, { mrz: MRZ_AJENA })
        assert.equal(c.estado, 409, x.estado)
        assert.equal(c.cuerpo.codigo, 'IDENTIDAD_CERRADA')
        assert.equal(x.nombreLegal, antes)
      }
    } finally {
      delete process.env.GENESIS_DOCUMENTO_EXIGE_REINICIO
    }
  })

  test('el reenvío del registro cámara-primero sigue pasando (antes de aprobar)', () => {
    const i = ids.iniciar('camara-guardas@prueba.local', 'prueba')
    ids.adjuntarDocumento(i.id, MRZ_AJENA, 'prueba')
    i.estado = 'biometria'
    ids.adjuntarDocumento(i.id, MRZ_AJENA, 'prueba')
    assert.equal(i.estado, 'biometria')
    assert.equal(i.nombreLegal, 'ANNA MARIA ERIKSSON')
  })
})

describe('Una vencida que vuelve repite la prueba de vida', () => {
  test('el cotejo viejo se descarta y el siguiente paso es el rostro', () => {
    const i = verificada('vencida-rostro@prueba.local', '2019-01-01')
    i.nombreDeclarado = 'Anna Maria Eriksson'
    i.fechaNacimientoDeclarada = '1974-08-12'
    assert.equal(ids.vencer(i.id, 'prueba').ok, true)
    ids.adjuntarDocumento(i.id, MRZ_AJENA, 'prueba')
    assert.equal(i.estado, 'documento')
    assert.equal(i.biometria, null, 'el cotejo se hizo contra el documento anterior')
    const vista = ids.estadoParaUsuario(i)
    assert.equal(vista.hecho.rostro, false)
    assert.equal(vista.siguientePaso, 'Hacer la prueba de vida con la cámara')
  })

  test('el reenvío de una que NO venía de vencida conserva su rostro', () => {
    const i = ids.iniciar('rostro-conservado-guardas@prueba.local', 'prueba')
    ids.adjuntarDocumento(i.id, MRZ_AJENA, 'prueba')
    i.estado = 'biometria'
    i.biometria = { estado: 'ok' } as any
    ids.adjuntarDocumento(i.id, MRZ_AJENA, 'prueba')
    assert.deepEqual(i.biometria, { estado: 'ok' })
  })
})

describe('aprobar() y el documento caducado', () => {
  for (const via of ['suspender', 'rechazar'] as const) {
    test(`vencer → ${via} → aprobar no la re-aprueba con el mismo documento`, async () => {
      const i = verificada(`vencida-${via}@prueba.local`, '2012-04-15')
      assert.equal(ids.vencer(i.id, 'prueba').ok, true)
      const paso = await ids[via](i.id, operador(), `${via} de prueba`)
      assert.equal(paso.ok, true)
      const r = await ids.aprobar(i.id, operador(), 'Re-aprobación de prueba',
        'Justificación suficientemente larga para anular los bloqueos')
      assert.equal(r.ok, false)
      assert.match(r.motivo!, /vencido/)
      assert.notEqual(i.estado, 'verificada')
    })
  }

  test('unas fotos nuevas sin leer no heredan la fecha del documento anterior', async () => {
    const i = verificada('vencida-fotos@prueba.local', '2012-04-15')
    assert.equal(ids.vencer(i.id, 'prueba').ok, true)
    assert.equal((await ids.suspender(i.id, operador(), 'suspender de prueba')).ok, true)
    // Sin lector en el servidor: las fotos entran y las lee el operador.
    const f = await pedir(`/api/v1/identidades/${i.id}/documento-fotos`, claveVeta, { anverso: IMAGEN, reverso: IMAGEN })
    assert.equal(f.estado, 200, JSON.stringify(f.cuerpo))
    const r = await ids.aprobar(i.id, operador(), 'Leído a mano: vigente',
      'El operador leyó las dos caras y el documento nuevo está vigente')
    assert.equal(r.ok, true, r.motivo)
    assert.equal(i.estado, 'verificada')
  })

  test('una nueva cuyo documento caducó esperando revisión tiene un bloqueo en vivo', async () => {
    const i = ids.iniciar('caduco-esperando@prueba.local', 'prueba')
    i.documento = { aceptable: true, datos: null, hallazgos: [], edad: null } as any
    i.vencimientoDocumento = '2013-03-03'
    ids.recalcularRiesgo(i)
    assert.ok(i.riesgo!.bloqueos.some((b) => /2013-03-03/.test(b)), JSON.stringify(i.riesgo!.bloqueos))
    const r = await ids.aprobar(i.id, operador(), 'Aprobación de prueba')
    assert.equal(r.ok, false)
    assert.ok(r.bloqueos?.some((b) => /2013-03-03/.test(b)))
  })

  test('el bloqueo en vivo no se repite si el documento ya venía vencido al revisarlo', () => {
    const i = ids.iniciar('ya-vencido@prueba.local', 'prueba')
    i.documento = {
      aceptable: false, datos: null, edad: null,
      hallazgos: [{ clave: 'documento.vencido', gravedad: 'grave', detalle: 'El documento venció el 2013-03-03' }],
    } as any
    i.vencimientoDocumento = '2013-03-03'
    ids.recalcularRiesgo(i)
    assert.equal(i.riesgo!.bloqueos.filter((b) => /2013-03-03/.test(b)).length, 1)
  })
})

describe('/gid/:gid con solo gid.verificar', () => {
  test('dice sí o no y si está bloqueada, sin la categoría del estado', async () => {
    const i = verificada('explorador@prueba.local', '2099-01-01')
    await ids.suspender(i.id, operador(), 'Suspensión de prueba')
    const r = await pedir(`/api/v1/gid/${i.gid}`, claveOrdenscan)
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    assert.deepEqual(Object.keys(r.cuerpo).sort(), ['bloqueada', 'gid', 'tipo', 'verificada'])
    assert.equal(r.cuerpo.verificada, false)

    // Con `gid.perfil` sigue llegando el estado publicado.
    const conPerfil = await pedir(`/api/v1/gid/${i.gid}`, claveVeta)
    assert.equal(conPerfil.cuerpo.estadoPublicado, 'suspendida')
  })
})

describe('Direcciones de los vínculos', () => {
  const A = '0x52908400098527886e0f7030069857d2e4169ee7'
  const B = '0xde709f2102306220921060314715629080e2fb77'
  let duena = ''
  let otra = ''
  const vincular = (identidadId: string, email: string, cuenta: string, direccion: string) =>
    pedir('/api/v1/vinculos', claveVeta, { identidadId, email, cuenta, direccion })
  const entradas = (accion: string, objeto: string) =>
    store.todo().bitacora.filter((e) => e.accion === accion && e.objeto === objeto)

  before(() => {
    // `otra` es MÁS VIEJA: con `porDireccion` devolviendo la primera, era la
    // que se quedaba con la dirección ajena.
    otra = ids.iniciar('otra-dir@prueba.local', 'prueba').id
    duena = ids.iniciar('duena-dir@prueba.local', 'prueba').id
  })

  test('una dirección ya atada a otra identidad: 409 VINCULO_DIRECCION_AJENA', async () => {
    assert.equal((await vincular(duena, 'duena-dir@prueba.local', 'c-duena', A)).estado, 200)
    const r = await vincular(otra, 'otra-dir@prueba.local', 'c-otra', A)
    assert.equal(r.estado, 409, JSON.stringify(r.cuerpo))
    assert.equal(r.cuerpo.codigo, 'VINCULO_DIRECCION_AJENA')
    assert.equal(ids.porId(otra)!.vinculos.length, 0)
    assert.equal(ids.porDireccion(A)?.id, duena)
    assert.equal(entradas('vinculo.direccionAjena', otra).length, 1)
  })

  test('volver a vincular la misma cuenta con la misma dirección sigue pasando', async () => {
    const r = await vincular(duena, 'duena-dir@prueba.local', 'c-duena', A.toUpperCase().replace('0X', '0x'))
    assert.equal(r.estado, 200)
    assert.equal(entradas('identidad.vinculoDireccion', duena).length, 0, 'misma dirección: no es un cambio')
  })

  test('cambiar la dirección de un vínculo deja rastro y conserva la anterior', async () => {
    const r = await vincular(duena, 'duena-dir@prueba.local', 'c-duena', B)
    assert.equal(r.estado, 200)
    const v = ids.porId(duena)!.vinculos.find((x) => x.cuenta === 'c-duena')!
    assert.equal(v.direccion, B)
    assert.deepEqual(v.direccionesAnteriores?.map((d) => d.direccion), [A])
    const e = entradas('identidad.vinculoDireccion', duena)
    assert.equal(e.length, 1)
    assert.deepEqual([e[0].detalle.antes, e[0].detalle.despues], [A, B])
    assert.deepEqual(ids.direccionesDe(ids.porId(duena)!).sort(), [A, B].sort(), 'la anterior sigue contando')
  })

  test('la válvula GENESIS_VINCULO_DIRECCION_AJENA=permitir deja pasar y lo anota', async () => {
    process.env.GENESIS_VINCULO_DIRECCION_AJENA = 'permitir'
    try {
      const r = await vincular(otra, 'otra-dir@prueba.local', 'c-otra', B)
      assert.equal(r.estado, 200)
      assert.equal(entradas('vinculo.direccionAjena', otra).length, 2)
    } finally {
      delete process.env.GENESIS_VINCULO_DIRECCION_AJENA
    }
  })

  test('lo legado: quien ya comparte una dirección puede volver a vincularla', async () => {
    // `otra` y `duena` comparten B desde la válvula: es el caso de los datos viejos.
    const r = await vincular(otra, 'otra-dir@prueba.local', 'c-otra', B)
    assert.equal(r.estado, 200)
  })
})
