// Comprueba en PRODUCCION que la idempotencia funciona de verdad.
//
// Toda la proteccion se apoya en que el indice unico exista y que Mongo
// devuelva 11000 en la segunda insercion. Eso no se puede dar por hecho: si el
// indice no llego a crearse, el codigo pasaria las dos veces y el doble envio
// seguiria siendo posible sin que nada avisara.
//
// Solo toca la coleccion de sellos, con una clave de prueba que se borra al
// final. No emite ninguna transaccion.

import mongoose from 'mongoose'
import Idempotencia from '/app/models/Idempotencia.js'
import { reservar, completar, marcarFallo, seSabeQueNoSalio } from '/app/lib/idempotencia.js'

const CLAVE = 'prueba_indice_' + Date.now().toString(36)
const USUARIO = '0xPRUEBA'
const ENVIO = { chain_id: '5550', recipientAddress: '0xaaa', amount: '1' }

let fallos = 0
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FALLA ') + m); if (!c) fallos++ }

;(async () => {
  await mongoose.connect(
    `mongodb+srv://blakefalkor:${process.env.MONGO_PASSWORD}@cluster0.ngdqmps.mongodb.net/wallet?retryWrites=true&w=majority`
  )

  // Mongoose crea los indices en segundo plano; hay que esperarlos.
  await Idempotencia.init()
  const indices = await Idempotencia.collection.indexes()
  const unico = indices.find((i) => i.unique && i.key.clave === 1 && i.key.usuario === 1)
  ok(Boolean(unico), 'existe el indice unico (clave, usuario)')

  const ttl = indices.find((i) => i.expireAfterSeconds != null)
  ok(Boolean(ttl), `los sellos caducan solos (${ttl?.expireAfterSeconds ?? '?'} s)`)

  ok((await reservar(CLAVE, USUARIO, ENVIO)).accion === 'seguir', 'primer envio -> seguir')
  ok((await reservar(CLAVE, USUARIO, ENVIO)).accion === 'esperar', 'segundo toque -> esperar')

  await completar(CLAVE, USUARIO, { hash: '0xPRUEBA', status: 'pending' })
  const r = await reservar(CLAVE, USUARIO, ENVIO)
  ok(r.accion === 'devolver' && r.respuesta.hash === '0xPRUEBA', 'reintento -> devuelve el mismo hash')

  ok((await reservar(CLAVE, USUARIO, { ...ENVIO, amount: '999' })).accion === 'conflicto',
     'mismo sello con otro monto -> conflicto')

  // Dos reservas a la vez, que es el caso que de verdad importa.
  const SIMULTANEO = CLAVE + '_par'
  const [a, b] = await Promise.all([
    reservar(SIMULTANEO, USUARIO, ENVIO),
    reservar(SIMULTANEO, USUARIO, ENVIO),
  ])
  const pasaron = [a, b].filter((x) => x.accion === 'seguir').length
  ok(pasaron === 1, `dos peticiones a la vez: pasa exactamente 1 (paso ${pasaron})`)

  await Idempotencia.deleteMany({ usuario: USUARIO })
  const quedan = await Idempotencia.countDocuments({ usuario: USUARIO })
  ok(quedan === 0, 'se limpiaron los sellos de prueba')

  console.log(fallos ? `RESULTADO ${fallos} FALLOS` : 'RESULTADO OK — 8 comprobaciones en produccion')
  await mongoose.disconnect()
  process.exit(fallos ? 1 : 0)
})().catch((e) => { console.log('ERR ' + e.message); process.exit(1) })
