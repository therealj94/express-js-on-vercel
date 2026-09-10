// El aviso por WhatsApp a la persona.
//
// POR QUE ESTAS PRUEBAS EXISTEN
//
// Este aviso sale del sitio más delicado del producto —dentro de una decisión
// de cumplimiento— y va al teléfono de una persona de verdad. Falla de tres
// formas y ninguna se nota desde dentro:
//
//   1. LE LLEGA A OTRA PERSONA. Un teléfono guardado a medias («9876-5432»,
//      sin país) al que se le rellenan dígitos para que «parezca» un número
//      internacional es cómo se le manda a un desconocido el aviso de que
//      alguien quedó verificado. Con su GID dentro.
//
//   2. NO LLEGA Y NADIE SE ENTERA. Aquí la identidad figura decidida y todo en
//      orden; la persona sigue esperando una respuesta que ya se dio.
//
//   3. TUMBA LA APROBACION. Si encolar el aviso pudiera lanzar, un fallo de
//      WhatsApp se llevaría por delante una decisión que ya estaba tomada.

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-wa-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
delete process.env.GENESIS_MONGO_URL
process.env.GENESIS_WHATSAPP_CLAVE = 'sk_de_mentira'
process.env.GENESIS_WHATSAPP_CUENTA = 'cuenta_de_mentira'

const { store } = await import('../store.js')
const wa = await import('../enganches/whatsapp.js')

const identidad = (extra: Record<string, unknown> = {}): any => ({
  id: 'idn_1', estado: 'verificada', gid: 'GEN-4K7P-9XQ2-M',
  nombreLegal: 'ANA MARÍA PÉREZ GÓMEZ', nombreDeclarado: null,
  telefono: '+504 3213-6457', vinculos: [], ...extra,
})

describe('a qué número sale', () => {
  test('UN TELEFONO SIN PAIS NO SE MANDA A NINGUNA PARTE', () => {
    /* Es el fallo que le manda a un desconocido el GID de otra persona. Ocho
       dígitos es un teléfono local; el país no se adivina. */
    for (const malo of ['9876-5432', '32136457', '', null, '  ', '+504']) {
      assert.equal(wa.aE164(malo as any), null, `coló «${malo}»`)
    }
  })

  test('uno internacional pasa, con la basura de en medio quitada', () => {
    assert.equal(wa.aE164('+504 3213-6457'), '50432136457')
    assert.equal(wa.aE164('(507) 6123 4567'), '50761234567')
  })

  test('uno absurdamente largo tampoco', () => {
    assert.equal(wa.aE164('+' + '9'.repeat(20)), null)
  })

  test('sin teléfono no se encola nada, y no es un error', () => {
    store.todo().entregas.length = 0
    assert.equal(wa.avisarPersona(identidad({ telefono: null })), false)
    assert.equal(store.todo().entregas.length, 0)
  })
})

describe('qué dice el aviso', () => {
  test('EL NOMBRE NO SE GRITA', () => {
    /* `nombreLegal` viene del documento y en mayúsculas. Mandar «ANA MARÍA
       PÉREZ GÓMEZ» por WhatsApp no es cómo se le habla a una persona. */
    assert.equal(wa.primerNombre(identidad()), 'Ana')
    assert.equal(wa.primerNombre(identidad({ nombreLegal: 'JOSÉ' })), 'José')
  })

  test('sin nombre no se rompe', () => {
    assert.equal(
      wa.primerNombre(identidad({ nombreLegal: null, nombreDeclarado: null })), 'hola')
  })

  test('un rechazo lleva SU MOTIVO dentro', () => {
    /* Un «no se pudo» sin motivo obliga a la persona a escribir para preguntar
       qué pasó, y la deja pensando que hizo algo mal. */
    const h = wa.huecos(identidad({ estado: 'rechazada' }), 'la foto salió borrosa')
    assert.deepEqual(h, ['Ana', 'la foto salió borrosa'])
  })

  test('UN MOTIVO CON SALTOS DE LINEA NO PUEDE VIAJAR', () => {
    /* Meta rechaza un hueco con salto de línea EN EL ENVIO, no al crear la
       plantilla. O sea que rompería en producción y no en la revisión. */
    const h = wa.huecos(identidad({ estado: 'rechazada' }),
      'documento vencido\ny la foto\t no se lee')
    assert.ok(!h[1].includes('\n') && !h[1].includes('\t'), h[1])
    assert.equal(h[1], 'documento vencido y la foto no se lee')
  })

  test('y uno larguísimo se recorta', () => {
    const h = wa.huecos(identidad({ estado: 'rechazada' }), 'x'.repeat(500))
    assert.ok(h[1].length <= 180)
    assert.ok(h[1].endsWith('…'))
  })

  test('LA APROBACION NO LLEVA EL GID, y tiene que ser así', () => {
    /* Meta rechazó dos veces la plantilla que lo entregaba: un mensaje que da
       un identificador lo clasifica como AUTHENTICATION —la categoría de los
       códigos de un solo uso— y no como el aviso de un trámite.

       Mandar dos huecos a una plantilla de uno hace que Meta rechace EL ENVIO,
       no la plantilla: rompería en producción, con la persona esperando. */
    assert.deepEqual(wa.huecos(identidad()), ['Ana'])
  })

  test('la suspensión sí lo lleva: esa plantilla tiene dos huecos', () => {
    assert.deepEqual(wa.huecos(identidad({ estado: 'suspendida' })),
                     ['Ana', 'GEN-4K7P-9XQ2-M'])
  })

  test('los huecos encolados coinciden con la plantilla que se nombra', () => {
    /* La comprobación que ata las dos mitades: si alguien cambia una plantilla
       en Meta y se olvida de los huecos aquí (o al revés), esto lo dice antes
       de que reviente en el teléfono de alguien. */
    const esperados: Record<string, number> = {
      verificada: 1, 'en-revision': 1, rechazada: 2, suspendida: 2,
    }
    for (const [estado, cuantos] of Object.entries(esperados)) {
      assert.equal(wa.huecos(identidad({ estado }), 'un motivo').length, cuantos,
        `«${estado}» encola ${wa.huecos(identidad({ estado }), 'x').length} huecos `
        + `y su plantilla espera ${cuantos}`)
    }
  })
})

