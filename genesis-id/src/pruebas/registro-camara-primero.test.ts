// El registro cámara-primero, de punta a punta sobre el servidor real.
//
// Lo que cambia respecto del flujo viejo: el documento entra ANTES que los
// datos, el estado dice qué está hecho, lo leído vuelve para confirmarlo, y
// reenviar el documento después del rostro no hace retroceder nada. Y la
// comprobación pública de un GID, que es lo que abre el QR de la tarjeta.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Server } from 'http'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-camara-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
process.env.GENESIS_ADMIN_EMAIL = 'admin@prueba.local'
process.env.GENESIS_ADMIN_PASSWORD = 'contrasena-de-prueba-larga'
process.env.GENESIS_SSO_SECRETO = 'secreto-de-prueba'
delete process.env.GENESIS_MONGO_URL
// Sin credenciales de AWS: nada de esto puede tocar Rekognition, ni por error.
for (const v of ['GENESIS_AWS_ACCESS_KEY_ID', 'GENESIS_AWS_SECRET_ACCESS_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'GENESIS_BIOMETRIA_URL']) {
  delete process.env[v]
}

let servidor: Server
let base: string
let sesion = ''
let claveVeta = ''
let identidadId = ''
let gid = ''

const { default: app, arrancar } = await import('../index.js')
const { store } = await import('../store.js')
const { cargarEnMemoria } = await import('../aml/listas.js')
const { digitoControl } = await import('../kyc/mrz.js')
const { _fijarLectorReversoParaPruebas } = await import('../kyc/lectura.js')

const pedir = async (ruta: string, opciones: RequestInit = {}) => {
  const r = await fetch(base + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) as any }
}
const conSesion = () => ({ Authorization: `Bearer ${sesion}` })
const conClave = () => ({ 'X-API-Key': claveVeta })

// Un pasaporte del ejemplo del estándar con vencimiento futuro y dígitos recalculados.
const doc = 'L898902C3', nac = '740812', ven = '351231', per = 'ZE184226B<<<<<'
const l2 = `${doc}${digitoControl(doc)}UTO${nac}${digitoControl(nac)}F${ven}${digitoControl(ven)}${per}${digitoControl(per)}`
const compuesto = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
const L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<'
const MRZ = `${L1}\n${l2}${digitoControl(compuesto)}`
// Una imagen de mentira con la forma que exige `/documento-fotos`.
const IMAGEN = 'data:image/jpeg;base64,' + 'A'.repeat(1200)

