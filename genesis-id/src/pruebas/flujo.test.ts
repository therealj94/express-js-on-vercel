// Prueba de extremo a extremo sobre el servidor de verdad.
//
// Lo que se comprueba aquí es sobre todo lo que NO se puede hacer. La versión
// anterior de Genesis ID permitía, sin ninguna credencial:
//
//   GET  /api/admin/identities        → volcado de todas las personas
//   POST /api/identities/:id/process  → identidad verificada y UID emitido
//   POST /api/identities/passport     → inyectar un pasaporte a cualquier correo
//   POST /api/admin/reset             → borrar la base
//
// Cada una tiene su prueba para que no vuelvan por descuido.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Server } from 'http'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-prueba-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
process.env.GENESIS_ADMIN_EMAIL = 'admin@prueba.local'
process.env.GENESIS_ADMIN_PASSWORD = 'contrasena-de-prueba-larga'
process.env.GENESIS_SSO_SECRETO = 'secreto-de-prueba'
delete process.env.GENESIS_MONGO_URL

let servidor: Server
let base: string
let sesion = ''
let claveVeta = ''

// El módulo se importa DESPUES de fijar las variables de entorno.
const { default: app, arrancar } = await import('../index.js')
const { store } = await import('../store.js')
const { cargarEnMemoria } = await import('../aml/listas.js')

const pedir = async (ruta: string, opciones: RequestInit = {}) => {
  const r = await fetch(base + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) as any }
}

const conSesion = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${sesion}`, ...extra })
const conClave = (clave = claveVeta) => ({ 'X-API-Key': clave })

before(async () => {
  await arrancar()
  await new Promise<void>((listo) => {
    servidor = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(servidor.address() as any).port}`
      listo()
    })
  })
  // La clave de API real de veta-wallet no se puede recuperar (solo se guarda
  // el hash), así que para la prueba se rota y se usa la nueva.
  const veta = store.todo().aplicaciones.find((a) => a.clave === 'veta-wallet')!
  const { rotar } = await import('../auth/aplicaciones.js')
  claveVeta = rotar(veta.id, 'prueba')!
})

