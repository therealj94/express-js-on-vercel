// Pruebas de la verificación de rostro: firma con AWS, saneado de imágenes,
// sorteo de retos y evaluación de cada gesto.
//
// Nada de esto llama a AWS. Se prueba lo que decide: la derivación de la clave
// de firma —contra el ejemplo publicado por AWS, que es el único modo de saber
// que está bien sin gastar una llamada real—, lo que se acepta como imagen, y
// sobre todo la lógica de gestos, que es la que separa a una persona de una foto.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { derivarClaveFirma, normalizarImagen, ErrorRekognition } from '../kyc/rekognition.js'
import {
  emitirReto, comprobarReto, evaluarGesto, retosVivos, _vaciarRetos,
  INSTRUCCIONES, type Gesto,
} from '../kyc/vivacidad.js'
import { sinProveedor } from '../kyc/biometria.js'
import type { RostroDetectado } from '../kyc/rekognition.js'

// ─────────────────────────────────────────────────────────────────────────────
// Firma SigV4
// ─────────────────────────────────────────────────────────────────────────────

test('la clave de firma coincide con el ejemplo publicado por AWS', () => {
  // Ejemplo de la documentación de Signature Version 4. Si esta línea deja de
  // pasar, todas las llamadas a Rekognition devolverían 403 sin explicar nada.
  const clave = derivarClaveFirma(
    'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20150830', 'us-east-1', 'iam')
  assert.equal(
    clave.toString('hex'),
    'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9')
})

test('la clave de firma cambia con el día, la región y el servicio', () => {
  const base = derivarClaveFirma('s3cr3t', '20260805', 'us-east-1', 'rekognition').toString('hex')
  for (const otra of [
    derivarClaveFirma('s3cr3t', '20260806', 'us-east-1', 'rekognition'),
    derivarClaveFirma('s3cr3t', '20260805', 'us-east-2', 'rekognition'),
    derivarClaveFirma('s3cr3t', '20260805', 'us-east-1', 'iam'),
  ]) assert.notEqual(otra.toString('hex'), base)
})

// ─────────────────────────────────────────────────────────────────────────────
// Imágenes
// ─────────────────────────────────────────────────────────────────────────────

const B64 = Buffer.from('una imagen de mentira').toString('base64')

test('acepta base64 con y sin la envoltura de data URI', () => {
  assert.equal(normalizarImagen(B64, 'x'), B64)
  assert.equal(normalizarImagen(`data:image/jpeg;base64,${B64}`, 'x'), B64)
  assert.equal(normalizarImagen(`data:image/png;base64,${B64}`, 'x'), B64)
})

test('rechaza una URL: bajarla convertiría al servidor en cliente de quien se verifica', () => {
  assert.throws(() => normalizarImagen('https://ejemplo.tld/cara.jpg', 'el selfie'),
    (e: any) => e instanceof ErrorRekognition && e.tipo === 'ImagenPorUrl')
  // También la forma que se usaría para alcanzar la red interna de la nube.
  assert.throws(() => normalizarImagen('http://169.254.169.254/latest/meta-data/', 'el selfie'),
    (e: any) => e.tipo === 'ImagenPorUrl')
})

test('rechaza lo que no es base64 y lo que viene vacío', () => {
  assert.throws(() => normalizarImagen('', 'el selfie'), (e: any) => e.tipo === 'ImagenVacia')
  assert.throws(() => normalizarImagen('no-es-base64-!!', 'el selfie'),
    (e: any) => e.tipo === 'ImagenInvalida')
})

test('rechaza imágenes por encima del límite de la API', () => {
  const enorme = 'A'.repeat(8 * 1024 * 1024)
  assert.throws(() => normalizarImagen(enorme, 'el selfie'), (e: any) => e.tipo === 'ImagenGrande')
})

// ─────────────────────────────────────────────────────────────────────────────
// Retos
// ─────────────────────────────────────────────────────────────────────────────

test('el reto empieza de frente, no repite gestos y trae instrucciones legibles', () => {
  _vaciarRetos()
  for (let i = 0; i < 40; i++) {
    const r = emitirReto('idn_1')
    assert.equal(r.gestos.length, 4)
    assert.equal(r.gestos[0], 'frente')
    assert.equal(new Set(r.gestos).size, 4, 'no debe repetirse un gesto dentro del reto')
    assert.deepEqual(r.instrucciones, r.gestos.map((g) => INSTRUCCIONES[g]))
    assert.ok(new Date(r.venceEn).getTime() > Date.now())
  }
})

