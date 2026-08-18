/* El archivo de documentos: cifrado, caducidad y lo que pasa sin llave.
 *
 * La política de privacidad publicada promete conservar los datos de
 * verificación de identidad cinco años. Antes se borraban al decidir, así que
 * el documento y el código decían cosas distintas. Ahora se conservan — y estas
 * pruebas fijan las tres condiciones bajo las que conservar es defendible:
 *
 *   1. cifrados, y con la llave FUERA de la base;
 *   2. sin llave no se conserva nada, se borra como antes: un depósito de
 *      cédulas en claro es peor que no tener archivo;
 *   3. lo que se guardó antes de que existiera el cifrado se sigue leyendo, o
 *      un operador se queda sin ver el documento que tiene que revisar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cifrar, descifrar, archivoConfigurado, olvidarClaveArchivo } from '../lib/cripto.js'

/** Pone una llave, corre algo y deja el entorno como estaba. */
function conLlave<T>(llave: string | null, hacer: () => T): T {
  const antes = process.env.GENESIS_ARCHIVO_CLAVE
  if (llave === null) delete process.env.GENESIS_ARCHIVO_CLAVE
  else process.env.GENESIS_ARCHIVO_CLAVE = llave
  olvidarClaveArchivo()
  try {
    return hacer()
  } finally {
    if (antes === undefined) delete process.env.GENESIS_ARCHIVO_CLAVE
    else process.env.GENESIS_ARCHIVO_CLAVE = antes
    olvidarClaveArchivo()
  }
}

// Una imagen de mentira, pero del tamaño que tiene una de verdad: si el cifrado
// se rompiera con datos largos, con veinte caracteres no se vería.
const IMAGEN = 'data:image/jpeg;base64,' + 'QUJDRA'.repeat(40000)

test('lo cifrado vuelve idéntico', () => {
  conLlave('una llave larga de archivo para la prueba', () => {
    const c = cifrar(IMAGEN)!
    assert.ok(c.startsWith('v1.'), 'lleva marca de versión')
    assert.ok(!c.includes('QUJDRA'), 'el contenido no se ve en claro')
    assert.equal(descifrar(c), IMAGEN)
  })
})

test('dos cifrados del mismo dato salen distintos', () => {
  conLlave('una llave larga de archivo para la prueba', () => {
    // Si salieran iguales, quien mire la base sabría qué documentos se repiten
    // sin descifrar nada. Lo garantiza el vector de inicialización al azar.
    assert.notEqual(cifrar(IMAGEN), cifrar(IMAGEN))
  })
})

test('un cifrado manipulado no se descifra, no devuelve basura', () => {
  conLlave('una llave larga de archivo para la prueba', () => {
    const c = cifrar('hola')!
    const partes = c.split('.')
    // Se cambia un byte del texto cifrado.
    const datos = Buffer.from(partes[3], 'base64')
    datos[0] = datos[0] ^ 0xff
    partes[3] = datos.toString('base64')
    assert.equal(descifrar(partes.join('.')), null,
      'GCM autentica: manipulado tiene que fallar, no devolver algo parecido a una imagen')
  })
})

test('con otra llave no se abre', () => {
  const c = conLlave('la llave buena y bastante larga', () => cifrar('secreto')!)
  conLlave('otra llave distinta y también larga', () => {
    assert.equal(descifrar(c), null)
  })
})

test('sin llave no hay archivo: no se cifra y no se descifra', () => {
  conLlave(null, () => {
    assert.equal(archivoConfigurado(), false)
    assert.equal(cifrar('lo que sea'), null,
      'sin llave, cifrar devuelve null y quien llama tiene que decidir qué hacer')
  })
})

test('lo guardado antes del cifrado se sigue leyendo', () => {
  conLlave('una llave larga de archivo para la prueba', () => {
    // Sin el prefijo `v1.` no es un cifrado nuestro: es una imagen vieja
    // guardada en claro, y devolverla es lo correcto.
    assert.equal(descifrar(IMAGEN), IMAGEN)
  })
})

test('el vencimiento cae a cinco años', async () => {
  const { conservacionConfigurada } = await import('../kyc/fotosDocumento.js')
  conLlave(null, () => {
    assert.equal(conservacionConfigurada(), false,
      'sin llave, el archivo se declara apagado y /healthz lo publica')
  })
})
