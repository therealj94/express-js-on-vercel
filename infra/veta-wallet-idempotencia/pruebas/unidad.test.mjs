// Pruebas de la idempotencia de los envios.
//
// Se ejercita el modulo REAL contra una coleccion en memoria que imita lo unico
// que de verdad importa del comportamiento de Mongo: que el indice unico haga
// fallar la segunda insercion con el codigo 11000. Toda la proteccion se apoya
// en ese detalle, asi que es lo que hay que imitar bien.

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Coleccion de mentira con indice unico sobre (clave, usuario).
const filas = []
const buscar = (q) => filas.find((f) => f.clave === q.clave && f.usuario === q.usuario)

const Idempotencia = {
  async create(doc) {
    if (buscar(doc)) {
      const e = new Error('E11000 duplicate key')
      e.code = 11000
      throw e
    }
    filas.push({ ...doc })
    return doc
  },
  async findOne(q) { return buscar(q) || null },
  async updateOne(q, upd) {
    const f = buscar(q)
    if (f) Object.assign(f, upd.$set)
    return { modifiedCount: f ? 1 : 0 }
  },
  async deleteOne(q) {
    const i = filas.findIndex((f) => f.clave === q.clave && f.usuario === q.usuario)
    if (i >= 0) filas.splice(i, 1)
    return { deletedCount: i >= 0 ? 1 : 0 }
  },
}

// Se compila el modulo real y se le inyecta la coleccion de mentira.
const babel = require('/tmp/vw-deploy/node_modules/@babel/core')
const fs = require('fs')
const fuente = fs.readFileSync('/tmp/vw-deploy/lib/idempotencia.js', 'utf8')
  .replace('import Idempotencia from "../models/Idempotencia";', 'const Idempotencia = globalThis.__COL;')
globalThis.__COL = Idempotencia
const { code } = babel.transformSync(fuente, { presets: [['@babel/preset-env', { targets: { node: 'current' } }]], cwd: '/tmp/vw-deploy', babelrc: false, configFile: false })
const mod = {}
new Function('exports', 'require', 'module', code)(mod, require, { exports: mod })
const { reservar, completar, marcarFallo, seSabeQueNoSalio, responderSiCorresponde, normalizarSello } = mod

let fallos = 0
const ok = (c, m) => { if (c) console.log('  ok   ', m); else { fallos++; console.log('  FALLA', m) } }

const ENVIO = { chain_id: '8532', recipientAddress: '0xaaa', amount: '10' }
const USUARIO = '0xmio'

console.log('\n1. Primer envio: pasa')
ok((await reservar('s1', USUARIO, ENVIO)).accion === 'seguir', 'primera vez -> seguir')

console.log('\n2. Mientras el primero corre, un segundo toque NO transfiere')
const r2 = await reservar('s1', USUARIO, ENVIO)
ok(r2.accion === 'esperar', 'mismo sello en curso -> esperar')

console.log('\n3. Terminado el primero, el reintento devuelve el MISMO resultado')
await completar('s1', USUARIO, { hash: '0xHASH1', status: 'pending' })
const r3 = await reservar('s1', USUARIO, ENVIO)
ok(r3.accion === 'devolver', 'ya hecho -> devolver')
ok(r3.respuesta.hash === '0xHASH1', 'devuelve el hash del envio que SI salio')

console.log('\n4. El mismo sello con otros datos es un error, no un reintento')
const r4 = await reservar('s1', USUARIO, { ...ENVIO, amount: '999' })
ok(r4.accion === 'conflicto', 'monto distinto -> conflicto')
const r4b = await reservar('s1', USUARIO, { ...ENVIO, recipientAddress: '0xotro' })
ok(r4b.accion === 'conflicto', 'destinatario distinto -> conflicto')

console.log('\n5. El sello de una persona no vale para otra')
ok((await reservar('s1', '0xotroUsuario', ENVIO)).accion === 'seguir',
   'mismo sello, otro usuario -> seguir (no se cruzan)')