after(() => {
  servidor?.close()
  rmSync(carpeta, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Lo que ya no se puede hacer sin credenciales', () => {
  test('el resumen del panel exige sesión', async () => {
    assert.equal((await pedir('/api/panel/resumen')).estado, 401)
  })

  test('la lista de identidades exige sesión', async () => {
    assert.equal((await pedir('/api/panel/identidades')).estado, 401)
  })

  test('la bitácora exige sesión', async () => {
    assert.equal((await pedir('/api/panel/bitacora')).estado, 401)
  })

  test('las rutas viejas de la versión insegura ya no existen', async () => {
    for (const ruta of ['/api/admin/identities', '/api/admin/stats', '/api/admin/business']) {
      assert.equal((await pedir(ruta)).estado, 404, `${ruta} debería haber desaparecido`)
    }
  })

  test('ya no hay ninguna ruta que borre la base', async () => {
    const r = await pedir('/api/admin/reset', { method: 'POST' })
    assert.equal(r.estado, 404)
  })

  test('no se puede crear una identidad sin clave de API', async () => {
    const r = await pedir('/api/v1/identidades', {
      method: 'POST', body: JSON.stringify({ email: 'colado@prueba.local' }),
    })
    assert.equal(r.estado, 401)
  })

  test('una clave de API inventada no sirve', async () => {
    const r = await pedir('/api/v1/identidades', {
      method: 'POST',
      headers: { 'X-API-Key': 'gid_live_inventada' },
      body: JSON.stringify({ email: 'colado@prueba.local' }),
    })
    assert.equal(r.estado, 401)
  })

  test('el estado del servicio no revela datos de nadie', async () => {
    const r = await pedir('/healthz')
    assert.equal(r.estado, 200)
    const texto = JSON.stringify(r.cuerpo)
    assert.equal(/identidades|email|nombre/i.test(texto), false)
  })
})

describe('Entrada de operadores', () => {
  test('una contraseña incorrecta no entra', async () => {
    const r = await pedir('/api/sesion/entrar', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@prueba.local', contrasena: 'incorrecta' }),
    })
    assert.equal(r.estado, 401)
  })

  test('la respuesta no distingue entre correo inexistente y contraseña mala', async () => {
    const a = await pedir('/api/sesion/entrar', {
      method: 'POST', body: JSON.stringify({ email: 'admin@prueba.local', contrasena: 'mala' }),
    })
    const b = await pedir('/api/sesion/entrar', {
      method: 'POST', body: JSON.stringify({ email: 'noexiste@prueba.local', contrasena: 'mala' }),
    })
    assert.equal(a.cuerpo.error, b.cuerpo.error)
  })

  test('la contraseña correcta abre sesión', async () => {
    const r = await pedir('/api/sesion/entrar', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@prueba.local', contrasena: 'contrasena-de-prueba-larga' }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.operador.rol, 'admin')
    sesion = r.cuerpo.token
  })

  test('con la sesión sí se ve el panel', async () => {
    const r = await pedir('/api/panel/resumen', { headers: conSesion() })
    assert.equal(r.estado, 200)
    assert.ok(r.cuerpo.salud)
  })
})

describe('Flujo completo de verificación', () => {
  let identidadId = ''

  test('la app crea la identidad con su clave de API', async () => {
    const r = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ email: 'persona@prueba.local' }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.identidad.estado, 'iniciada')
    // Lo esencial: al nacer NO hay GID.
    assert.equal(r.cuerpo.identidad.gid, null)
    identidadId = r.cuerpo.identidad.id
  })

  test('la app declara los datos de la persona', async () => {
    const r = await pedir(`/api/v1/identidades/${identidadId}/datos`, {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({
        nombreCompleto: 'Anna Maria Eriksson', fechaNacimiento: '1974-08-12', paisResidencia: 'HND',
        // El perfil de cumplimiento va con el alta: sin ocupacion ni origen de
        // fondos no hay contra que contrastar un movimiento, y por eso bloquea.
        telefono: '+504 9999 0000', direccion: 'Col. Palmira, Tegucigalpa',
        ocupacion: 'Ingeniera de sistemas', origenFondos: 'Salario',
        propositoCuenta: 'Ahorro y remesas familiares', volumenEsperadoUsd: 1500,
        pepDeclarado: false,
      }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.identidad.estado, 'datos')
  })

  test('sin ocupacion ni origen de fondos, la identidad NO se puede aprobar', async () => {
    // Se comprueba sobre una identidad aparte para no romper el flujo de arriba.
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ email: 'sin.perfil@ejemplo.test' }),
    })
    const otra = alta.cuerpo.identidad.id
    await pedir(`/api/v1/identidades/${otra}/datos`, {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ nombreCompleto: 'Persona Sin Perfil', fechaNacimiento: '1990-01-01' }),
    })
    const ficha = await pedir(`/api/v1/identidades/${otra}`, { headers: conClave() })
    assert.ok(ficha.cuerpo.identidad.faltan > 0, 'tiene que quedar con bloqueos pendientes')
  })

  test('un documento con la MRZ manipulada se rechaza', async () => {
    const manipulada = `P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
L898902C36UTO9008122F1204159ZE184226B<<<<<10`
    const r = await pedir(`/api/v1/identidades/${identidadId}/documento`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ mrz: manipulada }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.documento.aceptable, false)
    assert.ok(r.cuerpo.documento.problemas.some((p: string) => /dígitos de control/i.test(p)))
  })

  test('desde el navegador, el documento entra como dos fotos', async () => {
    // Quien se verifica en un navegador no tiene lector de MRZ, asi que sube
    // las dos caras y las lee un operador. Se hace sobre una identidad aparte
    // para no pisar el flujo de la MRZ de arriba.
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ email: 'porfotos@prueba.local' }),
    })
    const otra = alta.cuerpo.identidad.id
    await pedir(`/api/v1/identidades/${otra}/datos`, {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ nombreCompleto: 'Persona Por Fotos', fechaNacimiento: '1990-01-01' }),
    })
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(2000)
    const r = await pedir(`/api/v1/identidades/${otra}/documento-fotos`, {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ anverso: foto, reverso: foto }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.identidad.estado, 'documento')
    // Las dos claves se leen juntas: `aceptable` en falso aqui no quiere decir
    // rechazado, quiere decir que todavia no lo miro nadie.
    assert.equal(r.cuerpo.documento.via, 'fotos')
    assert.equal(r.cuerpo.documento.aceptable, false)
    assert.equal(r.cuerpo.documento.pendienteDeLectura, true)
    assert.deepEqual(r.cuerpo.documento.problemas, [])
  })

  test('media cara, o algo que no es una imagen, no entra', async () => {
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ email: 'mediacara@prueba.local' }),
    })
    const otra = alta.cuerpo.identidad.id
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(2000)
    const soloUna = await pedir(`/api/v1/identidades/${otra}/documento-fotos`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ anverso: foto }),
    })
    assert.equal(soloUna.estado, 400)
    const noEsFoto = await pedir(`/api/v1/identidades/${otra}/documento-fotos`, {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ anverso: 'https://algun.sitio/foto.jpg', reverso: foto }),
    })
    assert.equal(noEsFoto.estado, 400)
  })

  test('la app NO puede aprobar la identidad', async () => {
    // Aunque tenga una clave de API perfectamente válida.
    const r = await pedir(`/api/panel/identidades/${identidadId}/aprobar`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ motivo: 'porque sí' }),
    })
    assert.equal(r.estado, 401)
  })

  test('el operador tampoco puede aprobar mientras haya bloqueos', async () => {
    const r = await pedir(`/api/panel/identidades/${identidadId}/aprobar`, {
      method: 'POST', headers: conSesion(),
      body: JSON.stringify({ motivo: 'Revisado y conforme' }),
    })
    assert.equal(r.estado, 400)
    assert.ok(Array.isArray(r.cuerpo.bloqueos))
    assert.ok(r.cuerpo.bloqueos.length > 0)
  })

  test('sigue sin GID después del intento fallido', async () => {
    const r = await pedir(`/api/v1/identidades/${identidadId}`, { headers: conClave() })
    assert.equal(r.cuerpo.identidad.gid, null)
    assert.notEqual(r.cuerpo.identidad.estado, 'verificada')
  })

  test('con las comprobaciones resueltas, el operador sí aprueba', async () => {
    // Se cargan listas para que el tamizado sea real, se manda un documento
    // válido y se resuelve la biometría a mano.
    cargarEnMemoria([{
      id: 'P1', nombre: 'OTRA PERSONA DISTINTA', alias: [], tipo: 'persona', programa: 'P', lista: 'PRUEBA',
    }], 'prueba')

    // Documento no vencido: se construye uno con vencimiento futuro y sus
    // dígitos recalculados.
    const { digitoControl } = await import('../kyc/mrz.js')
    const doc = 'L898902C3'
    const nac = '740812'
    const ven = '351231'
    const per = 'ZE184226B<<<<<'
    const l2 = `${doc}${digitoControl(doc)}UTO${nac}${digitoControl(nac)}F${ven}${digitoControl(ven)}${per}${digitoControl(per)}`
    const compuesto = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
    const mrz = `P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n${l2}${digitoControl(compuesto)}`

    const doc1 = await pedir(`/api/v1/identidades/${identidadId}/documento`, {
      method: 'POST', headers: conClave(), body: JSON.stringify({ mrz }),
    })
    assert.equal(doc1.cuerpo.documento.aceptable, true, JSON.stringify(doc1.cuerpo.documento.problemas))

    const bio = await pedir(`/api/panel/identidades/${identidadId}/biometria`, {
      method: 'POST', headers: conSesion(),
      body: JSON.stringify({ coincide: true, nota: 'Rostro cotejado con el documento' }),
    })
    assert.equal(bio.estado, 200)

    const r = await pedir(`/api/panel/identidades/${identidadId}/aprobar`, {
      method: 'POST', headers: conSesion(),
      body: JSON.stringify({ motivo: 'Documento y cotejo verificados, sin coincidencias en listas' }),
    })
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    assert.ok(r.cuerpo.gid?.startsWith('GEN-'))
  })

  test('la aprobación quedó en la bitácora con el nombre del operador', async () => {
    const r = await pedir('/api/panel/bitacora?accion=identidad.aprobada', { headers: conSesion() })
    assert.equal(r.estado, 200)
    const entrada = r.cuerpo.entradas[0]
    assert.equal(entrada.actor, 'admin@prueba.local')
    assert.equal(r.cuerpo.cadena.integra, true)
  })

  test('ahora el ecosistema ve el GID como verificado', async () => {
    const identidad = store.todo().identidades.find((i) => i.id === identidadId)!
    const r = await pedir(`/api/v1/gid/${identidad.gid}`, { headers: conClave() })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.verificada, true)
  })

  test('un GID con el dígito verificador mal se rechaza sin consultar nada', async () => {
    const r = await pedir('/api/v1/gid/GEN-AAAA-BBBB-C', { headers: conClave() })
    assert.equal(r.estado, 400)
  })
})

