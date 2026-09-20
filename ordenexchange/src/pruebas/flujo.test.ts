// Prueba de extremo a extremo sobre el servidor de verdad, en modo demostración.
//
// Recorre lo que hace una persona: registrarse, verificarse, mirar el mercado,
// abrir una orden, chatear, marcar pagado, liberar, calificar. Y sobre todo lo
// que NO se puede hacer: liberar lo ajeno, cancelar lo pagado, tomar el propio
// anuncio, operar sin Genesis ID, mover más de lo que hay en custodia.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Server } from 'http'

const carpeta = mkdtempSync(join(tmpdir(), 'ordenexchange-prueba-'))
process.env.NODE_ENV = 'test'
process.env.ORDENEX_DATA_FILE = join(carpeta, 'datos.json')
process.env.ORDENEX_DEMO = '1'
process.env.ORDENEX_ORO_USD_ONZA = '4000'
process.env.ORDENEX_PLATA_USD_ONZA = '50'
process.env.ORDENEX_ADMIN_EMAIL = 'admin@prueba.local'
process.env.ORDENEX_ADMIN_PASSWORD = 'contrasena-admin-de-prueba'
process.env.ORDENEX_JWT_SECRETO = 'secreto-de-prueba'
process.env.ORDENEX_COMISION_PCT = '0.5'
delete process.env.GENESIS_API_KEY
delete process.env.ORDENEX_MONGO_URL
delete process.env.RENDER
delete process.env.VERCEL

const { default: app, arrancar } = await import('../index.js')
const { store } = await import('../store.js')
const { Dec } = await import('../lib/decimal.js')

let servidor: Server
let base: string

interface R { estado: number; datos: any }
async function pedir(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; token?: string } = {}): Promise<R> {
  const r = await fetch(base + ruta, {
    method: opciones.metodo || (opciones.cuerpo !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}) },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  })
  const texto = await r.text()
  let datos: any = null
  try { datos = texto ? JSON.parse(texto) : null } catch { datos = { crudo: texto } }
  return { estado: r.status, datos }
}

const demo = async (apodo: string): Promise<string> => {
  const r = await pedir('/api/auth/demo/entrar', { cuerpo: { apodo } })
  assert.equal(r.estado, 200, JSON.stringify(r.datos))
  return r.datos.token
}

const saldoDe = async (token: string, activo = 'ORIGEN') => {
  const r = await pedir('/api/billetera', { token })
  return r.datos.saldos.find((s: any) => s.activo === activo)
}

before(async () => {
  await arrancar()
  await new Promise<void>((ok) => { servidor = app.listen(0, () => ok()) })
  const puerto = (servidor.address() as any).port
  base = `http://127.0.0.1:${puerto}`
})

