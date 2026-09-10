// El bloqueo por infracción de políticas, contra el servidor de verdad.
//
// LO QUE DE VERDAD HAY QUE PROBAR AQUÍ NO ES QUE EL BOTÓN ESCRIBA UN CAMPO.
// Es que estén cerradas TODAS las puertas, incluidas las dos que se olvidan:
//
//   · El pase del SSO que ya se había emitido ANTES del bloqueo. Un bloqueo
//     siempre llega después de que se repartieran pases; si esa comprobación
//     falta, bloquear no hace nada hasta que caduque el último y el operador
//     cree que sacó a alguien que sigue dentro.
//   · Atar una cuenta nueva. El vínculo es la llave del SSO: sin cerrar esa
//     puerta, bastaría con crearse una cuenta en otra app del ecosistema y
//     atarla para volver a entrar por al lado.
//
// Y que desbloquear devuelva a la persona EXACTAMENTE a donde estaba, sin
// rehacer nada. Esa es toda la diferencia con suspender, y si se pierde, el
// bloqueo se vuelve irreversible de hecho y nadie se atreve a usarlo.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Server } from 'http'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-bloqueo-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
process.env.GENESIS_ADMIN_EMAIL = 'admin@prueba.local'
process.env.GENESIS_ADMIN_PASSWORD = 'contrasena-de-prueba-larga'
process.env.GENESIS_SSO_SECRETO = 'secreto-de-prueba'
delete process.env.GENESIS_MONGO_URL

let servidor: Server
let base: string
let sesion = ''
let clave = ''
let gid = ''
let idn = ''
/** Un pase emitido ANTES del bloqueo: es la puerta que se olvida. */
let paseViejo = ''

const { default: app, arrancar } = await import('../index.js')
const { store } = await import('../store.js')

const pedir = async (ruta: string, opciones: RequestInit = {}) => {
  const r = await fetch(base + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) as any }
}
const conSesion = () => ({ Authorization: `Bearer ${sesion}` })
const conClave = () => ({ 'X-API-Key': clave })

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

  const entrada = await pedir('/api/sesion/entrar', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@prueba.local', contrasena: 'contrasena-de-prueba-larga' }),
  })
  sesion = entrada.cuerpo.token

  // Una identidad YA verificada, puesta a mano en el almacén. Rehacer el KYC
  // entero aquí no probaría nada de este archivo y lo haría diez veces más
  // largo — eso ya lo prueba flujo.test.ts.
  const ids = await import('../motor/identidades.js')
  // El GID se genera con el generador de verdad: lleva dígito verificador y
  // las rutas lo comprueban antes de mirar nada. Uno inventado a mano se
  // rechaza con un 400 sin llegar a la identidad.
  const { gidPersonal } = await import('../lib/uid.js')
  const identidad = ids.iniciar('bloqueada@prueba.local', 'prueba')
  idn = identidad.id
  identidad.nombreLegal = 'Anna Maria Eriksson'
  identidad.nacionalidad = 'HND'
  identidad.estado = 'verificada'
  identidad.gid = gidPersonal()
  identidad.verificadaEn = new Date().toISOString()
  identidad.vinculos = [{
    app: 'veta-wallet', cuenta: 'cuenta-1', direccion: null,
    vinculadaEn: new Date().toISOString(), ultimoAcceso: null,
  }]
  gid = identidad.gid
  await store.guardarYa()

  const pase = await pedir('/api/v1/sso/token', {
    method: 'POST', headers: conClave(),
    body: JSON.stringify({ gid, cuenta: 'cuenta-1' }),
  })
  assert.equal(pase.estado, 200, JSON.stringify(pase.cuerpo))
  paseViejo = pase.cuerpo.token
})

after(() => {
  servidor?.close()
  rmSync(carpeta, { recursive: true, force: true })
})

const bloquear = (motivo: string, politica?: string) =>
  pedir(`/api/panel/identidades/${idn}/bloquear`, {
    method: 'POST', headers: conSesion(), body: JSON.stringify({ motivo, politica }),
  })
const desbloquear = (motivo: string) =>
  pedir(`/api/panel/identidades/${idn}/desbloquear`, {
    method: 'POST', headers: conSesion(), body: JSON.stringify({ motivo }),
  })

// ─────────────────────────────────────────────────────────────────────────────

