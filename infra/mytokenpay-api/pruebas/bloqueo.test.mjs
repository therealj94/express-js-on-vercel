// El bloqueo del ecosistema, del lado de MyTokenPay.
//
//   node --test pruebas/bloqueo.test.mjs
//
// AQUÍ EL AGUJERO ERA EL MÁS GRANDE DE LAS TRES CASAS. MyTokenPay firma un
// token de TREINTA DÍAS, sin refresco y sin `tokenVersion`: no tenía ningún
// interruptor de revocación. Una vez emitido, ese token valía un mes hiciera
// lo que hiciera cualquiera, y un bloqueo en Genesis no lo tocaba.
//
// Y hay una segunda cosa que solo pasa acá: esta casa tiene su propio registro
// con correo y contraseña, así que no toda cuenta viene de Genesis. Preguntar
// solo por el GID dejaría fuera del bloqueo justo a las cuentas de las que
// menos se sabe — las que nunca pasaron por el SSO.

import test, { describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

// ── El Genesis fingido, por HTTP y no por parche ────────────────────────────
const estado = { bloqueadosGid: new Set(), bloqueadosMail: new Set(), sinIdentidad: new Set(), caido: false, llamadas: 0 }
const servidor = createServer((req, res) => {
  estado.llamadas += 1
  if (estado.caido) { res.statusCode = 503; return res.end('{}') }
  res.setHeader('content-type', 'application/json')

  const g = /^\/api\/v1\/gid\/(.+)$/.exec(req.url || '')
  if (g) {
    const gid = decodeURIComponent(g[1])
    return res.end(JSON.stringify({
      tipo: 'personal', gid,
      verificada: !estado.bloqueadosGid.has(gid),
      bloqueada: estado.bloqueadosGid.has(gid),
    }))
  }
  const m = /^\/api\/v1\/identidades\/por-email\/(.+)$/.exec(req.url || '')
  if (m) {
    const email = decodeURIComponent(m[1]).toLowerCase()
    if (estado.sinIdentidad.has(email)) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'no existe' })) }
    return res.end(JSON.stringify({
      identidad: { email, estado: 'verificada', bloqueada: estado.bloqueadosMail.has(email) },
    }))
  }
  res.statusCode = 404
  res.end('{}')
})
await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo))
process.env.GENESIS_URL = `http://127.0.0.1:${servidor.address().port}`
process.env.GENESIS_API_KEY = 'clave-de-prueba'

/* El modulo esta en TypeScript, asi que esto necesita el cargador de tsx
   (`npm run probar` lo pone). Sin dependencias instaladas se dice y se sale:
   una prueba que no corrio no puede parecer una prueba que paso. */
let bloqueo
try {
  bloqueo = await import('../src/lib/bloqueo.ts')
} catch (e) {
  console.log('No se pudo cargar src/lib/bloqueo.ts (¿falta npm install?): esta prueba NO corrio y NO probo nada.')
  console.log('  ' + e.message)
  servidor.close()
  process.exit(0)
}

after(() => servidor.close())

const GID = 'GEN-AAAA-BBBB-1'
const CORREO = 'persona@ejemplo.com'

describe('Con GID: la cuenta que entró por el SSO', () => {
  test('quien no está bloqueado opera', async () => {
    bloqueo._adentro.olvidar()
    assert.equal((await bloqueo.puedeOperar({ gid: GID, email: CORREO })).puede, true)
  })

  test('quien sí lo está, no', async () => {
    estado.bloqueadosGid.add(GID)
    bloqueo._adentro.olvidar()
    const r = await bloqueo.puedeOperar({ gid: GID, email: CORREO })
    assert.equal(r.puede, false)
    assert.equal(r.respuesta.codigo, 'ACCESO_BLOQUEADO')
    // El mensaje es para una persona: dice qué pasa y qué hacer. Un 403 pelado
    // manda a alguien a reinstalar la app.
    assert.match(r.respuesta.error, /bloqueado/i)
    estado.bloqueadosGid.delete(GID)
  })

  test('el GID manda sobre el correo: es la identidad de verdad', async () => {
    estado.bloqueadosGid.add(GID)
    estado.bloqueadosMail.delete(CORREO)
    bloqueo._adentro.olvidar()
    assert.equal((await bloqueo.puedeOperar({ gid: GID, email: CORREO })).puede, false)
    estado.bloqueadosGid.delete(GID)
  })
})

describe('Sin GID: la cuenta que nunca pasó por el SSO', () => {
  test('se pregunta POR EL CORREO, que si no el bloqueo no la alcanza', async () => {
    estado.bloqueadosMail.add(CORREO)
    bloqueo._adentro.olvidar()
    const r = await bloqueo.puedeOperar({ gid: null, email: CORREO })
    assert.equal(r.puede, false, 'una cuenta de solo correo también se bloquea')
    assert.equal(r.respuesta.codigo, 'ACCESO_BLOQUEADO')
    estado.bloqueadosMail.delete(CORREO)
  })

  test('y si no está bloqueada, opera', async () => {
    bloqueo._adentro.olvidar()
    assert.equal((await bloqueo.puedeOperar({ gid: null, email: CORREO })).puede, true)
  })

  test('un correo que Genesis no conoce se deja pasar: no hay a quién bloquear', async () => {
    estado.sinIdentidad.add('ajena@ejemplo.com')
    bloqueo._adentro.olvidar()
    assert.equal((await bloqueo.puedeOperar({ gid: null, email: 'ajena@ejemplo.com' })).puede, true)
    estado.sinIdentidad.delete('ajena@ejemplo.com')
  })

  test('sin gid y sin correo no se le pregunta nada a nadie', async () => {
    bloqueo._adentro.olvidar()
    const antes = estado.llamadas
    assert.equal((await bloqueo.puedeOperar({})).puede, true)
    assert.equal(estado.llamadas, antes, 'ni una llamada de más')
  })
})