test('cada reto es distinto: no se puede grabar el vídeo de antemano', () => {
  _vaciarRetos()
  const ids = new Set<string>()
  const secuencias = new Set<string>()
  for (let i = 0; i < 60; i++) {
    const r = emitirReto('idn_1')
    ids.add(r.id)
    secuencias.add(r.gestos.join(','))
  }
  assert.equal(ids.size, 60, 'los identificadores de reto no pueden repetirse')
  assert.ok(secuencias.size >= 8, `se esperaba variedad de secuencias, hubo ${secuencias.size}`)
})

test('un reto inexistente, vencido o ajeno no vale', async () => {
  _vaciarRetos()
  const r = emitirReto('idn_1')
  const marcos = ['a', 'b', 'c', 'd']

  assert.match((await comprobarReto('reto_inventado', 'idn_1', marcos)).motivo!, /no existe/)
  assert.match((await comprobarReto(r.id, 'idn_OTRA', marcos)).motivo!, /otra identidad/)
  assert.equal((await comprobarReto(r.id, 'idn_OTRA', marcos)).puntuacion, 0)
})

test('faltando o sobrando fotogramas, el reto no se evalúa', async () => {
  _vaciarRetos()
  const r = emitirReto('idn_1')
  const corto = await comprobarReto(r.id, 'idn_1', ['a', 'b'])
  assert.equal(corto.puntuacion, 0)
  assert.match(corto.motivo!, /se esperaban 4 fotogramas/i)
})

test('un reto es de un solo uso, aunque el intento anterior fallara', async () => {
  _vaciarRetos()
  const r = emitirReto('idn_1')
  // Primer intento: los fotogramas no son imágenes, así que fallará — pero gasta
  // el reto. Si no fuera así se podrían ir probando fotogramas hasta acertar.
  await comprobarReto(r.id, 'idn_1', ['a', 'b', 'c', 'd'])
  const segundo = await comprobarReto(r.id, 'idn_1', ['a', 'b', 'c', 'd'])
  assert.match(segundo.motivo!, /ya se usó/)
})

