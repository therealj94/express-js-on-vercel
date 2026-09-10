/* La bitácora tiene que sobrevivir al viaje de ida y vuelta por la base.
 *
 * EL FALLO QUE ESTAS PRUEBAS FIJAN
 *
 * `/healthz` de producción decía `bitacoraIntegra: false` con `bitacoraSellos: 0`:
 * la cadena de la bitácora rota, y nunca sellada. No era manipulación. Era esto:
 *
 *   · `registrar()` calcula el hash sobre el contenido con `JSON.stringify`.
 *   · `JSON.stringify` BORRA las claves cuyo valor es `undefined`.
 *   · el driver de MongoDB, en cambio, las guarda como `null` (su opción
 *     `ignoreUndefined` viene desactivada).
 *
 * Y hay sitios que meten `undefined` sin querer, por ejemplo al aprobar:
 *
 *     riesgo: identidad.riesgo?.nivel        // undefined si no hay riesgo
 *
 * Así que el hash se calculaba sobre `{}` y, tras reiniciar el servicio, se
 * recalculaba sobre `{"riesgo":null}`. Distinto contenido, distinto hash, cadena
 * rota — y rota justo en el registro que un auditor viene a mirar.
 *
 * Lo peor es que el síntoma aparecía SOLO tras un reinicio: en memoria todo
 * cuadraba. Por eso hace falta una prueba que haga el viaje a propósito.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { registrar, verificarCadena } from '../audit/bitacora.js'
import { store } from '../store.js'

/** Imita lo que le pasa al estado al ir a MongoDB y volver.
 *
 *  No es JSON.parse(JSON.stringify(x)) —eso borraría los `undefined` y la
 *  prueba pasaría sin arreglar nada—. BSON los convierte en `null`, que es
 *  justamente la diferencia que rompía la cadena. */
function viajePorMongo<T>(x: T): T {
  const convertir = (v: any): any => {
    if (v === undefined) return null
    if (Array.isArray(v)) return v.map(convertir)
    if (v && typeof v === 'object') {
      const salida: any = {}
      for (const k of Object.keys(v)) salida[k] = convertir(v[k])
      return salida
    }
    return v
  }
  return convertir(x)
}

test('la cadena aguanta el viaje por la base con detalles que llevan undefined', () => {
  const bitacora = store.todo().bitacora
  const desde = bitacora.length

  // Un detalle como el de aprobar una identidad sin riesgo calculado: dos
  // claves con undefined, que es exactamente el caso real.
  registrar('prueba@orden', 'identidad.aprobada', 'idn_x', {
    gid: undefined,
    motivo: 'documento y rostro verificados',
    riesgo: undefined,
    puntuacion: undefined,
  })
  registrar('prueba@orden', 'identidad.siguiente', 'idn_x', { nota: 'la de después' })

  assert.equal(verificarCadena().integra, true, 'en memoria la cadena tiene que cuadrar')

  // Ahora el viaje: se sustituyen las entradas nuevas por su versión «como
  // vuelve de Mongo» y se vuelve a comprobar.
  for (let i = desde; i < bitacora.length; i++) bitacora[i] = viajePorMongo(bitacora[i])

  const estado = verificarCadena()
  assert.equal(estado.integra, true,
    `la cadena se rompió al volver de la base, en la entrada ${estado.rotaEn}`)
})

test('un detalle con undefined no deja la clave puesta', () => {
  const bitacora = store.todo().bitacora
  const e = registrar('prueba@orden', 'prueba.limpieza', 'x', {
    presente: 1, ausente: undefined, dentro: { tambienAusente: undefined, hay: 'sí' },
  })
  assert.deepEqual(e.detalle, { presente: 1, dentro: { hay: 'sí' } },
    'las claves con undefined tienen que desaparecer, no quedarse')
  assert.equal(bitacora[bitacora.length - 1].id, e.id)
})
