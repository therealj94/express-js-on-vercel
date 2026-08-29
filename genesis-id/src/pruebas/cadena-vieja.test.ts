// El respaldo de la cadena 8532.
//
// POR QUE ESTA PRUEBA EXISTE
//
// La 8532 se cerró el 10 de agosto y su nodo ya no contesta. Lo único que queda
// es el volcado del corte — el MISMO que decidió qué saldo se llevó cada quien
// a la 5550. Si estos datos se corrompen, no hay dónde volver a mirar.
//
// Y hay una forma concreta de corromperlos sin que se note: los saldos en wei
// son hasta 21 dígitos, y en JavaScript un número solo guarda 15 con exactitud.
// Sumar, ordenar o comparar saldos con `Number` da resultados que PARECEN bien
// —el orden sale casi igual, los totales casi cuadran— y son falsos.
//
//     Number('250000000000000000000000000000') + 1  ===  Number('250000000000000000000000000000')
//
// Por eso la prueba no se conforma con «devuelve algo»: comprueba que los
// números grandes sobreviven exactos.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const { respaldo, buscar, porDireccion } = await import('../motor/cadenaVieja.js')

describe('el respaldo de la 8532', () => {
  test('carga, y sabe de qué cadena habla', () => {
    const r = respaldo()
    assert.equal(r.cadena.id, 8532)
    assert.equal(r.cadena.estado, 'cerrada')
    assert.equal(r.cadena.sustituidaPor, 5550)
    assert.ok(String(r.cadena.raizDeEstado).startsWith('0x'),
      'sin la raíz de estado el respaldo no se puede contrastar con nada')
    assert.ok(String(r.cadena.origenDelDato).includes('estado-v3.json'),
      'de dónde salió el dato va escrito: un respaldo sin origen no es prueba de nada')
  })

  test('trae las 332 cuentas del corte', () => {
    const r = respaldo()
    assert.equal(r.cuentas.length, 332)
    assert.equal(r.resumen.cuentas, 332)
    assert.equal(r.resumen.billeteras, 159)
    assert.equal(r.resumen.contratos, 173)
  })

  test('LOS SALDOS SOBREVIVEN EXACTOS, sin redondear', () => {
    const r = respaldo()
    // Todos son cadenas, no números: en cuanto uno sea number ya se redondeó.
    assert.ok(r.cuentas.every((c) => typeof c.saldo === 'string'),
      'un saldo como number ya perdió dígitos y no hay forma de recuperarlos')

    const mayor = r.cuentas.map((c) => BigInt(c.saldo)).reduce((a, b) => (a > b ? a : b))
    assert.equal(mayor.toString(), '250000000000000000000000000000',
      'el saldo más grande, dígito por dígito')

    // Y la prueba de que el redondeo sería real si se usara Number:
    assert.equal(Number('250000000000000000000000000000') + 1,
                 Number('250000000000000000000000000000'),
                 'esto es lo que pasaría con Number: sumar uno no cambia nada')
  })

  test('el total suma el billón de ORIGEN', () => {
    const total = respaldo().cuentas.reduce((a, c) => a + BigInt(c.saldo), 0n)
    assert.equal(total.toString(), respaldo().resumen.origenTotal)
    assert.equal(total / 10n ** 18n, 1000000000010n)
  })

  test('ordena por saldo de verdad, no por cadena', () => {
    /* Ordenar saldos como texto pone «9» delante de «10». Con 21 dígitos y
       longitudes distintas el orden sale completamente mal, y a ojo parece
       razonable porque los primeros siguen siendo grandes. */
    const l = buscar({ orden: 'saldo', limite: 500 }).cuentas
    for (let i = 1; i < l.length; i++) {
      assert.ok(BigInt(l[i - 1].saldo) >= BigInt(l[i].saldo),
        `fuera de orden en la posición ${i}: ${l[i - 1].saldo} antes que ${l[i].saldo}`)
    }
  })

  describe('los filtros', () => {
    test('por tipo', () => {
      const b = buscar({ tipo: 'billetera', limite: 500 })
      assert.equal(b.total, 159)
      assert.ok(b.cuentas.every((c) => c.tipo === 'billetera'))
    })

    test('solo las que tienen saldo', () => {
      const b = buscar({ tipo: 'billetera', soloConSaldo: true, limite: 500 })
      assert.equal(b.total, 156)
      assert.ok(b.cuentas.every((c) => BigInt(c.saldo) > 0n))
    })

    test('solo las que movieron algo alguna vez', () => {
      const b = buscar({ tipo: 'billetera', soloQueMovieron: true, limite: 500 })
      assert.ok(b.cuentas.every((c) => c.nonce > 0))
      assert.equal(b.total, respaldo().resumen.billeterasQueMovieron)
    })

    test('por saldo mínimo, contado en ORIGEN y no en wei', () => {
      /* Se teclea «1000», no «1000000000000000000000». Pedirle a alguien que
         escriba wei en un buscador es pedirle que se equivoque. */
      const b = buscar({ minimo: '1000', limite: 500 })
      assert.ok(b.cuentas.every((c) => BigInt(c.saldo) >= 1000n * 10n ** 18n))
      assert.ok(b.total > 0 && b.total < 332)
    })

    test('por dirección, aunque se escriba en mayúsculas', () => {
      // La primera con dirección, no la primera a secas: 18 cuentas no tienen,
      // y aunque hoy la mayor sí la tenga, atarse a eso es atarse al orden.
      const una = respaldo().cuentas.find((c) => c.direccion)!.direccion!
      const b = buscar({ texto: una.toUpperCase() })
      assert.equal(b.total, 1)
      assert.equal(b.cuentas[0].direccion, una)
    })

    test('la suma es la DEL FILTRO, no la del universo', () => {
      /* Si el total ignorara el filtro sería el mismo número siempre, y un
         número que no cambia al filtrar no está diciendo nada. */
      const todo = buscar({ limite: 500 })
      const soloBill = buscar({ tipo: 'billetera', limite: 500 })
      assert.notEqual(todo.sumaFiltrada, soloBill.sumaFiltrada)
      const suma = soloBill.cuentas.reduce((a, c) => a + BigInt(c.saldo), 0n)
      assert.equal(soloBill.sumaFiltrada, suma.toString())
    })
  })

  describe('las páginas', () => {
    test('el total son las que cuadran, no las que caben', () => {
      const b = buscar({ limite: 10 })
      assert.equal(b.cuentas.length, 10)
      assert.equal(b.total, 332)
      assert.equal(b.hayMas, true)
    })

    test('dos páginas seguidas no repiten ni se saltan ninguna', () => {
      /* Se identifica por dirección O POR HASH: 18 cuentas no tienen dirección
         conocida, y agruparlas por `null` las colapsaba todas en una sola —el
         conjunto salía de 315 y parecía que faltaban 17 cuentas. */
      const id = (c: { direccion: string | null; hash: string }) => c.direccion || c.hash
      const a = buscar({ limite: 200 }).cuentas.map(id)
      const b = buscar({ desde: 200, limite: 200 }).cuentas.map(id)
      assert.equal(new Set([...a, ...b]).size, 332)
    })
  })

  test('las cuentas sin dirección conocida no esconden ni un ORIGEN', () => {
    /* El volcado guarda el HASH de la dirección; para 18 cuentas nunca se
       encontró la preimagen. «Hay cuentas sin dueño conocido» asusta hasta que
       se ve que son todas contratos y que suman cero. Se comprueba, porque si
       algún día suman algo eso SÍ es una alarma. */
    const r = respaldo()
    const sind = r.cuentas.filter((c) => !c.direccion)
    assert.equal(sind.length, r.resumen.sinDireccionConocida)
    assert.equal(sind.reduce((a, c) => a + BigInt(c.saldo), 0n), 0n,
      'si esto deja de ser cero, hay ORIGEN sin dueño conocido y hay que mirarlo')
    assert.ok(sind.every((c) => c.tipo === 'contrato'))
    assert.ok(sind.every((c) => c.hash.startsWith('0x')),
      'sin dirección, el hash es su único identificador')
  })

  test('una dirección concreta se encuentra, y sin distinguir mayúsculas', () => {
    const una = respaldo().cuentas.find((c) => c.tipo === 'billetera' && c.direccion)!
    assert.equal(porDireccion(una.direccion!)?.saldo, una.saldo)
    assert.equal(porDireccion(una.direccion!.toUpperCase())?.saldo, una.saldo)
    assert.equal(porDireccion('0xno-existe'), undefined)
  })
})