test('los retos vencidos se purgan solos', () => {
  _vaciarRetos()
  emitirReto('idn_1'); emitirReto('idn_2')
  assert.equal(retosVivos(), 2)
  _vaciarRetos()
  assert.equal(retosVivos(), 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// Gestos
// ─────────────────────────────────────────────────────────────────────────────

function rostro(cambios: Partial<RostroDetectado> = {}): RostroDetectado {
  return {
    confianza: 0.99,
    sonrisa: { valor: false, confianza: 0.97 },
    ojosAbiertos: { valor: true, confianza: 0.98 },
    bocaAbierta: { valor: false, confianza: 0.96 },
    gafas: false,
    postura: { guinada: 2, cabeceo: -3, alabeo: 1 },
    calidad: { brillo: 70, nitidez: 45 },
    tamano: 0.4,
    ...cambios,
  }
}

test('gesto de frente: pasa mirando a la cámara, falla con la cabeza girada', () => {
  assert.ok(evaluarGesto('frente', rostro()).ok)
  assert.equal(evaluarGesto('frente', rostro({ postura: { guinada: 30, cabeceo: 0, alabeo: 0 } })).ok, false)
  assert.equal(evaluarGesto('frente', rostro({ postura: { guinada: 0, cabeceo: 35, alabeo: 0 } })).ok, false)
  assert.equal(evaluarGesto('frente', rostro({ ojosAbiertos: { valor: false, confianza: 0.99 } })).ok, false)
})

test('sonreír y abrir la boca se comprueban por separado', () => {
  assert.ok(evaluarGesto('sonreir', rostro({ sonrisa: { valor: true, confianza: 0.95 } })).ok)
  assert.equal(evaluarGesto('sonreir', rostro()).ok, false)
  assert.ok(evaluarGesto('boca-abierta', rostro({ bocaAbierta: { valor: true, confianza: 0.9 } })).ok)
  assert.equal(evaluarGesto('boca-abierta', rostro()).ok, false)
})

test('un atributo con poca confianza no da el gesto por hecho', () => {
  // El proveedor dice "sí" pero con 60 % de confianza: eso no es una sonrisa
  // comprobada, es una suposición, y no puede sostener una identidad.
  assert.equal(evaluarGesto('sonreir', rostro({ sonrisa: { valor: true, confianza: 0.6 } })).ok, false)
})

test('ojos cerrados: con gafas de sol no se puede comprobar y se dice', () => {
  const cerrados = { valor: false, confianza: 0.97 }
  assert.ok(evaluarGesto('ojos-cerrados', rostro({ ojosAbiertos: cerrados })).ok)
  const conGafas = evaluarGesto('ojos-cerrados', rostro({ ojosAbiertos: cerrados, gafas: true }))
  assert.equal(conGafas.ok, false)
  assert.match(conGafas.motivo!, /gafas/)
  assert.equal(evaluarGesto('ojos-cerrados', rostro()).ok, false)
})

test('girar la cabeza vale hacia cualquier lado', () => {
  // A propósito: con la cámara frontal espejada, "izquierda" y "derecha" se
  // interpretan al revés según el teléfono, y eso reprobaría a gente honesta.
  for (const guinada of [25, -25, 40, -40]) {
    assert.ok(evaluarGesto('girar-cabeza', rostro({ postura: { guinada, cabeceo: 0, alabeo: 0 } })).ok,
      `debería aceptar ${guinada}°`)
  }
  for (const guinada of [0, 10, -15, 21]) {
    assert.equal(
      evaluarGesto('girar-cabeza', rostro({ postura: { guinada, cabeceo: 0, alabeo: 0 } })).ok, false,
      `no debería aceptar ${guinada}°`)
  }
})

test('todos los gestos sorteables tienen instrucción escrita', () => {
  const gestos: Gesto[] = ['frente', 'sonreir', 'boca-abierta', 'ojos-cerrados', 'girar-cabeza']
  for (const g of gestos) assert.ok(INSTRUCCIONES[g]?.length > 4, `falta instrucción de ${g}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// Política
// ─────────────────────────────────────────────────────────────────────────────

test('sin proveedor, el resultado dice "no comprobado", nunca "correcto"', () => {
  const r = sinProveedor()
  assert.equal(r.estado, 'no-configurada')
  assert.equal(r.parecido, null)
  assert.equal(r.vivacidad, null)
  assert.notEqual(r.estado, 'ok')
})

// ─────────────────────────────────────────────────────────────────────────────
// La politica de aprobacion de la prueba de vida
// ─────────────────────────────────────────────────────────────────────────────

import { _puntuar } from '../kyc/vivacidad.js'

test('exigir los cuatro gestos perfectos dejaba fuera a casi todo el mundo', () => {
  // Este es el caso que hacia imposible verificarse: tres gestos bien y uno a
  // medias daba 0,75, por debajo del umbral de 0,90.
  const casi = _puntuar([
    { gesto: 'frente', ok: true }, { gesto: 'sonreir', ok: true },
    { gesto: 'boca-abierta', ok: true }, { gesto: 'ojos-cerrados', ok: false },
  ] as any)
  assert.ok(casi >= 0.9, `de frente y dos de tres deberia bastar, dio ${casi}`)
})

test('los cuatro gestos puntuan mas que los justos', () => {
  const todos = _puntuar([
    { gesto: 'frente', ok: true }, { gesto: 'sonreir', ok: true },
    { gesto: 'boca-abierta', ok: true }, { gesto: 'ojos-cerrados', ok: true },
  ] as any)
  const justos = _puntuar([
    { gesto: 'frente', ok: true }, { gesto: 'sonreir', ok: true },
    { gesto: 'boca-abierta', ok: true }, { gesto: 'ojos-cerrados', ok: false },
  ] as any)
  assert.ok(todos > justos, 'un expediente impecable debe distinguirse de uno justo')
})

test('una fotografia sigue sin pasar', () => {
  // Una foto puesta ante la camara cumple «de frente» y nada mas.
  const foto = _puntuar([
    { gesto: 'frente', ok: true }, { gesto: 'sonreir', ok: false },
    { gesto: 'boca-abierta', ok: false }, { gesto: 'girar-cabeza', ok: false },
  ] as any)
  assert.ok(foto < 0.9, `una foto no puede pasar, dio ${foto}`)
})

test('un solo gesto ademas del de frente no basta', () => {
  const uno = _puntuar([
    { gesto: 'frente', ok: true }, { gesto: 'sonreir', ok: true },
    { gesto: 'boca-abierta', ok: false }, { gesto: 'girar-cabeza', ok: false },
  ] as any)
  assert.ok(uno < 0.9, `uno de tres no puede bastar, dio ${uno}`)
})

test('sin mirar de frente no se aprueba, aunque salgan los demas', () => {
  const sinFrente = _puntuar([
    { gesto: 'frente', ok: false }, { gesto: 'sonreir', ok: true },
    { gesto: 'boca-abierta', ok: true }, { gesto: 'girar-cabeza', ok: true },
  ] as any)
  assert.ok(sinFrente < 0.9, `sin el de frente no hay cotejo fiable, dio ${sinFrente}`)
})
