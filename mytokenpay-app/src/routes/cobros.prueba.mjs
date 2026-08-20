// Prueba del libro de cobros de MyTokenPay.
//
//   node --import tsx src/routes/cobros.prueba.mjs
//
// POR QUE EXISTE
//
// Estos endpoints son lo primero de MyTokenPay que mueve dinero de verdad.
// Hasta ahora los pagos eran una resta a un saldo guardado en el teléfono: un
// número que se recuperaba borrando la app. Lo que se prueba aquí es lo que no
// puede volver a estar mal cuando hay plata de por medio.
//
// LA PRUEBA QUE IMPORTA es la del doble pago. Es el mismo fallo que ya costó
// caro en la billetera: dos peticiones simultáneas del mismo QR —el cliente que
// toca dos veces, la red que reintenta— leen las dos «pendiente», las dos pasan
// el `if` y las dos cobran. Aquí se disparan A LA VEZ, sin esperar una a la
// otra, que es la única forma de que la carrera ocurra de verdad.
//
// Corre contra el motor de MEMORIA: sin MONGODB_URI el almacén cae ahí solo.
// No toca Atlas ni Genesis ID.

import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'secreto-solo-para-esta-prueba'
process.env.OG_TOKEN_PRICE_USD = '2.35'
process.env.HNL_POR_USD = '26.2'
process.env.ADMIN_EMAIL = 'jefe@prueba.local'
process.env.ADMIN_PASSWORD = 'clave-de-administrador-de-prueba'
delete process.env.MONGODB_URI
delete process.env.GENESIS_API_KEY   // sin clave, los reportes no salen a la red
delete process.env.VERCEL

const express = (await import('express')).default
const { authRouter } = await import('./auth.js')
const { companiesRouter } = await import('./companies.js')
const { cobrosRouter, pagosRouter } = await import('./cobros.js')
const { adminRouter } = await import('./admin.js')
const { db, documentoDeUsuario } = await import('../lib/db.js')

const app = express()
app.use(express.json({ limit: '4mb' }))
app.use('/api/auth', authRouter)
app.use('/api/companies', companiesRouter)
app.use('/api/cobros', cobrosRouter)
app.use('/api/pagos', pagosRouter)
app.use('/api/admin', adminRouter)
const server = app.listen(0)
const base = `http://127.0.0.1:${server.address().port}/api`

const pedir = async (ruta, { metodo = 'GET', cuerpo, token } = {}) => {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) }
}

const nuevaCuenta = async (correo) => {
  const r = await pedir('/auth/signup', {
    metodo: 'POST',
    cuerpo: { email: correo, password: 'Contrasena2026!', fullName: 'Persona De Prueba' },
  })
  assert.ok(r.estado === 200 || r.estado === 201, `no se pudo crear ${correo}: ${JSON.stringify(r.cuerpo)}`)
  return r.cuerpo.token
}

let fallos = 0
const prueba = async (nombre, fn) => {
  try { await fn(); console.log('  ok  ', nombre) }
  catch (e) { fallos++; console.log('  FALLA', nombre, '\n        ', e.message) }
}

console.log('\nCobros de MyTokenPay\n')

// ── Preparación: un comercio verificado y un cliente ─────────────────────────
const tokenComercio = await nuevaCuenta('comercio@prueba.local')
const tokenCliente = await nuevaCuenta('cliente@prueba.local')

const creada = await pedir('/companies', {
  metodo: 'POST', token: tokenComercio,
  cuerpo: {
    legalName: 'Cafe De Prueba S de RL', tradeName: 'Café de Prueba', taxId: 'TAX-0001',
    categorySlug: 'restaurantes', productsServices: ['café'],
    countrySlug: 'honduras', citySlug: 'tegucigalpa', address: 'Calle 1',
    lat: 14.0723, lng: -87.1921,
    description: 'Un café', acceptsOrigen: true,
  },
})
assert.ok(creada.estado === 200 || creada.estado === 201,
  'no se pudo crear el comercio: ' + JSON.stringify(creada.cuerpo))
