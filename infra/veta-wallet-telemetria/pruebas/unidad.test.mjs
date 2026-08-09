// Pruebas del reporte de telemetría y del padrón.
//
// Se ejercitan los módulos REALES contra un `fetch` de mentira. Lo que se
// comprueba no es que "manda eventos" —eso es lo fácil— sino lo que de verdad
// puede costar dinero: que nunca lance, que no crezca sin freno cuando Genesis
// ID está caído, que no reintente para siempre un lote que nunca va a entrar, y
// que el identificador de una persona sea EL MISMO en los dos módulos.

import test from 'node:test'
import assert from 'node:assert/strict'

// La configuración se lee al importar, así que se pone antes.
process.env.GENESIS_TELEMETRIA_KEY = 'gid_pub_prueba'
process.env.GENESIS_API_KEY = 'gid_live_prueba'
process.env.GENESIS_URL = 'https://genesis.prueba'
process.env.GENESIS_TELEMETRIA_INTERVALO_MS = '20'
process.env.GENESIS_TELEMETRIA_COLA = '10'
process.env.GENESIS_TELEMETRIA_LOTE = '5'

const tele = await import('../telemetria.js')
const dir = await import('../directorio.js')

// ── fetch de mentira ────────────────────────────────────────────────────────
const llamadas = []
let responder = () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
globalThis.fetch = async (url, opciones) => {
  llamadas.push({ url, cuerpo: JSON.parse(opciones.body), cabeceras: opciones.headers })
  return responder()
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Deja la cola vacía y el registro de llamadas limpio.
 *
 * El módulo tiene estado global a propósito —es una cola de proceso— así que
 * sin esto una prueba hereda los eventos que la anterior no llegó a mandar y
 * falla por algo que no está probando.
 */
async function limpiar() {
  responder = () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  await tele.vaciar()
  await esperar(40)
  await tele.vaciar()
  llamadas.length = 0
}

// ─────────────────────────────────────────────────────────────────────────────

test('el identificador es el mismo en telemetría y en el padrón', () => {
  // Es la prueba más importante del archivo. Si estos dos se separan, el panel
  // deja de poder poner nombre a los errores y NADA falla a la vista: solo
  // aparece «fuera del padrón» para todo el mundo.
  const usuario = { _id: 'abc123', email: 'maria@prueba.hn', nombre: 'Maria' }
  const enPadron = dir.deUsuario(usuario)
  assert.equal(enPadron.idExterno, tele.idDeUsuario(usuario))
})

test('el identificador prefiere el _id al correo, que puede cambiar', () => {
  assert.equal(tele.idDeUsuario({ _id: 'x1', email: 'a@b.c' }), 'x1')
  // Sin _id se cae al correo, pero solo como último recurso.
  assert.equal(tele.idDeUsuario({ email: 'a@b.c' }), 'a@b.c')
  assert.equal(tele.idDeUsuario(null), null)
  assert.equal(tele.idDeUsuario({}), null)
})

test('los eventos salen en lote y con la clave pública', async () => {
  await limpiar()
  responder = () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  tele.ingreso('u-1', { pais: 'HN' })
  tele.transaccion('u-1', { valor: 500, moneda: 'USD' })
  await esperar(60)

  assert.equal(llamadas.length, 1, 'los dos eventos van en una sola petición')
  assert.match(llamadas[0].url, /\/api\/v1\/telemetria\/eventos$/)
  assert.equal(llamadas[0].cabeceras['X-Telemetria-Key'], 'gid_pub_prueba')
  assert.equal(llamadas[0].cuerpo.eventos.length, 2)
  assert.equal(llamadas[0].cuerpo.eventos[0].tipo, 'sesion')
  assert.equal(llamadas[0].cuerpo.eventos[1].valor, 500)
})

test('la cola no crece sin freno cuando Genesis ID no responde', async () => {
  await limpiar()
  responder = () => { throw new Error('servidor caído') }
  for (let i = 0; i < 50; i++) tele.accion('u-1', 'toque')
  await esperar(80)

  const s = tele.estadisticas()
  assert.ok(s.enCola <= 10, `la cola se acotó al tope: ${s.enCola}`)
  assert.ok(s.descartados > 0, 'se descartaron los más viejos')
})

test('un lote rechazado por el servidor no se reintenta para siempre', async () => {
  await limpiar()
  // 400: el lote está mal formado o la clave fue revocada. Reintentarlo es
  // repetir el mismo error hasta el fin de los tiempos.
  responder = () => ({ ok: false, status: 400, json: async () => ({ error: 'clave inválida' }) })
  tele.accion('u-9', 'algo')
  await esperar(60)
  const primeras = llamadas.length
  await esperar(60)
  assert.equal(llamadas.length, primeras, 'no se reintentó el lote rechazado')
})

test('nunca lanza, ni con basura', () => {
  assert.doesNotThrow(() => tele.registrar(null))
  assert.doesNotThrow(() => tele.registrar({}))
  assert.doesNotThrow(() => tele.registrar({ tipo: 'accion' }))          // sin nombre
  assert.doesNotThrow(() => tele.fallo('x', undefined))
  assert.doesNotThrow(() => tele.transaccion(undefined, { valor: NaN }))
  const circular = {}
  circular.yo = circular
  assert.doesNotThrow(() => tele.registrar({ tipo: 'accion', nombre: 'a', meta: circular }))
})

test('los eventos sin tipo o sin nombre se caen en vez de viajar sucios', async () => {
  await limpiar()
  responder = () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  tele.registrar({ tipo: 'accion' })
  tele.registrar({ nombre: 'suelto' })
  await esperar(60)
  assert.equal(llamadas.length, 0, 'no se mandó nada')
})

test('los textos largos se recortan antes de salir', async () => {
  await limpiar()
  responder = () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  tele.fallo('grande', new Error('x'.repeat(5000)))
  await esperar(60)
  const e = llamadas[0].cuerpo.eventos[0]
  assert.ok(e.mensaje.length <= 300, `mensaje recortado: ${e.mensaje.length}`)
})

// ── El middleware ───────────────────────────────────────────────────────────

function pedir({ status = 200, path = '/api/x', metodo = 'GET', usuario, demora = 0 }) {
  const oyentes = {}
  const req = { path, method: metodo, headers: {}, usuario }
  const res = { statusCode: status, on: (ev, f) => { oyentes[ev] = f } }
  const medir = tele.medidor({ lentaMs: 100 })
  medir(req, res, () => {})
  return { terminar: () => oyentes.finish?.(), req, res }
}

test('el medidor reporta los 500 con quién los sufrió', async () => {
  await limpiar()
  responder = () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  const p = pedir({ status: 500, path: '/transaction/send', metodo: 'POST', usuario: { _id: 'u-77' } })
  p.terminar()
  await esperar(60)

  const e = llamadas[0].cuerpo.eventos[0]
  assert.equal(e.tipo, 'error')
  assert.equal(e.nombre, 'http.500')
  assert.equal(e.gravedad, 'critico')
  assert.equal(e.usuario, 'u-77')
  assert.match(e.ruta, /POST \/transaction\/send/)
})

test('el medidor NO reporta las peticiones correctas ni los 401/404', async () => {
  await limpiar()
  responder = () => ({ ok: true, status: 202, json: async () => ({ ok: true }) })
  pedir({ status: 200 }).terminar()
  pedir({ status: 401 }).terminar()
  pedir({ status: 404 }).terminar()
  await esperar(60)
  assert.equal(llamadas.length, 0, 'el ruido de fondo no se reporta')
})

test('el cazador de excepciones deja pasar el error a la app', () => {
  const cazar = tele.cazador()
  const err = new Error('explotó')
  let recibido = null
  cazar(err, { method: 'POST', path: '/x', usuario: { _id: 'u-1' } }, {}, (e) => { recibido = e })
  assert.equal(recibido, err, 'el error sigue su camino hacia el manejador de la app')
})

// ── El padrón ───────────────────────────────────────────────────────────────

test('el padrón manda solo los campos de la lista, nunca secretos', () => {
  const e = dir.deUsuario({
    _id: 'u-1', email: 'Maria@Prueba.HN ', nombre: 'Maria', address: '0xabc',
    // Todo esto NO puede salir de aquí:
    password: 'secreta', seed: 'doce palabras', privateKey: '0xdead',
    pin: '1234', documento: 'A123456', saldo: 9999,
  })
  const permitidos = [
    'idExterno', 'email', 'nombre', 'usuario', 'telefono', 'pais', 'ciudad',
    'direccionWallet', 'estado', 'kyc', 'verificado', 'creadoEn', 'ultimoAcceso',
  ]
  for (const k of Object.keys(e)) {
    assert.ok(permitidos.includes(k), `campo inesperado en el padrón: ${k}`)
  }
  assert.equal(e.email, 'maria@prueba.hn', 'el correo se normaliza')
  assert.equal(e.direccionWallet, '0xabc')
})

test('el padrón descarta a quien no tiene correo o identificador', () => {
  assert.equal(dir.deUsuario({ _id: 'x' }), null)
  assert.equal(dir.deUsuario({ email: 'a@b.c' })?.idExterno, 'a@b.c')
  assert.equal(dir.deUsuario(null), null)
})

test('el padrón se manda en lotes y con la clave secreta', async () => {
  await limpiar()
  responder = () => ({ ok: true, status: 200, json: async () => ({ ok: true, guardados: 2 }) })
  const r = await dir.sincronizar([
    { _id: 'a', email: 'a@b.c' },
    { _id: 'b', email: 'b@b.c' },
    { sin: 'nada' },
  ])
  assert.equal(r.ok, true)
  assert.equal(r.enviados, 2, 'el usuario inválido no se cuenta')
  assert.equal(llamadas[0].cabeceras['X-API-Key'], 'gid_live_prueba')
  assert.match(llamadas[0].url, /\/api\/v1\/directorio\/sincronizar$/)
})

test('si Genesis ID rechaza el padrón, se dice por qué en vez de fingir éxito', async () => {
  await limpiar()
  responder = () => ({ ok: false, status: 401, json: async () => ({ error: 'clave revocada' }) })
  const r = await dir.sincronizar([{ _id: 'a', email: 'a@b.c' }])
  assert.equal(r.ok, false)
  assert.match(r.motivo, /clave revocada/)
})
