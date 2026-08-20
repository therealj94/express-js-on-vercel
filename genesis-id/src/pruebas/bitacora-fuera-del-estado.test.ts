/* La bitácora fuera del documento de estado — contra un MongoDB de verdad.
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * El resto de la batería corre con el motor de archivo, así que no toca ni una
 * línea del camino de Mongo. Y el cambio que se prueba aquí es justamente de
 * ese camino: dónde se guarda la bitácora y cómo se recupera al arrancar.
 *
 * Lo que está en juego no es un detalle. Si la bitácora se carga en otro orden,
 * la cadena de hashes deja de cuadrar y el registro de auditoría queda
 * inservible — sin que nadie se entere hasta que un auditor lo pida.
 *
 * EL «REINICIO» ES `iniciar()` OTRA VEZ
 *
 * No se recargan módulos con trucos de caché: `iniciar()` vuelve a leer de Mongo
 * y a rellenar el estado en memoria, que es exactamente lo que hace el arranque
 * del servicio. Llamarlo dos veces es la forma honesta de probar un reinicio, y
 * además no deja procesos colgados.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'

const BASE = 'pruebabitacora'
let servidor: MongoMemoryServer
let uri: string
let store: typeof import('../store.js')['store']
let iniciar: typeof import('../store.js')['iniciar']
let registrar: typeof import('../audit/bitacora.js')['registrar']
let verificarCadena: typeof import('../audit/bitacora.js')['verificarCadena']
let saludBitacora: typeof import('../store.js')['saludBitacora']

before(async () => {
  servidor = await MongoMemoryServer.create()
  uri = servidor.getUri()
  process.env.GENESIS_MONGO_URL = uri
  process.env.GENESIS_MONGO_DB = BASE
  // Se importan DESPUÉS de poner las variables: el motor se decide al cargar.
  const s = await import('../store.js')
  const b = await import('../audit/bitacora.js')
  store = s.store; iniciar = s.iniciar; saludBitacora = s.saludBitacora
  registrar = b.registrar; verificarCadena = b.verificarCadena
  await iniciar()
})

after(async () => { await servidor?.stop() })

async function conBase<T>(hacer: (base: any) => Promise<T>): Promise<T> {
  const c = new MongoClient(uri)
  await c.connect()
  try { return await hacer(c.db(BASE)) } finally { await c.close() }
}

test('el estado se guarda sin bitácora, y al reiniciar vuelve entera y en orden', async () => {
  await store.reiniciar()
  for (let i = 0; i < 25; i++) {
    // `riesgo: undefined` a propósito: es el caso que rompía la cadena al
    // recargar, porque JSON.stringify borra la clave y Mongo la guardaba nula.
    registrar('operador@orden', 'identidad.aprobada', `idn_${i}`, { n: i, riesgo: undefined })
  }
  assert.equal(verificarCadena().integra, true, 'en memoria tiene que cuadrar')
  await store.guardarYa()

  const antes = store.todo().bitacora.map((e) => e.hash)

  await conBase(async (base) => {
    const doc: any = await base.collection('estado').findOne({ _id: 'genesis' })
    assert.equal(doc?.datos?.bitacora, undefined,
      'el documento de estado NO puede llevar bitácora: es todo el punto del cambio')
    const filas = await base.collection('bitacora').find({}).sort({ i: 1 }).toArray()
    assert.equal(filas.length, 25, 'las 25 entradas están en su colección')
    assert.deepEqual(filas.map((f: any) => f.i), [...Array(25).keys()],
      'el índice de orden va de 0 a 24 sin huecos')
  })

  await iniciar()   // el reinicio
  assert.deepEqual(store.todo().bitacora.map((e) => e.hash), antes,
    'vuelven las mismas entradas en el mismo orden')
  const estado = verificarCadena()
  assert.equal(estado.integra, true,
    `la cadena se rompió al recargar, en la entrada ${estado.rotaEn}`)
})

test('solo se escriben las entradas nuevas; las viejas no se reescriben', async () => {
  await store.reiniciar()
  registrar('operador@orden', 'prueba.una', 'x', {})
  await store.guardarYa()
  const idPrimera = store.todo().bitacora[0].id

  registrar('operador@orden', 'prueba.dos', 'x', {})
  await store.guardarYa()

  await conBase(async (base) => {
    const filas = await base.collection('bitacora').find({}).sort({ i: 1 }).toArray()
    assert.equal(filas.length, 2)
    assert.equal((filas[0] as any).entrada.id, idPrimera,
      'la primera no se reescribe: una bitácora no se toca hacia atrás')
  })
})

test('una bitácora vieja guardada dentro del estado se migra sin perder el orden', async () => {
  await store.reiniciar()
  for (let i = 0; i < 10; i++) registrar('viejo@orden', 'accion.vieja', `o_${i}`, { n: i })
  await store.guardarYa()
  const original = store.todo().bitacora.map((e) => e.hash)

  // Se fabrica el estado ANTERIOR al cambio: bitácora dentro del documento y
  // colección vacía. Es como está producción justo antes de desplegar esto.
  await conBase(async (base) => {
    const vieja = (await base.collection('bitacora').find({}).sort({ i: 1 }).toArray())
      .map((f: any) => f.entrada)
    await base.collection('bitacora').deleteMany({})
    await base.collection('estado').updateOne(
      { _id: 'genesis' as any }, { $set: { 'datos.bitacora': vieja } })
  })

  await iniciar()   // el arranque que tiene que migrarla

  assert.deepEqual(store.todo().bitacora.map((e) => e.hash), original,
    'las 10 entradas vuelven en el MISMO orden: otro orden es una cadena rota')
  assert.equal(verificarCadena().integra, true, 'y la cadena sigue íntegra')

  await conBase(async (base) => {
    const doc: any = await base.collection('estado').findOne({ _id: 'genesis' })
    assert.equal(doc?.datos?.bitacora, undefined, 'y ya no queda dentro del estado')
    assert.equal(await base.collection('bitacora').countDocuments(), 10)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
 * DOS VOLCADOS A LA VEZ
 *
 * Esta es la que reproduce la rotura de producción del 20 de agosto.
 *
 * `volcarBitacora()` lee cuántas entradas lleva guardadas, se va a esperar al
 * `insertMany`, y SOLO al volver adelanta el contador. Entre esas dos cosas hay
 * un `await`, y en esa rendija cabe otro volcado entero: lee el mismo contador,
 * ve las mismas entradas pendientes y las vuelve a insertar con el MISMO `i`.
 *
 * En memoria no se nota nada —la cadena cuadra— y por eso pasó desapercibido.
 * Se nota al reiniciar: `cargarBitacora()` ordena por `i`, la entrada duplicada
 * vuelve dos veces, y el eslabón repetido no encadena con el que ahora tiene
 * delante. La cadena se rompe exactamente ahí.
 *
 * Que dos volcados coincidan no es raro: `guardar()` programa uno a los 100 ms
 * y `guardarYa()` lanza el suyo sin esperar al que ya estuviera en vuelo. Con
 * dos operadores trabajando a la vez, o con el arranque migrando mientras entra
 * una petición, la rendija se abre sola.
 * ────────────────────────────────────────────────────────────────────────── */