const idComercio = creada.cuerpo.company.id

await prueba('un comercio sin KYB aprobado NO puede cobrar', async () => {
  const r = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 5 } })
  assert.equal(r.estado, 403)
  assert.match(r.cuerpo.error, /verificado/i)
})

const admin = 'Basic ' + Buffer.from('jefe@prueba.local:clave-de-administrador-de-prueba').toString('base64')
const comoAdmin = async (ruta, { metodo = 'GET', cuerpo } = {}) => {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: admin },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  return { estado: r.status, cuerpo: await r.json().catch(() => null) }
}

await prueba('sin credenciales de administrador no se revisa nada', async () => {
  const r = await pedir('/admin/comercios')
  assert.equal(r.estado, 401)
  const conClaveMala = await fetch(base + '/admin/comercios', {
    headers: { Authorization: 'Basic ' + Buffer.from('jefe@prueba.local:otra').toString('base64') },
  })
  assert.equal(conClaveMala.status, 401)
})

await prueba('no se aprueba un comercio que no mandó documentos', async () => {
  const r = await comoAdmin(`/admin/comercios/${idComercio}/decidir`, {
    metodo: 'POST', cuerpo: { decision: 'aprobar', motivo: 'documentos en regla' },
  })
  assert.equal(r.estado, 409)
})

// El comercio manda su KYB, como haría de verdad.
const enviado = await pedir(`/companies/${idComercio}/kyc`, {
  metodo: 'POST', token: tokenComercio,
  cuerpo: { documents: [{ label: 'Escritura de constitución', dataUrl: 'data:image/png;base64,AAAA' }] },
})
assert.equal(enviado.estado, 200, 'no se pudo mandar el KYB: ' + JSON.stringify(enviado.cuerpo))

await prueba('el comercio aparece en la cola de revisión', async () => {
  const r = await comoAdmin('/admin/comercios?estado=pending')
  assert.equal(r.estado, 200)
  const mio = r.cuerpo.comercios.find((c) => c.id === idComercio)
  assert.ok(mio, 'tiene que estar en la cola')
  // Y el listado NO reparte las imágenes de los documentos.
  assert.equal(mio.kyc.documentos[0].dataUrl, undefined)
  assert.equal(mio.kyc.documentos[0].label, 'Escritura de constitución')
})

await prueba('aprobar exige un motivo escrito', async () => {
  const r = await comoAdmin(`/admin/comercios/${idComercio}/decidir`, {
    metodo: 'POST', cuerpo: { decision: 'aprobar', motivo: 'ok' },
  })
  assert.equal(r.estado, 400)
})

await prueba('el administrador aprueba y el comercio queda verificado', async () => {
  const r = await comoAdmin(`/admin/comercios/${idComercio}/decidir`, {
    metodo: 'POST', cuerpo: { decision: 'aprobar', motivo: 'Escritura y RTN comprobados' },
  })
  assert.equal(r.estado, 200)
  assert.equal(r.cuerpo.comercio.kyc.status, 'verified')
  assert.equal(r.cuerpo.comercio.verified, true)
  assert.equal(r.cuerpo.comercio.kyc.note, 'Escritura y RTN comprobados')
})

await prueba('el cobro se crea con sus equivalentes congelados y su QR', async () => {
  const r = await pedir('/cobros', {
    metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 10, concepto: 'Dos cafés' },
  })
  assert.equal(r.estado, 201)
  const c = r.cuerpo.cobro
  assert.equal(c.montoOrigen, 10)
  assert.equal(c.montoUsd, 23.5, 'diez ORIGEN a 2,35 son 23,50 dólares')
  assert.equal(c.montoHnl, 615.7, 'y 615,70 lempiras a 26,2')
  assert.equal(c.estado, 'pendiente')
  assert.match(r.cuerpo.qr, /^mtp:cobro\?c=.+&inv=.+&a=10$/)
  assert.equal(c.comercio.nombre, 'Café de Prueba')
})