describe('Antes de bloquear, todo abierto', () => {
  test('el ecosistema la ve verificada', async () => {
    const r = await pedir(`/api/v1/gid/${gid}`, { headers: conClave() })
    assert.equal(r.cuerpo.verificada, true)
    assert.equal(r.cuerpo.bloqueada, false)
  })

  test('y su pase del SSO vale', async () => {
    const r = await pedir('/api/v1/sso/verificar', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ token: paseViejo }),
    })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.valido, true)
  })
})

describe('El bloqueo pide una razón escrita', () => {
  test('sin motivo no se bloquea', async () => {
    assert.equal((await bloquear('')).estado, 400)
  })

  test('con un motivo de dos letras tampoco', async () => {
    const r = await bloquear('no')
    assert.equal(r.estado, 400)
    assert.match(r.cuerpo.error, /mínimo/i)
  })

  test('el panel exige sesión de operador', async () => {
    const r = await pedir(`/api/panel/identidades/${idn}/bloquear`, {
      method: 'POST', body: JSON.stringify({ motivo: 'un motivo suficientemente largo' }),
    })
    assert.equal(r.estado, 401)
  })
})

describe('Bloqueada: no entra a nada', () => {
  test('se bloquea con motivo y política', async () => {
    const r = await bloquear('Amenazó a un agente por WhatsApp', 'Trato con el personal')
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    assert.equal(r.cuerpo.bloqueo.bloqueada, true)
    assert.equal(r.cuerpo.bloqueo.vigente.operador, 'admin@prueba.local')
  })

  test('EL PASE QUE YA TENÍA deja de valer — la puerta que se olvida', async () => {
    const r = await pedir('/api/v1/sso/verificar', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ token: paseViejo }),
    })
    assert.equal(r.estado, 403)
    assert.equal(r.cuerpo.valido, false)
    assert.equal(r.cuerpo.codigo, 'IDENTIDAD_BLOQUEADA')
  })

  test('no se le emite un pase nuevo', async () => {
    const r = await pedir('/api/v1/sso/token', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ gid, cuenta: 'cuenta-1' }),
    })
    assert.equal(r.estado, 403)
    assert.equal(r.cuerpo.codigo, 'IDENTIDAD_BLOQUEADA')
  })

  test('el ecosistema deja de verla verificada', async () => {
    const r = await pedir(`/api/v1/gid/${gid}`, { headers: conClave() })
    assert.equal(r.cuerpo.verificada, false)
    assert.equal(r.cuerpo.bloqueada, true)
  })

  test('no se le emite una credencial — que no se podría retirar después', async () => {
    const r = await pedir('/api/v1/credenciales', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({ gid, cuenta: 'cuenta-1', atributos: ['nombre'], dias: 30 }),
    })
    assert.equal(r.estado, 403)
    assert.equal(r.cuerpo.codigo, 'IDENTIDAD_BLOQUEADA')
  })

  test('NO puede atar una cuenta nueva para entrar por otra app', async () => {
    const r = await pedir('/api/v1/vinculos', {
      method: 'POST', headers: conClave(),
      body: JSON.stringify({
        identidadId: idn, cuenta: 'cuenta-nueva', email: 'bloqueada@prueba.local',
      }),
    })
    assert.equal(r.estado, 403)
    assert.equal(r.cuerpo.codigo, 'IDENTIDAD_BLOQUEADA')
  })

  test('el motivo NO viaja a las apps: les basta con que no entra', async () => {
    /* Las palabras se buscan sueltas y no con un «o» amplio: la primera
       versión de esta prueba buscaba también «personal» y saltaba sola,
       porque la respuesta lleva `tipo: 'personal'`. Una prueba que falla por
       su propio patrón enseña a ignorarla. */
    const filtra = (x: unknown) => /Amenaz|WhatsApp|Trato con el/i.test(JSON.stringify(x))
    const r = await pedir(`/api/v1/gid/${gid}`, { headers: conClave() })
    assert.equal(filtra(r.cuerpo), false, JSON.stringify(r.cuerpo))
    const s = await pedir('/api/v1/sso/verificar', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ token: paseViejo }),
    })
    assert.equal(filtra(s.cuerpo), false, JSON.stringify(s.cuerpo))
    const p = await pedir(`/api/v1/identidades/por-gid/${gid}`, { headers: conClave() })
    assert.equal(filtra(p.cuerpo), false, 'el motivo tampoco viaja en el perfil')
  })
})

