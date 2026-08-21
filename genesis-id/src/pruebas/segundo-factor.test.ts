/**
 * El segundo factor de los operadores, de punta a punta.
 *
 * El TOTP en sí ya está comprobado contra los vectores del RFC 6238 en
 * `totp.test.ts`. Acá se prueba lo otro, que es donde se cometen los errores de
 * verdad: cómo se enchufa al login.
 *
 *   - sin código no se entra, aunque la contraseña sea buena
 *   - un código NO sirve dos veces
 *   - los intentos con código malo cuentan para el bloqueo
 *   - los códigos de recuperación funcionan y se gastan
 *   - poner esto no deja fuera al equipo que todavía no lo activó
 */

import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'segundofactor-'))
process.env.GENESIS_DATOS = join(carpeta, 'genesis.json')
process.env.GENESIS_2FA_ROLES = 'admin,cumplimiento'

const ops = await import('../auth/operadores.js')
const { store } = await import('../store.js')
const { codigo, pasoDe, PASO_S } = await import('../auth/totp.js')

after(() => rmSync(carpeta, { recursive: true, force: true }))

const CLAVE = 'una contrasena larga de operador'

function nuevoOperador(rol: 'admin' | 'cumplimiento' | 'revisor' = 'cumplimiento') {
  return ops.crearOperador({
    email: `${rol}-${Math.floor(Math.random() * 1e9)}@prueba.org`,
    nombre: 'De Prueba', rol, contrasena: CLAVE, debeCambiar: false,
  })
}

/**
 * Deja a un operador con el segundo factor activo y devuelve su secreto.
 *
 * Se activa con el codigo del paso ANTERIOR, que la ventana acepta igual. No es
 * un truco de la prueba: es que activar GASTA ese codigo, asi que si se usara el
 * del paso actual, el `entrar` de justo despues seria una repeticion y el
 * sistema lo rechazaria con razon. Activando con el anterior, el paso de ahora
 * queda limpio, que es lo que pasa en la vida real donde entre escanear el QR y
 * entrar pasan minutos.
 */
function conSegundoFactor(rol: 'admin' | 'cumplimiento' | 'revisor' = 'cumplimiento') {
  const o = nuevoOperador(rol)
  const p = ops.prepararSegundoFactor(o.id)
  assert.equal(p.ok, true)
  const secreto = p.secreto!
  const a = ops.activarSegundoFactor(o.id, codigo(secreto, pasoDe() - 1))
  assert.equal(a.ok, true, a.error)
  return { o, secreto, respaldos: a.respaldos! }
}

