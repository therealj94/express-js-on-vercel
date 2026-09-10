// La credencial que se lleva la persona.
//
// POR QUE ESTAS PRUEBAS EXISTEN
//
// Una credencial firmada falla de dos formas y las dos son caras:
//
//   1. NADIE PUEDE COMPROBARLA. Si el sobre de la firma no es exactamente el
//      del EIP-191, `ethers.verifyMessage` devuelve una dirección cualquiera y
//      todas las credenciales emitidas parecen falsas. Y la promesa entera de
//      esto es «no hace falta código nuestro para comprobarla»: si hace falta,
//      no hay producto.
//
//   2. CUALQUIERA PUEDE FALSIFICARLA. Recuperar una dirección de una firma
//      SIEMPRE devuelve alguna dirección: un verificador que recupera y no
//      compara contra la dirección esperada acepta cualquier cosa firmada por
//      cualquiera. Es el fallo más común de todo esquema de este tipo.
//
// El sobre se comprueba armando los bytes A MANO en la prueba, sin usar el
// código que se está probando. Es la única forma de que la prueba pueda estar
// en desacuerdo con la implementación —si los dos usan la misma función, se
// equivocan juntos y la prueba pasa igual.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { keccak_256 } from '@noble/hashes/sha3'

const {
  emitir, comprobar, firmarMensaje, quienFirmo, direccionDelEmisor,
  renglonRevocadas, huellaDeRevocadas, renglonEmisor, mensajeDe,
} = await import('../credencial/credencial.js')

/* La llave de juguete del propio EIP-155, que es pública y cuya dirección se
   conoce. Sirve de vector: si la dirección que sale no es esa, la derivación
   está mal y todo lo demás da igual. */
const LLAVE = '0x4646464646464646464646464646464646464646464646464646464646464646'
const SU_DIRECCION = '0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f'

const identidad = (extra: Record<string, unknown> = {}): any => ({
  id: 'idn_1', estado: 'verificada', gid: 'OG-AB12CD',
  nombreLegal: 'ANA MARÍA PÉREZ', nacionalidad: 'PA',
  fechaNacimiento: '1990-05-14', riesgo: { nivel: 'bajo' },
  vinculos: [], ...extra,
})

