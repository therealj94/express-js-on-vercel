// «¿Cuánta gente usa la app y cuánta la web?»
//
// EL FALLO QUE ESTAS PRUEBAS FIJAN
//
// La pantalla de conexiones traía las cien filas más recientes y ahí se
// acababa: para saber el reparto entre app y web había que leer dos columnas
// de la tabla y contar a ojo. Un porcentaje sacado de una página se cita
// después en una reunión como si fuera el del negocio entero, y no lo es.
//
// Estas pruebas fijan las dos cosas que hacen que la cifra sirva: que se
// cuente sobre TODA la colección, y que una persona que entra por los dos
// lados no se cuente dos veces ni se le adjudique un solo lado.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ingerir, almacen } from '../analitica/eventos.js'
import { repartoPorPlataforma } from '../analitica/explorador.js'

const ahora = () => new Date().toISOString()

let n = 0
const nuevaApp = () => `reparto-${++n}`

function limpiar() {
  almacen.memoria.eventos.length = 0
  almacen.memoria.usuarios.clear()
  almacen.memoria.dias.clear()
  almacen.memoria.activos.clear()
}

const abrir = (app: string, usuario: string, plataforma: string) =>
  ingerir(app, [{ tipo: 'sesion', nombre: 'abrir', usuario, plataforma, en: ahora() }], 'HN')

test('cada persona cae en un solo lado, y la que usa las dos no se cuenta dos veces', async () => {
  limpiar()
  const APP = nuevaApp()

  await abrir(APP, 'solo-app', 'android')
  await abrir(APP, 'solo-web', 'web')
  await abrir(APP, 'las-dos', 'android')
  await abrir(APP, 'las-dos', 'web')

  const r = await repartoPorPlataforma({ app: APP })

  assert.equal(r.personas, 3, 'son tres personas, no cuatro sesiones')
  assert.equal(r.soloApp, 1)
  assert.equal(r.soloWeb, 1)
  assert.equal(r.ambas, 1)
  assert.equal(r.soloApp + r.soloWeb + r.ambas + r.sinDato, r.personas,
    'las partes tienen que sumar el total: si no, el porcentaje miente')
})

test('el iPhone cuenta como app, no como «ni una cosa ni la otra»', async () => {
  limpiar()
  const APP = nuevaApp()

  await abrir(APP, 'de-iphone', 'ios')

  const r = await repartoPorPlataforma({ app: APP })
  assert.equal(r.soloApp, 1)
  assert.equal(r.sinDato, 0)
})

test('el estreno cuenta a quien abrió por primera vez dentro de la ventana', async () => {
  limpiar()
  const APP = nuevaApp()

  /* Fechado hace dos horas y no «ahora»: con `ahora()` la ingesta y la
     consulta pueden caer en el mismo milisegundo, y entonces una ventana de
     cero días se alcanza a sí misma. La prueba pasaría o fallaría según lo
     rápido que vaya la máquina, que es la peor clase de prueba. */
  const haceDosHoras = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  await ingerir(APP, [{
    tipo: 'sesion', nombre: 'abrir', usuario: 'recien-llegada',
    plataforma: 'android', en: haceDosHoras,
  }], 'HN')

  const dentro = await repartoPorPlataforma({ app: APP, dias: 30 })
  assert.equal(dentro.estrenaronApp, 1)
  assert.equal(dentro.dias, 30)

  // Una ventana que empieza después de que entró no puede reclamarla.
  const fuera = await repartoPorPlataforma({ app: APP, dias: 0 })
  assert.equal(fuera.estrenaronApp, 0,
    'quien entró hace dos horas no estrena dentro de una ventana de cero días')
  assert.equal(fuera.personas, 1, 'pero la persona sigue estando en el total')
})

test('no se mezclan las apps: el reparto de una no arrastra a la otra', async () => {
  limpiar()
  const UNA = nuevaApp()
  const OTRA = nuevaApp()

  await abrir(UNA, 'a', 'android')
  await abrir(OTRA, 'b', 'web')
  await abrir(OTRA, 'c', 'web')

  const r = await repartoPorPlataforma({ app: OTRA })
  assert.equal(r.personas, 2)
  assert.equal(r.soloWeb, 2)
  assert.equal(r.soloApp, 0)
})