describe('Segundo factor · alta', () => {
  beforeEach(() => store.reiniciar())

  test('preparar da el secreto y la dirección del QR, pero NO lo deja activo', () => {
    const o = nuevoOperador()
    const p = ops.prepararSegundoFactor(o.id)

    assert.equal(p.ok, true)
    assert.ok(p.secreto && p.secreto.length >= 32)
    assert.match(p.uri!, /^otpauth:\/\/totp\//)

    // Clave: mientras no demuestre que lo escaneó, se sigue entrando sin código.
    // Darlo por activo sin comprobarlo es la forma más fácil de dejar a alguien
    // fuera de su propia cuenta.
    assert.equal(ops.entrar(o.email, CLAVE, null).ok, true)
  })

  test('no se activa con un código inventado', () => {
    const o = nuevoOperador()
    ops.prepararSegundoFactor(o.id)
    const r = ops.activarSegundoFactor(o.id, '000000')
    assert.equal(r.ok, false)
    assert.match(String(r.error), /no es correcto/)
  })

  /* El codigo que se gasta activando no puede servir ademas para entrar. Es la
     misma regla de siempre —un codigo, un uso— aplicada al momento del alta,
     que es justo donde se olvida. */
  test('el código que se usó para activar no sirve además para entrar', () => {
    const o = nuevoOperador()
    const p = ops.prepararSegundoFactor(o.id)
    const c = codigo(p.secreto!, pasoDe())

    assert.equal(ops.activarSegundoFactor(o.id, c).ok, true)
    const r = ops.entrar(o.email, CLAVE, null, c)
    assert.equal(r.ok, false, 'activar ya gastó ese código')
    assert.match(String(r.motivo), /ya se usó/)
  })

  test('al activarlo salen diez códigos de recuperación, una sola vez', () => {
    const { respaldos } = conSegundoFactor()
    assert.equal(respaldos.length, 10)
    // Y ya no vuelven a salir por ninguna ruta: en la base solo quedan hashes.
    const guardados = store.todo().operadores.at(-1)!.segundoFactor!.respaldos
    assert.equal(guardados.length, 10)
    for (const h of guardados) {
      assert.ok(!respaldos.some((c) => h.includes(c)), 'no se puede guardar en claro')
    }
  })
})

describe('Segundo factor · entrar', () => {
  beforeEach(() => store.reiniciar())

  test('con la contraseña buena pero sin código NO se entra', () => {
    const { o } = conSegundoFactor()
    const r = ops.entrar(o.email, CLAVE, null)
    assert.equal(r.ok, false)
    assert.equal(r.faltaSegundoFactor, true, 'el panel tiene que saber que pedir el código')
  })

  test('con la contraseña buena y el código bueno, se entra', () => {
    const { o, secreto } = conSegundoFactor()
    const r = ops.entrar(o.email, CLAVE, null, codigo(secreto, pasoDe()))
    assert.equal(r.ok, true, r.motivo)
    assert.ok(r.sesion?.token)
  })

  test('con el código bueno pero la contraseña mala, tampoco', () => {
    const { o, secreto } = conSegundoFactor()
    const r = ops.entrar(o.email, 'la que no es', null, codigo(secreto, pasoDe()))
    assert.equal(r.ok, false)
    assert.equal(r.faltaSegundoFactor, undefined, 'ni siquiera se llega a mirar el código')
  })

  /* LA IMPORTANTE. Quien mira la pantalla por encima del hombro tiene treinta
     segundos para volver a escribir el mismo código. Guardar el paso convierte
     cada código en de un solo uso. */
  test('el MISMO código no sirve dos veces', () => {
    const { o, secreto } = conSegundoFactor()
    const c = codigo(secreto, pasoDe())

    assert.equal(ops.entrar(o.email, CLAVE, null, c).ok, true)

    const segunda = ops.entrar(o.email, CLAVE, null, c)
    assert.equal(segunda.ok, false, 'reusar el código tiene que fallar')
    assert.match(String(segunda.motivo), /ya se usó/)
  })

  test('y tampoco sirve uno anterior al último aceptado', () => {
    const { o, secreto } = conSegundoFactor()
    const ahora = Date.now()
    assert.equal(ops.entrar(o.email, CLAVE, null, codigo(secreto, pasoDe(ahora))).ok, true)

    // Uno del paso anterior: la ventana lo aceptaría, el anti-repetición no.
    const previo = codigo(secreto, pasoDe(ahora) - 1)
    assert.equal(ops.entrar(o.email, CLAVE, null, previo).ok, false)
  })

  test('el código del paso siguiente sí vale: los relojes no van iguales', () => {
    const { o, secreto } = conSegundoFactor()
    const siguiente = codigo(secreto, pasoDe(Date.now() + PASO_S * 1000))
    assert.equal(ops.entrar(o.email, CLAVE, null, siguiente).ok, true)
  })

  /* Sin esto el segundo factor sería una molestia y no una barrera: quien tenga
     la contraseña probaría códigos de seis dígitos sin límite. */
  test('los intentos con código malo cuentan para el bloqueo', () => {
    const { o } = conSegundoFactor()
    let ultimo
    for (let i = 0; i < 6; i++) ultimo = ops.entrar(o.email, CLAVE, null, '000000')
    assert.equal(ultimo!.bloqueado, true, 'probar códigos sin fin no puede salir gratis')
  })
})

describe('Segundo factor · recuperación', () => {
  beforeEach(() => store.reiniciar())

  test('un código de recuperación deja entrar', () => {
    const { o, respaldos } = conSegundoFactor()
    assert.equal(ops.entrar(o.email, CLAVE, null, respaldos[0]).ok, true)
  })

  test('y se gasta: el mismo no vale dos veces', () => {
    const { o, respaldos } = conSegundoFactor()
    assert.equal(ops.entrar(o.email, CLAVE, null, respaldos[0]).ok, true)
    assert.equal(ops.entrar(o.email, CLAVE, null, respaldos[0]).ok, false)
    assert.equal(store.todo().operadores.at(-1)!.segundoFactor!.respaldos.length, 9)
  })

  test('se acepta escrito sin el guion y en minúsculas', () => {
    const { o, respaldos } = conSegundoFactor()
    const aMano = respaldos[0].replace('-', '').toLowerCase()
    assert.equal(ops.entrar(o.email, CLAVE, null, aMano).ok, true)
  })

  test('un administrador puede quitarlo, y queda escrito quién fue', () => {
    const { o } = conSegundoFactor()
    const antes = store.todo().bitacora.length

    assert.equal(ops.quitarSegundoFactor(o.id, 'jefe@prueba.org').ok, true)
    assert.equal(ops.entrar(o.email, CLAVE, null).ok, true, 'sin segundo factor se vuelve a entrar')

    const nuevas = store.todo().bitacora.slice(antes)
    const anotado = nuevas.find((e) => e.accion === 'segundofactor.quitado')
    assert.ok(anotado, 'quitar el segundo factor tiene que quedar en la bitácora')
    assert.equal(anotado!.actor, 'jefe@prueba.org')
  })
})

describe('Segundo factor · puesta en marcha sin dejar a nadie fuera', () => {
  beforeEach(() => store.reiniciar())

  test('quien tiene rol obligado y no lo activó entra, pero se le avisa', () => {
    const o = nuevoOperador('cumplimiento')
    const r = ops.entrar(o.email, CLAVE, null)
    assert.equal(r.ok, true, 'cerrarlo de golpe dejaría fuera al equipo entero')
    assert.equal(r.debeActivarSegundoFactor, true, 'pero el panel tiene que llevarlo a activarlo')
  })

  test('a quien no tiene rol obligado no se le avisa de nada', () => {
    const o = nuevoOperador('revisor')
    const r = ops.entrar(o.email, CLAVE, null)
    assert.equal(r.ok, true)
    assert.equal(r.debeActivarSegundoFactor, false)
  })

  test('se cuenta quién falta, que es lo que evita el «lo tiene una persona»', () => {
    nuevoOperador('cumplimiento')
    nuevoOperador('admin')
    nuevoOperador('revisor')
    const { o } = conSegundoFactor('cumplimiento')

    const s = ops.saludSegundoFactor()
    assert.equal(s.activos, 1)
    assert.equal(s.obligadosSinPonerlo, 2, 'el revisor no cuenta: su rol no lo exige')
    assert.ok(!s.quienesFaltan.includes(o.email))
  })
})