describe('Bloquear NO es suspender', () => {
  test('su KYC queda intacto: sigue verificada por dentro', async () => {
    const i = store.todo().identidades.find((x) => x.id === idn)!
    assert.equal(i.estado, 'verificada')
    assert.equal(i.gid, gid)
    assert.equal(i.nombreLegal, 'Anna Maria Eriksson')
  })

  test('y la propia persona sabe que está bloqueada, no que su trámite falló', async () => {
    const r = await pedir(`/api/v1/identidades/por-gid/${gid}`, { headers: conClave() })
    assert.equal(r.estado, 200)
    assert.equal(r.cuerpo.identidad.bloqueada, true)
    assert.equal(r.cuerpo.identidad.estado, 'verificada')
  })

  test('no se puede bloquear dos veces: dos vigentes a la vez es un lío sin salida', async () => {
    const r = await bloquear('Otro motivo cualquiera de largo suficiente')
    assert.equal(r.estado, 400)
    assert.match(r.cuerpo.error, /ya está bloqueada/i)
  })
})

describe('Desbloquear la devuelve a donde estaba', () => {
  test('el levantamiento también pide su razón', async () => {
    assert.equal((await desbloquear('ok')).estado, 400)
  })

  test('se levanta', async () => {
    const r = await desbloquear('Se aclaró: no fue ella, era otra cuenta')
    assert.equal(r.estado, 200, JSON.stringify(r.cuerpo))
    assert.equal(r.cuerpo.bloqueo.bloqueada, false)
  })

  test('vuelve a entrar SIN repetir el documento ni el rostro', async () => {
    const r = await pedir(`/api/v1/gid/${gid}`, { headers: conClave() })
    assert.equal(r.cuerpo.verificada, true)
    assert.equal(r.cuerpo.bloqueada, false)
    const i = store.todo().identidades.find((x) => x.id === idn)!
    assert.equal(i.estado, 'verificada')
    assert.equal(i.gid, gid, 'el GID es el mismo de siempre')
  })

  test('y se le vuelve a emitir un pase', async () => {
    const r = await pedir('/api/v1/sso/token', {
      method: 'POST', headers: conClave(), body: JSON.stringify({ gid, cuenta: 'cuenta-1' }),
    })
    assert.equal(r.estado, 200)
  })

  test('desbloquear a quien no está bloqueado no hace nada', async () => {
    const r = await desbloquear('otro intento de levantar lo que no está puesto')
    assert.equal(r.estado, 400)
  })
})

describe('El historial no se borra', () => {
  test('el bloqueo levantado sigue ahí, con las dos fechas y los dos motivos', async () => {
    const i = store.todo().identidades.find((x) => x.id === idn)!
    const lista = i.bloqueos ?? []
    assert.equal(lista.length, 1)
    const b = lista[0]
    assert.equal(b.motivo, 'Amenazó a un agente por WhatsApp')
    assert.equal(b.politica, 'Trato con el personal')
    assert.equal(b.operador, 'admin@prueba.local')
    assert.ok(b.desde)
    assert.equal(b.levantadoPor, 'admin@prueba.local')
    assert.ok(b.levantadoEn)
    assert.match(b.levantadoMotivo!, /no fue ella/)
  })

  test('se puede volver a bloquear, y se apila sin pisar el anterior', async () => {
    const r = await bloquear('Reincidió con el mismo agente')
    assert.equal(r.estado, 200)
    const i = store.todo().identidades.find((x) => x.id === idn)!
    assert.equal((i.bloqueos ?? []).length, 2)
    assert.equal(i.bloqueos![0].levantadoEn !== null, true, 'el primero sigue levantado')
    assert.equal(i.bloqueos![1].levantadoEn, null, 'el segundo está vigente')
  })

  test('las dos decisiones quedaron en la bitácora, con quién las tomó', async () => {
    for (const accion of ['identidad.bloqueada', 'identidad.desbloqueada']) {
      const r = await pedir(`/api/panel/bitacora?accion=${accion}`, { headers: conSesion() })
      assert.equal(r.estado, 200)
      assert.ok(r.cuerpo.entradas.length >= 1, `falta ${accion} en la bitácora`)
      assert.equal(r.cuerpo.entradas[0].actor, 'admin@prueba.local')
    }
  })
})
