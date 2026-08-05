// ETAPA 3 — borrar los respaldos.
//
// POR QUE ESTE PASO ES EL QUE DE VERDAD CIERRA EL AGUJERO
//
// La migracion recifro todo con la clave nueva, pero guardo el cifrado
// ORIGINAL en `privateKeyRespaldo` y `seedRespaldo`. Ese original esta cifrado
// con la clave vieja de 7 caracteres y contiene exactamente las mismas llaves
// privadas y frases semilla.
//
// Es decir: mientras los respaldos existan, quien consiga un volcado de la base
// puede romper por fuerza bruta la clave de 7 caracteres y vaciar las cuentas
// igual que antes. La migracion, por si sola, no arregla nada. Este paso si.
//
// El respaldo hizo su trabajo —permitia volver atras si la migracion salia
// mal— y `comparar.js` ya demostro que no salio mal: los 804 campos descifran
// al mismo texto que antes. A partir de ahi el respaldo deja de ser una red de
// seguridad y pasa a ser el propio riesgo.
//
// Aun asi no se borra a ciegas: de cada campo se vuelve a comprobar, uno por
// uno y en el momento, que el valor actual descifra con la clave nueva y
// coincide con el respaldo. Solo entonces se quita.
//
// Arranca en simulacro. Solo escribe con LIMPIAR=si.

import mongoose from 'mongoose'
import CryptoJS from 'crypto-js'
import { esLlavePrivada, esFraseSemilla } from '/app/lib/cripto.js'

const VIEJA = process.env.PASS_ADM
const NUEVA = process.env.PASS_ADM_NUEVA
const ESCRIBIR = process.env.LIMPIAR === 'si'

const descifrar = (cifrado, clave) => {
  try {
    return CryptoJS.AES.decrypt(String(cifrado || ''), clave).toString(CryptoJS.enc.Utf8)
  } catch (e) {
    return ''
  }
}

const CAMPOS = [
  ['privateKey', 'privateKeyRespaldo', esLlavePrivada],
  ['seed', 'seedRespaldo', esFraseSemilla],
]

;(async () => {
  if (!VIEJA || !NUEVA) throw new Error('Hacen falta las dos claves para poder comprobar antes de borrar')

  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`
  )
  const col = mongoose.connection.db.collection('users')

  const cuenta = { revisados: 0, borrados: 0, conservados: 0, sinRespaldo: 0 }
  const conservados = []

  for await (const u of col.find({}, {
    projection: { address: 1, seed: 1, privateKey: 1, seedRespaldo: 1, privateKeyRespaldo: 1 },
  })) {
    const quitar = {}

    for (const [campo, respaldo, valida] of CAMPOS) {
      if (!u[respaldo]) { cuenta.sinRespaldo++; continue }
      cuenta.revisados++

      const actual = descifrar(u[campo], NUEVA)
      const original = descifrar(u[respaldo], VIEJA)

      // Las tres condiciones tienen que darse a la vez. Si alguna falla, el
      // respaldo se queda: es preferible dejar un riesgo conocido y anotado
      // que borrar la unica copia de la llave privada de alguien.
      if (actual && valida(actual) && actual === original) {
        quitar[respaldo] = ''
      } else {
        cuenta.conservados++
        conservados.push(`${u.address} ${campo} (${!actual ? 'no descifra' : actual !== original ? 'no coincide' : 'forma invalida'})`)
      }
    }

    if (Object.keys(quitar).length && ESCRIBIR) {
      await col.updateOne({ _id: u._id }, { $unset: quitar })
      cuenta.borrados += Object.keys(quitar).length
    } else {
      cuenta.borrados += Object.keys(quitar).length
    }
  }

  console.log((ESCRIBIR ? 'LIMPIEZA ' : 'SIMULACRO ') + JSON.stringify({
    ...cuenta, conservados: conservados.slice(0, 10),
  }))
  await mongoose.disconnect()
  process.exit(0)
})().catch((e) => { console.log('ERR ' + e.message); process.exit(1) })
