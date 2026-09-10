// El ancla de la bitácora, escrita en la cadena.
//
// POR QUE ESTAS PRUEBAS EXISTEN
//
// El ancla es lo que convierte «confíen en nosotros» en «compruébenlo ustedes».
// Y falla en silencio: si el destino de la cadena no sale, el servicio no se
// entera de nada —el ancla queda en el registro, que es el destino que siempre
// funciona— y nadie lo nota hasta el día que hace falta demostrar algo. Es
// decir, exactamente el día en que ya no se puede arreglar.
//
// Se prueba contra un nodo FALSO y no contra la 5550 porque una prueba que
// necesita una cadena viva y gas no se corre en cada cambio, y una prueba que
// no se corre no protege nada.
//
// Y lo que se comprueba no es «se llamó al nodo»: es que lo que llega al nodo
// se puede LEER DESDE FUERA sin nuestro código, que es la única propiedad que
// le importa a quien viene a comprobar.

import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-ancla-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
delete process.env.GENESIS_MONGO_URL

/* Una llave de juguete, fija y sin un centavo. Está aquí escrita a propósito:
   la de producción vive en `GENESIS_ANCLA_LLAVE` y no aparece en el repositorio
   ni en las pruebas. */
const LLAVE_DE_JUGUETE = '0x' + '77'.repeat(32)

const { store } = await import('../store.js')
const { registrar } = await import('../audit/bitacora.js')
const { echarAncla, renglonAncla, direccionDelAncla } = await import('../audit/ancla.js')
const { direccionDe } = await import('../audit/cadena.js')

/** Lo que el nodo falso vio pasar. */
let vistas: { metodo: string; params: any[] }[] = []

/**
 * Un nodo que contesta lo justo para firmar y mandar.
 *
 * `rechaza` simula la avería real: el nodo está, pero no acepta la transacción
 * —sin gas, nonce repetido, la cadena parada.
 */
function nodo({ rechaza = false } = {}) {
  const original = globalThis.fetch
  vistas = []
  globalThis.fetch = (async (_url: any, init: any) => {
    const c = JSON.parse(String(init?.body ?? '{}'))
    vistas.push({ metodo: c.method, params: c.params })
    const contesta = (result: any) => ({ json: async () => ({ jsonrpc: '2.0', id: 1, result }) })
    if (c.method === 'eth_getTransactionCount') return contesta('0x7') as any
    if (c.method === 'eth_gasPrice') return contesta('0x3b9aca00') as any
    if (c.method === 'eth_sendRawTransaction') {
      if (rechaza) {
        return {
          json: async () => ({
            jsonrpc: '2.0', id: 1,
            error: { code: -32000, message: 'insufficient funds for gas * price + value' },
          }),
        } as any
      }
      return contesta('0x' + 'ab'.repeat(32)) as any
    }
    return contesta(null) as any
  }) as any
  return () => { globalThis.fetch = original }
}

/** El `data` que se mandó, ya de vuelta a texto. Es lo que vería un auditor. */
function loQueLeeriaUnAuditor(): string {
  const crudo = vistas.find((v) => v.metodo === 'eth_sendRawTransaction')!.params[0]
  /* Se saca el `data` sin deshacer el RLP: se busca el prefijo del ancla dentro
     de la transacción cruda. Es lo bastante distintivo y evita meter en la
     prueba un decodificador que también podría estar mal —si la prueba y el
     código comparten el error, la prueba no sirve. */
  const bytes = Buffer.from(crudo.slice(2), 'hex')
  const texto = bytes.toString('utf8')
  const i = texto.indexOf('GENESIS-ID/ANCLA/')
  assert.ok(i >= 0, 'el renglón del ancla no viaja dentro de la transacción')
  return texto.slice(i).replace(/[^\x20-\x7e].*$/s, '')
}

