/**
 * La firma de la bitácora.
 *
 * El encadenado por hash detecta a un extraño. NO detectaba a alguien de dentro:
 * quien tuviera permiso de escritura sobre Mongo podía borrar entradas,
 * reescribir las siguientes y recalcular todos los hashes, y la cadena
 * verificaba entera y limpia. El de dentro es justo el riesgo que un regulador
 * quiere ver cubierto.
 *
 * Lo que se prueba acá es exactamente eso: que el ataque que antes pasaba
 * inadvertido ahora se ve. Cada prueba MONTA el ataque y comprueba que salta.
 */

import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'bitacora-'))
process.env.GENESIS_DATOS = join(carpeta, 'genesis.json')
process.env.GENESIS_BITACORA_CLAVE = 'una llave de bitacora larga de sobra para scrypt'

const { registrar, verificarCadena } = await import('../audit/bitacora.js')
const { store } = await import('../store.js')
const { olvidarClaveBitacora, eslabon } = await import('../lib/cripto.js')

const LLAVE = 'una llave de bitacora larga de sobra para scrypt'

after(() => rmSync(carpeta, { recursive: true, force: true }))

const conLlave = () => { process.env.GENESIS_BITACORA_CLAVE = LLAVE; olvidarClaveBitacora() }
const sinLlave = () => { delete process.env.GENESIS_BITACORA_CLAVE; olvidarClaveBitacora() }

/** Rehace la cadena desde `desde`, como haría quien tuviera la base. */
function recalcularCadena(desde = 0) {
  const b = store.todo().bitacora
  for (let i = desde; i < b.length; i++) {
    const anterior = i === 0 ? '0'.repeat(64) : b[i - 1].hash
    const contenido = {
      fecha: b[i].fecha, actor: b[i].actor, accion: b[i].accion,
      objeto: b[i].objeto, detalle: b[i].detalle,
    }
    b[i].hashAnterior = anterior
    b[i].hash = eslabon(anterior, contenido)
  }
}

describe('Bitácora firmada', () => {
  beforeEach(() => {
    store.reiniciar()
    conLlave()
  })

  test('con llave puesta, cada entrada sale firmada', () => {
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
    registrar('ana@prueba', 'identidad.aprobada', 'idn-2')

    const r = verificarCadena()
    assert.equal(r.integra, true)
    assert.equal(r.firmas.hayLlave, true)
    assert.equal(r.firmas.firmadas, 2)
    assert.equal(r.firmas.sinFirmar, 0)
    assert.equal(r.firmas.firmaRotaEn, null)
  })

  /* EL ATAQUE QUE ANTES PASABA.
     Alguien con la base cambia el actor de una aprobación y rehace todos los
     hashes posteriores. Sin firma, `verificarCadena` decía «íntegra». */
  test('quien reescribe la base y recalcula los hashes ya no cuela', () => {
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
    registrar('ana@prueba', 'identidad.aprobada', 'idn-2')
    registrar('ana@prueba', 'identidad.aprobada', 'idn-3')

    // El ataque: cambiar quién aprobó, y dejar la cadena cuadrando.
    store.todo().bitacora[1].actor = 'quien-no-fue@prueba'
    recalcularCadena(1)

    const r = verificarCadena()
    assert.equal(r.integra, false, 'la cadena reescrita tiene que salir NO íntegra')
    assert.equal(r.firmas.firmaRotaEn, 1, 'y tiene que señalar la entrada tocada')
  })

  /* EL TRUCO OBVIO PARA ESQUIVAR LA FIRMA.
     Si no puede falsificar firmas, las quita todas para que las entradas
     parezcan viejas y así poder recalcular a gusto. */
  test('quitar las firmas para poder reescribir tampoco cuela', () => {
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
    registrar('ana@prueba', 'identidad.aprobada', 'idn-2')
    registrar('ana@prueba', 'identidad.aprobada', 'idn-3')

    // El ataque: borrar la firma de la segunda en adelante y recalcular.
    for (const e of store.todo().bitacora.slice(1)) delete e.firma
    store.todo().bitacora[1].actor = 'quien-no-fue@prueba'
    recalcularCadena(1)

    const r = verificarCadena()
    assert.equal(r.integra, false, 'una entrada sin firmar detrás de una firmada es delito')
    assert.equal(r.firmas.degradadaEn, 1)
  })

  /* Y LA VUELTA: no puede saltar con lo que es legítimo.
     Las entradas escritas antes de que existiera la llave no llevan firma, y
     eso no es manipulación: es historia. */
  test('las entradas viejas sin firma no se cuentan como manipulación', () => {
    sinLlave()
    registrar('ana@prueba', 'identidad.aprobada', 'vieja-1')
    registrar('ana@prueba', 'identidad.aprobada', 'vieja-2')

    conLlave()
    registrar('ana@prueba', 'identidad.aprobada', 'nueva-1')

    const r = verificarCadena()
    assert.equal(r.integra, true, 'lo viejo sin firmar es legítimo')
    assert.equal(r.firmas.sinFirmar, 2)
    assert.equal(r.firmas.firmadas, 1)
    assert.equal(r.firmas.degradadaEn, null, 'lo sin firmar va ANTES, no después')
  })

  test('sin llave no se juzgan las firmas, y se dice que no se pudo', () => {
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
    sinLlave()

    const r = verificarCadena()
    assert.equal(r.firmas.hayLlave, false)
    assert.equal(r.firmas.firmaRotaEn, null, 'sin llave no se puede decir que una firma esté rota')
    assert.equal(r.integra, true, 'y no se puede acusar de nada')
  })

  test('una llave distinta no valida las firmas de la buena', () => {
    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')

    process.env.GENESIS_BITACORA_CLAVE = 'otra llave completamente distinta y larga'
    olvidarClaveBitacora()

    const r = verificarCadena()
    assert.equal(r.integra, false)
    assert.equal(r.firmas.firmaRotaEn, 0)
  })

  test('una llave demasiado corta no se acepta: firmar a medias es peor que no firmar', () => {
    process.env.GENESIS_BITACORA_CLAVE = 'corta'
    olvidarClaveBitacora()

    registrar('ana@prueba', 'identidad.aprobada', 'idn-1')
    const r = verificarCadena()
    assert.equal(r.firmas.hayLlave, false, 'cinco caracteres no son una llave')
    assert.equal(r.firmas.firmadas, 0, 'y no se puede haber firmado nada con ella')
  })
})
