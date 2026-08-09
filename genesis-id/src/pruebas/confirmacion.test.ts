// Pruebas del alta probada con la propia sesión.
//
// Lo que se está comprobando aquí no es que funcione: es que NO se pueda
// abusar. Esta ruta se abre con una clave pública —la que va dentro de un APK
// y de una página— así que lo único que separa el padrón de cualquiera es el
// token, y estas pruebas fijan exactamente eso.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { confirmarPersona, idDelToken } from '../directorio/confirmacion.js'
import { consultar } from '../directorio/padron.js'

/** Un JWT de mentira: cabecera y firma dan igual, lo que se lee es el medio. */
function jwt(contenido: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64(contenido)}.firma`
}

/** Sustituye el `fetch` global para simular al backend de la app. */
function conBackend(responder: (url: string, opciones: any) => Response, fn: () => Promise<void>) {
  const original = globalThis.fetch
  globalThis.fetch = (async (u: any, o: any) => responder(String(u), o)) as any
  return fn().finally(() => { globalThis.fetch = original })
}

const ok = () => new Response('{}', { status: 200 })
const noAutorizado = () => new Response('{}', { status: 401 })

test('sin un token que el backend acepte NO se escribe una sola fila', async () => {
  await conBackend(noAutorizado, async () => {
    const r = await confirmarPersona('veta-wallet', jwt({ id: 'intruso', email: 'falso@ejemplo.com' }))
    assert.equal(r.ok, false)
    assert.equal(r.estado, 401, 'tiene que ser 401: la sesión no vale')
  })
  const d = await consultar({ app: 'veta-wallet', texto: 'falso@ejemplo.com' })
  assert.equal(d.usuarios.length, 0, 'un rechazo no puede dejar rastro en el padrón')
})

test('con un token que el backend acepta, la persona entra al padrón', async () => {
  await conBackend(ok, async () => {
    const r = await confirmarPersona('veta-wallet', jwt({
      id: 'usr_ok_1', email: 'valida@ejemplo.com', name: 'Valida Real',
      address: '0x1234567890123456789012345678901234567890',
    }))
    assert.equal(r.ok, true)
    assert.equal(r.idExterno, 'usr_ok_1')
    assert.equal(r.emailConfirmado, true, 'el correo venía dentro del token, o sea firmado')
  })

  const d = await consultar({ app: 'veta-wallet', texto: 'valida@ejemplo.com' })
  assert.equal(d.usuarios.length, 1)
  assert.equal(d.usuarios[0].nombre, 'Valida Real')
  assert.equal(d.usuarios[0].direccionWallet, '0x1234567890123456789012345678901234567890')
})

test('el token manda sobre lo que diga el cliente', async () => {
  await conBackend(ok, async () => {
    await confirmarPersona('veta-wallet',
      jwt({ id: 'usr_ok_2', email: 'suyo@ejemplo.com', address: '0xaaaa000000000000000000000000000000000000' }),
      // El cliente intenta colar otro correo y otra billetera.
      { email: 'ajeno@ejemplo.com', direccionWallet: '0xbbbb000000000000000000000000000000000000' })
  })

  const suyo = await consultar({ app: 'veta-wallet', texto: 'suyo@ejemplo.com' })
  assert.equal(suyo.usuarios.length, 1, 'se guarda el correo del token')
  assert.equal(suyo.usuarios[0].direccionWallet, '0xaaaa000000000000000000000000000000000000',
    'y su billetera, no la que puso el cliente')

  const ajeno = await consultar({ app: 'veta-wallet', texto: 'ajeno@ejemplo.com' })
  assert.equal(ajeno.usuarios.length, 0, 'lo que declaró el cliente se ignora si el token lo trae')
})

test('un correo no firmado se guarda marcado como tal', async () => {
  await conBackend(ok, async () => {
    const r = await confirmarPersona('veta-wallet',
      jwt({ id: 'usr_ok_3' }),  // el token no trae correo
      { email: 'declarado@ejemplo.com' })
    assert.equal(r.ok, true)
    assert.equal(r.emailConfirmado, false)
  })
  const d = await consultar({ app: 'veta-wallet', texto: 'declarado@ejemplo.com' })
  assert.equal(d.usuarios.length, 1)
  assert.match(String((d.usuarios[0] as any).extra?.correoConfirmado), /^no/,
    'tiene que quedar dicho que ese correo no venía firmado')
})

test('cada quien solo puede escribir SU fila', async () => {
  // Dos altas con el mismo token: la clave es el id del token, así que la
  // segunda actualiza la primera en vez de crear a otra persona.
  await conBackend(ok, async () => {
    await confirmarPersona('veta-wallet', jwt({ id: 'usr_unico', email: 'uno@ejemplo.com' }))
    await confirmarPersona('veta-wallet', jwt({ id: 'usr_unico', email: 'uno@ejemplo.com' }))
  })
  const d = await consultar({ app: 'veta-wallet', texto: 'uno@ejemplo.com' })
  assert.equal(d.usuarios.length, 1, 'no se duplica: la fila es del id del token')
})

test('si el backend de la app está caído no se cuela nadie', async () => {
  await conBackend(() => { throw new Error('ECONNREFUSED') }, async () => {
    const r = await confirmarPersona('veta-wallet', jwt({ id: 'x', email: 'caido@ejemplo.com' }))
    assert.equal(r.ok, false)
    assert.equal(r.estado, 502, 'sin un sí explícito no se escribe: se pide reintentar')
  })
  const d = await consultar({ app: 'veta-wallet', texto: 'caido@ejemplo.com' })
  assert.equal(d.usuarios.length, 0)
})

test('una app sin verificador configurado no puede usar esta puerta', async () => {
  const r = await confirmarPersona('app-cualquiera', jwt({ id: 'x', email: 'x@ejemplo.com' }))
  assert.equal(r.ok, false)
  assert.equal(r.estado, 400)
})

test('lo que no es un JWT se rechaza antes de molestar al backend', async () => {
  let llamadas = 0
  await conBackend(() => { llamadas++; return ok() }, async () => {
    for (const malo of ['', 'abc', 'a.b', 'a.b.c.d']) {
      const r = await confirmarPersona('veta-wallet', malo)
      assert.equal(r.ok, false)
    }
  })
  assert.equal(llamadas, 0, 'ni una consulta al backend por basura evidente')
})

test('el identificador se saca con el mismo orden que usan los clientes', () => {
  assert.equal(idDelToken({ sub: 's', id: 'i', userId: 'u' }), 'i', 'id gana a sub')
  assert.equal(idDelToken({ _id: 'm', id: 'i' }), 'm', '_id gana a id')
  assert.equal(idDelToken({ sub: 's', userId: 'u' }), 's')
  assert.equal(idDelToken({ userId: 'u' }), 'u')
  assert.equal(idDelToken({ email: 'e@x.com' }), 'e@x.com', 'el correo es el último recurso')
  assert.equal(idDelToken({}), null)
})
