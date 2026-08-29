// Firmar una transacción para la cadena 5550.
//
// POR QUE ESTA PRUEBA EXISTE, Y POR QUE CON VECTORES CONOCIDOS
//
// Un firmante de transacciones falla de una forma particularmente mala: la
// transacción sale, la cadena la rechaza con «invalid sender» o —peor— la
// acepta y viene de una dirección que no es la nuestra. Nada de eso se ve
// leyendo el código, y probarlo contra la cadena de verdad cuesta gas y un
// bloque de espera por intento.
//
// Así que se comprueba contra el VECTOR OFICIAL del EIP-155, que es el ejemplo
// que la propia especificación publica con su resultado exacto. Si nuestra
// firma coincide byte por byte con ese, el firmante está bien; si no, está mal
// y se sabe antes de tocar la cadena.
//
//     https://eips.ethereum.org/EIPS/eip-155
//
// Y se comprueban las dos piezas por separado, porque fallan por separado: RLP
// (cómo se empaqueta) y la firma (qué se firma y cómo se pega el chainId).

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const { firmarTx, direccionDe } = await import('../audit/cadena.js')

describe('el firmante de transacciones', () => {
  test('EL VECTOR OFICIAL DEL EIP-155, byte por byte', () => {
    /* El ejemplo de la especificación: nonce 9, 20 gwei, 21000 de gas, a
       0x3535…3535, 1 ether, sin datos, cadena 1. La especificación publica el
       resultado firmado exacto con esta llave privada de ejemplo —que es
       pública y de juguete, sale en el propio EIP. */
    const LLAVE_DEL_EJEMPLO =
      '0x4646464646464646464646464646464646464646464646464646464646464646'

    const firmada = firmarTx({
      nonce: 9n,
      precioGas: 20000000000n,
      limiteGas: 21000n,
      a: '0x3535353535353535353535353535353535353535',
      valor: 1000000000000000000n,
      datos: new Uint8Array(0),
      cadenaId: 1,
    }, LLAVE_DEL_EJEMPLO)

    /* El resultado que publica el EIP, campo por campo. Escrito así y no como
       un pegote de 214 caracteres porque un pegote no se puede revisar: al
       transcribirlo de corrido se cae un byte y no lo ve nadie. */
    const OFICIAL = '0x' + [
      'f86c',                 // lista de 108 bytes
      '09',                   // nonce 9
      '8504a817c800',         // precio del gas: 20 gwei
      '825208',               // límite: 21000
      '943535353535353535353535353535353535353535',   // a 0x3535…3535 (20 bytes)
      '880de0b6b3a7640000',   // valor: 1 ether
      '80',                   // datos: vacío
      '25',                   // v = 1*2 + 35 + 0 = 37. AQUI VIVE EL EIP-155:
                              // sin él aquí iría 0x1b/0x1c y la firma valdría
                              // en cualquier cadena.
      'a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276',   // r
      'a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83',   // s
    ].join('')

    assert.equal(firmada, OFICIAL,
      'la firma no coincide con el vector oficial: el firmante está mal')
  })

  test('la dirección sale de la llave, y es la del ejemplo', () => {
    assert.equal(
      direccionDe('0x4646464646464646464646464646464646464646464646464646464646464646'),
      '0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f')
  })

  describe('RLP, que es donde se rompe en silencio', () => {
    test('el cero se codifica como VACIO, no como 0x00', () => {
      /* Es el error clásico de RLP, y falla de la peor forma: la transacción
         sale, la cadena la acepta, y al recuperar el remitente sale una
         dirección que no es la nuestra. El ancla aparecería firmada por un
         desconocido.

         Se comprueba en los bytes: con nonce 0 y precio 1, justo después de la
         cabecera de lista tienen que ir `80` (cadena vacía = cero) y `01` (un
         byte por debajo de 0x80 va tal cual). Si el cero fuera `0x00`, ahí
         habría `00` y no `80`. */
      const conCero = firmarTx({
        nonce: 0n, precioGas: 1n, limiteGas: 21000n,
        a: '0x0000000000000000000000000000000000000001',
        valor: 0n, datos: new Uint8Array(0), cadenaId: 5550,
      }, '0x' + '11'.repeat(32))

      // 0x + el byte de cabecera de lista (f8 + largo) y después los campos.
      const cuerpo = conCero.slice(2)
      const trasCabecera = cuerpo.startsWith('f8') ? cuerpo.slice(4) : cuerpo.slice(2)
      assert.ok(trasCabecera.startsWith('8001'),
        `esperaba «80 01» (cero vacío, precio 1) y empieza por ${trasCabecera.slice(0, 8)}`)
    })
  })

  test('la firma NO vale en otra cadena', () => {
    /* EIP-155. Sin el chainId dentro de lo que se firma, una transacción de la
       5550 se puede reenviar tal cual en cualquier red con el mismo formato —y
       el ancla de nuestra bitácora aparecería en cadenas ajenas. */
    const comun = {
      nonce: 3n, precioGas: 7n, limiteGas: 30000n,
      a: '0x0000000000000000000000000000000000000002',
      valor: 0n, datos: Uint8Array.of(1, 2, 3),
    }
    const llave = '0x' + '22'.repeat(32)
    assert.notEqual(firmarTx({ ...comun, cadenaId: 5550 }, llave),
                    firmarTx({ ...comun, cadenaId: 8532 }, llave),
                    'la misma transacción firma igual en dos cadenas: falta el EIP-155')
  })

  test('los datos cambian la firma', () => {
    /* Si el `data` no entrara en lo firmado, el ancla sería un hash que
       cualquiera podría cambiar sin invalidar la transacción. */
    const comun = {
      nonce: 1n, precioGas: 1n, limiteGas: 30000n,
      a: '0x0000000000000000000000000000000000000003',
      valor: 0n, cadenaId: 5550,
    }
    const llave = '0x' + '33'.repeat(32)
    assert.notEqual(firmarTx({ ...comun, datos: Uint8Array.of(1) }, llave),
                    firmarTx({ ...comun, datos: Uint8Array.of(2) }, llave))
  })

  test('firmar es determinista: la misma entrada da la misma salida', () => {
    /* secp256k1 con nonce determinista (RFC 6979). Si no lo fuera, dos anclas
       del mismo hash darían transacciones distintas y no se podría comprobar
       nada por comparación. */
    const tx = {
      nonce: 5n, precioGas: 2n, limiteGas: 25000n,
      a: '0x0000000000000000000000000000000000000004',
      valor: 0n, datos: Uint8Array.of(9, 9), cadenaId: 5550,
    }
    const llave = '0x' + '44'.repeat(32)
    assert.equal(firmarTx(tx, llave), firmarTx(tx, llave))
  })
})