describe('Inicio de sesión único', () => {
  test('no se emite token si la cuenta no está atada al GID', async () => {
    const identidad = store.todo().identidades.find((i) => i.email === 'persona@prueba.local')!
    const r = await pedir('/api/v1/sso/token', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ gid: identidad.gid, cuenta: 'cuenta-que-no-existe' }),
    })
    assert.equal(r.estado, 403)
  })

  test('con la cuenta atada sí se emite, y otra app lo valida', async () => {
    const identidad = store.todo().identidades.find((i) => i.email === 'persona@prueba.local')!

    const vinculo = await pedir('/api/v1/vinculos', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ identidadId: identidad.id, cuenta: 'usuario-1', direccion: '0xabc' }),
    })
    assert.equal(vinculo.estado, 200)

    const token = await pedir('/api/v1/sso/token', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ gid: identidad.gid, cuenta: 'usuario-1' }),
    })
    assert.equal(token.estado, 200)

    const validado = await pedir('/api/v1/sso/verificar', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ token: token.cuerpo.token }),
    })
    assert.equal(validado.estado, 200)
    assert.equal(validado.cuerpo.valido, true)
    assert.equal(validado.cuerpo.gid, identidad.gid)
  })

  test('un token manipulado no se valida', async () => {
    const r = await pedir('/api/v1/sso/verificar', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ token: 'aaa.bbb.ccc' }),
    })
    assert.equal(r.estado, 401)
  })

  test('si la identidad se suspende, el token deja de valer', async () => {
    const identidad = store.todo().identidades.find((i) => i.email === 'persona@prueba.local')!
    const token = await pedir('/api/v1/sso/token', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ gid: identidad.gid, cuenta: 'usuario-1' }),
    })
    await pedir(`/api/panel/identidades/${identidad.id}/suspender`, {
      method: 'POST', headers: conSesion(), body: JSON.stringify({ motivo: 'Prueba de suspensión' }),
    })
    const r = await pedir('/api/v1/sso/verificar', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ token: token.cuerpo.token }),
    })
    assert.equal(r.estado, 403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LAS FOTOS DEL DOCUMENTO, FUERA DEL DOCUMENTO DE ESTADO
//
// Se guardaban dentro del expediente, o sea dentro del ÚNICO documento de Mongo
// donde vive todo el estado del motor. Dos caras de varios megabytes no caben
// ahí: pasado el límite de 16 MB por documento, lo que falla no es la subida de
// la foto sino el guardado de TODO —identidades, operadores, aprobaciones—
// mientras el servicio sigue respondiendo bien, y el siguiente reinicio de
// Render se lo lleva por delante.
//
// Estas pruebas son el cerrojo: que las fotos no vuelvan nunca al estado, que el
// operador las siga viendo, y que se borren al decidir.
// ─────────────────────────────────────────────────────────────────────────────

describe('Las fotos del documento viven fuera del estado', () => {
  const foto = 'data:image/jpeg;base64,' + 'R'.repeat(20000)
  const aparte = () => JSON.parse(readFileSync(join(carpeta, 'documentosPendientes.json'), 'utf8'))
  const estadoEnDisco = () => readFileSync(process.env.GENESIS_DATA_FILE!, 'utf8')
  let conFotos = ''

  test('subirlas no las mete en el documento de estado', async () => {
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ email: 'fuera.del.estado@prueba.local' }),
    })
    conFotos = alta.cuerpo.identidad.id
    const r = await pedir(`/api/v1/identidades/${conFotos}/documento-fotos`, {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ anverso: foto, reverso: foto }),
    })
    assert.equal(r.estado, 200)

    const identidad = store.todo().identidades.find((i) => i.id === conFotos)!
    assert.equal(identidad.documento?.via, 'fotos')
    assert.equal(identidad.documento?.imagenes ?? null, null, 'el expediente no puede llevar las fotos')

    // Y sobre todo: que no aparezcan en lo que se ESCRIBE, que es lo que
    // reventaba el volcado.
    await store.guardarYa()
    assert.equal(estadoEnDisco().includes('R'.repeat(20000)), false, 'la foto acabó dentro del estado')
    assert.equal(aparte()[conFotos].anverso, foto, 'tiene que estar guardada aparte')
  })

  test('el operador las sigue viendo en la ficha, y mirarlas no las devuelve al estado', async () => {
    const r = await pedir(`/api/panel/identidades/${conFotos}`, { headers: conSesion() })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.identidad.documento.imagenes.anverso, foto)
    assert.equal(r.cuerpo.identidad.documento.imagenes.reverso, foto)

    const identidad = store.todo().identidades.find((i) => i.id === conFotos)!
    assert.equal(identidad.documento?.imagenes ?? null, null)
    await store.guardarYa()
    assert.equal(estadoEnDisco().includes('R'.repeat(20000)), false)
  })

  test('al rechazar, las fotos desaparecen', async () => {
    const r = await pedir(`/api/panel/identidades/${conFotos}/rechazar`, {
      method: 'POST', headers: conSesion(),
      body: JSON.stringify({ motivo: 'Documento ilegible en las dos caras' }),
    })
    assert.equal(r.estado, 200)
    assert.equal(conFotos in aparte(), false, 'no se pueden acumular documentos ya decididos')

    const ficha = await pedir(`/api/panel/identidades/${conFotos}`, { headers: conSesion() })
    assert.equal(ficha.cuerpo.identidad.documento.imagenes, null)
  })

  test('una cara de más de 3 MB no entra, y el mensaje dice cuánto', async () => {
    const enorme = 'data:image/jpeg;base64,' + 'A'.repeat(3_000_001)
    const r = await pedir(`/api/v1/identidades/${conFotos}/documento-fotos`, {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ anverso: enorme, reverso: foto }),
    })
    assert.equal(r.estado, 413)
    assert.match(r.cuerpo.error, /3 MB/)
  })

  test('las que ya estaban dentro del estado se mudan al arrancar', async () => {
    // Datos viejos: se planta una foto dentro del expediente, tal como la
    // guardaba la versión anterior, y se comprueba que la mudanza la saca.
    const vieja = 'data:image/jpeg;base64,' + 'V'.repeat(20000)
    const alta = await pedir('/api/v1/identidades', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ email: 'dato.viejo@prueba.local' }),
    })
    const identidad = store.todo().identidades.find((i) => i.id === alta.cuerpo.identidad.id)!
    identidad.documento = {
      aceptable: false, datos: null, hallazgos: [], edad: null,
      anverso: { aportado: true, nombreConfirmado: null, fechaConfirmada: null },
      via: 'fotos',
      imagenes: { anverso: vieja, reverso: vieja },
    }
    await store.guardarYa()
    assert.equal(estadoEnDisco().includes('V'.repeat(20000)), true, 'la prueba tiene que partir del estado sucio')

    const { migrarFotosDelEstado } = await import('../kyc/fotosDocumento.js')
    const r = await migrarFotosDelEstado()
    assert.equal(r.movidas, 1)
    assert.equal(identidad.documento?.imagenes ?? null, null)
    assert.equal(estadoEnDisco().includes('V'.repeat(20000)), false, 'el estado sigue pesado')
    assert.equal(aparte()[identidad.id].anverso, vieja)
  })
})

describe('Alcances de las aplicaciones', () => {
  test('ordenscan no puede crear identidades', async () => {
    const scan = store.todo().aplicaciones.find((a) => a.clave === 'ordenscan')!
    const { rotar } = await import('../auth/aplicaciones.js')
    const clave = rotar(scan.id, 'prueba')!
    const r = await pedir('/api/v1/identidades', {
      method: 'POST', headers: { 'X-API-Key': clave },
      body: JSON.stringify({ email: 'otro@prueba.local' }),
    })
    assert.equal(r.estado, 403)
    assert.match(r.cuerpo.error, /alcance/)
  })
})
