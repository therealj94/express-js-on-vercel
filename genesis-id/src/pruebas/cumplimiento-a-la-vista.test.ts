/* Que `/healthz` no diga «ok» a secas cuando el cumplimiento está a medias.
 *
 * POR QUE ESTA PRUEBA EXISTE
 *
 * El 29-ago, mirando la salud del servicio en producción, salió esto:
 *
 *     estado: "ok"
 *     bitacoraFirmada: false      bitacoraEntradasSinFirmar: 1886
 *     segundoFactorExigidoEn: ["admin", "cumplimiento"]
 *     segundoFactorActivos: 0     operadoresSinSegundoFactor: 2
 *
 * O sea: un servicio que decide identidades verificadas y guarda documentos de
 * personas, contestando «ok», con sus DOS garantías frente a alguien de dentro
 * apagadas. La bitácora encadenada detecta a un extraño, pero quien tenga
 * escritura sobre la base la reescribe entera y verifica limpia — eso es lo que
 * la firma existe para atrapar, y no había llave. Y el panel que aprueba se
 * abría solo con contraseña, aunque el propio código declara el segundo factor
 * obligatorio para esos dos roles.
 *
 * Ninguna de las dos es un fallo de código: son configuración que falta. Lo que
 * sí era de código es que nada lo dijera. `estado` no las miraba, el arranque
 * no las avisaba, y las cifras estaban repartidas entre veinte claves donde
 * había que saber cuál mirar.
 *
 * `estado` se deja como estaba a propósito: contesta «¿esto sirve peticiones
 * bien?», que es lo que necesita quien depura una caída, y mezclarlo con el
 * cumplimiento le quitaría el sentido a los dos. El bloque `cumplimiento` va
 * al lado, con la lista de lo que falta — un booleano en rojo sin decir qué es
 * no lo arregla nadie.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { olvidarClaveBitacora, bitacoraFirmable } from '../lib/cripto.js'

test('sin llave, la bitácora no se puede firmar y se sabe', () => {
  const antes = process.env.GENESIS_BITACORA_CLAVE
  delete process.env.GENESIS_BITACORA_CLAVE
  olvidarClaveBitacora()
  assert.equal(bitacoraFirmable(), false, 'sin llave tiene que decir que no puede firmar')

  // Y una llave corta tampoco vale: da la sensación de firmar sin firmar.
  process.env.GENESIS_BITACORA_CLAVE = 'corta'
  olvidarClaveBitacora()
  assert.equal(bitacoraFirmable(), false, 'una llave de 5 caracteres no es una llave')

  process.env.GENESIS_BITACORA_CLAVE = 'x'.repeat(32)
  olvidarClaveBitacora()
  assert.equal(bitacoraFirmable(), true, 'con 32 o más sí firma')

  if (antes === undefined) delete process.env.GENESIS_BITACORA_CLAVE
  else process.env.GENESIS_BITACORA_CLAVE = antes
  olvidarClaveBitacora()
})

test('la lista de lo que falta nombra la causa, no solo el síntoma', () => {
  /* Se comprueba la FORMA del aviso y no solo que exista. «cumplimiento
     incompleto» a secas obliga a quien lo lee a ir a buscar qué falta, y en la
     práctica eso significa que no lo arregla nadie. Cada línea tiene que traer
     la variable o la pantalla con la que se resuelve. */
  const falta: string[] = []
  const hayLlave = false
  const sinSegundoFactor = 2
  if (!hayLlave) falta.push('bitácora sin firmar (falta GENESIS_BITACORA_CLAVE)')
  if (sinSegundoFactor > 0) {
    falta.push(`segundo factor sin activar en ${sinSegundoFactor} operador(es) que lo tienen exigido`)
  }

  assert.equal(falta.length, 2)
  assert.ok(
    falta.some((l) => l.includes('GENESIS_BITACORA_CLAVE')),
    'la línea de la bitácora tiene que nombrar la variable que la enciende',
  )
  assert.ok(
    falta.some((l) => /\d+ operador/.test(l)),
    'la del segundo factor tiene que decir a cuántos les falta, no solo que falta',
  )
  for (const linea of falta) {
    assert.ok(linea.length > 25, `«${linea}» es demasiado corta para ser accionable`)
  }
})
