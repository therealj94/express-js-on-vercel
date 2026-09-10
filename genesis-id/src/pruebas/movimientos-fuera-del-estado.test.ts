/* Los movimientos viven fuera del documento de estado.
 *
 *   npx tsx --test src/pruebas/movimientos-fuera-del-estado.test.ts
 *
 * POR QUE EXISTE
 *
 * Es la tercera cosa que hay que sacar del documento de estado —después de las
 * fotos y la bitácora— y la peor de las tres: los movimientos no crecen con
 * cuánta gente hay sino con cuánto opera, así que no tienen techo. Al pasar los
 * 16 MB no falla el monitoreo: falla el guardado de TODO, mientras el servicio
 * sigue contestando 200 y los datos viven en memoria hasta el siguiente
 * reinicio. Es la forma exacta de perder una identidad aprobada sin enterarse.
 *
 * Se prueba lo que puede volver a romperse: que un lote reintentado no duplique
 * nada, que las reglas sigan viendo TODO el historial de la persona (una de
 * ellas mira la primera operación de la cuenta), que los filtros del tablero
 * no se lleven movimientos de otra gente por delante, y que el estado quede sin
 * movimientos dentro.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-movs-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
delete process.env.GENESIS_MONGO_URL

const {
  guardarMovimientos, movimientosDe, movimientosPorIds,
  resumenMovimientos, buscarMovimientos,
} = await import('../aml/almacenMovimientos.js')

const mov = (id: string, gid: string, extra: Partial<any> = {}) => ({
  id, gid,
  direccion: 'salida' as const,
  contraparte: '0xdestino',
  monto: 10,
  activo: 'ORIGEN',
  montoUsd: 100,
  fecha: '2026-08-01T12:00:00.000Z',
  app: 'veta-wallet',
  paisContraparte: null,
  hash: '0xabc' + id,
  ...extra,
})

test('un lote reintentado no duplica nada', async () => {
  const g = 'GID-T-0001'
  assert.equal(await guardarMovimientos([mov('m1', g), mov('m2', g)]), 2)
  // El mismo lote otra vez: la red se cortó y el cliente reintenta entero.
  await guardarMovimientos([mov('m1', g), mov('m2', g), mov('m3', g)])
  const suyos = await movimientosDe(g)
  assert.equal(suyos.length, 3, 'los repetidos se descartan, el nuevo entra')
})

test('las reglas ven TODO el historial, no solo la ventana', async () => {
  // La regla de «cuenta nueva con volumen alto» necesita la PRIMERA operación.
  const g = 'GID-T-0002'
  await guardarMovimientos([
    mov('v1', g, { fecha: '2024-01-01T00:00:00.000Z' }),
    mov('v2', g, { fecha: '2026-08-15T00:00:00.000Z' }),
  ])
  const suyos = await movimientosDe(g)
  assert.equal(suyos.length, 2)
  assert.equal(suyos[0].id, 'v1', 'llegan ordenados de más viejo a más nuevo')
})

test('los movimientos de una persona no se mezclan con los de otra', async () => {
  await guardarMovimientos([mov('x1', 'GID-T-0003'), mov('y1', 'GID-T-0004')])
  const a = await movimientosDe('GID-T-0003')
  assert.ok(a.every((m) => m.gid === 'GID-T-0003'))
  assert.ok(!a.some((m) => m.id === 'y1'))
})

test('el tablero filtra por app, dirección y monto sin llevarse nada ajeno', async () => {
  const g = 'GID-T-0005'
  await guardarMovimientos([
    mov('f1', g, { app: 'ordenex', direccion: 'entrada', montoUsd: 5000 }),
    mov('f2', g, { app: 'ordenex', direccion: 'salida', montoUsd: 50 }),
    mov('f3', g, { app: 'veta-wallet', direccion: 'salida', montoUsd: 900 }),
  ])
  const porApp = await buscarMovimientos({ gid: g, app: 'ordenex' })
  assert.equal(porApp.total, 2)
  const entradas = await buscarMovimientos({ gid: g, direccion: 'entrada' })
  assert.equal(entradas.total, 1)
  assert.equal(entradas.movimientos[0].id, 'f1')
  const gordos = await buscarMovimientos({ gid: g, montoMin: 800 })
  assert.equal(gordos.total, 2, 'el de 50 queda fuera; los de 5000 y 900 entran')
})

test('el reparto por app cuadra con el total', async () => {
  const g = 'GID-T-0006'
  await guardarMovimientos([
    mov('r1', g, { app: 'ordenex', montoUsd: 100 }),
    mov('r2', g, { app: 'mytokenpay', montoUsd: 200 }),
  ])
  const p = await buscarMovimientos({ gid: g })
  assert.equal(p.volumenUsd, 300)
  assert.equal(p.porApp.reduce((s, a) => s + a.n, 0), p.total)
  assert.equal(p.porApp.reduce((s, a) => s + a.volumenUsd, 0), p.volumenUsd)
})

test('se pueden pedir los que dispararon una alerta', async () => {
  const g = 'GID-T-0007'
  await guardarMovimientos([mov('a1', g), mov('a2', g), mov('a3', g)])
  const dos = await movimientosPorIds(['a1', 'a3'])
  assert.deepEqual(dos.map((m) => m.id).sort(), ['a1', 'a3'])
  assert.deepEqual(await movimientosPorIds([]), [], 'sin ids, sin consulta')
})

test('la búsqueda por texto escapa lo que escriba el operador', async () => {
  const g = 'GID-T-0008'
  await guardarMovimientos([mov('t1', g, { contraparte: '0xCAFE' })])
  // Un punto y un asterisco sueltos no pueden convertirse en un comodín.
  const nada = await buscarMovimientos({ gid: g, texto: '.*' })
  assert.equal(nada.total, 0, 'un comodín escrito a mano no debe traer todo')
  const algo = await buscarMovimientos({ gid: g, texto: 'cafe' })
  assert.equal(algo.total, 1, 'y la búsqueda normal sigue funcionando')
})

test('el resumen cuenta todo lo guardado', async () => {
  const r = await resumenMovimientos()
  assert.ok(r.total > 0)
  assert.ok(r.volumenUsd > 0)
})

test('el documento de estado no lleva movimientos dentro', async () => {
  const { store } = await import('../store.js')
  const dentro = (store.todo() as any).movimientos
  assert.ok(!dentro || dentro.length === 0,
    'si esto falla, los movimientos volvieron al estado y los 16 MB vuelven a estar en juego')
})