describe('el ancla en la cadena', () => {
  before(() => {
    process.env.GENESIS_ANCLA_RPC = 'http://127.0.0.1:59560/'
    process.env.GENESIS_CADENA_ID = '5550'
    delete process.env.GENESIS_ANCLA_URL
  })

  beforeEach(async () => {
    store.todo().bitacora.length = 0
    store.todo().anclas.length = 0
    registrar('alguien@ejemplo.invalid', 'identidad.verificada', 'i1', { nota: 'una' })
    registrar('alguien@ejemplo.invalid', 'identidad.verificada', 'i2', { nota: 'otra' })
  })

  test('SIN LLAVE NO SE TOCA LA CADENA, y no es un fallo', async () => {
    /* Genesis ID corre hoy sin la llave puesta. Que el ancla intente firmar sin
       ella y reviente cada día llenaría los registros de errores por una
       función que sencillamente no está encendida. */
    delete process.env.GENESIS_ANCLA_LLAVE
    const soltar = nodo()
    try {
      const a = await echarAncla()
      assert.equal(vistas.length, 0, 'no se habló con el nodo')
      assert.equal(a.cadena, undefined)
      assert.equal(a.errorCadena, undefined, 'no haber encendido algo no es un error')
      assert.equal(direccionDelAncla(), null)
    } finally { soltar() }
  })

  describe('con la llave puesta', () => {
    before(() => { process.env.GENESIS_ANCLA_LLAVE = LLAVE_DE_JUGUETE })

    test('el ancla llega a la cadena y queda apuntada', async () => {
      const soltar = nodo()
      try {
        const a = await echarAncla()
        assert.equal(a.cadena?.tx, '0x' + 'ab'.repeat(32))
        assert.equal(a.cadena?.cadenaId, 5550)
        assert.equal(a.publicada, true)

        const guardada = store.todo().anclas.at(-1)!
        assert.equal(guardada.tx, a.cadena!.tx)
        assert.equal(guardada.entradas, 2)
        assert.equal(guardada.hash, a.hash)
      } finally { soltar() }
    })

    test('LO ESCRITO SE LEE SIN NUESTRO CODIGO', async () => {
      /* Es la prueba que de verdad importa. Un ancla que solo se entiende con
         nuestro decodificador no sirve para nada: quien viene a comprobar no lo
         tiene, y pedirle que se fíe de él sería volver al principio.
         Tiene que poder abrir la transacción en un explorador, pasar el `data`
         a texto y entender lo que ve. */
      const soltar = nodo()
      try {
        const a = await echarAncla()
        const leido = loQueLeeriaUnAuditor()

        assert.equal(leido, renglonAncla(a), 'lo escrito no es lo publicado')
        assert.match(leido, /^GENESIS-ID\/ANCLA\/1 /, 'no se identifica solo')
        assert.match(leido, /n=2 /, 'no dice cuántos asientos había')
        assert.ok(leido.includes(`h=${a.hash}`), 'no lleva el hash del último asiento')
        assert.match(leido, /integra=1$/)
      } finally { soltar() }
    })

    test('la cuenta de asientos es la que delata un borrado', async () => {
      /* El ancla existe para esto y para nada más: si mañana hay menos asientos
         que en el ancla de hoy, la resta es la prueba. Si el número no viajara,
         el ancla sería un hash suelto y un borrado del final quedaría tapado. */
      const soltar = nodo()
      try {
        const ayer = await echarAncla()
        store.todo().bitacora.pop()                 // alguien borra el último
        const hoy = await echarAncla()
        assert.ok(hoy.entradas < ayer.entradas,
          'un borrado del final tiene que verse en la resta de las dos anclas')
      } finally { soltar() }
    })

    test('la dirección se publica; la llave no sale por ningún lado', async () => {
      const soltar = nodo()
      try {
        const a = await echarAncla()
        assert.equal(a.cadena?.desde, direccionDe(LLAVE_DE_JUGUETE))
        assert.equal(direccionDelAncla(), a.cadena!.desde)

        /* Y la llave no puede aparecer en NADA de lo que se guarda o se
           publica. Se comprueba sobre el volcado entero y no campo a campo:
           un campo nuevo que la filtrara pasaría desapercibido en una
           comprobación por campos. */
        const todo = JSON.stringify({ ancla: a, guardadas: store.todo().anclas })
        assert.ok(!todo.includes('77'.repeat(32)), 'la llave se filtró')
        assert.ok(!todo.includes(LLAVE_DE_JUGUETE.slice(2, 34)), 'medio llave también es filtrarla')
      } finally { soltar() }
    })

    test('si el nodo rechaza, el ancla NO se da por buena', async () => {
      /* La avería silenciosa: la transacción no entra y el servicio sigue como
         si nada. Sin esto, `publicada: true` mentiría el día que importa. */
      const soltar = nodo({ rechaza: true })
      try {
        const a = await echarAncla()
        assert.equal(a.publicada, false)
        assert.equal(a.cadena, undefined)
        assert.match(a.errorCadena || '', /insufficient funds/)

        // Y queda apuntada igual, marcada como que no llegó: esconder el día en
        // que el ancla falló sería justo el silencio contra el que existe.
        const guardada = store.todo().anclas.at(-1)!
        assert.equal(guardada.tx, undefined)
        assert.equal(guardada.entradas, 2)
      } finally { soltar() }
    })

    test('que la cadena falle no tumba el servicio', async () => {
      const original = globalThis.fetch
      globalThis.fetch = (async () => { throw new Error('nodo inalcanzable') }) as any
      try {
        const a = await echarAncla()          // no lanza
        assert.equal(a.hash.length, 64, 'el ancla se calculó igual')
        assert.match(a.errorCadena || '', /inalcanzable/)
      } finally { globalThis.fetch = original }
    })
  })
})
