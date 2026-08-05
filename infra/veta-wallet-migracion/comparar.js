// SOLO LECTURA. Demuestra que la migracion no perdio ni cambio nada.
//
// POR QUE ESTA COMPROBACION ES LA QUE IMPORTA
//
// Que los 402 registros se descifren con la clave nueva y den algo con forma
// valida no prueba que den LO MISMO que antes. Prueba que dan algo bien
// formado, que no es igual: una llave privada distinta tambien tiene la forma
// de una llave privada, y llevaria a una cuenta que no es la del usuario.
//
// Mientras el respaldo siga en el documento se puede comprobar de verdad:
// se descifra el original con la clave vieja, se descifra el actual con la
// nueva, y se comparan caracter por caracter. Si coinciden los 402, la
// migracion fue exactamente una recifrado y no toco el contenido.
//
// Esto hay que correrlo ANTES de borrar los respaldos, porque despues ya no
// habra con que comparar.

import mongoose from 'mongoose'
import CryptoJS from 'crypto-js'
import { esLlavePrivada, esFraseSemilla } from '/app/lib/cripto.js'

const VIEJA = process.env.PASS_ADM
const NUEVA = process.env.PASS_ADM_NUEVA

const descifrar = (cifrado, clave) => {
  try {
    return CryptoJS.AES.decrypt(String(cifrado || ''), clave).toString(CryptoJS.enc.Utf8)
  } catch (e) {
    return ''
  }
}

;(async () => {
  if (!VIEJA || !NUEVA) throw new Error('Hacen falta las dos claves para poder comparar')

  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`
  )
  const col = mongoose.connection.db.collection('users')

  const cuenta = { conRespaldo: 0, iguales: 0, distintos: 0, sinRespaldo: 0, respaldoIlegible: 0 }
  const problemas = []

  const CAMPOS = [
    ['privateKey', 'privateKeyRespaldo', esLlavePrivada],
    ['seed', 'seedRespaldo', esFraseSemilla],
  ]

  for await (const u of col.find({}, {
    projection: { address: 1, seed: 1, privateKey: 1, seedRespaldo: 1, privateKeyRespaldo: 1 },
  })) {
    for (const [campo, respaldo, valida] of CAMPOS) {
      if (!u[respaldo]) { cuenta.sinRespaldo++; continue }
      cuenta.conRespaldo++

      const original = descifrar(u[respaldo], VIEJA)
      const actual = descifrar(u[campo], NUEVA)

      if (!original || !valida(original)) {
        cuenta.respaldoIlegible++
        problemas.push(`${u.address} ${campo} respaldo-ilegible`)
        continue
      }
      if (original === actual) {
        cuenta.iguales++
      } else {
        cuenta.distintos++
        // Nunca el contenido: solo que no coinciden y cuanto miden.
        problemas.push(`${u.address} ${campo} DISTINTO (original ${original.length} car., actual ${actual.length})`)
      }
    }
  }

  console.log('COMPARACION ' + JSON.stringify({ ...cuenta, problemas: problemas.slice(0, 10) }))
  console.log(cuenta.distintos === 0 && cuenta.respaldoIlegible === 0
    ? 'VEREDICTO: la migracion fue exactamente un recifrado. No se perdio ni cambio nada.'
    : 'VEREDICTO: HAY DIFERENCIAS — NO borrar los respaldos.')

  await mongoose.disconnect()
  process.exit(cuenta.distintos === 0 && cuenta.respaldoIlegible === 0 ? 0 : 1)
})().catch((e) => { console.log('ERR ' + e.message); process.exit(1) })