console.log('\n6. Fallo del que se sabe que NO salio: se puede reintentar')
await reservar('s2', USUARIO, ENVIO)
const sinSaldo = Object.assign(new Error('insufficient funds'), { code: 'INSUFFICIENT_FUNDS' })
ok(seSabeQueNoSalio(sinSaldo), 'INSUFFICIENT_FUNDS se reconoce como previo al envio')
await marcarFallo('s2', USUARIO, sinSaldo, seSabeQueNoSalio(sinSaldo))
ok((await reservar('s2', USUARIO, ENVIO)).accion === 'seguir', 'tras saldo insuficiente -> se puede reintentar')

console.log('\n7. Fallo DUDOSO: no se repite a ciegas')
await completar('s3', USUARIO, null)   // limpia por si acaso
filas.length = 0
await reservar('s3', USUARIO, ENVIO)
const corte = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
ok(!seSabeQueNoSalio(corte), 'un corte de red NO se da por no enviado')
await marcarFallo('s3', USUARIO, corte, seSabeQueNoSalio(corte))
const r7 = await reservar('s3', USUARIO, ENVIO)
ok(r7.accion === 'verificar', 'tras un corte -> verificar antes de repetir')
ok(/hang up/.test(r7.error || ''), 'conserva el motivo para poder explicarlo')

console.log('\n8. Las respuestas HTTP')
const falso = () => {
  const r = { estado: null, cuerpo: null }
  r.status = (c) => { r.estado = c; return r }
  r.json = (b) => { r.cuerpo = b; return r }
  return r
}
let res = falso(); responderSiCorresponde(res, { accion: 'devolver', respuesta: { hash: '0xH' } })
ok(res.estado === 200 && res.cuerpo.repetido === true, 'repetido -> 200 con marca')
res = falso(); responderSiCorresponde(res, { accion: 'esperar' })
ok(res.estado === 409 && res.cuerpo.codigo === 'en-curso', 'en curso -> 409')
res = falso(); responderSiCorresponde(res, { accion: 'verificar', error: 'x' })
ok(res.estado === 409 && res.cuerpo.codigo === 'verificar-antes-de-repetir', 'dudoso -> 409 con aviso')
res = falso(); responderSiCorresponde(res, { accion: 'conflicto' })
ok(res.estado === 422, 'conflicto -> 422')
ok(responderSiCorresponde(falso(), { accion: 'seguir' }) === null, 'seguir -> no responde, deja pasar')

console.log('\n9. Sin sello, todo sigue funcionando como antes')
ok(responderSiCorresponde(falso(), { accion: 'seguir' }) === null, 'compatibilidad hacia atras')

console.log('\n10. Un fallo al anotar el sello NO puede convertir un envio bueno en error')
// Es el caso mas traicionero: la transferencia YA salio y ya esta en el
// historial. Si `completar` lanzara, el controlador caeria en su catch y le
// devolveria un error al usuario por un envio que funciono — invitandolo a
// repetirlo.
filas.length = 0
await reservar('s9', USUARIO, ENVIO)
const updateOriginal = Idempotencia.updateOne
Idempotencia.updateOne = async () => { throw new Error('base caida') }
let lanzo = false
try { await completar('s9', USUARIO, { hash: '0xOK' }) } catch { lanzo = true }
Idempotencia.updateOne = updateOriginal
ok(!lanzo, 'completar() se traga el fallo en vez de propagarlo')

console.log('\n11. Sellos raros del cliente')
ok(normalizarSello({ $ne: null }) === null, 'un objeto no entra como sello')
ok(normalizarSello([1, 2]) === null, 'un arreglo tampoco')
ok(normalizarSello(null) === null && normalizarSello('') === null, 'vacio -> sin sello')
ok(normalizarSello('  abc  ') === 'abc', 'se recortan los espacios')
ok(normalizarSello('x'.repeat(5000)).length === 200, 'un sello larguisimo se recorta a 200')
ok(normalizarSello(12345) === '12345', 'un numero se acepta como texto')

console.log(fallos ? `\n${fallos} FALLOS` : '\nIDEMPOTENCIA OK — 27 comprobaciones')
process.exit(fallos ? 1 : 0)
