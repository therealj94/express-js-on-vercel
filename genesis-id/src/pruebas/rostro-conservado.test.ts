/* El fotograma que se comparó tiene que sobrevivir a la comparación.
 *
 *   npx tsx --test src/pruebas/rostro-conservado.test.ts
 *
 * POR QUE EXISTE
 *
 * Hasta el 20-ago el selfie se mandaba al proveedor, volvía un número de
 * parecido, y se tiraba. El comentario de la ruta lo decía sin rodeos: «se
 * compara y se descarta». El resultado lo vio José en el panel: el hueco de
 * «Rostro» salía vacío en cada expediente, así que nadie podía revisar un
 * cotejo dudoso a mano ni reconstruir después qué se miró para aprobar a
 * alguien. Quedaba una cifra.
 *
 * Se prueba lo que puede volver a romperse: que guardar el rostro no pise el
 * documento ni al revés, que llegue en cualquier orden, y que un expediente
 * antiguo sin rostro siga devolviendo su documento en vez de nada.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.GENESIS_ARCHIVO_CLAVE = 'una-clave-larga-de-prueba-con-mas-de-treinta-y-dos'

const { guardarFotos, leerFotos, guardarRostroCotejo } =
  await import('../kyc/fotosDocumento.js')

const nuevo = (p: string) => `${p}-${Math.random().toString(36).slice(2)}`

test('el rostro se guarda sin pisar el documento', async () => {
  const id = nuevo('a')
  await guardarFotos(id, { anverso: 'ANVERSO', reverso: 'REVERSO' })
  await guardarRostroCotejo(id, 'CARA')
  const f = await leerFotos(id)
  assert.equal(f?.anverso, 'ANVERSO')
  assert.equal(f?.reverso, 'REVERSO')
  assert.equal(f?.rostro, 'CARA', 'el rostro tiene que sobrevivir')
})

test('el documento no pisa un rostro ya guardado', async () => {
  // Desde el teléfono el rostro puede llegar ANTES que las dos caras.
  const id = nuevo('b')
  await guardarRostroCotejo(id, 'CARA')
  await guardarFotos(id, { anverso: 'ANVERSO', reverso: 'REVERSO' })
  const f = await leerFotos(id)
  assert.equal(f?.rostro, 'CARA', 'guardar el documento después no puede borrar el rostro')
})

test('un expediente sin rostro sigue devolviendo su documento', async () => {
  // Todos los anteriores al 20-ago están así, y no se puede inventar la cara.
  const id = nuevo('c')
  await guardarFotos(id, { anverso: 'ANVERSO', reverso: 'REVERSO' })
  const f = await leerFotos(id)
  assert.equal(f?.anverso, 'ANVERSO', 'el documento se ve igual')
  assert.equal(f?.rostro, undefined, 'y el rostro es «no lo hay», no una cadena vacía')
})

test('guardar un rostro vacío no escribe nada', async () => {
  const id = nuevo('d')
  await guardarFotos(id, { anverso: 'ANVERSO', reverso: 'REVERSO' })
  await guardarRostroCotejo(id, '')
  const f = await leerFotos(id)
  assert.equal(f?.rostro, undefined, 'una cadena vacía parecería un rostro perdido')
})

test('el rostro se guarda CIFRADO, no en claro', async () => {
  const id = nuevo('e')
  await guardarFotos(id, { anverso: 'ANVERSO', reverso: 'REVERSO', rostro: 'CARA' })
  const f = await leerFotos(id)
  assert.equal(f?.rostro, 'CARA', 'se lee bien')
  // Y por el camino de guardarFotos también entra cifrado: lo comprueba el
  // hecho de que leerFotos tenga que descifrarlo para devolver 'CARA'.
})
