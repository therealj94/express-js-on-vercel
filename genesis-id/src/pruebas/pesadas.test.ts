/* El limitador de peticiones pesadas.
 *
 * POR QUE HACE FALTA, Y POR QUE NO BASTA EL TOPE POR MINUTO
 *
 * Las rutas que reciben imágenes admiten cuerpos de 25 MB, y no se pueden bajar
 * sin dejar sin verificarse a quien tenga una versión vieja de la app. Una
 * petición así ocupa bastante más de 25 MB ya parseada, y el servicio corre con
 * memoria contada.
 *
 * El tope por minuto no protege de esto: cuenta por IP, así que mil personas
 * distintas verificándose a la vez pasan todas. Lo que hay que contar es cuántas
 * hay DENTRO en este instante, que es lo que ocupa memoria.
 *
 * LO QUE SE FIJA AQUI
 *
 *   1. Solo pasan las que caben; el resto espera en cola, no se rechaza.
 *   2. Al terminar una, entra la siguiente de la cola.
 *   3. Con la cola llena sí se contesta 503, y con `Retry-After` para que la
 *      app reintente en vez de dar la verificación por perdida.
 *   4. La cuenta se libera aunque el cliente corte a media petición — si no, el
 *      servicio se iría quedando sin plazas hasta atascarse solo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

// Se fija la configuración ANTES de importar: se lee al cargar el módulo.
process.env.GENESIS_PESADAS_A_LA_VEZ = '2'
process.env.GENESIS_PESADAS_EN_COLA = '3'
process.env.GENESIS_PESADAS_ESPERA_MS = '300'

const { pesada, cargaPesadas } = await import('../middleware/proteger.js')

/** Una respuesta de mentira que anota lo que le hacen y sabe terminar. */
function respuesta() {
  const res: any = new EventEmitter()
  res.cabeceras = {}
  res.codigo = null
  res.cuerpo = null
  res.setHeader = (k: string, v: string) => { res.cabeceras[k] = v }
  res.status = (c: number) => { res.codigo = c; return res }
  res.json = (b: any) => { res.cuerpo = b; return res }
  res.terminar = () => res.emit('finish')
  return res
}

/** Mete una petición y devuelve si la dejaron pasar. */
function meter(res: any): { pasa: Promise<boolean> } {
  let resolver: (v: boolean) => void
  const pasa = new Promise<boolean>((r) => { resolver = r })
  pesada({} as any, res, () => resolver(true))
  // Si contestó 503, no pasó.
  setImmediate(() => { if (res.codigo === 503) resolver(false) })
  return { pasa }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('pasan las que caben y las demás hacen cola', async () => {
  const a = respuesta(), b = respuesta(), c = respuesta()
  assert.equal(await meter(a).pasa, true, 'la primera entra')
  assert.equal(await meter(b).pasa, true, 'la segunda entra')

  // La tercera no cabe: se queda esperando, sin respuesta todavía.
  const tercera = meter(c)
  await esperar(30)
  assert.equal(c.codigo, null, 'la tercera espera, no se le echa')
  assert.equal(cargaPesadas().dentro, 2)
  assert.equal(cargaPesadas().enCola, 1)

  // Al terminar la primera, entra la tercera.
  a.terminar()
  assert.equal(await tercera.pasa, true, 'al liberarse una plaza, entra la que esperaba')
  assert.equal(cargaPesadas().enCola, 0)

  b.terminar(); c.terminar()
  await esperar(20)
  assert.equal(cargaPesadas().dentro, 0, 'al final no queda ninguna dentro')
})

test('con la cola llena se contesta 503 con Retry-After', async () => {
  const dentro = [respuesta(), respuesta()]
  for (const r of dentro) assert.equal(await meter(r).pasa, true)

  const enCola = [respuesta(), respuesta(), respuesta()]
  for (const r of enCola) meter(r)
  await esperar(30)
  assert.equal(cargaPesadas().enCola, 3, 'la cola se llenó')

  const sobra = respuesta()
  assert.equal(await meter(sobra).pasa, false)
  assert.equal(sobra.codigo, 503)
  assert.equal(sobra.cabeceras['Retry-After'], '15',
    'sin Retry-After la app no sabe que puede reintentar')

  // Se vacía todo para no dejar plazas tomadas a la siguiente prueba.
  for (const r of dentro) r.terminar()
  await esperar(50)
  for (const r of enCola) r.terminar()
  await esperar(450)   // pasa la espera máxima de los que quedaran en cola
  assert.equal(cargaPesadas().enCola, 0)
})

test('la plaza se libera aunque el cliente corte a media petición', async () => {
  const a = respuesta()
  assert.equal(await meter(a).pasa, true)
  assert.equal(cargaPesadas().dentro, 1)

  // `close` sin `finish`: el cliente se fue antes de recibir la respuesta.
  a.emit('close')
  await esperar(20)
  assert.equal(cargaPesadas().dentro, 0,
    'si no se liberara aquí, el servicio se quedaría sin plazas solo')
})