await prueba('un monto inválido no crea nada', async () => {
  for (const m of [0, -5, 'mucho', null]) {
    const r = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: m } })
    assert.equal(r.estado, 400, `${m} debería rechazarse`)
  }
})

await prueba('quien no tiene sesión no puede cobrar', async () => {
  const r = await pedir('/cobros', { metodo: 'POST', cuerpo: { montoOrigen: 5 } })
  assert.equal(r.estado, 401)
})

await prueba('el cobro se puede leer sin sesión: el QR lo escanea cualquiera', async () => {
  const c = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 3 } })
  const leido = await pedir('/cobros/' + c.cuerpo.cobro.id)
  assert.equal(leido.estado, 200)
  assert.equal(leido.cuerpo.cobro.montoOrigen, 3)
  // Y NO lleva datos internos del comercio ni de quién pagó.
  assert.equal(leido.cuerpo.cobro.emisorId, undefined)
  assert.equal(leido.cuerpo.cobro.pago, undefined)
})

// ══ LA PRUEBA QUE IMPORTA ═══════════════════════════════════════════════════
await prueba('UN COBRO NO SE PAGA DOS VECES, ni con dos peticiones a la vez', async () => {
  const c = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 7 } })
  const id = c.cuerpo.cobro.id

  // A la vez de verdad: se lanzan las dos y después se espera. Encadenarlas
  // con await haría que la segunda viera la primera ya terminada, que es
  // justamente el caso que NO reproduce el fallo.
  const [a, b] = await Promise.all([
    pedir(`/cobros/${id}/pagar`, { metodo: 'POST', token: tokenCliente, cuerpo: { medio: 'wallet' } }),
    pedir(`/cobros/${id}/pagar`, { metodo: 'POST', token: tokenCliente, cuerpo: { medio: 'wallet' } }),
  ])

  const exitos = [a, b].filter((r) => r.estado === 200)
  const choques = [a, b].filter((r) => r.estado === 409)
  assert.equal(exitos.length, 1, 'exactamente UNO tiene que cobrar')
  assert.equal(choques.length, 1, 'y el otro tiene que enterarse de que perdió')
  assert.match(choques[0].cuerpo.error, /ya fue pagado/i)

  const final = await pedir('/cobros/' + id)
  assert.equal(final.cuerpo.cobro.estado, 'pagado')
})

await prueba('un pago en la cadena sin hash se rechaza', async () => {
  const c = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 2 } })
  const r = await pedir(`/cobros/${c.cuerpo.cobro.id}/pagar`, {
    metodo: 'POST', token: tokenCliente, cuerpo: { medio: 'cadena' },
  })
  assert.equal(r.estado, 400)
  assert.match(r.cuerpo.error, /hash/i)
})

await prueba('un pago en la cadena con hash sí entra, y la prueba queda guardada', async () => {
  const c = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 2 } })
  const r = await pedir(`/cobros/${c.cuerpo.cobro.id}/pagar`, {
    metodo: 'POST', token: tokenCliente, cuerpo: { medio: 'cadena', hash: '0xabc123' },
  })
  assert.equal(r.estado, 200)
  const guardado = await db.cobroPorId(c.cuerpo.cobro.id)
  assert.equal(guardado.pago.hash, '0xabc123')
  assert.equal(guardado.pago.medio, 'cadena')
})

await prueba('un cobro cancelado ya no se puede pagar', async () => {
  const c = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 4 } })
  const id = c.cuerpo.cobro.id
  const cancelado = await pedir(`/cobros/${id}/cancelar`, { metodo: 'POST', token: tokenComercio })
  assert.equal(cancelado.estado, 200)
  const intento = await pedir(`/cobros/${id}/pagar`, {
    metodo: 'POST', token: tokenCliente, cuerpo: { medio: 'wallet' },
  })
  assert.equal(intento.estado, 409)
})