test('dos volcados a la vez no duplican entradas ni rompen la cadena', async () => {
  await store.reiniciar()
  for (let i = 0; i < 12; i++) registrar('operador@orden', 'prueba.carrera', `c_${i}`, { n: i })

  // Los dos a la vez, sin esperar al primero. Es lo que hace el servicio.
  await Promise.all([store.guardarYa(), store.guardarYa()])

  await conBase(async (base) => {
    const filas = await base.collection('bitacora').find({}).sort({ i: 1 }).toArray()
    assert.equal(filas.length, 12,
      `se escribieron ${filas.length} filas para 12 entradas: hay duplicados`)
  })

  const antes = store.todo().bitacora.map((e) => e.hash)
  await iniciar()
  assert.deepEqual(store.todo().bitacora.map((e) => e.hash), antes,
    'al reiniciar vuelven las mismas entradas, ni una de más')
  const estado = verificarCadena()
  assert.equal(estado.integra, true,
    `la cadena se rompió al recargar, en la entrada ${estado.rotaEn}`)
})

/* Una colección que YA tiene copias — el estado en que quedó producción.
 *
 * El arreglo de arriba impide que vuelva a pasar, pero no deshace lo que ya
 * está escrito. Esto comprueba lo otro: que al arrancar sobre una colección con
 * copias, la cadena vuelve a cuadrar sin tocar ni una entrada, que las copias
 * se quitan del almacén, y que queda dicho cuántas eran. */