after(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()))
  rmSync(carpeta, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('lo público', () => {
  test('catálogo: países, activos, demo', async () => {
    const r = await pedir('/api/mercado/catalogo')
    assert.equal(r.estado, 200)
    assert.ok(r.datos.paises.length >= 20, `solo ${r.datos.paises.length} países`)
    assert.equal(r.datos.activos.length, 3)
    assert.equal(r.datos.demo, true)
    const hn = r.datos.paises.find((p: any) => p.iso2 === 'HN')
    assert.equal(hn.moneda.codigo, 'HNL')
    assert.ok(hn.metodos.some((m: any) => m.tipo === 'transferencia' && m.bancos.length >= 5))
    assert.ok(!r.datos.paises.some((p: any) => p.iso2 === 'CU'), 'Cuba no puede estar')
  })

  test('precios de referencia: ORIGEN = 1/55 g de oro', async () => {
    const r = await pedir('/api/mercado/precios?moneda=HNL')
    assert.equal(r.estado, 200)
    const usd = Number(r.datos.referencia.ORIGEN.usd)
    const esperado = 4000 / 31.1034768 / 55
    assert.ok(Math.abs(usd - esperado) < 0.0001, `${usd} vs ${esperado}`)
    assert.ok(Number(r.datos.referencia.ORIGEN.fiat) > usd, 'en lempiras vale más que en dólares')
    assert.equal(Number(r.datos.referencia.AUKA.usd), 4000)
    assert.equal(Number(r.datos.referencia.AGKA.usd), 50)
  })

  test('el mercado enseña anuncios de venta cuando quiero comprar', async () => {
    const r = await pedir('/api/mercado/anuncios?quiero=comprar&activo=ORIGEN&moneda=HNL')
    assert.equal(r.estado, 200)
    assert.ok(r.datos.anuncios.length >= 1)
    for (const a of r.datos.anuncios) {
      assert.equal(a.lado, 'venta')
      assert.equal(a.moneda, 'HNL')
      assert.ok(Number(a.precio) > 0)
      assert.equal(a.cumpleRequisitos, null, 'sin sesión no se evalúan requisitos')
      assert.ok(!('id' in a.metodos[0]), 'los ids de los métodos del anunciante no salen al público')
    }
    const barato = r.datos.anuncios[0]
    assert.ok(r.datos.anuncios.every((a: any) => Dec.mayorIgual(a.precio, barato.precio)), 'ordenados por precio')
  })

  test('filtro por monto y por método', async () => {
    const r = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=HNL&monto=1000000000')
    assert.equal(r.datos.anuncios.length, 0)
    const r2 = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=HNL&metodo=tigo-money')
    assert.ok(r2.datos.anuncios.every((a: any) => a.metodos.some((m: any) => m.tipo === 'tigo-money')))
  })

  test('sin sesión, lo privado da 401 con código', async () => {
    for (const ruta of ['/api/auth/yo', '/api/billetera', '/api/ordenes', '/api/anuncios', '/api/metodos-pago', '/api/agentes/estado']) {
      const r = await pedir(ruta)
      assert.equal(r.estado, 401, ruta)
      assert.equal(r.datos.codigo, 'sin-sesion')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('cuenta y verificación', () => {
  let token = ''
  let codigoCorreo = ''

  test('registro exige datos válidos', async () => {
    assert.equal((await pedir('/api/auth/registro', { cuerpo: { email: 'x', contrasena: '12345678', apodo: 'Ana_1', pais: 'HN' } })).estado, 400)
    assert.equal((await pedir('/api/auth/registro', { cuerpo: { email: 'ana@prueba.local', contrasena: '123', apodo: 'Ana_1', pais: 'HN' } })).estado, 400)
    assert.equal((await pedir('/api/auth/registro', { cuerpo: { email: 'ana@prueba.local', contrasena: '12345678', apodo: 'a', pais: 'HN' } })).estado, 400)
    const cuba = await pedir('/api/auth/registro', { cuerpo: { email: 'ana@prueba.local', contrasena: '12345678', apodo: 'Ana_1', pais: 'CU' } })
    assert.equal(cuba.estado, 400)
    assert.equal(cuba.datos.codigo, 'pais-no-permitido')
  })

  test('registro, entrada y perfil', async () => {
    const r = await pedir('/api/auth/registro', { cuerpo: { email: 'Ana@Prueba.local', contrasena: '12345678', apodo: 'Ana_1', pais: 'HN' } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    token = r.datos.token
    assert.equal(r.datos.usuario.email, 'ana@prueba.local')
    assert.equal(r.datos.usuario.moneda, 'HNL')
    assert.equal(r.datos.usuario.puedeOperar, false)
    assert.equal(r.datos.usuario.gidEstado, 'sin-verificar')
    assert.equal(r.datos.usuario.emailVerificado, false)
    assert.equal(r.datos.verificacionPendiente, true)
    assert.match(r.datos.codigoDemo, /^\d{6}$/, 'sin proveedor de correo y fuera de producción, el código vuelve')
    codigoCorreo = r.datos.codigoDemo

    const dup = await pedir('/api/auth/registro', { cuerpo: { email: 'ana@prueba.local', contrasena: '12345678', apodo: 'Otra', pais: 'HN' } })
    assert.equal(dup.estado, 409)
    const dupApodo = await pedir('/api/auth/registro', { cuerpo: { email: 'otra@prueba.local', contrasena: '12345678', apodo: 'ana_1', pais: 'HN' } })
    assert.equal(dupApodo.estado, 409)

    assert.equal((await pedir('/api/auth/entrar', { cuerpo: { email: 'ana@prueba.local', contrasena: 'mala' } })).estado, 403)
    const ok = await pedir('/api/auth/entrar', { cuerpo: { email: 'ana@prueba.local', contrasena: '12345678' } })
    assert.equal(ok.estado, 200)
    const yo = await pedir('/api/auth/yo', { token })
    assert.equal(yo.datos.usuario.apodo, 'Ana_1')
    assert.equal(yo.datos.saldos.length, 3)
  })

  test('sin Genesis ID verificado no se opera; sin correo confirmado no se toca Genesis', async () => {
    const r = await pedir('/api/anuncios', { token, cuerpo: { lado: 'venta', activo: 'ORIGEN', tipoPrecio: 'flotante', margen: 101, cantidadTotal: '10', limiteMin: '500', limiteMax: '1000', metodosPagoIds: [], ventanaPagoMin: 15 } })
    assert.equal(r.estado, 403)
    assert.equal(r.datos.codigo, 'no-verificado')
    const sinCorreo = await pedir('/api/genesis/estado', { token })
    assert.equal(sinCorreo.estado, 403)
    assert.equal(sinCorreo.datos.codigo, 'correo-no-verificado')

    const mal = await pedir('/api/auth/verificar-correo', { token, cuerpo: { codigo: '000000' } })
    assert.equal(mal.estado, 400)
    assert.equal(mal.datos.codigo, 'codigo')
    const ok = await pedir('/api/auth/verificar-correo', { token, cuerpo: { codigo: codigoCorreo } })
    assert.equal(ok.estado, 200, JSON.stringify(ok.datos))
    assert.equal(ok.datos.usuario.emailVerificado, true)
    assert.equal((await pedir('/api/auth/reenviar-codigo', { token, cuerpo: {} })).estado, 409)

    const g = await pedir('/api/genesis/estado', { token })
    assert.equal(g.estado, 503)
    assert.equal(g.datos.codigo, 'genesis-no-configurado')
  })

  test('en demo se puede verificar, y entonces sí', async () => {
    const r = await pedir('/api/genesis/demo/verificar', { token, cuerpo: {} })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.usuario.gidEstado, 'verificada')
    assert.match(r.datos.usuario.gid, /^GEN-[2-9A-Z]{4}-[2-9A-Z]{4}-D$/)
    assert.equal(r.datos.usuario.puedeOperar, true)
  })

  test('perfil: dirección de la cadena y cambio de contraseña', async () => {
    const mala = await pedir('/api/auth/yo', { token, metodo: 'PATCH', cuerpo: { direccionCadena: '0x123' } })
    assert.equal(mala.estado, 400)
    const ok = await pedir('/api/auth/yo', { token, metodo: 'PATCH', cuerpo: { direccionCadena: '0x' + 'ab'.repeat(20), telefono: '+504 9999 0000', idioma: 'en' } })
    assert.equal(ok.estado, 200)
    assert.equal(ok.datos.usuario.idioma, 'en')
    assert.equal((await pedir('/api/auth/contrasena', { token, cuerpo: { actual: 'mala', nueva: 'nueva-contrasena' } })).estado, 403)
    const cambio = await pedir('/api/auth/contrasena', { token, cuerpo: { actual: '12345678', nueva: 'nueva-contrasena' } })
    assert.equal(cambio.estado, 200)
    await new Promise((ok) => setTimeout(ok, 1100))
    assert.equal((await pedir('/api/auth/yo', { token })).estado, 401, 'el token viejo ya no vale')
    assert.equal((await pedir('/api/auth/yo', { token: cambio.datos.token })).estado, 200, 'el nuevo sí')
    token = cambio.datos.token
    const entrada = await pedir('/api/auth/entrar', { cuerpo: { email: 'ana@prueba.local', contrasena: 'nueva-contrasena' } })
    assert.equal(entrada.estado, 200)
    assert.equal((await pedir('/api/auth/salir', { token: entrada.datos.token, cuerpo: {} })).estado, 204)
    await new Promise((ok) => setTimeout(ok, 1100))
    assert.equal((await pedir('/api/auth/yo', { token: entrada.datos.token })).estado, 401, 'salir revoca la sesión')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('comprar: el flujo entero con custodia', () => {
  let comprador = '', vendedor = ''
  let anuncio: any
  let orden: any
  let disponibleVendedorAntes = '', congeladoVendedorAntes = ''

  before(async () => {
    comprador = await demo('Comprador1')
    vendedor = await demo('OroTegus')
    const m = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=HNL', { token: comprador })
    anuncio = m.datos.anuncios.find((a: any) => a.anunciante.apodo === 'OroTegus')
    assert.ok(anuncio, 'el anuncio de OroTegus tiene que estar')
    assert.equal(anuncio.cumpleRequisitos, true)
    const s = await saldoDe(vendedor)
    disponibleVendedorAntes = s.disponible
    congeladoVendedorAntes = s.congelado
  })

  test('el anunciante no ve su propio anuncio en el mercado', async () => {
    const m = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=HNL', { token: vendedor })
    assert.ok(!m.datos.anuncios.some((a: any) => a.anunciante.apodo === 'OroTegus'))
  })

  test('límites del anuncio', async () => {
    const bajo = await pedir('/api/ordenes', { token: comprador, cuerpo: { anuncioId: anuncio.id, montoFiat: '1' } })
    assert.equal(bajo.estado, 400)
    assert.equal(bajo.datos.codigo, 'fuera-de-limites')
    const propio = await pedir('/api/ordenes', { token: vendedor, cuerpo: { anuncioId: anuncio.id, montoFiat: '1000' } })
    assert.equal(propio.estado, 409)
    assert.equal(propio.datos.codigo, 'anuncio-propio')
    const sinMonto = await pedir('/api/ordenes', { token: comprador, cuerpo: { anuncioId: anuncio.id } })
    assert.equal(sinMonto.estado, 400)
  })

  test('abrir la orden congela el activo del vendedor', async () => {
    const metodo = anuncio.metodos.find((m: any) => m.tipo === 'transferencia')
    assert.ok(metodo)
    // Hace falta el id del método del anunciante: el frontend lo pide del
    // detalle del anuncio con sesión… pero al público no salen los ids. Se
    // manda el tipo y el servidor resuelve cuando hay uno solo de ese tipo.
    const r = await pedir('/api/ordenes', { token: comprador, cuerpo: { anuncioId: anuncio.id, montoFiat: '1000', metodoTipo: 'transferencia' } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    orden = r.datos.orden
    assert.equal(orden.estado, 'pendiente-pago')
    assert.equal(orden.miRol, 'comprador')
    assert.equal(orden.montoFiat, '1000')
    assert.equal(orden.moneda, 'HNL')
    assert.equal(orden.precio, anuncio.precio)
    assert.ok(Dec.esPositivo(orden.cantidadActivo))
    assert.ok(Dec.menorIgual(Dec.multiplicar(orden.cantidadActivo, orden.precio), '1000'), 'la cantidad se trunca, nunca se redondea arriba')
    assert.equal(orden.enCustodia, true)
    assert.ok(orden.segundosRestantes > 0 && orden.segundosRestantes <= 15 * 60)
    assert.equal(orden.metodoPago.tipo, 'transferencia')
    assert.ok(orden.metodoPago.campos.cuenta, 'el comprador ve dónde pagar')
    assert.ok(orden.acciones.pagar && orden.acciones.cancelar && !orden.acciones.liberar)
    assert.ok(orden.mensajes.some((m: any) => m.de === 'sistema'))
    assert.ok(orden.mensajes.some((m: any) => m.de !== 'sistema'), 'la respuesta automática del anunciante')

    const s = await saldoDe(vendedor)
    assert.equal(s.disponible, Dec.restar(disponibleVendedorAntes, orden.cantidadActivo))
    assert.equal(s.congelado, Dec.sumar(congeladoVendedorAntes, orden.cantidadActivo))

    const mercado = await pedir('/api/mercado/anuncios/' + anuncio.id)
    assert.equal(mercado.datos.anuncio.cantidadDisponible, Dec.restar(anuncio.cantidadDisponible, orden.cantidadActivo))
  })

  test('un tercero no ve la orden', async () => {
    const tercero = await demo('YapePeru')
    assert.equal((await pedir('/api/ordenes/' + orden.id, { token: tercero })).estado, 404)
    assert.equal((await pedir(`/api/ordenes/${orden.id}/pagado`, { token: tercero, cuerpo: {} })).estado, 404)
  })

  test('chat en ambos sentidos con no leídos', async () => {
    const m1 = await pedir(`/api/ordenes/${orden.id}/mensajes`, { token: comprador, cuerpo: { texto: 'Hola, ya transfiero' } })
    assert.equal(m1.estado, 201)
    const vacio = await pedir(`/api/ordenes/${orden.id}/mensajes`, { token: comprador, cuerpo: {} })
    assert.equal(vacio.estado, 400)
    const lista = await pedir('/api/ordenes?estado=abiertas', { token: vendedor })
    const mia = lista.datos.ordenes.find((o: any) => o.id === orden.id)
    assert.equal(mia.miRol, 'vendedor')
    assert.ok(mia.noLeidos >= 1)
    assert.equal(lista.datos.abiertas, 1)
    const desde = await pedir(`/api/ordenes/${orden.id}/mensajes?desde=${orden.mensajes[orden.mensajes.length - 1].id}`, { token: vendedor })
    assert.equal(desde.datos.mensajes.length, 1)
    assert.equal(desde.datos.mensajes[0].texto, 'Hola, ya transfiero')
    const img = await pedir(`/api/ordenes/${orden.id}/mensajes`, { token: comprador, cuerpo: { imagen: 'data:image/png;base64,iVBORw0KGgo=' } })
    assert.equal(img.estado, 201)
    const noImg = await pedir(`/api/ordenes/${orden.id}/mensajes`, { token: comprador, cuerpo: { imagen: 'data:text/html;base64,PGh0bWw+' } })
    assert.equal(noImg.estado, 400)
  })

  test('el vendedor no marca pagado ni cancela; el comprador marca pagado', async () => {
    assert.equal((await pedir(`/api/ordenes/${orden.id}/pagado`, { token: vendedor, cuerpo: {} })).estado, 403)
    assert.equal((await pedir(`/api/ordenes/${orden.id}/cancelar`, { token: vendedor, cuerpo: {} })).estado, 403)
    const r = await pedir(`/api/ordenes/${orden.id}/pagado`, { token: comprador, cuerpo: { referencia: 'REF-123' } })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.orden.estado, 'pagado')
    assert.equal(r.datos.orden.referenciaPago, 'REF-123')
    assert.equal(r.datos.orden.segundosRestantes, null)
    const otraVez = await pedir(`/api/ordenes/${orden.id}/pagado`, { token: comprador, cuerpo: {} })
    assert.equal(otraVez.estado, 409)
    const cancelar = await pedir(`/api/ordenes/${orden.id}/cancelar`, { token: comprador, cuerpo: {} })
    assert.equal(cancelar.estado, 409, 'pagada no se cancela')
    assert.equal(cancelar.datos.codigo, 'estado-invalido')
  })

  test('liberar exige la contraseña del vendedor y solo el vendedor', async () => {
    assert.equal((await pedir(`/api/ordenes/${orden.id}/liberar`, { token: comprador, cuerpo: { contrasena: 'demo1234' } })).estado, 403)
    const mala = await pedir(`/api/ordenes/${orden.id}/liberar`, { token: vendedor, cuerpo: { contrasena: 'incorrecta' } })
    assert.equal(mala.estado, 403)
    assert.equal(mala.datos.codigo, 'contrasena')
    const antesComprador = await saldoDe(comprador)
    const r = await pedir(`/api/ordenes/${orden.id}/liberar`, { token: vendedor, cuerpo: { contrasena: 'demo1234' } })
    assert.equal(r.estado, 200, JSON.stringify(r.datos))
    assert.equal(r.datos.orden.estado, 'completada')
    assert.equal(r.datos.orden.enCustodia, false)
    const comision = r.datos.orden.comision
    assert.equal(comision, Dec.truncar(Dec.multiplicar(orden.cantidadActivo, '0.005'), 8))

    // El comprador recibe exactamente lo que compró; la comisión la paga el vendedor.
    const despuesComprador = await saldoDe(comprador)
    assert.equal(despuesComprador.disponible, Dec.sumar(antesComprador.disponible, orden.cantidadActivo))
    const sVendedor = await saldoDe(vendedor)
    assert.equal(sVendedor.disponible, Dec.restar(Dec.restar(disponibleVendedorAntes, orden.cantidadActivo), comision))
    assert.equal(sVendedor.congelado, congeladoVendedorAntes)

    const tes = store.todo().saldos.find((s) => s.usuarioId === 'tesoreria' && s.activo === 'ORIGEN')
    assert.ok(tes && Dec.mayorIgual(tes.disponible, comision))
  })

  test('después de completar, el comprador ya no ve los datos bancarios; el vendedor sí', async () => {
    const c = await pedir('/api/ordenes/' + orden.id, { token: comprador })
    assert.deepEqual(c.datos.orden.metodoPago.campos, {})
    const v = await pedir('/api/ordenes/' + orden.id, { token: vendedor })
    assert.ok(v.datos.orden.metodoPago.campos.cuenta)
  })

  test('calificar una sola vez por parte, y la reputación se mueve', async () => {
    const r = await pedir(`/api/ordenes/${orden.id}/calificar`, { token: comprador, cuerpo: { tipo: 'positiva', comentario: 'Rápido' } })
    assert.equal(r.estado, 200)
    assert.equal((await pedir(`/api/ordenes/${orden.id}/calificar`, { token: comprador, cuerpo: { tipo: 'positiva' } })).estado, 409)
    assert.equal((await pedir(`/api/ordenes/${orden.id}/calificar`, { token: vendedor, cuerpo: { tipo: 'negativa' } })).estado, 200)
    const yo = await pedir('/api/auth/yo', { token: comprador })
    assert.equal(yo.datos.usuario.reputacion.ordenesCompletadas, 1)
    assert.equal(yo.datos.usuario.reputacion.negativas, 1)
    assert.equal(yo.datos.usuario.reputacion.tasaFinalizacion30d, 100)
    const perfil = await pedir('/api/usuarios/' + yo.datos.usuario.id + '/perfil')
    assert.equal(perfil.datos.usuario.reputacion.positivas, 0)
    assert.equal(perfil.datos.usuario.agente, false)
    const vendedorYo = await pedir('/api/auth/yo', { token: vendedor })
    assert.equal(vendedorYo.datos.usuario.reputacion.positivas, 1)
    assert.ok(vendedorYo.datos.usuario.reputacion.tiempoPromedioLiberacionSeg != null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('vender: tomar un anuncio de compra', () => {
  let tomador = '', anunciante = ''
  let orden: any

  test('el tomador vende y su activo va a custodia', async () => {
    tomador = await demo('YapePeru')
    anunciante = await demo('SpeiMX')
    // YapePeru es de Perú: para vender en MXN necesita un método en México.
    const mp = await pedir('/api/metodos-pago', { token: tomador, cuerpo: { pais: 'MX', tipo: 'transferencia', banco: 'BBVA México', titular: 'Yape Perú Demo', campos: { clabe: '012180009876543210', cuenta: '9876543210' } } })
    assert.equal(mp.estado, 201, JSON.stringify(mp.datos))
    const m = await pedir('/api/mercado/anuncios?quiero=vender&moneda=MXN', { token: tomador })
    const a = m.datos.anuncios.find((x: any) => x.anunciante.apodo === 'SpeiMX')
    assert.ok(a && a.lado === 'compra')
    const sinMetodo = await pedir('/api/ordenes', { token: tomador, cuerpo: { anuncioId: a.id, cantidadActivo: '25' } })
    assert.equal(sinMetodo.estado, 400)
    const antes = await saldoDe(tomador)
    const r = await pedir('/api/ordenes', { token: tomador, cuerpo: { anuncioId: a.id, cantidadActivo: '25', metodoId: mp.datos.metodo.id } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    orden = r.datos.orden
    assert.equal(orden.miRol, 'vendedor')
    assert.equal(orden.cantidadActivo, '25')
    assert.equal(orden.montoFiat, Dec.redondear(Dec.multiplicar('25', a.precio), 2))
    assert.equal(orden.metodoPago.titular, 'Yape Perú Demo')
    const despues = await saldoDe(tomador)
    assert.equal(despues.congelado, Dec.sumar(antes.congelado, '25'))
  })

  test('el anunciante (comprador) paga y el tomador libera', async () => {
    const p = await pedir(`/api/ordenes/${orden.id}/pagado`, { token: anunciante, cuerpo: {} })
    assert.equal(p.estado, 200)
    const antes = await saldoDe(anunciante)
    const l = await pedir(`/api/ordenes/${orden.id}/liberar`, { token: tomador, cuerpo: { contrasena: 'demo1234' } })
    assert.equal(l.estado, 200)
    assert.equal(l.datos.orden.estado, 'completada')
    const despues = await saldoDe(anunciante)
    assert.equal(despues.disponible, Dec.sumar(antes.disponible, '25'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('cancelar y vencer', () => {
  test('el comprador cancela antes de pagar y la custodia vuelve', async () => {
    const comprador = await demo('NequiCol')
    const vendedor = await demo('CambioChapin')
    const m = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=GTQ', { token: comprador })
    const a = m.datos.anuncios.find((x: any) => x.anunciante.apodo === 'CambioChapin')
    const antes = await saldoDe(vendedor)
    const r = await pedir('/api/ordenes', { token: comprador, cuerpo: { anuncioId: a.id, montoFiat: '500' } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    const durante = await saldoDe(vendedor)
    assert.equal(durante.congelado, Dec.sumar(antes.congelado, r.datos.orden.cantidadActivo))
    const c = await pedir(`/api/ordenes/${r.datos.orden.id}/cancelar`, { token: comprador, cuerpo: { motivo: 'me arrepentí' } })
    assert.equal(c.estado, 200)
    assert.equal(c.datos.orden.estado, 'cancelada')
    assert.equal(c.datos.orden.canceladaPor, 'comprador')
    const despues = await saldoDe(vendedor)
    assert.equal(despues.disponible, antes.disponible)
    assert.equal(despues.congelado, antes.congelado)
    const anuncio = await pedir('/api/mercado/anuncios/' + a.id)
    assert.equal(anuncio.datos.anuncio.cantidadDisponible, a.cantidadDisponible)
    const yo = await pedir('/api/auth/yo', { token: comprador })
    assert.ok(yo.datos.usuario.reputacion.tasaFinalizacion30d < 100, 'cancelar cuenta en contra')
  })

  test('si vence la ventana, se cancela sola y devuelve la custodia', async () => {
    const comprador = await demo('SinpeCR')
    const vendedor = await demo('PixBrasil')
    const m = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=BRL', { token: comprador })
    const a = m.datos.anuncios.find((x: any) => x.anunciante.apodo === 'PixBrasil' && x.activo === 'ORIGEN')
    const antes = await saldoDe(vendedor)
    const r = await pedir('/api/ordenes', { token: comprador, cuerpo: { anuncioId: a.id, montoFiat: '200' } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    const o = store.todo().ordenes.find((x) => x.id === r.datos.orden.id)!
    o.venceEn = new Date(Date.now() - 1000).toISOString()
    const p = await pedir(`/api/ordenes/${o.id}/pagado`, { token: comprador, cuerpo: {} })
    assert.equal(p.estado, 409)
    const v = await pedir('/api/ordenes/' + o.id, { token: comprador })
    assert.equal(v.datos.orden.estado, 'cancelada')
    assert.equal(v.datos.orden.canceladaPor, 'sistema')
    const despues = await saldoDe(vendedor)
    assert.equal(despues.congelado, antes.congelado)
    assert.equal(despues.disponible, antes.disponible)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('apelaciones y panel', () => {
  let admin = ''
  let comprador = '', vendedor = ''

  before(async () => {
    const r = await pedir('/api/panel/sesion/entrar', { cuerpo: { email: 'admin@prueba.local', contrasena: 'contrasena-admin-de-prueba' } })
    assert.equal(r.estado, 200, JSON.stringify(r.datos))
    admin = r.datos.token
    comprador = await demo('MercadoAR')
    vendedor = await demo('PagoMovilVE')
  })

  async function ordenPagada(veces: string) {
    const m = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=VES', { token: comprador })
    const a = m.datos.anuncios.find((x: any) => x.anunciante.apodo === 'PagoMovilVE' && x.activo === 'ORIGEN')
    assert.ok(a, `no está el anuncio de PagoMovilVE: ${JSON.stringify(m.datos).slice(0, 600)}`)
    const monto = Dec.multiplicar(a.limiteMin, veces)
    const r = await pedir('/api/ordenes', { token: comprador, cuerpo: { anuncioId: a.id, montoFiat: monto } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    assert.equal((await pedir(`/api/ordenes/${r.datos.orden.id}/pagado`, { token: comprador, cuerpo: {} })).estado, 200)
    return r.datos.orden
  }

  test('el panel exige sesión y credenciales', async () => {
    assert.equal((await pedir('/api/panel/resumen')).estado, 401)
    assert.equal((await pedir('/api/panel/sesion/entrar', { cuerpo: { email: 'admin@prueba.local', contrasena: 'mala' } })).estado, 403)
    const yo = await pedir('/api/panel/sesion/yo', { token: admin })
    assert.equal(yo.datos.operador.rol, 'admin')
    const r = await pedir('/api/panel/resumen', { token: admin })
    assert.equal(r.estado, 200)
    assert.ok(r.datos.usuarios.total >= 10)
    assert.ok(Dec.esPositivo(r.datos.custodia.ORIGEN), 'las garantías de los agentes están en custodia')
  })

  test('apelación resuelta a favor del vendedor: devolver', async () => {
    const o = await ordenPagada('2')
    const antes = await saldoDe(vendedor)
    const mal = await pedir(`/api/ordenes/${o.id}/apelar`, { token: vendedor, cuerpo: { motivo: 'inventado', detalle: 'no llegó nada de nada' } })
    assert.equal(mal.estado, 400)
    const ap = await pedir(`/api/ordenes/${o.id}/apelar`, { token: vendedor, cuerpo: { motivo: 'no-recibi-pago', detalle: 'No llegó ningún pago móvil a mi cuenta' } })
    assert.equal(ap.estado, 200, JSON.stringify(ap.datos))
    assert.equal(ap.datos.orden.estado, 'apelacion')
    assert.equal((await pedir(`/api/ordenes/${o.id}/liberar`, { token: vendedor, cuerpo: { contrasena: 'incorrecta' } })).estado, 403, 'liberar en apelación sigue exigiendo la contraseña')
    assert.equal((await pedir(`/api/ordenes/${o.id}/cancelar`, { token: comprador, cuerpo: {} })).estado, 409)
    assert.equal((await pedir(`/api/ordenes/${o.id}/apelacion/retirar`, { token: comprador, cuerpo: {} })).estado, 403)

    const cola = await pedir('/api/panel/apelaciones', { token: admin })
    assert.ok(cola.datos.ordenes.some((x: any) => x.id === o.id))
    const det = await pedir('/api/panel/ordenes/' + o.id, { token: admin })
    assert.equal(det.datos.orden.apelacion.motivo, 'no-recibi-pago')
    assert.ok(det.datos.orden.mensajes.length >= 2)
    const msg = await pedir(`/api/panel/ordenes/${o.id}/mensajes`, { token: admin, cuerpo: { texto: 'Operador: revisando comprobantes' } })
    assert.equal(msg.estado, 201)

    const sinNota = await pedir(`/api/panel/ordenes/${o.id}/resolver`, { token: admin, cuerpo: { resolucion: 'devolver', nota: '' } })
    assert.equal(sinNota.estado, 400)
    const r = await pedir(`/api/panel/ordenes/${o.id}/resolver`, { token: admin, cuerpo: { resolucion: 'devolver', nota: 'El comprador no aportó comprobante' } })
    assert.equal(r.estado, 200, JSON.stringify(r.datos))
    assert.equal(r.datos.orden.estado, 'cancelada')
    assert.equal(r.datos.orden.canceladaPor, 'operador')
    const despues = await saldoDe(vendedor)
    assert.equal(despues.disponible, Dec.sumar(antes.disponible, o.cantidadActivo))
    const yo = await pedir('/api/auth/yo', { token: comprador })
    assert.equal(yo.datos.usuario.reputacion.apelacionesPerdidas, 1)
    const c = await pedir('/api/ordenes/' + o.id, { token: comprador })
    assert.ok(c.datos.orden.mensajes.some((m: any) => String(m.de).startsWith('operador:')))
  })

  test('apelación resuelta a favor del comprador: liberar', async () => {
    const o = await ordenPagada('3')
    const antes = await saldoDe(comprador)
    const ap = await pedir(`/api/ordenes/${o.id}/apelar`, { token: comprador, cuerpo: { motivo: 'no-liberan', detalle: 'Pagué hace una hora y no liberan' } })
    assert.equal(ap.estado, 200)
    const retiro = await pedir(`/api/ordenes/${o.id}/apelacion/retirar`, { token: comprador, cuerpo: {} })
    assert.equal(retiro.estado, 200)
    assert.equal(retiro.datos.orden.estado, 'pagado')
    const otraVez = await pedir(`/api/ordenes/${o.id}/apelar`, { token: comprador, cuerpo: { motivo: 'no-liberan', detalle: 'Sigue sin liberar, adjunto comprobante' } })
    assert.equal(otraVez.estado, 409, 'una apelación por parte y orden')
    const ap2 = await pedir(`/api/ordenes/${o.id}/apelar`, { token: vendedor, cuerpo: { motivo: 'monto-incorrecto', detalle: 'Llegó menos dinero del pactado' } })
    assert.equal(ap2.estado, 200, JSON.stringify(ap2.datos))
    const r = await pedir(`/api/panel/ordenes/${o.id}/resolver`, { token: admin, cuerpo: { resolucion: 'liberar', nota: 'Comprobante válido del banco' } })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.orden.estado, 'completada')
    const despues = await saldoDe(comprador)
    assert.equal(despues.disponible, Dec.sumar(antes.disponible, o.cantidadActivo))
  })

  test('un auditor lee pero no resuelve', async () => {
    const nuevo = await pedir('/api/panel/operadores', { token: admin, cuerpo: { email: 'auditor@prueba.local', nombre: 'Auditora', rol: 'auditor' } })
    assert.equal(nuevo.estado, 201)
    const s = await pedir('/api/panel/sesion/entrar', { cuerpo: { email: 'auditor@prueba.local', contrasena: nuevo.datos.contrasenaTemporal } })
    assert.equal(s.estado, 200)
    assert.equal(s.datos.operador.debeCambiarContrasena, true)
    assert.equal((await pedir('/api/panel/resumen', { token: s.datos.token })).estado, 200)
    const o = await ordenPagada('1.5')
    await pedir(`/api/ordenes/${o.id}/apelar`, { token: comprador, cuerpo: { motivo: 'otro', detalle: 'Prueba de permisos del auditor' } })
    const r = await pedir(`/api/panel/ordenes/${o.id}/resolver`, { token: s.datos.token, cuerpo: { resolucion: 'liberar', nota: 'no debería poder' } })
    assert.equal(r.estado, 403)
    assert.equal((await pedir('/api/panel/operadores', { token: s.datos.token, cuerpo: { email: 'x@y.z', nombre: 'X', rol: 'admin' } })).estado, 403)
    await pedir(`/api/panel/ordenes/${o.id}/resolver`, { token: admin, cuerpo: { resolucion: 'liberar', nota: 'limpieza de la prueba' } })
  })

  test('congelar una cuenta pausa sus anuncios y le impide operar', async () => {
    const yo = await pedir('/api/auth/yo', { token: vendedor })
    const r = await pedir(`/api/panel/usuarios/${yo.datos.usuario.id}/congelar`, { token: admin, cuerpo: { congelado: true, motivo: 'Revisión de cumplimiento' } })
    assert.equal(r.estado, 200)
    const mercado = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=VES')
    assert.ok(!mercado.datos.anuncios.some((a: any) => a.anunciante.apodo === 'PagoMovilVE'))
    await new Promise((ok) => setTimeout(ok, 1100))
    assert.equal((await pedir('/api/auth/yo', { token: vendedor })).estado, 401, 'bloquear cierra las sesiones')
    vendedor = await demo('PagoMovilVE')
    const mis = await pedir('/api/anuncios', { token: vendedor })
    assert.ok(mis.datos.anuncios.every((a: any) => a.estado !== 'activo'))
    const yo2 = await pedir('/api/auth/yo', { token: vendedor })
    assert.equal(yo2.datos.usuario.puedeOperar, false)
    assert.equal((await pedir('/api/agentes/renunciar', { token: vendedor, cuerpo: {} })).datos.codigo, 'congelado', 'bloqueado no mueve la garantía')
    await pedir(`/api/panel/usuarios/${yo.datos.usuario.id}/congelar`, { token: admin, cuerpo: { congelado: false, motivo: 'listo' } })
    const yo3 = await pedir('/api/auth/yo', { token: vendedor })
    assert.equal(yo3.datos.usuario.puedeOperar, true)
  })

  test('precios: solo un administrador, y con valores sensatos', async () => {
    const sop = await pedir('/api/panel/operadores', { token: admin, cuerpo: { email: 'soporte@prueba.local', nombre: 'Soporte', rol: 'soporte' } })
    const sesionSoporte = await pedir('/api/panel/sesion/entrar', { cuerpo: { email: 'soporte@prueba.local', contrasena: sop.datos.contrasenaTemporal } })
    assert.equal((await pedir('/api/panel/precios', { token: sesionSoporte.datos.token, metodo: 'PUT', cuerpo: { oroUsdOnza: 4001 } })).estado, 403)
    assert.equal((await pedir('/api/panel/precios', { token: admin, metodo: 'PUT', cuerpo: { oroUsdOnza: -5 } })).estado, 400)
    const r = await pedir('/api/panel/precios', { token: admin, metodo: 'PUT', cuerpo: { oroUsdOnza: 4100, fx: { HNL: 26.5 } } })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.precios.oroUsdOnza, 4100)
    assert.equal(r.datos.precios.fx.HNL, 26.5)
    assert.equal(r.datos.precios.fuente, 'manual')
    const p = await pedir('/api/mercado/precios?moneda=HNL')
    assert.equal(p.datos.fx, 26.5)
  })

  test('la bitácora está íntegra', async () => {
    const r = await pedir('/api/panel/bitacora?q=orden', { token: admin })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.integra, true)
    assert.ok(r.datos.total >= 8)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('anuncios propios, billetera y agentes', () => {
  let token = ''
  let metodo: any

  before(async () => {
    const r = await pedir('/api/auth/registro', { cuerpo: { email: 'juan@prueba.local', contrasena: '12345678', apodo: 'JuanHN', pais: 'HN' } })
    token = r.datos.token
    await pedir('/api/genesis/demo/verificar', { token, cuerpo: { nombre: 'Juan Pérez López' } })
    const mp = await pedir('/api/metodos-pago', { token, cuerpo: { tipo: 'transferencia', banco: 'Banco Atlántida', titular: 'Juan Pérez', campos: { cuenta: '0011223344', tipoCuenta: 'Ahorro' } } })
    assert.equal(mp.estado, 201, JSON.stringify(mp.datos))
    metodo = mp.datos.metodo
  })

  test('el nombre abreviado sale del nombre legal', async () => {
    const yo = await pedir('/api/auth/yo', { token })
    assert.equal(yo.datos.usuario.nombreAbreviado, 'Juan P.')
  })

  test('métodos de pago: validación por catálogo', async () => {
    assert.equal((await pedir('/api/metodos-pago', { token, cuerpo: { tipo: 'pix', titular: 'Juan', campos: {} } })).estado, 400, 'PIX no existe en Honduras')
    assert.equal((await pedir('/api/metodos-pago', { token, cuerpo: { tipo: 'transferencia', titular: 'Juan', campos: {} } })).estado, 400, 'sin banco ni cuenta')
    const lista = await pedir('/api/metodos-pago', { token })
    assert.equal(lista.datos.metodos.length, 1)
  })

  test('vender sin saldo no se puede; con saldo del grifo sí', async () => {
    const cuerpo = { lado: 'venta', activo: 'ORIGEN', tipoPrecio: 'flotante', margen: 103, cantidadTotal: '50', limiteMin: '200', limiteMax: '3000', metodosPagoIds: [metodo.id], ventanaPagoMin: 30, terminos: 'Solo BAC' }
    const sin = await pedir('/api/anuncios', { token, cuerpo })
    assert.equal(sin.estado, 409)
    assert.equal(sin.datos.codigo, 'sin-saldo')
    const grifo = await pedir('/api/billetera/faucet', { token, cuerpo: { activo: 'ORIGEN', cantidad: '1000' } })
    assert.equal(grifo.estado, 200)
    const con = await pedir('/api/anuncios', { token, cuerpo })
    assert.equal(con.estado, 201, JSON.stringify(con.datos))
    assert.equal(con.datos.anuncio.estado, 'activo')
    assert.ok(con.datos.anuncio.precioEfectivo)
    const dup = await pedir('/api/anuncios', { token, cuerpo })
    assert.equal(dup.estado, 409)
    assert.equal(dup.datos.codigo, 'anuncio-duplicado')

    const malMargen = await pedir('/api/anuncios', { token, cuerpo: { ...cuerpo, lado: 'compra', metodosPagoIds: undefined, metodosTipos: ['transferencia'], margen: 50 } })
    assert.equal(malMargen.estado, 400)
    const malLimite = await pedir('/api/anuncios', { token, cuerpo: { ...cuerpo, lado: 'compra', metodosPagoIds: undefined, metodosTipos: ['transferencia'], limiteMax: '99999999' } })
    assert.equal(malLimite.estado, 400)
    assert.equal(malLimite.datos.codigo, 'limites')

    const editar = await pedir('/api/anuncios/' + con.datos.anuncio.id, { token, metodo: 'PATCH', cuerpo: { requisitos: { soloAgentes: true }, terminos: 'Solo agentes' } })
    assert.equal(editar.estado, 200)
    assert.equal(editar.datos.anuncio.requisitos.soloAgentes, true)

    const otro = await demo('Comprador1')
    const m = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=HNL', { token: otro })
    const mio = m.datos.anuncios.find((a: any) => a.anunciante.apodo === 'JuanHN')
    assert.ok(mio)
    assert.equal(mio.cumpleRequisitos, false)
    const intento = await pedir('/api/ordenes', { token: otro, cuerpo: { anuncioId: mio.id, montoFiat: '500' } })
    assert.equal(intento.estado, 403)
    assert.equal(intento.datos.codigo, 'requisitos')

    const pausar = await pedir(`/api/anuncios/${con.datos.anuncio.id}/estado`, { token, cuerpo: { estado: 'pausado' } })
    assert.equal(pausar.datos.anuncio.estado, 'pausado')
    assert.equal((await pedir('/api/mercado/anuncios/' + con.datos.anuncio.id)).estado, 404)
    const cerrar = await pedir(`/api/anuncios/${con.datos.anuncio.id}/estado`, { token, cuerpo: { estado: 'cerrado' } })
    assert.equal(cerrar.datos.anuncio.estado, 'cerrado')
    assert.equal((await pedir(`/api/anuncios/${con.datos.anuncio.id}/estado`, { token, cuerpo: { estado: 'activo' } })).estado, 409)
    assert.equal((await pedir('/api/metodos-pago/' + metodo.id, { token, metodo: 'DELETE' })).estado, 204)
  })

  test('retiros: contraseña, custodia, cancelación y decisión del operador', async () => {
    const antes = await saldoDe(token)
    const sinClave = await pedir('/api/billetera/retiros', { token, cuerpo: { activo: 'ORIGEN', cantidad: '100', direccion: '0x' + '1'.repeat(40), contrasena: 'mala' } })
    assert.equal(sinClave.estado, 403)
    const r = await pedir('/api/billetera/retiros', { token, cuerpo: { activo: 'ORIGEN', cantidad: '100', direccion: '0x' + '1'.repeat(40), contrasena: '12345678' } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    let s = await saldoDe(token)
    assert.equal(s.congelado, Dec.sumar(antes.congelado, '100'))
    const c = await pedir(`/api/billetera/retiros/${r.datos.retiro.id}/cancelar`, { token, cuerpo: {} })
    assert.equal(c.estado, 200)
    s = await saldoDe(token)
    assert.equal(s.congelado, antes.congelado)

    const r2 = await pedir('/api/billetera/retiros', { token, cuerpo: { activo: 'ORIGEN', cantidad: '50', direccion: '0x' + '2'.repeat(40), contrasena: '12345678' } })
    const admin = (await pedir('/api/panel/sesion/entrar', { cuerpo: { email: 'admin@prueba.local', contrasena: 'contrasena-admin-de-prueba' } })).datos.token
    const pendientes = await pedir('/api/panel/retiros', { token: admin })
    assert.ok(pendientes.datos.retiros.some((x: any) => x.id === r2.datos.retiro.id))
    const sinHash = await pedir(`/api/panel/retiros/${r2.datos.retiro.id}/decidir`, { token: admin, cuerpo: { decision: 'enviado' } })
    assert.equal(sinHash.estado, 400)
    const ok = await pedir(`/api/panel/retiros/${r2.datos.retiro.id}/decidir`, { token: admin, cuerpo: { decision: 'enviado', txHash: '0x' + 'ab'.repeat(32) } })
    assert.equal(ok.estado, 200)
    s = await saldoDe(token)
    assert.equal(s.congelado, antes.congelado)
    assert.equal(s.disponible, Dec.restar(antes.disponible, '50'))
    const depos = await pedir('/api/billetera/depositos', { token, cuerpo: { txHash: '0x' + 'cd'.repeat(32), activo: 'ORIGEN' } })
    assert.equal(depos.estado, 503, 'sin tesorería no se comprueban depósitos')
  })

  test('agente de cambio: garantía en custodia, retiro, aprobación', async () => {
    const e0 = await pedir('/api/agentes/estado', { token })
    assert.equal(e0.datos.estadoAgente, 'no')
    assert.equal(e0.datos.garantiaRequerida, '500')
    const antes = await saldoDe(token)
    const corta = await pedir('/api/agentes/solicitar', { token, cuerpo: { descripcion: 'corto' } })
    assert.equal(corta.estado, 400)
    const r = await pedir('/api/agentes/solicitar', { token, cuerpo: { descripcion: 'Opero en Tegucigalpa y San Pedro Sula, volumen medio, horario comercial' } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    assert.equal(r.datos.usuario.estadoAgente, 'solicitado')
    let s = await saldoDe(token)
    assert.equal(s.congelado, Dec.sumar(antes.congelado, '500'))
    assert.equal((await pedir('/api/agentes/retirar', { token, cuerpo: {} })).estado, 200)
    s = await saldoDe(token)
    assert.equal(s.congelado, antes.congelado)

    const r2 = await pedir('/api/agentes/solicitar', { token, cuerpo: { descripcion: 'Opero en Tegucigalpa y San Pedro Sula, volumen medio, horario comercial' } })
    const admin = (await pedir('/api/panel/sesion/entrar', { cuerpo: { email: 'admin@prueba.local', contrasena: 'contrasena-admin-de-prueba' } })).datos.token
    const lista = await pedir('/api/panel/agentes?estado=pendiente', { token: admin })
    assert.ok(lista.datos.solicitudes.some((x: any) => x.id === r2.datos.solicitud.id))
    const ok = await pedir(`/api/panel/agentes/${r2.datos.solicitud.id}/decidir`, { token: admin, cuerpo: { decision: 'aprobar', nota: 'Perfil completo' } })
    assert.equal(ok.estado, 200)
    const yo = await pedir('/api/auth/yo', { token })
    assert.equal(yo.datos.usuario.agente, true)
    assert.equal(yo.datos.usuario.estadoAgente, 'aprobado')
    s = await saldoDe(token)
    assert.equal(s.congelado, Dec.sumar(antes.congelado, '500'), 'la garantía sigue en custodia')
    const ren = await pedir('/api/agentes/renunciar', { token, cuerpo: {} })
    assert.equal(ren.estado, 200)
    s = await saldoDe(token)
    assert.equal(s.congelado, antes.congelado)
  })

  test('un agente suspendido no recupera la garantía por su cuenta', async () => {
    const r = await pedir('/api/auth/registro', { cuerpo: { email: 'agente2@prueba.local', contrasena: '12345678', apodo: 'AgenteDos', pais: 'GT' } })
    const t = r.datos.token
    await pedir('/api/genesis/demo/verificar', { token: t, cuerpo: {} })
    await pedir('/api/billetera/faucet', { token: t, cuerpo: { activo: 'ORIGEN', cantidad: '600' } })
    const sol = await pedir('/api/agentes/solicitar', { token: t, cuerpo: { descripcion: 'Agente de prueba en Guatemala con horario de oficina' } })
    assert.equal(sol.estado, 201, JSON.stringify(sol.datos))
    const admin = (await pedir('/api/panel/sesion/entrar', { cuerpo: { email: 'admin@prueba.local', contrasena: 'contrasena-admin-de-prueba' } })).datos.token
    await pedir(`/api/panel/agentes/${sol.datos.solicitud.id}/decidir`, { token: admin, cuerpo: { decision: 'aprobar', nota: 'ok' } })
    const uid = r.datos.usuario.id
    const susp = await pedir(`/api/panel/usuarios/${uid}/agente`, { token: admin, cuerpo: { estado: 'suspendido', nota: 'Revisión por reclamo' } })
    assert.equal(susp.estado, 200, JSON.stringify(susp.datos))
    const ren = await pedir('/api/agentes/renunciar', { token: t, cuerpo: {} })
    assert.equal(ren.estado, 409)
    assert.equal((await saldoDe(t)).congelado, '500', 'la garantía sigue en custodia')
    const nueva = await pedir('/api/agentes/solicitar', { token: t, cuerpo: { descripcion: 'Intento de volver a solicitar tras la suspensión' } })
    assert.equal(nueva.estado, 409)
    const ret = await pedir(`/api/panel/usuarios/${uid}/agente`, { token: admin, cuerpo: { estado: 'retirado', nota: 'Se devuelve la garantía' } })
    assert.equal(ret.estado, 200)
    assert.equal((await saldoDe(t)).congelado, '0')
  })

  test('un anuncio ajeno no existe (404), y la orden no se abre con más decimales que la moneda', async () => {
    const yape = await demo('YapePeru')
    const mio = await pedir('/api/anuncios', { token: yape })
    const otro = await demo('NequiCol')
    const m = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=PEN', { token: otro })
    const a = m.datos.anuncios[0]
    assert.ok(a)
    assert.equal((await pedir('/api/anuncios/' + a.id, { token: otro })).estado, 404)
    assert.ok(mio.datos.anuncios.length >= 1)
    const r = await pedir('/api/ordenes', { token: otro, cuerpo: { anuncioId: a.id, montoFiat: Dec.sumar(a.limiteMin, '0.001') } })
    assert.equal(r.estado, 400)
    assert.equal(r.datos.codigo, 'monto')
  })

  test('el chat: una imagen sale como URL firmada y se limita por orden', async () => {
    const comprador = await demo('Comprador1')
    const vendedor = await demo('OroTegus')
    const m = await pedir('/api/mercado/anuncios?quiero=comprar&moneda=HNL', { token: comprador })
    const a = m.datos.anuncios.find((x: any) => x.anunciante.apodo === 'OroTegus')
    const r = await pedir('/api/ordenes', { token: comprador, cuerpo: { anuncioId: a.id, montoFiat: Dec.multiplicar(a.limiteMin, '2'), metodoTipo: 'transferencia' } })
    assert.equal(r.estado, 201, JSON.stringify(r.datos))
    const o = r.datos.orden
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const img = await pedir(`/api/ordenes/${o.id}/mensajes`, { token: comprador, cuerpo: { imagen: png } })
    assert.equal(img.estado, 201)
    assert.match(img.datos.mensaje.imagen, /^\/api\/ordenes\/.+\/imagenes\/img_.+\?f=[0-9a-f]{32}$/)
    const cruda = await fetch(base + img.datos.mensaje.imagen)
    assert.equal(cruda.status, 200)
    assert.equal(cruda.headers.get('content-type'), 'image/png')
    const sinFirma = await fetch(base + img.datos.mensaje.imagen.replace(/\?f=.*$/, '?f=0000'))
    assert.equal(sinFirma.status, 404)
    for (let i = 0; i < 5; i++) await pedir(`/api/ordenes/${o.id}/mensajes`, { token: vendedor, cuerpo: { imagen: png } })
    const tope = await pedir(`/api/ordenes/${o.id}/mensajes`, { token: comprador, cuerpo: { imagen: png } })
    assert.equal(tope.estado, 409)
    const detalle = await pedir('/api/ordenes/' + o.id, { token: comprador })
    assert.ok(!('id' in detalle.datos.orden.metodoPago), 'el id del método del vendedor no sale')
    assert.ok(!('vistaPor' in detalle.datos.orden))
    const sondeo = await pedir(`/api/ordenes/${o.id}/mensajes`, { token: comprador })
    assert.ok(!('mensajes' in sondeo.datos.orden), 'el sondeo no repite los mensajes dentro de la orden')
    assert.equal((await pedir(`/api/ordenes/${o.id}/cancelar`, { token: comprador, cuerpo: {} })).estado, 200)
  })

  test('los saldos cuadran con los movimientos', async () => {
    const d = store.todo()
    for (const s of d.saldos) {
      const movs = d.movimientos.filter((m) => m.usuarioId === s.usuarioId && m.activo === s.activo)
      const disp = movs.reduce((acc, m) => Dec.sumar(acc, m.disponibleDelta), '0')
      const cong = movs.reduce((acc, m) => Dec.sumar(acc, m.congeladoDelta), '0')
      assert.equal(s.disponible, disp, `disponible de ${s.usuarioId} ${s.activo}`)
      assert.equal(s.congelado, cong, `congelado de ${s.usuarioId} ${s.activo}`)
      assert.ok(!Dec.esNegativo(s.disponible) && !Dec.esNegativo(s.congelado))
    }
  })
})