await prueba('nadie cancela el cobro de otro comercio', async () => {
  const c = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 4 } })
  const r = await pedir(`/cobros/${c.cuerpo.cobro.id}/cancelar`, { metodo: 'POST', token: tokenCliente })
  assert.equal(r.estado, 409, 'el cliente no es el emisor')
})

await prueba('un cobro caducado no se paga', async () => {
  const c = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 4 } })
  const id = c.cuerpo.cobro.id
  // Se envejece a mano en vez de esperar media hora.
  const guardado = await db.cobroPorId(id)
  guardado.caducaEn = new Date(Date.now() - 1000)
  const r = await pedir(`/cobros/${id}/pagar`, {
    metodo: 'POST', token: tokenCliente, cuerpo: { medio: 'wallet' },
  })
  assert.equal(r.estado, 409)
  assert.match(r.cuerpo.error, /caduc/i)
})

await prueba('el comercio ve su libro y su resumen cuadra', async () => {
  const r = await pedir('/cobros', { token: tokenComercio })
  assert.equal(r.estado, 200)
  assert.ok(r.cuerpo.cobros.length > 0)
  const res = r.cuerpo.resumen
  assert.equal(res.precioOrigenUsd, 2.35)
  // Lo pagado tiene que ser 7 (el de la carrera) + 2 (el de la cadena) = 9.
  assert.equal(res.totalOrigen, 9, 'solo suman los cobros PAGADOS')
  assert.equal(res.pagados, 2)
})

await prueba('el cliente ve lo que pagó, y solo lo suyo', async () => {
  const r = await pedir('/pagos', { token: tokenCliente })
  assert.equal(r.estado, 200)
  assert.equal(r.cuerpo.pagos.length, 2)
  const delComercio = await pedir('/pagos', { token: tokenComercio })
  assert.equal(delComercio.cuerpo.pagos.length, 0, 'el comercio no pagó nada')
})

await prueba('un cobro que no existe da 404, no 500', async () => {
  const r = await pedir('/cobros/no-existe-este-id')
  assert.equal(r.estado, 404)
})

/* ══ EL FALLO QUE TUMBO PRODUCCION ═════════════════════════════════════════
   Dos registros del mismo correo a la vez. El `if` que comprueba antes pierde
   la carrera; el indice unico de la base la gana y lanza. Y una excepcion
   dentro de un handler `async` de Express 4 NO llega al manejador de errores:
   queda como `unhandledRejection` y Node MATA EL PROCESO. O sea que el
   registro repetido de UNA persona dejaba a TODAS sin servicio.

   Aqui se comprueba lo que tiene que pasar: uno entra, el otro recibe 409, y
   el servidor sigue en pie contestando. */
await prueba('dos registros del mismo correo a la vez: 409, y el servidor NO se cae', async () => {
  const correo = `carrera-${Date.now()}@prueba.local`
  const cuerpo = { email: correo, password: 'Contrasena2026!', fullName: 'Carrera De Registro' }
  const [a, b] = await Promise.all([
    pedir('/auth/signup', { metodo: 'POST', cuerpo }),
    pedir('/auth/signup', { metodo: 'POST', cuerpo }),
  ])
  const creados = [a, b].filter((r) => r.estado === 200 || r.estado === 201)
  const choques = [a, b].filter((r) => r.estado === 409)
  assert.equal(creados.length, 1, 'exactamente UNA cuenta')
  assert.equal(choques.length, 1, 'y la otra recibe un 409, no una caida')

  // Lo que de verdad se prueba: el servidor sigue vivo despues.
  const despues = await pedir('/cobros/lo-que-sea')
  assert.equal(despues.estado, 404, 'el servidor tiene que seguir contestando')
})

