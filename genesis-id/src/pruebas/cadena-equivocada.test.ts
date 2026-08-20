/* Un saldo de otra cadena no se guarda. Nunca.
 *
 *   npx tsx --test src/pruebas/cadena-equivocada.test.ts
 *
 * POR QUE EXISTE ESTA PRUEBA
 *
 * El 20-ago el panel enseñaba 39.998,40958 ORIGEN en una billetera que en la
 * cadena tenía 0,983. El saldo de la cadena era el correcto —la consolidación
 * dejó 1 ORIGEN y el resto se fue en gasolina—; lo que estaba mal era la
 * pantalla, que arrastraba una lectura vieja hecha contra la 8532.
 *
 * Lo grave no fue el número, fue que era INVISIBLE: bien formado, plausible, y
 * sin ninguna forma de saber de cuándo era ni de dónde salía. Un operador
 * aprobando a una persona mirando eso decide con datos de otra cadena, y su
 * nombre queda en la bitácora.
 *
 * Se prueban las tres cosas que lo impiden:
 *   1. si el nodo contesta otra cadena, no se lee ni un saldo;
 *   2. si el nodo no contesta, tampoco — «no lo sé» no es «tiene cero»;
 *   3. una lectura a medias no se guarda encima de una buena.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const RPC_FALSO = 'http://127.0.0.1:59559/'

/** Un nodo de mentira que contesta lo que se le diga. */
function nodo(chainId: string | null, opciones: { saldosFallan?: boolean } = {}) {
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: any, init: any) => {
    const cuerpo = JSON.parse(String(init?.body ?? '{}'))
    if (!Array.isArray(cuerpo) && cuerpo.method === 'eth_chainId') {
      if (chainId === null) throw new Error('nodo inalcanzable')
      return { json: async () => ({ jsonrpc: '2.0', id: 1, result: chainId }) } as any
    }
    if (Array.isArray(cuerpo)) {
      if (opciones.saldosFallan) throw new Error('lote rechazado')
      return {
        json: async () => cuerpo.map((c: any) => ({
          jsonrpc: '2.0', id: c.id,
          result: '0x' + (10n ** 18n).toString(16),   // 1 unidad de cada moneda
        })),
      } as any
    }
    return { json: async () => ({}) } as any
  }) as any
  return () => { globalThis.fetch = original }
}

const cargar = async () => {
  process.env.GENESIS_RPC_URL = RPC_FALSO
  process.env.GENESIS_CADENA_ID = '5550'
  // Se recarga el módulo en cada prueba: lee las variables al importarse.
  return await import(`../directorio/monedas.js?t=${Math.random()}`)
}

const UNA = '0x3ef161e1112126c39c841b46cd81c6bce42156d6'

test('la cadena correcta sí se lee', async () => {
  const soltar = nodo('0x15ae')            // 5550
  try {
    const { saldosDe } = await cargar()
    const r = await saldosDe([UNA])
    assert.equal(r.cadena, 5550)
    assert.equal(r.cadenaCorrecta, true)
    assert.ok(r.completas.has(UNA), 'la dirección se leyó entera')
    assert.ok(Object.keys(r.saldos.get(UNA)!).length > 0, 'trae saldos')
    assert.ok(r.leidoEn, 'trae la fecha de lectura')
  } finally { soltar() }
})

test('otra cadena NO se lee: ni un saldo, y se avisa', async () => {
  const soltar = nodo('0x2154')            // 8532, la vieja
  try {
    const { saldosDe } = await cargar()
    const r = await saldosDe([UNA])
    assert.equal(r.cadena, 8532)
    assert.equal(r.cadenaCorrecta, false, 'tiene que quedar marcada como equivocada')
    assert.equal(r.completas.size, 0, 'NINGUNA dirección se puede guardar')
    assert.deepEqual(r.saldos.get(UNA), {}, 'no se trae ni un número de la otra cadena')
  } finally { soltar() }
})

test('un nodo que no contesta tampoco deja guardar nada', async () => {
  const soltar = nodo(null)
  try {
    const { saldosDe } = await cargar()
    const r = await saldosDe([UNA])
    assert.equal(r.cadena, null)
    assert.equal(r.cadenaCorrecta, false)
    assert.equal(r.completas.size, 0)
  } finally { soltar() }
})

test('una lectura a medias no se puede guardar encima de una buena', async () => {
  // La cadena es la correcta, pero los lotes de saldos fallan. Antes esto
  // devolvía `{}` y quien llamaba lo escribía encima: la persona pasaba a
  // verse con cero, que es una mentira distinta pero igual de peligrosa.
  const soltar = nodo('0x15ae', { saldosFallan: true })
  try {
    const { saldosDe } = await cargar()
    const r = await saldosDe([UNA])
    assert.equal(r.cadenaCorrecta, true, 'la cadena sí era la buena')
    assert.ok(r.fallidas > 0, 'se contaron las llamadas perdidas')
    assert.equal(r.completas.size, 0, 'pero nada se puede guardar')
  } finally { soltar() }
})

test('la emisión de otra cadena queda en «no lo sé», no en cero', async () => {
  const soltar = nodo('0x2154')
  try {
    const { emisiones } = await cargar()
    const e = await emisiones()
    const valores = Object.values(e)
    assert.ok(valores.length > 0)
    assert.ok(valores.every((v) => v === null),
      'todas en null: un cero se leería como «nadie tiene» y sería falso')
  } finally { soltar() }
})
