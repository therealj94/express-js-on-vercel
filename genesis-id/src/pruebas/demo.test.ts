// El recorrido de demostración.
//
// POR QUE ESTA PRUEBA EXISTE
//
// Enseñar el producto obligaba a abrir el expediente de una persona real
// —su documento, su cara— delante de quien mira. La demo es la salida a eso,
// pero solo si cumple dos condiciones, y las dos se pueden romper sin que se
// note:
//
//   1. QUE NO ESCRIBA NADA. Una demo que crea identidades de mentira ensucia
//      las cifras de cumplimiento, y unas cifras con basura dentro no sirven
//      para lo único que sirven: responderle a un auditor. Y el día que pase,
//      nadie va a sospechar de la pantalla de demostración.
//
//   2. QUE LO INVENTADO SE RECONOZCA. Si un dato de la demo apareciera en una
//      pantalla de verdad —o al revés, si alguien copiara el ejemplo a un
//      formulario real— tiene que cantar. Por eso el correo usa
//      `ejemplo.invalid`, un dominio que por norma NO PUEDE existir (RFC 2606),
//      y el documento es un número imposible.
//
// Lo demás que se comprueba es que el guion cuente el producto DE VERDAD: los
// mismos estados que usa el motor, y las salidas que no son la buena. Una demo
// que solo enseña el camino feliz vende algo que no existe.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const carpeta = mkdtempSync(join(tmpdir(), 'genesis-demo-'))
process.env.GENESIS_DATA_FILE = join(carpeta, 'datos.json')
delete process.env.GENESIS_MONGO_URL

const { recorrido, PASOS, PERSONA_DEMO } = await import('../motor/demo.js')
const { store } = await import('../store.js')

describe('el recorrido de demostración', () => {
  test('NO ESCRIBE NADA, ni llamándolo mil veces', () => {
    const antes = JSON.stringify(store.todo())
    for (let i = 0; i < 1000; i++) recorrido()
    assert.equal(JSON.stringify(store.todo()), antes,
      'la demo tocó el almacén: eso ensucia las cifras de cumplimiento')
  })

  test('lo inventado se reconoce a simple vista', () => {
    assert.ok(PERSONA_DEMO.email.endsWith('@ejemplo.invalid'),
      '.invalid no puede existir por norma (RFC 2606): si aparece en una pantalla real, canta')
    assert.match(PERSONA_DEMO.documento.numero, /^0+[-0]+$/,
      'un número de documento imposible a propósito')
    assert.ok(PERSONA_DEMO.gid.includes('DEMO'),
      'el GID lleva DEMO dentro: en una lista de identidades se ve sin buscarlo')
  })

  test('el aviso lo dice antes que nada', () => {
    const r = recorrido()
    assert.match(r.aviso, /DEMOSTRACION/)
    // Las dos cosas que el aviso TIENE que decir: que no es nadie real, y que
    // no queda guardado. Se buscan por separado y no con una frase exacta: una
    // prueba atada a la redacción se rompe al mejorar el texto, que es lo
    // contrario de lo que hace falta.
    assert.match(r.aviso, /no es una persona real|persona real/i)
    assert.match(r.aviso, /se guarda/i)
  })

  test('los pasos son los estados DE VERDAD del motor, y en orden', () => {
    /* Si alguien cambia la máquina de estados y no toca la demo, la demo pasa a
       enseñar un producto que ya no existe — y nadie lo nota, porque la demo se
       mira cuando hay visita, no cuando se programa. */
    assert.deepEqual(PASOS.map((p) => p.estado),
      ['iniciada', 'datos', 'documento', 'biometria', 'en-revision', 'verificada'])
  })

  test('cada paso dice las TRES cosas que pasan a la vez', () => {
    for (const p of PASOS) {
      assert.ok(p.queHizoLaPersona.length > 20, `${p.estado}: falta qué hizo la persona`)
      assert.ok(p.queRecibeGenesis.length > 20, `${p.estado}: falta qué recibe Genesis`)
      assert.ok(p.queVeElOperador.length > 20, `${p.estado}: falta qué ve el operador`)
      assert.ok(p.duracionTipica.length > 3,
        `${p.estado}: sin cuánto tarda, la demo hace creer que todo es instantáneo`)
    }
  })

  test('se distingue lo que decide una máquina de lo que decide una persona', () => {
    const aMano = PASOS.filter((p) => !p.automatico).map((p) => p.estado)
    assert.deepEqual(aMano, ['en-revision', 'verificada'],
      'aprobar es un acto humano y la demo tiene que enseñarlo así')
  })

  test('enseña también las salidas que NO son la buena', () => {
    const r = recorrido()
    assert.deepEqual(r.salidas.map((s) => s.estado), ['rechazada', 'suspendida'])
    for (const s of r.salidas) {
      assert.ok(s.porQuePasa.length > 30)
      assert.ok(s.queQueda.length > 20, 'qué queda después importa tanto como por qué pasó')
    }
  })

  test('enseña el RESULTADO, que es lo que le importa a quien integra', () => {
    const l = recorrido().loQueRecibeLaApp
    assert.equal(l.gid, PERSONA_DEMO.gid)
    assert.equal(l.verificada, true)
    assert.ok(l.noRecibe.length >= 3,
      'lo que NO se entrega es la mitad del argumento de un sistema de identidad')
  })

  test('lo que la app recibe NO incluye el documento ni el retrato', () => {
    /* Esta es la promesa central del producto: una app del ecosistema nunca ve
       el documento de nadie. Si algún día el objeto de ejemplo lo incluyera,
       la demo estaría enseñando lo contrario de lo que el sistema hace. */
    const texto = JSON.stringify(recorrido().loQueRecibeLaApp).toLowerCase()
    for (const prohibido of ['numero', 'documento', 'retrato', 'fechanacimiento']) {
      const enLoQueRecibe = JSON.stringify(
        Object.fromEntries(Object.entries(recorrido().loQueRecibeLaApp)
          .filter(([k]) => k !== 'noRecibe'))).toLowerCase()
      assert.ok(!enLoQueRecibe.includes(prohibido),
        `«${prohibido}» aparece en lo que la app recibe, y no debería`)
    }
    assert.ok(texto.includes('norecibe'), 'y se dice explícitamente qué no se entrega')
  })
})
