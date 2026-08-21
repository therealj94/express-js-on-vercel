/**
 * El retrato de la credencial, cifrado.
 *
 * Estaba guardado en claro mientras esa MISMA CARA —el fotograma del cotejo
 * biométrico— sí se cifraba en la colección de documentos. La misma imagen con
 * dos tratos distintos, y el peor de los dos era el que se quedaba para siempre,
 * porque el retrato no caduca.
 *
 * Lo que se prueba acá:
 *   - lo nuevo se guarda cifrado, no en claro
 *   - lo viejo, guardado en claro antes del cambio, se sigue leyendo
 *   - la migración de arranque cierra lo viejo sin estropearlo
 *   - sin llave configurada nada se rompe: se comporta como antes
 *
 * Corre sobre el motor de archivo, que es el que se puede montar sin Mongo. La
 * lógica de cifrado es la misma en los dos caminos.
 */

import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'retrato-'))
process.env.GENESIS_DATOS = join(carpeta, 'genesis.json')
process.env.GENESIS_ARCHIVO_CLAVE = 'una llave de prueba bien larga para scrypt'

const { guardarFoto, leerFoto, borrarFoto, cifrarRetratosEnClaro } =
  await import('../kyc/fotoCredencial.js')
const { archivoAparte } = await import('../store.js')
const { olvidarClaveArchivo } = await import('../lib/cripto.js')

/** Un PNG diminuto de verdad, en base64. */
const CARA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const ruta = () => archivoAparte('fotosCredencial')
const crudo = (): Record<string, string> => {
  try { return JSON.parse(readFileSync(ruta(), 'utf8')) } catch { return {} }
}
const escribirCrudo = (m: Record<string, string>) => {
  mkdirSync(dirname(ruta()), { recursive: true })
  writeFileSync(ruta(), JSON.stringify(m))
}

after(() => rmSync(carpeta, { recursive: true, force: true }))

describe('Retrato de credencial', () => {
  beforeEach(() => {
    escribirCrudo({})
    process.env.GENESIS_ARCHIVO_CLAVE = 'una llave de prueba bien larga para scrypt'
    olvidarClaveArchivo()
  })

  test('lo que se guarda hoy queda cifrado en el disco, no en claro', async () => {
    await guardarFoto('idn-1', CARA)

    const guardado = crudo()['idn-1']
    assert.ok(guardado, 'algo tiene que haberse escrito')
    assert.ok(guardado.startsWith('v1.'), 'tiene que llevar el prefijo del cifrado')
    assert.ok(!guardado.includes('iVBORw0KGgo'), 'la imagen no puede aparecer legible en el disco')
  })

  test('y se lee de vuelta idéntica', async () => {
    await guardarFoto('idn-1', CARA)
    assert.equal(await leerFoto('idn-1'), CARA)
  })

  /* La que evita que el arreglo rompa lo que ya estaba: en la base hay retratos
     guardados antes de que existiera el cifrado. Negarse a leerlos no los
     protege, y sí deja sin cara a gente ya verificada. */
  test('un retrato viejo, guardado en claro, se sigue viendo', async () => {
    escribirCrudo({ 'idn-viejo': CARA })
    assert.equal(await leerFoto('idn-viejo'), CARA)
  })

  test('la migración de arranque cifra los viejos sin estropearlos', async () => {
    escribirCrudo({ 'idn-viejo': CARA, 'idn-otro': CARA })

    const r = await cifrarRetratosEnClaro()
    assert.equal(r.cifrados, 2)
    assert.equal(r.fallidos, 0)

    for (const id of ['idn-viejo', 'idn-otro']) {
      assert.ok(crudo()[id].startsWith('v1.'), `${id} tiene que quedar cifrado`)
      assert.equal(await leerFoto(id), CARA, `${id} tiene que leerse igual que antes`)
    }
  })

  test('pasar la migración dos veces no vuelve a cifrar lo ya cifrado', async () => {
    escribirCrudo({ 'idn-viejo': CARA })
    await cifrarRetratosEnClaro()
    const despuesDeUna = crudo()['idn-viejo']

    const segunda = await cifrarRetratosEnClaro()
    assert.equal(segunda.cifrados, 0, 'la segunda vuelta no tiene nada que hacer')
    assert.equal(crudo()['idn-viejo'], despuesDeUna, 'y no puede tocar lo que ya estaba')
    assert.equal(await leerFoto('idn-viejo'), CARA)
  })

  test('borrar sigue borrando', async () => {
    await guardarFoto('idn-1', CARA)
    await borrarFoto('idn-1')
    assert.equal(await leerFoto('idn-1'), null)
  })

  test('sin llave configurada no se rompe nada: guarda y lee como antes', async () => {
    delete process.env.GENESIS_ARCHIVO_CLAVE
    olvidarClaveArchivo()

    await guardarFoto('idn-sin-llave', CARA)
    // Queda en claro, que es lo que pasaba antes de este cambio. `/healthz` ya
    // publica esa situación como `conservacionDocumentos: false`.
    assert.equal(crudo()['idn-sin-llave'], CARA)
    assert.equal(await leerFoto('idn-sin-llave'), CARA)

    const r = await cifrarRetratosEnClaro()
    assert.equal(r.cifrados, 0, 'sin llave no se puede cifrar, y decir que sí sería mentira')
  })
})