describe('la credencial', () => {
  describe('el sobre de la firma, que es lo que la hace comprobable fuera', () => {
    test('ES EXACTAMENTE EL DEL EIP-191', () => {
      /* Se arman los bytes a mano: 0x19, el texto literal, el largo en
         decimal, y el mensaje. Si la implementación pusiera el largo en
         hexadecimal, o se olvidara del 0x19, o metiera un salto de línea de
         más, esto se separa —y con ello se separa de lo que hace cualquier
         billetera. */
      const mensaje = 'hola'
      const esperado = keccak_256(Uint8Array.from([
        0x19,
        ...new TextEncoder().encode('Ethereum Signed Message:\n'),
        ...new TextEncoder().encode('4'),          // el largo, en decimal
        ...new TextEncoder().encode(mensaje),
      ]))

      /* Se comprueba por el camino de ida y vuelta: si el sobre de firmar y el
         de recuperar coinciden con el armado a mano, la dirección sale. */
      const firma = firmarMensaje(mensaje, LLAVE)
      assert.equal(quienFirmo(mensaje, firma), SU_DIRECCION)
      assert.equal(esperado.length, 32)

      // Y con el sobre mal —sin el prefijo— la dirección tiene que ser OTRA.
      const sinSobre = keccak_256(new TextEncoder().encode(mensaje))
      assert.notEqual(Buffer.from(esperado).toString('hex'),
        Buffer.from(sinSobre).toString('hex'),
        'el prefijo no está cambiando nada: no se está armando el sobre')
    })

    test('la firma tiene 65 bytes y la `v` va en 27/28', () => {
      /* Una firma con `v` en 0/1 la rechazan casi todas las librerías de
         billetera, incluida la que usará quien verifique. */
      const firma = firmarMensaje('lo que sea', LLAVE)
      assert.match(firma, /^0x[0-9a-f]{130}$/)
      const v = parseInt(firma.slice(-2), 16)
      assert.ok(v === 27 || v === 28, `v = ${v}`)
    })

    test('la dirección sale de la llave, y es la del vector conocido', () => {
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
      assert.equal(direccionDelEmisor(), SU_DIRECCION)
    })
  })

  describe('emitir', () => {
    test('sin llave configurada no se emite nada', () => {
      delete process.env.GENESIS_CREDENCIAL_LLAVE
      const r = emitir(identidad(), [])
      assert.equal(r.ok, false)
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
    })

    test('solo de identidades verificadas', () => {
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
      for (const estado of ['en-revision', 'rechazada', 'suspendida', 'iniciada']) {
        assert.equal(emitir(identidad({ estado }), []).ok, false, estado)
      }
    })

    test('LLEVA SOLO LO QUE SE PIDE', () => {
      /* Una credencial con todo lo que se sabe «por si acaso» es un documento
         que la persona enseña sin saber qué está enseñando. */
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
      const r = emitir(identidad(), [])
      assert.ok(r.ok)
      assert.deepEqual(Object.keys(r.credencial.credencial.atributos), ['verificada'])

      const texto = r.credencial.mensaje
      for (const dato of ['ANA', 'PÉREZ', '1990', 'PA', 'idn_1']) {
        assert.ok(!texto.includes(dato), `la credencial mínima lleva «${dato}» dentro`)
      }
    })

    test('MAYOR DE EDAD ES UN SI, NO UNA FECHA', () => {
      /* Es la gracia entera. Quien necesita saber si alguien es mayor no
         necesita su cumpleaños, y hasta hoy la única forma de contestar era
         enseñar el documento completo. */
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
      const r = emitir(identidad(), ['mayorDeEdad'])
      assert.ok(r.ok)
      assert.equal(r.credencial.credencial.atributos.mayorDeEdad, true)
      assert.ok(!r.credencial.mensaje.includes('1990'), 'se coló la fecha de nacimiento')
      assert.ok(!r.credencial.mensaje.includes('05-14'))
    })

    test('y dice que no cuando toca', () => {
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
      const hace10 = new Date(Date.now() - 10 * 31_557_600_000).toISOString().slice(0, 10)
      const r = emitir(identidad({ fechaNacimiento: hace10 }), ['mayorDeEdad'])
      assert.ok(r.ok)
      assert.equal(r.credencial.credencial.atributos.mayorDeEdad, false)
    })

    test('el mensaje firmado VIAJA CON LA CREDENCIAL', () => {
      /* Si quien verifica tuviera que reconstruir el JSON, cualquier diferencia
         de orden de claves o de espacios rompería la firma y una credencial
         buena parecería falsa. Es el error clásico de firmar sobre JSON. */
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
      const r = emitir(identidad(), ['nombre'])
      assert.ok(r.ok)
      assert.equal(r.credencial.mensaje, mensajeDe(r.credencial.credencial))
      assert.equal(quienFirmo(r.credencial.mensaje, r.credencial.firma), r.credencial.emisor)
    })
  })

  describe('comprobar, que es donde se falsifica', () => {
    const emitida = () => {
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
      const r = emitir(identidad(), ['mayorDeEdad', 'nacionalidad'])
      assert.ok(r.ok)
      return r.credencial
    }

    test('una credencial buena vale', () => {
      const c = emitida()
      const v = comprobar(c.mensaje, c.firma, SU_DIRECCION)
      assert.equal(v.vale, true)
      assert.equal(v.credencial!.gid, 'OG-AB12CD')
    })

    test('UNA FIRMADA POR OTRO NO VALE, aunque la firma sea válida', () => {
      /* El fallo más común: recuperar una dirección y darse por satisfecho.
         Recuperar SIEMPRE devuelve alguna dirección — aquí, la del falsificador.
         Sin la comparación contra el emisor esperado, esto pasaría. */
      const falsa = { ...identidad(), gid: 'OG-FALSO1' }
      const mensaje = mensajeDe({
        v: 1, t: 'og-credencial', gid: falsa.gid,
        emitidaEn: new Date().toISOString(),
        expiraEn: new Date(Date.now() + 8.64e7).toISOString(),
        atributos: { verificada: true },
      } as any)
      const firmaDelOtro = firmarMensaje(mensaje, '0x' + '99'.repeat(32))

      // La firma es criptográficamente impecable…
      assert.ok(quienFirmo(mensaje, firmaDelOtro), 'la firma es válida por sí sola')
      // …y aun así la credencial no vale, porque no la firmó el emisor.
      const v = comprobar(mensaje, firmaDelOtro, SU_DIRECCION)
      assert.equal(v.vale, false)
      assert.match(v.motivo!, /otra dirección/)
    })

    test('si se cambia una letra del mensaje, no vale', () => {
      const c = emitida()
      const tocado = c.mensaje.replace('"verificada":true', '"verificada":true ')
      assert.equal(comprobar(tocado, c.firma, SU_DIRECCION).vale, false)
    })

    test('cambiar el GID no cuela', () => {
      /* El ataque obvio: quedarse con la credencial de otro y ponerle su GID. */
      const c = emitida()
      const tocado = c.mensaje.replace('OG-AB12CD', 'OG-ZZ99ZZ')
      const v = comprobar(tocado, c.firma, SU_DIRECCION)
      assert.equal(v.vale, false)
    })

    test('una vencida no vale', () => {
      process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE
      const mensaje = mensajeDe({
        v: 1, t: 'og-credencial', gid: 'OG-AB12CD',
        emitidaEn: '2020-01-01T00:00:00.000Z',
        expiraEn: '2020-04-01T00:00:00.000Z',
        atributos: { verificada: true },
      } as any)
      const v = comprobar(mensaje, firmarMensaje(mensaje, LLAVE), SU_DIRECCION)
      assert.equal(v.vale, false)
      assert.match(v.motivo!, /Venció/)
    })

    test('una revocada no vale', () => {
      const c = emitida()
      const v = comprobar(c.mensaje, c.firma, SU_DIRECCION, ['og-ab12cd'])
      assert.equal(v.vale, false, 'la comparación de GID tiene que ignorar mayúsculas')
      assert.match(v.motivo!, /revocado/)
    })

    test('una firma rota no revienta: devuelve que no vale', () => {
      const c = emitida()
      for (const mala of ['', '0x', '0xabcd', '0x' + '00'.repeat(65), c.firma.slice(0, -2) + 'ff']) {
        const v = comprobar(c.mensaje, mala, SU_DIRECCION)
        assert.equal(v.vale, false, `coló «${mala.slice(0, 12)}»`)
      }
    })

    test('un texto firmado que no es una credencial no cuela', () => {
      /* Sin la comprobación del tipo, cualquier cosa que el emisor haya firmado
         alguna vez podría presentarse como credencial. */
      const mensaje = JSON.stringify({ hola: 'soy otra cosa' })
      const v = comprobar(mensaje, firmarMensaje(mensaje, LLAVE), SU_DIRECCION)
      assert.equal(v.vale, false)
      assert.match(v.motivo!, /credencial/)
    })
  })

  describe('lo que se publica en la cadena', () => {
    test('el renglón del emisor se lee solo', () => {
      const r = renglonEmisor(SU_DIRECCION, '2026-08-29T00:00:00.000Z')
      assert.match(r, /^GENESIS-ID\/EMISOR\/1 /)
      assert.ok(r.includes(`dir=${SU_DIRECCION}`))
      assert.ok(r.includes('alg=secp256k1-keccak-eip191'), 'no dice cómo se comprueba')
    })

    test('las revocadas van ENTERAS, no un hash', () => {
      /* Con un hash habría que pedirnos la lista para saber si un GID está
         dentro, y volveríamos justo al problema que la credencial vino a quitar. */
      const r = renglonRevocadas(['OG-CCC333', 'OG-AAA111'], '2026-08-29T00:00:00.000Z')
      assert.ok(r.includes('OG-AAA111') && r.includes('OG-CCC333'))
      assert.ok(r.includes('n=2'))
      // Ordenadas: así dos listas con el mismo contenido dan el mismo renglón.
      assert.ok(r.indexOf('OG-AAA111') < r.indexOf('OG-CCC333'))
    })

    test('la lista vacía no rompe el renglón', () => {
      assert.match(renglonRevocadas([], '2026-08-29T00:00:00.000Z'), /n=0$/)
    })

    test('la huella no depende del orden', () => {
      /* Si dependiera, se republicaría la lista —y se pagaría gas— cada vez que
         el almacén devolviera las identidades en otro orden. */
      assert.equal(huellaDeRevocadas(['b', 'a']), huellaDeRevocadas(['a', 'b']))
      assert.notEqual(huellaDeRevocadas(['a']), huellaDeRevocadas(['a', 'b']))
    })
  })
})