test('una colección con copias se carga limpia y la cadena vuelve a cuadrar', async () => {
  await store.reiniciar()
  for (let i = 0; i < 10; i++) registrar('operador@orden', 'accion', `x_${i}`, { n: i })
  await store.guardarYa()
  const buenos = store.todo().bitacora.map((e) => e.hash)

  // Se fabrica el daño: las tres últimas filas, escritas otra vez con su mismo
  // `i`. Es exactamente lo que dejaba el volcado repetido.
  await conBase(async (base) => {
    /* Se tira el índice único primero: sin él estaba producción, y por eso las
       copias pudieron escribirse. Que haga falta tirarlo para fabricar el daño
       ya dice que el índice hace su trabajo. */
    await base.collection('bitacora').dropIndex('i_unico').catch(() => {})
    const filas = await base.collection('bitacora').find({ i: { $gte: 7 } }).toArray()
    await base.collection('bitacora').insertMany(
      filas.map((f: any) => ({ i: f.i, entrada: f.entrada })))
    assert.equal(await base.collection('bitacora').countDocuments(), 13, 'el daño está puesto')
  })

  await iniciar()

  const { copiasApartadas, sitiosEnChoque } = saludBitacora()
  assert.equal(copiasApartadas, 3, 'se apartaron las tres copias')
  assert.deepEqual(sitiosEnChoque, [], 'y ninguna era un choque de verdad')
  assert.deepEqual(store.todo().bitacora.map((e) => e.hash), buenos,
    'vuelven las diez entradas buenas, sin tocar ninguna')
  const estado = verificarCadena()
  assert.equal(estado.integra, true, `la cadena sigue rota en ${estado.rotaEn}`)

  await conBase(async (base) => {
    assert.equal(await base.collection('bitacora').countDocuments(), 10,
      'y las copias ya no están en el almacén')
  })
})

/* Dos entradas DISTINTAS en el mismo sitio no son una copia: son una anomalía.
 * Ahí no se elige ninguna —elegir sería decidir qué versión de la historia
 * vale—. Se guardan las dos, la cadena sale rota como debe, y el sitio queda
 * anotado para que una persona lo mire. */
test('dos entradas distintas en el mismo sitio no se descartan solas', async () => {
  await store.reiniciar()
  for (let i = 0; i < 6; i++) registrar('operador@orden', 'accion', `y_${i}`, { n: i })
  await store.guardarYa()

  await conBase(async (base) => {
    await base.collection('bitacora').dropIndex('i_unico').catch(() => {})
    const f: any = await base.collection('bitacora').findOne({ i: 4 })
    await base.collection('bitacora').insertOne({
      i: 4, entrada: { ...f.entrada, id: 'log_otro', hash: 'f'.repeat(64) } })
  })

  await iniciar()
  const { copiasApartadas, sitiosEnChoque } = saludBitacora()
  assert.equal(copiasApartadas, 0, 'no era una copia, así que no se apartó nada')
  assert.deepEqual(sitiosEnChoque, [4], 'y el sitio en choque queda anotado')
  assert.equal(store.todo().bitacora.length, 7, 'se cargan las dos: no se elige por nadie')
  assert.equal(verificarCadena().integra, false, 'y la cadena sale rota, que es lo correcto')
})