/* El documento que se GUARDA no puede llevar `gid` mientras no haya GID.
   Sobre ese campo hay un indice unico y disperso, y «disperso» excluye a los
   documentos donde el campo no existe — no a los que lo tienen en `null`. Con
   `gid: null` escrito, la segunda cuenta de la historia chocaba con un
   duplicado y el error decia «ya existe una cuenta con este correo» sobre un
   correo nuevo. El motor de memoria no tiene indices, asi que esta prueba
   comprueba la INVARIANTE que los hace funcionar, no el indice. */
await prueba('el documento guardado no lleva gid mientras no haya GID', async () => {
  const base = {
    id: 'x', email: 'a@b.c', passwordHash: 'h', fullName: 'N',
    role: 'user', createdAt: new Date().toISOString(),
    gid: null, direccionWallet: null,
  }
  const guardado = documentoDeUsuario(base)
  assert.equal('gid' in guardado, false, 'con gid en null, la clave NO puede existir')
  assert.equal('direccionWallet' in guardado, false)
  // Y cuando SI hay identidad, el campo va — es lo que hace unico al indice.
  const conGid = documentoDeUsuario({ ...base, gid: 'GID-HN-000001' })
  assert.equal(conGid.gid, 'GID-HN-000001')
})

/* LA REFERENCIA DEL QR TIENE QUE SERVIR PARA PAGAR.
   El codigo que se escanea lleva la REFERENCIA, no el id interno. Si solo se
   pudiera por id, quien escanea tendria en la mano un dato con el que no puede
   hacer nada — y el cajero que la dicta por telefono, tampoco. */
await prueba('un cobro se lee y se paga por su referencia, no solo por su id', async () => {
  const c = await pedir('/cobros', { metodo: 'POST', token: tokenComercio, cuerpo: { montoOrigen: 6 } })
  const ref = c.cuerpo.cobro.referencia
  assert.ok(ref && ref.length === 8, 'la referencia tiene que venir en la respuesta')

  // Leerlo por referencia, sin sesion, como quien escanea el codigo.
  const leido = await pedir('/cobros/' + ref)
  assert.equal(leido.estado, 200)
  assert.equal(leido.cuerpo.cobro.montoOrigen, 6)

  // En minusculas tambien: quien la teclea no se acuerda de como estaba escrita.
  const enMinusculas = await pedir('/cobros/' + ref.toLowerCase())
  assert.equal(enMinusculas.estado, 200)

  // Y pagarlo por referencia.
  const pago = await pedir(`/cobros/${ref}/pagar`, {
    metodo: 'POST', token: tokenCliente, cuerpo: { medio: 'wallet' },
  })
  assert.equal(pago.estado, 200)
  assert.equal(pago.cuerpo.cobro.estado, 'pagado')

  // Y no se paga dos veces, ni mezclando referencia con id.
  const otraVez = await pedir(`/cobros/${c.cuerpo.cobro.id}/pagar`, {
    metodo: 'POST', token: tokenCliente, cuerpo: { medio: 'wallet' },
  })
  assert.equal(otraVez.estado, 409)
})

/* ══ LA PUERTA DEL ECOSISTEMA ══════════════════════════════════════════════
   Sin clave de Genesis configurada (que es como corre esta prueba) el SSO no
   puede verificar nada, y lo que tiene que pasar es que RECHACE — nunca que
   deje entrar por no poder comprobar. Un «no pude verificarlo, pasá» es
   exactamente como se cuela quien no debería. */
await prueba('sin poder verificar el token, el SSO NO deja entrar', async () => {
  const r = await pedir('/auth/sso', { metodo: 'POST', cuerpo: { token: 'lo-que-sea' } })
  assert.equal(r.estado, 401)
})

await prueba('el SSO sin token pide el token', async () => {
  const r = await pedir('/auth/sso', { metodo: 'POST', cuerpo: {} })
  assert.equal(r.estado, 400)
})

server.close()
console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo en orden\n')
process.exit(fallos ? 1 : 0)
