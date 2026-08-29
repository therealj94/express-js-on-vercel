// La lista de identidades del panel: que no esconda ninguna.
//
// POR QUE ESTA PRUEBA EXISTE
//
// La ruta cortaba en 300 con un `.slice(0, 300)` sin aviso, y encima devolvia
// como `total` la longitud de la lista YA CORTADA. Con mas de 300 identidades
// eso daba tres cosas a la vez:
//
//   · el tablero contaba las de verdad (d.identidades.length)
//   · la lista enseñaba 300 y decia «300»
//   · y nada explicaba la diferencia entre los dos numeros
//
// Y lo peor no era el tope: es que se ordena por ultima modificacion, asi que
// CUALES 300 se ven cambia solo. Una identidad que estaba ayer desaparece hoy
// sin que nadie la haya tocado — basta con que otras 300 se hayan movido.
// «Estan todas pero a veces no aparece», dicho por quien lo sufrio.
//
// Un tope es razonable: nadie quiere mandar diez mil fichas al navegador. Lo
// que no es razonable es que sea invisible. Asi que se comprueban las dos
// cosas: que corte, y que DIGA que corto y cuanto falta.

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-lista-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
delete process.env.GENESIS_MONGO_URL

const { store } = await import('../store.js')
const { panelRouter } = await import('../routes/panel.js')

/** Llama a la ruta sin levantar un servidor: se le da un req y un res de mentira. */
function pedir(consulta: Record<string, string> = {}): any {
  const capa = (panelRouter as any).stack.find(
    (c: any) => c.route?.path === '/identidades' && c.route.methods.get)
  assert.ok(capa, 'no encuentro la ruta /identidades')
  // El ultimo manejador es el de la ruta; los de antes son los permisos, que
  // aqui no se ejercitan — de eso ya se ocupa puerta.test.
  const manejador = capa.route.stack[capa.route.stack.length - 1].handle
  let salida: any = null
  manejador({ query: consulta } as any,
            { json: (x: any) => { salida = x } } as any,
            () => {})
  return salida
}

describe('la lista de identidades', () => {
  before(() => {
    const d = store.todo()
    d.identidades.length = 0
    // 420 identidades: por encima del tope de 300, que es donde estaba el fallo.
    for (let i = 0; i < 420; i++) {
      d.identidades.push({
        id: `id-${i}`, email: `p${i}@prueba.local`, gid: `G${i}`,
        estado: i % 7 === 0 ? 'verificada' : 'iniciada',
        nombreDeclarado: `Persona ${i}`,
        vinculos: [], pep: false,
        // La fecha crece con i: la mas nueva es la ultima.
        actualizadaEn: new Date(1700000000000 + i * 1000).toISOString(),
        creadaEn: new Date(1700000000000).toISOString(),
      } as any)
    }
  })

  test('el total son las que HAY, no las que caben en la página', () => {
    const r = pedir()
    assert.equal(r.total, 420, 'antes decia 300, que era la pagina, no el total')
    assert.equal(r.identidades.length, 300, 'la pagina sigue siendo de 300')
    assert.equal(r.hayMas, true)
  })

  test('y se puede traer el resto', () => {
    const r = pedir({ desde: '300' })
    assert.equal(r.identidades.length, 120)
    assert.equal(r.total, 420)
    assert.equal(r.hayMas, false, 'con las 420 traidas ya no falta ninguna')
  })

  test('las dos páginas juntas son TODAS, sin repetir ni saltarse ninguna', () => {
    const a = pedir().identidades.map((i: any) => i.id)
    const b = pedir({ desde: '300' }).identidades.map((i: any) => i.id)
    const juntas = new Set([...a, ...b])
    assert.equal(juntas.size, 420,
      'si hubiera solapamiento o hueco, acá saldrían menos de 420')
  })

  test('el total respeta el filtro, no cuenta el universo', () => {
    const r = pedir({ estado: 'verificada' })
    assert.equal(r.total, 60, '420 / 7 = 60')
    assert.equal(r.hayMas, false)
    assert.ok(r.identidades.every((i: any) => i.estado === 'verificada'))
  })

  test('buscar encuentra una que está MÁS ALLÁ del tope', () => {
    /* Es el caso que de verdad se sufria: la identidad 5 es de las mas viejas,
       o sea que con 420 en la base cae fuera de la primera pagina. Si el filtro
       se aplicara DESPUES de cortar —que es el error facil de cometer al meter
       paginacion— esta busqueda no encontraria nada. */
    const r = pedir({ texto: 'p5@prueba.local' })
    assert.equal(r.total, 1)
    assert.equal(r.identidades[0].email, 'p5@prueba.local')
  })

  test('una página pedida más allá del final no revienta: viene vacía', () => {
    const r = pedir({ desde: '9999' })
    assert.equal(r.identidades.length, 0)
    assert.equal(r.total, 420)
    assert.equal(r.hayMas, false)
  })

  test('un «desde» con basura se trata como cero, no como NaN', () => {
    const r = pedir({ desde: 'no-soy-un-numero' })
    assert.equal(r.desde, 0)
    assert.equal(r.identidades.length, 300)
  })
})