before(async () => {
  await arrancar()
  await new Promise<void>((listo) => {
    servidor = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(servidor.address() as any).port}`
      listo()
    })
  })
  const veta = store.todo().aplicaciones.find((a) => a.clave === 'veta-wallet')!
  const { rotar } = await import('../auth/aplicaciones.js')
  claveVeta = rotar(veta.id, 'prueba')!
  const r = await pedir('/api/sesion/entrar', {
    method: 'POST', body: JSON.stringify({ email: 'admin@prueba.local', contrasena: 'contrasena-de-prueba-larga' }),
  })
  sesion = r.cuerpo.token
  cargarEnMemoria([{ id: 'P1', nombre: 'OTRA PERSONA DISTINTA', alias: [], tipo: 'persona', programa: 'P', lista: 'PRUEBA' }], 'prueba')
})

after(() => {
  servidor?.close()
  rmSync(carpeta, { recursive: true, force: true })
})

describe('Documento primero, datos después', () => {
  test('la identidad nace sin nada hecho', async () => {
    const r = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ email: 'camara@prueba.local' }),
    })
    assert.equal(r.estado, 200)
    identidadId = r.cuerpo.identidad.id
    assert.deepEqual(r.cuerpo.identidad.hecho, { datos: false, documento: false, rostro: false })
    assert.equal(r.cuerpo.identidad.siguientePaso, 'Escanear el documento de identidad')
  })

  test('el documento entra sin datos declarados, y devuelve lo leído para confirmarlo', async () => {
    const r = await pedir(`/api/v1/identidades/${identidadId}/documento`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ mrz: MRZ }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.documento.aceptable, true, JSON.stringify(r.cuerpo.documento.problemas))
    assert.equal(r.cuerpo.documento.datos.nombre, 'ANNA MARIA ERIKSSON')
    assert.equal(r.cuerpo.documento.datos.fechaNacimiento, '1974-08-12')
    assert.equal(r.cuerpo.documento.datos.nacionalidad, 'UTO')
    assert.equal(r.cuerpo.identidad.hecho.documento, true)
    assert.equal(r.cuerpo.identidad.hecho.datos, false)
    assert.equal(r.cuerpo.identidad.siguientePaso, 'Hacer la prueba de vida con la cámara')
  })

  test('el rostro sin proveedor queda «no-configurada», que NO es correcto pero sí es hecho', async () => {
    const r = await pedir(`/api/v1/identidades/${identidadId}/biometria`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ selfie: 'data:image/jpeg;base64,AAAA' }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.identidad.estado, 'biometria')
    assert.equal(r.cuerpo.identidad.hecho.rostro, true)
    assert.equal(r.cuerpo.identidad.siguientePaso, 'Confirmar los datos leídos del documento')
  })

  test('confirmar los datos y reenviar el documento no hace retroceder el rostro', async () => {
    const datos = await pedir(`/api/v1/identidades/${identidadId}/datos`, {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ nombreCompleto: 'Anna Maria Eriksson', fechaNacimiento: '1974-08-12', paisResidencia: 'HND',
        ocupacion: 'Ingeniera', origenFondos: 'Salario', volumenEsperadoUsd: 1500, pepDeclarado: false }),
    })
    assert.equal(datos.cuerpo.identidad.hecho.datos, true)
    const doc2 = await pedir(`/api/v1/identidades/${identidadId}/documento`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ mrz: MRZ }),
    })
    assert.equal(doc2.cuerpo.documento.aceptable, true)
    assert.equal(doc2.cuerpo.identidad.estado, 'biometria', 'el rostro ya hecho no se pierde')
    assert.equal(doc2.cuerpo.identidad.siguientePaso, 'En revisión')
  })

  test('el operador aprueba y sale el GID', async () => {
    await pedir(`/api/panel/identidades/${identidadId}/biometria`, {
      method: 'POST', headers: conSesion(), body: JSON.stringify({ coincide: true, nota: 'Cotejado a mano' }),
    })
    const r = await pedir(`/api/panel/identidades/${identidadId}/aprobar`, {
      method: 'POST', headers: conSesion(), body: JSON.stringify({ motivo: 'Documento y cotejo verificados' }),
    })
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    gid = r.cuerpo.gid
    assert.ok(gid?.startsWith('GEN-'))
  })
})

describe('Leer el documento desde la foto', () => {
  test('sin proveedor responde «sin lector» y no inventa nada', async () => {
    _fijarLectorReversoParaPruebas(null)
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ email: 'foto@prueba.local' }),
    })
    const r = await pedir(`/api/v1/identidades/${alta.cuerpo.identidad.id}/documento/leer`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ imagen: IMAGEN }),
    })
    assert.equal(r.estado, 503)
    assert.equal(r.cuerpo.motivo, 'sin-lector')
    assert.equal(r.cuerpo.mrz, undefined)
  })

  test('la ruta exige clave de API', async () => {
    const r = await pedir(`/api/v1/identidades/${identidadId}/documento/leer`, {
      method: 'POST', body: JSON.stringify({ imagen: IMAGEN }),
    })
    assert.equal(r.estado, 401)
  })

  test('con lector, la MRZ del reverso vuelve leída e interpretada, y la imagen no queda en ningún sitio', async () => {
    _fijarLectorReversoParaPruebas(async () => ['REPUBLICA DE UTOPIA', L1, MRZ.split('\n')[1].replace('7408122', '74O8122')])
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ email: 'foto2@prueba.local' }),
    })
    const r = await pedir(`/api/v1/identidades/${alta.cuerpo.identidad.id}/documento/leer`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ imagen: IMAGEN }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.ok, true)
    assert.equal(r.cuerpo.corregida, true)
    assert.equal(r.cuerpo.mrz, MRZ)
    assert.equal(r.cuerpo.datos.nombreCompleto, 'ANNA MARIA ERIKSSON')
    // Leer no es adjuntar: la identidad sigue sin documento.
    const ficha = await pedir(`/api/v1/identidades/${alta.cuerpo.identidad.id}`, { headers: conClave() })
    assert.equal(ficha.cuerpo.identidad.hecho.documento, false)
    assert.equal(JSON.stringify(store.todo()).includes('A'.repeat(200)), false, 'la imagen no se guardó')
    _fijarLectorReversoParaPruebas(null)
  })

  test('por la vía de las dos fotos, con lector, el documento se comprueba solo y trae datos', async () => {
    _fijarLectorReversoParaPruebas(async () => [L1, MRZ.split('\n')[1]])
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ email: 'fotos3@prueba.local' }),
    })
    const r = await pedir(`/api/v1/identidades/${alta.cuerpo.identidad.id}/documento-fotos`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ anverso: IMAGEN, reverso: IMAGEN }),
    })
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    assert.equal(r.cuerpo.documento.via, 'fotos')
    assert.equal(r.cuerpo.documento.pendienteDeLectura, false)
    assert.equal(r.cuerpo.documento.aceptable, true)
    assert.equal(r.cuerpo.documento.datos.nombre, 'ANNA MARIA ERIKSSON')
    assert.equal(r.cuerpo.identidad.hecho.documento, true)
    _fijarLectorReversoParaPruebas(null)
  })

  test('por la vía de las dos fotos, sin lector, sigue esperando a un operador', async () => {
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ email: 'fotos4@prueba.local' }),
    })
    const r = await pedir(`/api/v1/identidades/${alta.cuerpo.identidad.id}/documento-fotos`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ anverso: IMAGEN, reverso: IMAGEN }),
    })
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    assert.equal(r.cuerpo.documento.pendienteDeLectura, true)
    assert.equal(r.cuerpo.documento.aceptable, false)
    assert.equal(r.cuerpo.documento.datos, null)
    // Aportado cuenta como hecho: la persona ya puso lo suyo.
    assert.equal(r.cuerpo.identidad.hecho.documento, true)
  })
})

describe('Comprobación pública de un GID', () => {
  test('cualquiera puede comprobar un GID sin credenciales y solo ve verificado/no verificado y el día', async () => {
    const r = await pedir(`/api/publico/gid/${gid}`)
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.verificada, true)
    assert.equal(r.cuerpo.tipo, 'personal')
    assert.match(r.cuerpo.verificadaEn, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(/eriksson|anna|prueba\.local|riesgo|nacionalidad/i.test(JSON.stringify(r.cuerpo)), false)
  })

  test('un GID bien formado que no existe responde igual que uno sin verificar', async () => {
    const { gidValido } = await import('../lib/uid.js')
    const inventado = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'.split('').map((c) => `GEN-K7QP-3M2X-${c}`).find(gidValido)!
    const r = await pedir(`/api/publico/gid/${inventado}`)
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.verificada, false)
    assert.equal(r.cuerpo.tipo, null)
  })

  test('un GID mal formado se rechaza sin consultar nada', async () => {
    assert.equal((await pedir('/api/publico/gid/GEN-AAAA-BBBB-C')).estado, 400)
  })

  test('suspendida deja de ser verificada', async () => {
    await pedir(`/api/panel/identidades/${identidadId}/suspender`, {
      method: 'POST', headers: conSesion(), body: JSON.stringify({ motivo: 'Prueba' }),
    })
    const r = await pedir(`/api/publico/gid/${gid}`)
    assert.equal(r.cuerpo.verificada, false)
    assert.equal(r.cuerpo.verificadaEn, null)
  })
})