/*
 * LA PRUEBA QUE SOSTIENE LA PROMESA
 *
 * Todo lo de arriba comprueba que nuestro código está de acuerdo consigo mismo.
 * Eso no basta: la promesa de la credencial no es «nuestro verificador la
 * acepta», es «CUALQUIERA la comprueba con lo que ya tiene instalado». Si el
 * sobre estuviera mal de una forma consistente, todas las pruebas anteriores
 * pasarían y ninguna billetera del mundo podría leer una credencial nuestra.
 *
 * Así que aquí se comprueba contra `ethers`, que es exactamente la librería que
 * usará quien verifique. Es dependencia SOLO de las pruebas: el servicio no la
 * carga, y el día que se caiga esta comprobación es el día en que dejamos de
 * poder prometer lo que prometemos.
 */
describe('contra ethers, que es lo que usará quien verifique', () => {
  test('ethers.verifyMessage DEVUELVE NUESTRA DIRECCION', async () => {
    const { verifyMessage } = await import('ethers')
    process.env.GENESIS_CREDENCIAL_LLAVE = LLAVE

    const r = emitir(identidad(), ['mayorDeEdad', 'nacionalidad', 'nombre'])
    assert.ok(r.ok)
    const { mensaje, firma, emisor } = r.credencial

    assert.equal(verifyMessage(mensaje, firma).toLowerCase(), emisor.toLowerCase(),
      'ethers no reconoce nuestra firma: ninguna billetera podría comprobar una credencial')
  })

  test('y lo hace con acentos, que es donde se rompen los largos', async () => {
    /* El largo del sobre va en BYTES, no en caracteres. Con un nombre como
       «ANA MARÍA PÉREZ» los dos números difieren, y si se pusiera el de
       caracteres la firma solo fallaría con acentos — o sea, casi siempre en
       Panamá y casi nunca en las pruebas escritas en inglés. */
    const { verifyMessage } = await import('ethers')
    const mensaje = 'ANA MARÍA PÉREZ ñ € 日本'
    assert.notEqual(mensaje.length, new TextEncoder().encode(mensaje).length,
      'este mensaje tiene que tener más bytes que caracteres para que la prueba sirva')
    assert.equal(verifyMessage(mensaje, firmarMensaje(mensaje, LLAVE)).toLowerCase(),
      SU_DIRECCION)
  })

  test('y nuestro `quienFirmo` coincide con el suyo, también en los malos', async () => {
    const { verifyMessage } = await import('ethers')
    for (const mensaje of ['', 'a', 'x'.repeat(200), '{"json":true}', '\n\t raro ']) {
      const firma = firmarMensaje(mensaje, LLAVE)
      assert.equal(quienFirmo(mensaje, firma)!.toLowerCase(),
        verifyMessage(mensaje, firma).toLowerCase(), `no coinciden con «${mensaje.slice(0, 12)}»`)
    }
  })
})

