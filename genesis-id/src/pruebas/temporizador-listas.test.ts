/**
 * El temporizador que mantiene las listas al día.
 *
 * Lo que se prueba acá no es que baje un archivo: eso lo hace la OFAC y no
 * depende de nosotros. Se prueba la POLITICA, que es lo que decide si el
 * sistema queda seguro o inseguro cuando algo sale mal:
 *
 *   - un fallo de descarga NO puede dejar el servicio sin listas
 *   - una racha de fallos tiene que contarse y verse
 *   - una vuelta buena limpia la racha
 *   - si el tamizado continuo se para, tiene que notarse desde fuera
 *
 * Las piezas que hablan con la red se inyectan. Una prueba que dependiera de
 * que treasury.gov conteste no probaría nuestro código: probaría el de ellos.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  unaVuelta, estadoTemporizador, _reiniciarParaPruebas, type Piezas,
} from '../aml/temporizador.js'
import { cargarEnMemoria, estadoListas } from '../aml/listas.js'

const LISTA = [
  { id: 'P-1', nombre: 'IVAN PETROV', alias: ['I. PETROV'], tipo: 'persona' as const,
    programa: 'PRUEBA', lista: 'PRUEBA', nacionalidades: ['RUS'], direcciones: [] },
]

/** Unas piezas que siempre funcionan. */
const buenas = (registros = 17000): Piezas => ({
  bajar: async () => ({ registros, conAlias: registros, fuente: 'ofac-de-mentira' }),
  retamizar: () => ({ revisadas: 42, conCoincidencias: 1 }),
})

/** Unas piezas donde la descarga se cae, que es el caso que importa. */
const rotas = (mensaje = 'la OFAC no contesta'): Piezas => ({
  bajar: async () => { throw new Error(mensaje) },
  retamizar: () => { throw new Error('esto no se debería llamar nunca') },
})

describe('Temporizador de listas', () => {
  beforeEach(() => {
    _reiniciarParaPruebas()
    cargarEnMemoria(LISTA, 'prueba')
  })

  test('una vuelta buena deja el resultado a la vista', async () => {
    const r = await unaVuelta('prueba', buenas())
    assert.equal(r.ok, true)
    assert.equal(r.registros, 17000)
    assert.equal(r.revisadas, 42)

    const e = estadoTemporizador()
    assert.equal(e.fallosSeguidos, 0)
    assert.equal(e.ultimoError, null)
    assert.ok(e.ultimaCorrida, 'tiene que quedar la marca de cuándo corrió')
  })

  /* ESTA ES LA IMPORTANTE.
     Si la descarga falla y el temporizador dejara las listas vacías, el motor
     pasaría a «sin tamizar» y bloquearía a todo el padrón. Unas listas de ayer
     sirven; ninguna lista no sirve. */
  test('si la descarga falla, las listas que ya estaban siguen ahí', async () => {
    const antes = estadoListas().registros
    assert.equal(antes, 1)

    const r = await unaVuelta('prueba', rotas())
    assert.equal(r.ok, false)
    assert.match(String(r.error), /no contesta/)

    assert.equal(estadoListas().registros, antes, 'no se puede haber perdido ninguna ficha')
    assert.equal(estadoListas().cargadas, true)
  })

  test('los fallos seguidos se cuentan, que es lo que distingue una caída de una avería', async () => {
    await unaVuelta('prueba', rotas())
    assert.equal(estadoTemporizador().fallosSeguidos, 1)

    await unaVuelta('prueba', rotas())
    await unaVuelta('prueba', rotas())
    assert.equal(estadoTemporizador().fallosSeguidos, 3)
    assert.match(String(estadoTemporizador().ultimoError), /no contesta/)
  })

  test('una vuelta buena limpia la racha de fallos', async () => {
    await unaVuelta('prueba', rotas())
    await unaVuelta('prueba', rotas())
    assert.equal(estadoTemporizador().fallosSeguidos, 2)

    await unaVuelta('prueba', buenas())
    assert.equal(estadoTemporizador().fallosSeguidos, 0)
    assert.equal(estadoTemporizador().ultimoError, null)
  })

  test('el intento queda marcado aunque falle, no solo los éxitos', async () => {
    await unaVuelta('prueba', rotas())
    const e = estadoTemporizador()
    assert.ok(e.ultimoIntento, 'un intento fallido también es un intento')
    assert.equal(e.ultimaCorrida, null, 'pero no cuenta como vuelta completada')
  })

  test('dos vueltas a la vez: la segunda se rechaza en vez de duplicar el trabajo', async () => {
    let sueltoLaDescarga: () => void = () => {}
    const lentas: Piezas = {
      bajar: async () => {
        await new Promise<void>((r) => { sueltoLaDescarga = r })
        return { registros: 1, conAlias: 0, fuente: 'lenta' }
      },
      retamizar: () => ({ revisadas: 0, conCoincidencias: 0 }),
    }

    const primera = unaVuelta('prueba', lentas)
    await new Promise((r) => setTimeout(r, 20))

    const segunda = await unaVuelta('prueba', buenas())
    assert.equal(segunda.saltada, true, 'la segunda no puede entrar mientras corre la primera')

    sueltoLaDescarga()
    assert.equal((await primera).ok, true)
  })

  test('sin encender, no se dice que esté atrasado', () => {
    const e = estadoTemporizador()
    assert.equal(e.encendido, false)
    assert.equal(e.atrasado, false, 'un temporizador apagado no está atrasado, está apagado')
    assert.equal(e.nuncaCorrio, false)
  })
})
