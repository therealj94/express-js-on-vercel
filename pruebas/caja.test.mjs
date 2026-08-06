// Pruebas del dominio de cobro contra el servidor real, de punta a punta.
//
// No se prueba «la función devuelve lo que espero». Se prueba lo que de verdad
// puede costar dinero: que una parte no se pague dos veces, que dos personas no
// paguen la misma porción, que nadie retire más de lo que tiene y que un
// comercio sin verificar no pueda cobrar.
//
//   node --test pruebas/caja.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.API || 'http://127.0.0.1:3399'

async function pedir(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  return { estado: r.status, datos: await r.json().catch(() => ({})) }
}

/**
 * Pide al servidor que verifique el cobro contra la cadena y dice si TODO el
 * dinero quedó respaldado.
 *
 * Contra la cadena de verdad, un comprobante de prueba nunca se confirma —y
 * eso está bien: es la garantía que protege al administrador de pagar
 * lempiras contra dinero que no existe. Contra un nodo simulado
 * (RPC_8532_URL apuntando a un doble), sí se confirma y se puede ejercitar el
 * circuito entero del retiro.
 */
async function respaldadoEnCadena(tokenComercio, cobroId) {
  const r = await pedir(`/api/cobros/mios/${cobroId}/verificar`, { metodo: 'POST', token: tokenComercio })
  return r.estado === 200 && r.datos?.resumen?.todoDepositado === true
}

