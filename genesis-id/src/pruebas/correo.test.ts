/* El correo: la firma de AWS y la promesa de que nunca estorba.
 *
 * QUE SE FIJA AQUI, Y POR QUE
 *
 * 1. La firma. Está escrita a mano para no cargarle a Genesis ID el SDK entero
 *    de AWS, así que no puede quedar sin verificar: se comprueba contra el
 *    vector que AWS publica en su propia documentación. Si alguien toca una
 *    línea de `firma.ts`, esto se cae aquí y no en producción con los correos
 *    rebotando.
 *
 * 2. Que un correo caído NO tumbe una aprobación. Es la regla que sostiene
 *    todo el módulo: aprobar a una persona es un acto de cumplimiento y no
 *    puede depender de que un servicio de terceros esté en pie. Sin esta
 *    prueba, un `await` mal puesto en el futuro convierte «SES está lento» en
 *    «no se puede verificar a nadie».
 *
 * 3. Que las plantillas digan lo que la Junta aprobó: la regla de cobre (AUKA
 *    SIGUE el precio, nunca «es una onza»), el +18 con sus bases, y que jamás
 *    se pida una contraseña por correo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { derivarClaveFirma, firmarPost } from '../correo/firma.js'
import { identidadAprobada, identidadRechazada } from '../correo/plantillas.js'
import { enviar, enviarSinEsperar, correoEncendido } from '../correo/enviar.js'

test('la clave de firma coincide con el vector publicado por AWS', () => {
  // De la documentación de AWS, «Examples of how to derive a signing key».
  const clave = derivarClaveFirma(
    'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20120215', 'us-east-1', 'iam')
  assert.equal(
    clave.toString('hex'),
    'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d',
    'si esto no cuadra, TODAS las peticiones a SES saldrían rechazadas')
})

test('la petición firmada sale con la forma que AWS exige', () => {
  const p = firmarPost({
    servicio: 'ses', region: 'us-east-1', host: 'email.us-east-1.amazonaws.com',
    ruta: '/v2/email/outbound-emails', cuerpo: '{"a":1}',
    credenciales: { llave: 'AKIDEXAMPLE', secreto: 'secreto-de-prueba' },
  }, new Date('2026-08-19T14:30:12.000Z'))

  assert.equal(p.cabeceras['x-amz-date'], '20260819T143012Z')
  assert.match(p.cabeceras.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260819\/us-east-1\/ses\/aws4_request, /)
  assert.match(p.cabeceras.Authorization, /SignedHeaders=content-type;host;x-amz-date, /,
    'las cabeceras firmadas van en minúscula y ordenadas: el orden es parte de la firma')
  assert.match(p.cabeceras.Authorization, /Signature=[0-9a-f]{64}$/)
  assert.equal(p.url, 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails')
})

test('la misma entrada firma igual, y una distinta firma distinto', () => {
  const args = {
    servicio: 'ses', region: 'us-east-1', host: 'email.us-east-1.amazonaws.com',
    ruta: '/v2/email/outbound-emails',
    credenciales: { llave: 'AKIDEXAMPLE', secreto: 'secreto-de-prueba' },
  }
  const cuando = new Date('2026-08-19T14:30:12.000Z')
  const a = firmarPost({ ...args, cuerpo: '{"a":1}' }, cuando)
  const b = firmarPost({ ...args, cuerpo: '{"a":1}' }, cuando)
  const c = firmarPost({ ...args, cuerpo: '{"a":2}' }, cuando)
  assert.equal(a.cabeceras.Authorization, b.cabeceras.Authorization)
  assert.notEqual(a.cabeceras.Authorization, c.cabeceras.Authorization,
    'el cuerpo entra en la firma; si no, cualquiera podría cambiarlo en el camino')
})

test('sin configurar, el correo está apagado y no revienta nada', async () => {
  // En las pruebas no hay GENESIS_SES_*, que es justo el estado de producción
  // hasta que la Junta apruebe el gasto.
  assert.equal(correoEncendido(), false)
  const r = await enviar({ para: 'a@b.com', asunto: 'x', texto: 'x', html: 'x' })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'correo apagado')
})

test('enviarSinEsperar devuelve al instante y jamás lanza', () => {
  const antes = Date.now()
  // Sin destinatario, sin configuración: el peor caso posible.
  assert.doesNotThrow(() => {
    enviarSinEsperar({ para: '', asunto: '', texto: '', html: '' }, 'prueba')
  })
  assert.ok(Date.now() - antes < 50,
    'si esto tardara, una aprobación quedaría esperando a un servidor de correo')
})

test('el correo de aprobación lleva el GID y respeta la regla de cobre', () => {
  const c = identidadAprobada({
    email: 'persona@ejemplo.com', nombreLegal: 'María Fernanda López',
    gid: 'GEN-1234-5678-9',
  })
  assert.equal(c.para, 'persona@ejemplo.com')
  assert.match(c.asunto, /GEN-1234-5678-9/)
  for (const cuerpo of [c.texto, c.html]) {
    assert.match(cuerpo, /GEN-1234-5678-9/, 'sin el código, el correo no sirve para nada')
    assert.match(cuerpo, /Hola, María/, 'se saluda por el primer nombre, no por el legal completo')
    assert.doesNotMatch(cuerpo, /es una onza|respaldad|equivale a una onza/i,
      'REGLA DE COBRE: AUKA sigue el precio, nunca es ni respalda una onza')
    assert.match(cuerpo, /contraseña ni tu frase de respaldo/,
      'el pie antisuplantación va en los dos formatos')
  }
})

test('si el sorteo está vivo, se invita con +18 y bases; nunca sin ellos', () => {
  const c = identidadAprobada({
    email: 'p@e.com', nombreLegal: null, gid: 'GEN-0000-0000-0',
  })
  const vivo = Date.now() < Date.UTC(2026, 8, 10, 5, 59, 59)
  for (const cuerpo of [c.texto, c.html]) {
    if (vivo) {
      assert.match(cuerpo, /1 AUKA/)
      assert.match(cuerpo, /sigue el precio de la onza de oro/)
      assert.match(cuerpo, /18 años/, 'invitar al sorteo sin el +18 es lo que no se hace')
      assert.match(cuerpo, /sorteo-orden-global/, 'y sin enlace a las bases, tampoco')
    } else {
      assert.doesNotMatch(cuerpo, /1 AUKA/,
        'cerrado el sorteo, el correo deja de invitar solo')
    }
  }
  assert.match(c.texto, /^Hola\./m, 'sin nombre se saluda igual, no queda un hueco')
})

test('el rechazo explica el motivo y ofrece volver a intentar', () => {
  const c = identidadRechazada({
    email: 'p@e.com', nombreLegal: 'Juan Pérez',
    motivo: 'La foto del reverso está cortada y no se lee la fecha de vencimiento.',
  })
  for (const cuerpo of [c.texto, c.html]) {
    assert.match(cuerpo, /no se lee la fecha de vencimiento/,
      'el motivo va COMPLETO: sin él la persona repite el mismo error')
    assert.match(cuerpo, /volver a intentar/i)
  }
})

test('un motivo con HTML adentro no rompe el correo', () => {
  const c = identidadRechazada({
    email: 'p@e.com', nombreLegal: '<script>alert(1)</script>',
    motivo: 'Documento <b>ilegible</b> & borroso',
  })
  assert.doesNotMatch(c.html, /<script>/, 'lo que escribe un operador se escapa antes de pintarse')
  assert.match(c.html, /&amp; borroso/)
})
