/**
 * El ancla diaria de la bitácora.
 *
 * La firma HMAC impide INVENTAR entradas. No impide BORRAR las últimas y dejar
 * la cadena terminando antes de tiempo, perfectamente firmada y perfectamente
 * íntegra: una aprobación que no debió darse, un acceso que se quiere tapar, se
 * cortan las horas finales y no queda rastro dentro del sistema.
 *
 * Contra eso solo sirve dejar constancia fuera. Un hash al día acota cualquier
 * borrado a las últimas 24 horas: si el ancla de ayer dice 1.288 entradas y hoy
 * hay 1.200, la resta es la prueba. Eso es lo que se prueba acá.
 */

import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer, type Server } from 'http'

const carpeta = mkdtempSync(join(tmpdir(), 'ancla-'))
process.env.GENESIS_DATOS = join(carpeta, 'genesis.json')
process.env.GENESIS_BITACORA_CLAVE = 'una llave de bitacora larga de sobra para probar'

const { registrar } = await import('../audit/bitacora.js')
const { echarAncla, estadoAncla } = await import('../audit/ancla.js')
const { store } = await import('../store.js')

after(() => rmSync(carpeta, { recursive: true, force: true }))

describe('Ancla de la bitácora', () => {
  beforeEach(() => {
    store.reiniciar()
    delete process.env.GENESIS_ANCLA_URL
  })

  test('lleva el hash de la punta y cuántas entradas había', async () => {
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
    registrar('ana@prueba', 'identidad.aprobada', 'idn-2')

    const a = await echarAncla()
    assert.equal(a.entradas, store.todo().bitacora.length)
    assert.equal(a.hash, store.todo().bitacora.at(-1)!.hash)
    assert.equal(a.integra, true)
    assert.equal(a.firmadas, a.entradas, 'con llave puesta se firman todas')
  })

  /* LA PROPIEDAD QUE JUSTIFICA QUE ESTO EXISTA: el ancla de ayer sigue
     diciendo cuántas entradas había, aunque hoy las hayan borrado. */
  test('un borrado posterior se nota comparando con el ancla', async () => {
    for (let i = 0; i < 5; i++) registrar('ana@prueba', 'identidad.aprobada', `idn-${i}`)
    const ayer = await echarAncla()
    assert.equal(ayer.entradas, 5)

    // Alguien con la base borra las dos últimas. La cadena que queda es
    // perfectamente válida: cada eslabón cuadra y cada firma cuadra.
    store.todo().bitacora.splice(3)
    const { verificarCadena } = await import('../audit/bitacora.js')
    assert.equal(verificarCadena().integra, true, 'por dentro no se nota, y ese es el problema')

    // Pero el ancla de ayer dice otra cosa, y la resta es la prueba.
    const hoy = await echarAncla()
    assert.equal(hoy.entradas, 3)
    assert.ok(hoy.entradas < ayer.entradas, 'la bitácora encogió: eso no pasa solo')
    assert.notEqual(hoy.hash, ayer.hash)
  })

  test('queda guardada como la última echada', async () => {
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
    const a = await echarAncla()
    assert.equal(estadoAncla().ultima?.hash, a.hash)
  })

  test('sin dirección configurada no se dice que se publicó', async () => {
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
    const a = await echarAncla()
    assert.equal(a.publicada, false)
    assert.equal(a.error, undefined, 'no configurar destino no es un error')
  })

  test('con dirección configurada se manda, y se dice que se publicó', async () => {
    let recibido: any = null
    const servidor: Server = createServer((req, res) => {
      let cuerpo = ''
      req.on('data', (c) => { cuerpo += c })
      req.on('end', () => {
        recibido = JSON.parse(cuerpo)
        res.writeHead(200).end('{}')
      })
    })
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
    const puerto = (servidor.address() as any).port
    process.env.GENESIS_ANCLA_URL = `http://127.0.0.1:${puerto}/ancla`

    try {
      registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
      const a = await echarAncla()

      assert.equal(a.publicada, true)
      // Con el puerto: `host` lo incluye, y para un destino real como un bucket
      // en un puerto estándar no aparece, así que informa sin estorbar.
      assert.equal(a.destino, `127.0.0.1:${puerto}`)
      assert.equal(recibido?.hash, a.hash)
      assert.equal(recibido?.entradas, a.entradas)
    } finally {
      await new Promise<void>((r) => servidor.close(() => r()))
    }
  })

  /* Un destino caído no puede tumbar el servicio ni impedir que el hash quede
     en el registro, que es el destino que siempre existe. */
  test('si el destino falla, el ancla no lanza y avisa de que quedó a medias', async () => {
    // Puerto donde no escucha nadie.
    process.env.GENESIS_ANCLA_URL = 'http://127.0.0.1:1/ancla'
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')

    const a = await echarAncla()
    assert.equal(a.publicada, false)
    assert.ok(a.error, 'tiene que decir qué pasó')
    assert.ok(a.hash, 'y el hash tiene que estar igual: el registro no falla')
  })
})