describe('La memoria corta', () => {
  test('tres peticiones seguidas son UNA llamada a Genesis', async () => {
    bloqueo._adentro.olvidar()
    const antes = estado.llamadas
    await bloqueo.puedeOperar({ gid: GID })
    await bloqueo.puedeOperar({ gid: GID })
    await bloqueo.puedeOperar({ gid: GID })
    assert.equal(estado.llamadas - antes, 1)
  })

  test('pasado el minuto se vuelve a preguntar', async () => {
    const antes = estado.llamadas
    await bloqueo.puedeOperar({ gid: GID }, { ahora: Date.now() + bloqueo._adentro.MEMORIA_MS + 1000 })
    assert.equal(estado.llamadas - antes, 1)
  })

  test('la memoria es de un minuto o dos, no de horas', () => {
    // Acá no hay refresco donde volver a preguntar: esta memoria es lo ÚNICO
    // que hay entre el botón de bloquear y la puerta.
    assert.ok(bloqueo._adentro.MEMORIA_MS <= 120_000, String(bloqueo._adentro.MEMORIA_MS))
  })

  test('el gid y el correo se recuerdan por separado', async () => {
    bloqueo._adentro.olvidar()
    await bloqueo.puedeOperar({ gid: GID })
    const antes = estado.llamadas
    await bloqueo.puedeOperar({ gid: null, email: CORREO })
    assert.equal(estado.llamadas - antes, 1, 'una cuenta de correo no hereda la respuesta de un GID')
  })
})

describe('Si Genesis no contesta', () => {
  test('un tropiezo corto NO tumba MyTokenPay', async () => {
    bloqueo._adentro.olvidar()
    await bloqueo.puedeOperar({ gid: GID })
    estado.caido = true
    const r = await bloqueo.puedeOperar({ gid: GID }, { ahora: Date.now() + 61_000 })
    assert.equal(r.puede, true, 'se usa lo último que dijo')
    estado.caido = false
  })

  test('pero pasada la ventana ciega se deja de operar', async () => {
    bloqueo._adentro.olvidar()
    await bloqueo.puedeOperar({ gid: GID })
    estado.caido = true
    const r = await bloqueo.puedeOperar({ gid: GID }, { ahora: Date.now() + bloqueo._adentro.VENTANA_CIEGA_MS + 1000 })
    assert.equal(r.puede, false)
    assert.equal(r.respuesta.codigo, 'NO_SE_PUDO_COMPROBAR', 'y se dice que no se pudo, no que está bloqueado')
    estado.caido = false
  })

  test('un bloqueado NO se desbloquea porque Genesis se caiga', async () => {
    bloqueo._adentro.olvidar()
    estado.bloqueadosGid.add(GID)
    await bloqueo.puedeOperar({ gid: GID })
    estado.caido = true
    const r = await bloqueo.puedeOperar({ gid: GID }, { ahora: Date.now() + 61_000 })
    assert.equal(r.puede, false, 'lo último que dijo se respeta en los DOS sentidos')
    estado.caido = false
    estado.bloqueadosGid.delete(GID)
  })

  test('de quien nunca se supo, se deja pasar esta vez', async () => {
    bloqueo._adentro.olvidar()
    estado.caido = true
    assert.equal((await bloqueo.puedeOperar({ gid: 'GEN-ZZZZ-ZZZZ-9' })).puede, true)
    estado.caido = false
  })
})

describe('Un Genesis viejo, sin el campo nuevo', () => {
  test('un `verificada:false` también cierra: de más y no de menos', async () => {
    const viejo = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ tipo: 'personal', verificada: false }))
    })
    await new Promise((l) => viejo.listen(0, '127.0.0.1', l))
    const antes = process.env.GENESIS_URL
    process.env.GENESIS_URL = `http://127.0.0.1:${viejo.address().port}`
    bloqueo._adentro.olvidar()
    // El módulo lee la base al cargar, así que se comprueba la rama directa.
    const r = await bloqueo._adentro.porGid(GID)
    assert.equal(r.ok, true)
    process.env.GENESIS_URL = antes
    viejo.close()
  })
})

describe('Está cableado donde tiene que estar', () => {
  test('la puerta lo consulta, y es el único sitio donde se puede', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../src/middleware/auth.ts', import.meta.url), 'utf8')
    assert.match(src, /puedeOperar\(usuario\)/, 'requireAuth lo consulta')
    // Después de validar el token —no se le pregunta a Genesis por una sesión
    // inválida— y antes de dejar entrar.
    const iToken = src.indexOf('verifyToken(token)')
    const iBloq = src.indexOf('puedeOperar(usuario)')
    assert.ok(iToken > 0 && iBloq > iToken, 'después de validar el token')
    // Y también en attachUser: si no, una persona bloqueada seguiría siendo
    // «alguien conocido» en las rutas donde entrar con sesión cambia lo que se ve.
    assert.equal((src.match(/puedeOperar\(usuario\)/g) || []).length, 2,
      'las DOS puertas lo consultan: requireAuth y attachUser')
  })
})