const correo = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@prueba.test`

async function nuevoUsuario(nombre) {
  const email = correo(nombre)
  const r = await pedir('/api/auth/signup', {
    metodo: 'POST',
    cuerpo: { email, password: 'Clave12345', fullName: nombre },
  })
  assert.equal(r.estado, 201, `alta de ${nombre}: ${JSON.stringify(r.datos)}`)
  return { token: r.datos.token, id: r.datos.user.id, email }
}

async function nuevoComercio(token, verificar = true) {
  const r = await pedir('/api/companies', {
    metodo: 'POST',
    token,
    cuerpo: {
      legalName: 'Comedor La Prueba S. de R.L.',
      tradeName: 'Comedor La Prueba',
      taxId: '08011999123456',
      categorySlug: 'restaurantes',
      productsServices: ['Almuerzos'],
      countrySlug: 'honduras',
      citySlug: 'tegucigalpa',
      address: 'Barrio de prueba',
      lat: 14.1,
      lng: -87.2,
      description: 'Un comedor para probar el cobro',
      socials: {},
      acceptsOrigen: true,
      walletAddress: '0xf777de573e67e78ececd2afe19dd18dd046fd4d0',
    },
  })
  assert.equal(r.estado, 201, `alta de comercio: ${JSON.stringify(r.datos)}`)
  const negocio = r.datos.company

  if (verificar) {
    // El estado se fuerza por la puerta del administrador, que es la única que
    // existe: no hay forma de auto-verificarse, y así debe seguir.
    const admin = await tokenAdmin()
    const rr = await pedir(`/api/admin/negocios/${negocio.id}/resolver`, {
      metodo: 'POST',
      token: admin,
      cuerpo: { decision: 'verificar' },
    })
    assert.equal(rr.estado, 200, `verificación: ${JSON.stringify(rr.datos)}`)
  }
  return negocio
}

let cacheAdmin = null
async function tokenAdmin() {
  if (cacheAdmin) return cacheAdmin
  const r = await pedir('/api/auth/login', {
    metodo: 'POST',
    cuerpo: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  })
  assert.equal(r.estado, 200, `login de admin: ${JSON.stringify(r.datos)}`)
  cacheAdmin = r.datos.token
  return cacheAdmin
}

// ─────────────────────────────────────────────────────────────────────────────

test('un comercio sin verificar no puede cobrar', async () => {
  const dueño = await nuevoUsuario('Dueño sin verificar')
  await nuevoComercio(dueño.token, false)
  const r = await pedir('/api/cobros', { metodo: 'POST', token: dueño.token, cuerpo: { montoHnl: 100 } })
  assert.equal(r.estado, 403)
  assert.match(r.datos.error, /verificado/i)
})

test('la cuenta dividida reparte sin perder ni un centavo', async () => {
  const dueño = await nuevoUsuario('Dueño reparto')
  await nuevoComercio(dueño.token)
  const r = await pedir('/api/cobros', {
    metodo: 'POST',
    token: dueño.token,
    cuerpo: { montoHnl: 100, concepto: 'Mesa 4', partes: 3 },
  })
  assert.equal(r.estado, 201, JSON.stringify(r.datos))
  const { cobro } = r.datos
  assert.equal(cobro.partes.length, 3)

  const suma = cobro.partes.reduce((s, p) => s + p.montoOrigen, 0)
  assert.equal(Math.round(suma * 1e6), Math.round(cobro.montoOrigen * 1e6), 'las partes no suman el total')
})

test('dos personas no pueden pagar la misma parte', async () => {
  const dueño = await nuevoUsuario('Dueño colisión')
  await nuevoComercio(dueño.token)
  const { datos } = await pedir('/api/cobros', {
    metodo: 'POST',
    token: dueño.token,
    cuerpo: { montoHnl: 200, partes: 2 },
  })
  const codigo = datos.cobro.codigo
  const parte = datos.cobro.partes[0].id

  const ana = await nuevoUsuario('Ana')
  const beto = await nuevoUsuario('Beto')

  const r1 = await pedir(`/api/cobros/codigo/${codigo}/reservar`, {
    metodo: 'POST', token: ana.token, cuerpo: { parteIds: [parte] },
  })
  assert.equal(r1.estado, 200)

  const r2 = await pedir(`/api/cobros/codigo/${codigo}/reservar`, {
    metodo: 'POST', token: beto.token, cuerpo: { parteIds: [parte] },
  })
  assert.equal(r2.estado, 409, 'Beto pudo reservar una parte que Ana ya tenía')
})

test('el mismo sello no cobra dos veces', async () => {
  const dueño = await nuevoUsuario('Dueño sello')
  await nuevoComercio(dueño.token)
  const { datos } = await pedir('/api/cobros', {
    metodo: 'POST', token: dueño.token, cuerpo: { montoHnl: 150, partes: 2 },
  })
  const codigo = datos.cobro.codigo
  const parte = datos.cobro.partes[0].id
  const cliente = await nuevoUsuario('Cliente sello')

  const pago = {
    metodo: 'POST',
    token: cliente.token,
    cuerpo: { parteIds: [parte], txHash: '0xabc', sello: 'sello-fijo-de-prueba' },
  }
  const p1 = await pedir(`/api/cobros/codigo/${codigo}/pagar`, pago)
  assert.equal(p1.estado, 200, JSON.stringify(p1.datos))
  assert.equal(p1.datos.repetido, false)

  const p2 = await pedir(`/api/cobros/codigo/${codigo}/pagar`, pago)
  assert.equal(p2.estado, 200, 'el reintento debería devolver el mismo resultado, no un error')
  assert.equal(p2.datos.repetido, true, 'el segundo intento cobró de nuevo')

  // Y el saldo del comercio solo subió una vez.
  const s = await pedir('/api/retiros/saldo', { token: dueño.token })
  const esperado = datos.cobro.partes[0].montoOrigen
  assert.equal(Math.round(s.datos.saldo.total * 1e6), Math.round(esperado * 1e6), 'el saldo se abonó dos veces')
})

test('el cobro se cierra solo cuando se pagan todas las partes', async () => {
  const dueño = await nuevoUsuario('Dueño cierre')
  await nuevoComercio(dueño.token)
  const { datos } = await pedir('/api/cobros', {
    metodo: 'POST', token: dueño.token, cuerpo: { montoHnl: 90, partes: 3 },
  })
  const codigo = datos.cobro.codigo
  const partes = datos.cobro.partes.map((p) => p.id)

  for (let i = 0; i < partes.length; i += 1) {
    const cliente = await nuevoUsuario(`Comensal ${i}`)
    const r = await pedir(`/api/cobros/codigo/${codigo}/pagar`, {
      metodo: 'POST',
      token: cliente.token,
      cuerpo: { parteIds: [partes[i]], txHash: `0x${i}`, sello: `sello-${codigo}-${i}` },
    })
    assert.equal(r.estado, 200, JSON.stringify(r.datos))
    const ultima = i === partes.length - 1
    assert.equal(r.datos.cerrado, ultima, `tras pagar ${i + 1} de ${partes.length} el cobro ${ultima ? 'debía' : 'no debía'} cerrarse`)
  }
})

test('no se puede retirar más de lo que hay', async () => {
  const dueño = await nuevoUsuario('Dueño retiro')
  await nuevoComercio(dueño.token)
  const r = await pedir('/api/retiros', {
    metodo: 'POST',
    token: dueño.token,
    cuerpo: {
      montoOrigen: 9999,
      banco: { banco: 'Banco Ficohsa', tipoCuenta: 'ahorro', numeroCuenta: '2000456756', titular: 'Prueba Prueba', identidad: '0801199912345' },
    },
  })
  assert.equal(r.estado, 400)
  assert.match(r.datos.error, /saldo/i)
})

test('el número de cuenta nunca vuelve completo al comercio', async () => {
  const dueño = await nuevoUsuario('Dueño cuenta')
  await nuevoComercio(dueño.token)
  const { datos } = await pedir('/api/cobros', {
    metodo: 'POST', token: dueño.token, cuerpo: { montoHnl: 5000, partes: 1 },
  })
  const cliente = await nuevoUsuario('Cliente pagador')
  await pedir(`/api/cobros/codigo/${datos.cobro.codigo}/pagar`, {
    metodo: 'POST',
    token: cliente.token,
    cuerpo: { parteIds: [datos.cobro.partes[0].id], txHash: '0xff', sello: `s-${datos.cobro.codigo}` },
  })

  const respaldado = await respaldadoEnCadena(dueño.token, datos.cobro.id)

  const r = await pedir('/api/retiros', {
    metodo: 'POST',
    token: dueño.token,
    cuerpo: {
      montoOrigen: 1,
      banco: { banco: 'Banco Ficohsa', tipoCuenta: 'ahorro', numeroCuenta: '2000456756', titular: 'Prueba Prueba', identidad: '0801199912345' },
    },
  })

  if (!respaldado) {
    // La otra mitad de la misma promesa: sin respaldo en la cadena ese dinero
    // NO se retira, por mucho que la app haya dado el pago por hecho.
    assert.equal(r.estado, 400, JSON.stringify(r.datos))
    assert.match(JSON.stringify(r.datos), /por confirmar/, 'debe explicar que falta el respaldo')
    return
  }

  assert.equal(r.estado, 201, JSON.stringify(r.datos))
  assert.ok(!JSON.stringify(r.datos).includes('2000456756'), 'el número de cuenta volvió completo')
  assert.match(r.datos.retiro.banco.numeroCuenta, /^····6756$/)
})

test('el panel de administración no existe para quien no es administrador', async () => {
  const cualquiera = await nuevoUsuario('Curioso')
  const r = await pedir('/api/admin/retiros', { token: cualquiera.token })
  assert.equal(r.estado, 404, 'un usuario normal pudo asomarse al panel')
})

test('el saldo se descuenta solo cuando el administrador confirma que pagó', async () => {
  const dueño = await nuevoUsuario('Dueño flujo')
  await nuevoComercio(dueño.token)
  const { datos } = await pedir('/api/cobros', {
    metodo: 'POST', token: dueño.token, cuerpo: { montoHnl: 8000, partes: 1 },
  })
  const cliente = await nuevoUsuario('Cliente flujo')
  await pedir(`/api/cobros/codigo/${datos.cobro.codigo}/pagar`, {
    metodo: 'POST',
    token: cliente.token,
    cuerpo: { parteIds: [datos.cobro.partes[0].id], txHash: '0xee', sello: `sf-${datos.cobro.codigo}` },
  })

  const respaldado = await respaldadoEnCadena(dueño.token, datos.cobro.id)

  const antes = await pedir('/api/retiros/saldo', { token: dueño.token })
  const total = antes.datos.saldo.total

  const cr = await pedir('/api/retiros', {
    metodo: 'POST',
    token: dueño.token,
    cuerpo: {
      montoOrigen: 1,
      banco: { banco: 'BAC Credomatic', tipoCuenta: 'cheques', numeroCuenta: '1122334455', titular: 'Prueba Prueba', identidad: '0801199912345' },
    },
  })

  if (!respaldado) {
    // Sin respaldo en la cadena no hay retiro que resolver: el saldo se ve,
    // pero no sale. Que esto sea 400 es la garantía, no un fallo.
    assert.equal(cr.estado, 400, JSON.stringify(cr.datos))
    assert.equal(antes.datos.saldo.disponible, 0, 'nada sin confirmar puede estar disponible')
    assert.ok(antes.datos.saldo.porConfirmar > 0, 'el dinero pagado tiene que verse como por confirmar')
    return
  }

  assert.equal(cr.estado, 201)

  const enEspera = await pedir('/api/retiros/saldo', { token: dueño.token })
  assert.equal(enEspera.datos.saldo.total, total, 'el total bajó antes de que el administrador pagara')
  assert.equal(enEspera.datos.saldo.retenido, 1, 'el monto pedido no quedó retenido')
  assert.equal(Math.round(enEspera.datos.saldo.disponible * 1e6), Math.round((total - 1) * 1e6))

  const admin = await tokenAdmin()
  const rr = await pedir(`/api/admin/retiros/${cr.datos.retiro.id}/estado`, {
    metodo: 'POST', token: admin, cuerpo: { estado: 'pagado' },
  })
  assert.equal(rr.estado, 200, JSON.stringify(rr.datos))

  const despues = await pedir('/api/retiros/saldo', { token: dueño.token })
  assert.equal(Math.round(despues.datos.saldo.total * 1e6), Math.round((total - 1) * 1e6), 'el saldo no se descontó al pagar')
  assert.equal(despues.datos.saldo.retenido, 0)
})

test('un rechazo sin motivo escrito no se acepta', async () => {
  const dueño = await nuevoUsuario('Dueño rechazo')
  await nuevoComercio(dueño.token)
  const admin = await tokenAdmin()
  const negocio = (await pedir('/api/companies/mine', { token: dueño.token })).datos.company
  const r = await pedir(`/api/admin/negocios/${negocio.id}/resolver`, {
    metodo: 'POST', token: admin, cuerpo: { decision: 'rechazar' },
  })
  assert.equal(r.estado, 400)
  assert.match(r.datos.error, /motivo/i)
})