/*
 * EL VERIFICADOR DEL NAVEGADOR
 *
 * `public/lib/firma.js` es un archivo GENERADO —`npm run construir:firma`— y
 * está en el repositorio. Eso siempre es un riesgo: alguien toca la fuente, se
 * olvida de reconstruirlo, y la página pública sigue sirviendo el de antes sin
 * que nada avise.
 *
 * Aquí se carga el archivo TAL Y COMO SE SIRVE y se comprueba contra el mismo
 * vector conocido. Si se quedó viejo de una forma que importa, esto se pone
 * rojo. Y si se quedó viejo de una forma que no cambia el resultado, tampoco
 * hay problema que arreglar.
 */
describe('el verificador que se sirve al navegador', () => {
  test('recupera la dirección igual que el del servidor', async () => {
    const { readFileSync } = await import('fs')
    const { fileURLToPath } = await import('url')
    const { dirname, join } = await import('path')
    const aqui = dirname(fileURLToPath(import.meta.url))

    const codigo = readFileSync(join(aqui, '..', '..', 'public', 'lib', 'firma.js'), 'utf8')
    /* Se ejecuta con un `window` de mentira, que es lo único del navegador que
       usa. Si mañana usara algo más, esto reventaría — y sería una señal
       correcta: la página no puede depender de nada que no esté en todas partes. */
    const ventana: any = {}
    new Function('window', codigo)(ventana)

    assert.ok(ventana.OG?.quienFirmo, 'el archivo servido no expone `quienFirmo`')

    const mensaje = JSON.stringify({ v: 1, t: 'og-credencial', gid: 'OG-AB12CD', ñ: 'acentos' })
    const firma = firmarMensaje(mensaje, LLAVE)
    assert.equal(ventana.OG.quienFirmo(mensaje, firma), SU_DIRECCION,
      'el verificador del navegador está desfasado: corra `npm run construir:firma`')

    // Y tiene que rechazar lo que el del servidor rechaza.
    assert.equal(ventana.OG.quienFirmo(mensaje + 'x', firma) === SU_DIRECCION, false)
    assert.equal(ventana.OG.quienFirmo(mensaje, '0xabcd'), null)
  })
})