describe('la cola', () => {
  beforeEach(() => { store.todo().entregas.length = 0 })

  test('se encola con su canal, para que la cola sepa por dónde sacarlo', () => {
    assert.equal(wa.avisarPersona(identidad()), true)
    const e = store.todo().entregas[0]
    assert.equal(e.canal, 'whatsapp')
    assert.equal(e.url, '50432136457')
    // Se lee de la tabla, no del nombre escrito a mano: las plantillas se
    // renombran cuando Meta rechaza una, y eso no debe romper esta prueba.
    assert.equal(JSON.parse(e.cuerpo).plantilla, wa.PLANTILLAS.verificada)
    assert.match(wa.PLANTILLAS.verificada, /^genesisid_/)
  })

  test('un estado SIN plantilla no manda nada', () => {
    /* Inventar un texto sería peor: Meta lo rechazaría y la persona no
       recibiría nada igual, pero con un fallo por medio. */
    assert.equal(wa.avisarPersona(identidad({ estado: 'documento' })), false)
    assert.equal(wa.avisarPersona(identidad({ estado: 'iniciada' })), false)
    assert.equal(store.todo().entregas.length, 0)
  })

  test('SIN CONFIGURAR NO EXISTE, y no se queja', () => {
    const antes = process.env.GENESIS_WHATSAPP_CLAVE
    delete process.env.GENESIS_WHATSAPP_CLAVE
    try {
      assert.equal(wa.encendido(), false)
      assert.equal(wa.avisarPersona(identidad()), false)
      assert.equal(store.todo().entregas.length, 0)
    } finally { process.env.GENESIS_WHATSAPP_CLAVE = antes }
  })

  test('ENCOLAR NUNCA LANZA', () => {
    /* Se llama desde dentro de una aprobación. Si esto pudiera lanzar, un
       fallo de WhatsApp se llevaría por delante una decisión ya tomada. */
    assert.doesNotThrow(() => wa.avisarPersona(null as any))
    assert.doesNotThrow(() => wa.avisarPersona(identidad({ telefono: 12345 })))
  })
})

describe('el envío, con la forma real del proveedor', () => {
  test('ABRE CONVERSACION CON LA PLANTILLA, que es como se manda', async () => {
    /* La primera versión inventó un `/whatsapp/messages` que no existe. Esta
       prueba fija el contrato leído: a quien nunca escribió no hay hilo al que
       contestar, así que empezar uno con una plantilla aprobada ES el envío. */
    let visto: any = null
    const original = globalThis.fetch
    globalThis.fetch = (async (url: any, init: any) => {
      visto = { url: String(url), cuerpo: JSON.parse(init.body) }
      return { ok: true, status: 200, text: async () => '' } as any
    }) as any
    try {
      await wa.entregarWhatsApp('50432136457', JSON.stringify(
        { plantilla: 'genesisid_identidad_verificada', huecos: ['Ana', 'GEN-1'] }))
    } finally { globalThis.fetch = original }

    assert.match(visto.url, /\/inbox\/conversations$/)
    assert.equal(visto.cuerpo.participantId, '50432136457')
    assert.equal(visto.cuerpo.templateName, 'genesisid_identidad_verificada')
    assert.deepEqual(visto.cuerpo.templateParams, ['Ana', 'GEN-1'],
      'los huecos van en una lista plana y en orden')
  })

  test('un rechazo de Meta LANZA, para que la cola reintente', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok: false, status: 400, text: async () => 'template not approved',
    })) as any
    try {
      await assert.rejects(
        wa.entregarWhatsApp('50432136457', JSON.stringify({ plantilla: 'x', huecos: [] })),
        /400.*template not approved/)
    } finally { globalThis.fetch = original }
  })
})
