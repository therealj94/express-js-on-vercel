/* La máquina lee el frente del documento cuando entra por fotos.
 *
 *   npx tsx --test src/pruebas/anverso-leido.test.ts
 *
 * POR QUÉ EXISTE
 *
 * La regla de la casa es que el nombre se coteja SIEMPRE contra el frente del
 * documento —la zona mecánica corta los nombres largos—, y la vía del
 * navegador la tenía rota: entraban dos fotos y nadie leía nada hasta que un
 * operador abría el expediente días después. Ahora el servidor lee el impreso
 * con Rekognition en el momento.
 *
 * Aquí no se llama a AWS: un test que necesita credenciales no es un test, es
 * un gasto intermitente. Se inyecta un lector falso y se prueba TODO lo demás:
 * los hallazgos, el aviso inmediato a la persona, el texto conservado para el
 * operador, y —lo más importante— que sin lector todo siga funcionando igual
 * que antes, porque Rekognition caído no puede tumbar una verificación.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-anverso-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
process.env.GENESIS_ARCHIVO_CLAVE = 'una-clave-larga-de-prueba-con-mas-de-treinta-y-dos'
delete process.env.GENESIS_MONGO_URL
delete process.env.GENESIS_AWS_ACCESS_KEY_ID
delete process.env.AWS_ACCESS_KEY_ID

const ids = await import('../motor/identidades.js')
const { _fijarLectorParaPruebas } = await import('../kyc/textoDocumento.js')
const { cotejarAnverso } = await import('../kyc/documento.js')

const FOTO = 'data:image/jpeg;base64,' + 'A'.repeat(1200)

function nuevaIdentidad(nombre: string | null) {
  const i = ids.iniciar(`${Math.random().toString(36).slice(2)}@prueba.local`, 'prueba')
  if (nombre) {
    ids.declararDatos(i.id, {
      nombreCompleto: nombre,
      fechaNacimiento: '1994-03-12',
      paisResidencia: 'HND',
    } as any, 'prueba')
  }
  return ids.porId(i.id)!
}

test('sin lector configurado, la vía de fotos queda exactamente como era', async () => {
  _fijarLectorParaPruebas(null)
  const i = nuevaIdentidad('JOSE MANUEL ENAMORADO RIVERA')
  const r = await ids.adjuntarDocumentoPorFotos(i.id, FOTO, FOTO, 'prueba')
  assert.equal(r.ok, true)
  assert.equal(r.lectura, null, 'sin lector no se afirma nada')
  const d = r.identidad!.documento!
  assert.equal(d.via, 'fotos')
  assert.equal(d.anverso.nombreConfirmado, null)
  assert.equal(d.textoAnverso ?? null, null)
  assert.equal(d.hallazgos.length, 1, 'solo el aviso de siempre, ningún hallazgo inventado')
})

test('la máquina encuentra el nombre: hallazgo en verde y aviso inmediato en verde', async () => {
  _fijarLectorParaPruebas(async () => ({
    lineas: ['REPUBLICA DE HONDURAS', 'NOMBRES', 'JOSE MANUEL', 'APELLIDOS', 'ENAMORADO RIVERA', 'VENCE 12/03/2032'],
    rostros: 1,
  }))
  const i = nuevaIdentidad('Jose Manuel Enamorado Rivera')
  const r = await ids.adjuntarDocumentoPorFotos(i.id, FOTO, FOTO, 'prueba')
  const d = r.identidad!.documento!
  assert.equal(d.anverso.nombreConfirmado, true)
  assert.equal(r.lectura?.nombreConfirmado, true)
  assert.equal(r.lectura?.rostroEnFrente, true)
  assert.ok(d.textoAnverso!.includes('ENAMORADO'), 'el texto leído se conserva para el operador')
  assert.ok(d.hallazgos.some((h) => h.clave === 'anverso.nombre' && h.gravedad === 'ok'))
  assert.ok(d.hallazgos.some((h) => h.clave === 'anverso.rostro' && h.gravedad === 'ok'))
})

test('frente sin rostro y sin el nombre: dos avisos, y la respuesta se lo dice a la persona', async () => {
  _fijarLectorParaPruebas(async () => ({
    lineas: ['TEXTO DE OTRA COSA', 'SIN NADA QUE VER'],
    rostros: 0,
  }))
  const i = nuevaIdentidad('MARIA LOPEZ')
  const r = await ids.adjuntarDocumentoPorFotos(i.id, FOTO, FOTO, 'prueba')
  const d = r.identidad!.documento!
  assert.equal(d.anverso.nombreConfirmado, false)
  assert.equal(r.lectura?.nombreConfirmado, false)
  assert.equal(r.lectura?.rostroEnFrente, false)
  assert.ok(d.hallazgos.some((h) => h.clave === 'anverso.rostro' && h.gravedad === 'aviso'))
  assert.ok(d.hallazgos.some((h) => h.clave === 'anverso.nombre' && h.gravedad === 'aviso'))
})

test('el lector revienta: la verificación sigue como si no hubiera lector', async () => {
  _fijarLectorParaPruebas(async () => { throw new Error('AWS tosió') })
  const i = nuevaIdentidad('PEDRO GOMEZ')
  const r = await ids.adjuntarDocumentoPorFotos(i.id, FOTO, FOTO, 'prueba')
  assert.equal(r.ok, true, 'Rekognition caído no puede tumbar una verificación')
  assert.equal(r.lectura, null)
  assert.equal(r.identidad!.documento!.anverso.nombreConfirmado, null)
})

test('sin texto legible pero con rostro: se dice lo uno y lo otro', async () => {
  _fijarLectorParaPruebas(async () => ({ lineas: [], rostros: 1 }))
  const i = nuevaIdentidad('ANA RODRIGUEZ')
  const r = await ids.adjuntarDocumentoPorFotos(i.id, FOTO, FOTO, 'prueba')
  const d = r.identidad!.documento!
  assert.equal(r.lectura?.rostroEnFrente, true)
  assert.equal(d.anverso.nombreConfirmado, null, 'sin texto no se afirma nada del nombre')
  assert.ok(d.hallazgos.some((h) => h.clave === 'anverso.texto' && h.gravedad === 'aviso'))
})

test('el cotejo tolera lo que el OCR rompe, y solo eso', () => {
  // Cifras por letras (el error clásico sobre filigrana) y palabra partida.
  const bien = cotejarAnverso('N0MBRES J0SE MANUEL APELLIDOS ENAMO RADO RIVERA',
    { nombreCompleto: 'Jose Manuel Enamorado Rivera' })
  assert.equal(bien.nombre, true)
  // Una palabra DISTINTA no pasa por parecida.
  const mal = cotejarAnverso('NOMBRES JOSE MANUEL APELLIDOS PEREZ RIVERA',
    { nombreCompleto: 'Jose Manuel Gomez Rivera' })
  assert.equal(mal.nombre, false)
})

test('al final, el lector falso se retira', () => {
  _fijarLectorParaPruebas(null)
})
