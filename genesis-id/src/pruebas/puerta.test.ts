// La puerta del panel: qué se responde cuando NO se puede entrar.
//
// Estas pruebas existen por una avería real. Una persona intentaba entrar desde
// el móvil, el servidor la rechazaba, y el panel lo anunciaba como «La sesión
// caducó» —una sesión que nunca había existido—, así que nadie podía saber si
// el problema era la contraseña, la cuenta o un bloqueo. Debajo había además
// una trampa: el contador de intentos fallidos no volvía nunca a cero, y al
// llegar a cinco la cuenta quedaba encerrada en ciclos de quince minutos.
//
// Aquí no se escribe ninguna contraseña: todo se comprueba con un correo que no
// pertenece a ningún operador, que es justo el caso de quien llega a esta
// puerta sin tener cuenta en ella.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-puerta-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
delete process.env.GENESIS_MONGO_URL

const { entrar } = await import('../auth/operadores.js')

const MINUTO = 60000
const DESCONOCIDO = 'nadie@prueba.local'

// El reloj se mueve a mano en vez de esperar quince minutos de verdad.
const relojReal = Date.now
let desfase = 0
const avanzar = (ms: number) => { desfase += ms }

before(() => { Date.now = () => relojReal() + desfase })
after(() => {
  Date.now = relojReal
  rmSync(carpeta, { recursive: true, force: true })
})

const intento = (correo = DESCONOCIDO) => entrar(correo, 'da-igual', null)

// Se comprueba el motivo, no solo la marca de bloqueo: lo que ve la persona es
// el texto, y es justo lo que la avería hacía imposible de leer.
const porCredenciales = (r: ReturnType<typeof entrar>) => {
  assert.equal(r.ok, false)
  assert.equal(r.bloqueado, undefined)
  assert.equal(r.motivo, 'Correo o contraseña incorrectos')
}
const porBloqueo = (r: ReturnType<typeof entrar>) => {
  assert.equal(r.ok, false)
  assert.equal(r.bloqueado, true)
  assert.match(r.motivo!, /Demasiados intentos/)
}

describe('Rechazo en la puerta del panel', () => {
  test('un correo que no es de ningún operador recibe el mismo motivo de siempre', () => {
    // El motivo no dice cuál de los dos datos falla: distinguirlos permitiría
    // averiguar qué correos son de operadores.
    porCredenciales(intento())
  })

  test('a los cinco fallos se bloquea, y se dice que es un bloqueo', () => {
    for (let i = 0; i < 4; i++) porCredenciales(intento()) // el quinto incluido
    porBloqueo(intento())
  })

  test('reintentar durante el bloqueo NO lo alarga', () => {
    const alPrincipio = intento().motivo
    avanzar(10 * MINUTO)
    // Se insiste en mitad del castigo, que es lo que hace cualquiera desde el
    // móvil. Si esto alargara el bloqueo, no habría forma de salir de él.
    const aMitad = intento()
    porBloqueo(aMitad)
    assert.notEqual(aMitad.motivo, alPrincipio) // quedan menos minutos, no los mismos
    assert.match(aMitad.motivo!, /en [1-5] minuto/)
  })

  test('pasado el cuarto de hora se puede volver a intentar, y hay cinco intentos otra vez', () => {
    avanzar(6 * MINUTO) // 16 minutos desde el bloqueo

    // Aquí estaba la trampa: como el contador nunca volvía a cero, el primer
    // fallo después de cumplir el castigo dejaba la cuenta en seis y el bloqueo
    // empezaba otra vez entero. Ahora la ventana vencida borra la cuenta atrás.
    for (let i = 0; i < 5; i++) porCredenciales(intento())
    porBloqueo(intento())
  })

  test('los fallos sueltos caducan: no se acumulan de una semana para otra', () => {
    const otro = 'tampoco@prueba.local'
    for (let i = 0; i < 4; i++) porCredenciales(intento(otro))
    avanzar(20 * MINUTO)
    // Los cuatro fallos viejos ya no cuentan: estos son de una ventana nueva.
    for (let i = 0; i < 5; i++) porCredenciales(intento(otro))
    porBloqueo(intento(otro))
  })
})
