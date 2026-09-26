/* El script de revisión del v0.3 NO escribe, ni aunque se le pida.
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * `src/migraciones/v03-estados-y-vinculos.ts` se corre a mano contra el mismo
 * Mongo del servicio. Tenía una bandera, `--aplicar-vencidas`, que abría el
 * almacén con `iniciar()` en OTRO proceso, vencía identidades y volcaba. El
 * servicio vivo guarda todo en memoria y lleva su propio contador de la
 * bitácora sobre un índice único en `i`: después de esa corrida, cada volcado
 * del servicio chocaba con E11000 y ya no persistía nada —KYC, aprobaciones,
 * vínculos— mientras seguía contestando 200. Al siguiente reinicio se perdía
 * todo lo hecho en memoria desde entonces.
 *
 * Aquí el proceso de la prueba hace de servicio y el script corre como proceso
 * aparte contra el mismo MongoDB, que es exactamente cómo se usaría.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'

const BASE = 'pruebamigracionv03'
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = 'src/migraciones/v03-estados-y-vinculos.ts'

let servidor: MongoMemoryServer
let uri = ''
let store: typeof import('../store.js')['store']
let saludAlmacen: typeof import('../store.js')['saludAlmacen']
let registrar: typeof import('../audit/bitacora.js')['registrar']
let ids: typeof import('../motor/identidades.js')
let caducadaId = ''

before(async () => {
  servidor = await MongoMemoryServer.create()
  uri = servidor.getUri()
  process.env.GENESIS_MONGO_URL = uri
  process.env.GENESIS_MONGO_DB = BASE
  delete process.env.GENESIS_DATA_FILE
  const s = await import('../store.js')
  store = s.store; saludAlmacen = s.saludAlmacen
  registrar = (await import('../audit/bitacora.js')).registrar
  ids = await import('../motor/identidades.js')
  await s.iniciar()

  // El «servicio» tiene una verificada con el documento caducado, y bitácora.
  const i = ids.iniciar('caducada@prueba.local', 'prueba')
  i.nombreLegal = 'Persona De Prueba'
  i.estado = 'verificada'
  i.gid = 'GEN-PRUE-BA00-0001'
  i.verificadaEn = new Date().toISOString()
  i.vencimientoDocumento = '2020-01-01'
  caducadaId = i.id
  registrar('op@prueba.local', 'identidad.aprobada', i.id, {})
  await store.guardarYa()
})

after(async () => { await servidor?.stop() })

async function conBase<T>(hacer: (base: any) => Promise<T>): Promise<T> {
  const c = new MongoClient(uri)
  await c.connect()
  try { return await hacer(c.db(BASE)) } finally { await c.close() }
}

const foto = () => conBase(async (b) => ({
  estado: await b.collection('estado').findOne({ _id: 'genesis' }),
  filasBitacora: await b.collection('bitacora').countDocuments(),
}))

function correrScript(...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, GENESIS_MONGO_URL: uri, GENESIS_MONGO_DB: BASE }
  delete env.GENESIS_DATA_FILE
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, ...args], {
    cwd: RAIZ, env, encoding: 'utf8', timeout: 60_000,
  })
}

test('sin bandera: cuenta las vencibles y no escribe nada', async () => {
  const antes = await foto()
  const r = correrScript()
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Verificadas con el documento ya vencido: 1/)
  assert.doesNotMatch(r.stdout, /--aplicar-vencidas/, 'no invita a la bandera que rompía el servicio')
  const despues = await foto()
  assert.equal(despues.filasBitacora, antes.filasBitacora)
  assert.deepEqual(despues.estado?.actualizado, antes.estado?.actualizado, 'el documento de estado no se reescribió')
})

test('--aplicar-vencidas se niega, y el servicio vivo sigue guardando', async () => {
  const antes = await foto()
  const r = correrScript('--aplicar-vencidas')
  assert.notEqual(r.status, 0, 'la bandera ya no aplica nada: tiene que fallar')
  assert.match(r.stderr, /GENESIS_VENCER_AUTO/, 'dice cuál es el camino bueno')

  const despues = await foto()
  assert.equal(despues.filasBitacora, antes.filasBitacora, 'no escribió en la bitácora')
  const enMongo = despues.estado?.datos?.identidades?.find((x: any) => x.id === caducadaId)
  assert.equal(enMongo?.estado, 'verificada', 'no cambió el estado de nadie desde fuera del servicio')

  // Y lo que importa: el servicio sigue pudiendo guardar.
  const nueva = ids.iniciar('despues@prueba.local', 'prueba')
  await store.guardarYa()
  assert.equal(saludAlmacen().ultimoVolcado?.ok, true, JSON.stringify(saludAlmacen()))
  const final = await foto()
  assert.ok(final.estado?.datos?.identidades?.some((x: any) => x.id === nueva.id), 'lo nuevo del servicio quedó guardado')
  assert.equal(final.filasBitacora, antes.filasBitacora + 1)
})

test('un almacén abierto en solo lectura se niega a volcar', async () => {
  const antes = await foto()
  const env: NodeJS.ProcessEnv = { ...process.env, GENESIS_MONGO_URL: uri, GENESIS_MONGO_DB: BASE }
  delete env.GENESIS_DATA_FILE
  delete env.NODE_TEST_CONTEXT
  const codigo = `
    const s = await import('./src/store.ts')
    await s.iniciarSoloLectura()
    s.store.todo().identidades.length = 0
    try { await s.store.guardarYa(); console.log('ESCRIBIO') } catch (e) { console.log('NEGADO ' + e.message) }
    process.exit(0)`
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', codigo], {
    cwd: RAIZ, env, encoding: 'utf8', timeout: 60_000,
  })
  assert.match(r.stdout, /NEGADO .*solo lectura/, r.stdout + r.stderr)
  const despues = await foto()
  assert.equal(despues.estado?.datos?.identidades?.length, antes.estado?.datos?.identidades?.length)
  assert.ok(antes.estado?.datos?.identidades?.length > 0)
})
