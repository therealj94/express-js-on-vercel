/**
 * La entrega del expediente completo, para el derecho de acceso.
 *
 * Lo que importa acá no es que devuelva algo, sino que devuelva TODO y solo lo
 * suyo. Una entrega a la que le falta un trozo es peor que no haberla hecho, y
 * una que trae datos de otra persona es una filtración.
 *
 *   - junta lo que vive en cinco sitios distintos
 *   - no se lleva nada de otra persona
 *   - queda escrito en la bitácora quién lo sacó y por qué
 *   - no mete las imágenes dentro, solo dice cuáles hay
 */

import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'expediente-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'genesis.json')

const { expedienteCompleto, entregarExpediente } = await import('../motor/expediente.js')
const { store } = await import('../store.js')
const { registrar } = await import('../audit/bitacora.js')

after(() => rmSync(carpeta, { recursive: true, force: true }))

/** Mete a mano una identidad en el estado, con lo justo para esta prueba. */
function meterIdentidad(id: string, email: string, gid: string | null = null) {
  store.todo().identidades.push({
    id, email, gid,
    estado: 'aprobada', creadaEn: new Date().toISOString(),
    nombreDeclarado: 'Persona De Prueba', nombreLegal: 'PERSONA DE PRUEBA',
    decisiones: [], vinculos: [],
  } as any)
  return id
}

describe('Expediente completo', () => {
  beforeEach(() => store.reiniciar())

  test('junta lo que vive repartido en varios sitios', async () => {
    meterIdentidad('idn-1', 'ana@prueba.org', 'GID-1')
    store.todo().negocios.push({
      id: 'neg-1', emailDueno: 'ana@prueba.org', razonSocial: 'Suya SA',
      beneficiarios: [],
    } as any)
    store.todo().casos.push({ id: 'caso-1', identidadId: 'idn-1', titulo: 'Un caso' } as any)
    registrar('ana@prueba.org', 'identidad.iniciada', 'ana@prueba.org')
    registrar('operador@prueba.org', 'identidad.aprobada', 'idn-1')

    const r = await expedienteCompleto('idn-1', 'operador@prueba.org')
    assert.equal(r.ok, true)

    const e = r.expediente as any
    assert.equal((e.identidad as any).email, 'ana@prueba.org')
    assert.equal(e.negocios.length, 1, 'el negocio del que es dueña tiene que ir')
    assert.equal(e.casos.length, 1, 'y su caso de cumplimiento')
    assert.ok(e.bitacora.length >= 2, 'y sus entradas de bitácora')
    assert.ok(e.generado.en && e.generado.porOperador, 'la entrega va firmada')
  })

  /* LA IMPORTANTE EN LA OTRA DIRECCION: una entrega que se lleve datos de
     otra persona no es un derecho de acceso, es una filtración. */
  test('no se lleva nada de otra persona', async () => {
    meterIdentidad('idn-1', 'ana@prueba.org', 'GID-1')
    meterIdentidad('idn-2', 'beto@prueba.org', 'GID-2')

    store.todo().casos.push({ id: 'caso-de-beto', identidadId: 'idn-2', titulo: 'De Beto' } as any)
    store.todo().negocios.push({
      id: 'neg-de-beto', emailDueno: 'beto@prueba.org', razonSocial: 'De Beto SA',
      beneficiarios: [],
    } as any)
    registrar('beto@prueba.org', 'identidad.iniciada', 'beto@prueba.org')
    registrar('operador@prueba.org', 'identidad.aprobada', 'idn-2')

    const e = (await expedienteCompleto('idn-1', 'operador@prueba.org')).expediente as any
    assert.equal(e.casos.length, 0)
    assert.equal(e.negocios.length, 0)
    for (const entrada of e.bitacora) {
      assert.ok(!/beto/i.test(JSON.stringify(entrada)),
        'ni una entrada de la bitácora de otra persona')
    }
  })

  test('un homónimo no se cuela: se filtra por lo que identifica, no por el nombre', async () => {
    meterIdentidad('idn-1', 'ana@prueba.org', 'GID-1')
    meterIdentidad('idn-2', 'ana.otra@prueba.org', 'GID-2')
    // Las dos se llaman «Persona De Prueba». Buscar por nombre las mezclaría.
    registrar('ana.otra@prueba.org', 'identidad.aprobada', 'idn-2')

    const e = (await expedienteCompleto('idn-1', 'op@prueba.org')).expediente as any
    for (const entrada of e.bitacora) {
      assert.notEqual(entrada.objeto, 'idn-2')
      assert.notEqual(entrada.actor, 'ana.otra@prueba.org')
    }
  })

  test('si es beneficiaria final de un negocio ajeno, ese negocio también va', async () => {
    meterIdentidad('idn-1', 'ana@prueba.org', 'GID-1')
    store.todo().negocios.push({
      id: 'neg-ajeno', emailDueno: 'otro@prueba.org', razonSocial: 'De Otro SA',
      beneficiarios: [{ nombreCompleto: 'PERSONA DE PRUEBA', gid: 'GID-1', porcentaje: 30 }],
    } as any)

    const e = (await expedienteCompleto('idn-1', 'op@prueba.org')).expediente as any
    assert.equal(e.negocios.length, 1, 'ser beneficiaria final es un dato suyo')
  })

  test('las imágenes no van dentro: solo se dice cuáles hay', async () => {
    meterIdentidad('idn-1', 'ana@prueba.org')
    const e = (await expedienteCompleto('idn-1', 'op@prueba.org')).expediente as any
    assert.equal(typeof e.imagenes.documento, 'boolean')
    assert.equal(typeof e.imagenes.retratoCredencial, 'boolean')
    // Nada de base64 suelto: un anverso dentro volvería esto inmanejable.
    assert.ok(!/iVBORw0KGgo|data:image/.test(JSON.stringify(e.imagenes)))
  })

  /* Sacar el expediente entero de una persona es justo lo que un inspector va a
     querer ver registrado. Hecho a mano no quedaba en ninguna parte. */
  test('la entrega queda escrita en la bitácora, con quién y por qué', async () => {
    meterIdentidad('idn-1', 'ana@prueba.org')
    const antes = store.todo().bitacora.length

    await entregarExpediente('idn-1', 'operador@prueba.org', 'solicitud de acceso de la persona')

    const nuevas = store.todo().bitacora.slice(antes)
    const anotada = nuevas.find((x) => x.accion === 'expediente.entregado')
    assert.ok(anotada, 'tiene que quedar anotada')
    assert.equal(anotada!.actor, 'operador@prueba.org')
    assert.equal(anotada!.objeto, 'idn-1')
    assert.match(String((anotada!.detalle as any).motivo), /solicitud de acceso/)
  })

  test('de una identidad que no existe no se inventa nada', async () => {
    const r = await expedienteCompleto('idn-que-no-hay', 'op@prueba.org')
    assert.equal(r.ok, false)
    assert.match(String(r.error), /No existe/)
  })

  test('y si no existe, tampoco se anota una entrega que no ocurrió', async () => {
    const antes = store.todo().bitacora.length
    await entregarExpediente('idn-que-no-hay', 'op@prueba.org', 'lo que sea')
    assert.equal(store.todo().bitacora.length, antes)
  })
})
