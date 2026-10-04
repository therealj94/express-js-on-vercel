// SOLO LECTURA. Saca de la base de cualquier app del ecosistema las direcciones
// de billetera que guarda, para que en la foto de la migración no falte nadie.
//
// No conoce el esquema de cada app: recorre todas las colecciones de la base y
// recoge solo los valores con forma de dirección (0x + 40 hexadecimales). Una
// llave privada tiene 64 hexadecimales y un texto cifrado no tiene esa forma,
// así que no se recogen. De cada dirección informa el campo donde apareció
// («coleccion.campo»), que sirve para separar usuarios de contratos o tesorería.
//
// Corre en un dyno one-off de la app, con la conexión que ya tiene configurada:
//
//   DYNO_APP=ordenex-api python3 ../veta-wallet-migracion/dyno.py direcciones-app.cjs > salida-ordenex.txt
//
// Lee la base de MONGODB_URI, DB_URL o MONGO_URI (y MONGODB_DB si la app la usa).
// No escribe nada. La salida queda fuera del repositorio.
let mongodb
try { mongodb = require('mongodb') } catch { mongodb = require('mongoose').mongo }

const DIRECCION = /^0x[0-9a-fA-F]{40}$/
const DENTRO = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g
const TOPE_POR_COLECCION = 500000

function recorrer(valor, ruta, salida) {
  if (valor == null) return
  if (typeof valor === 'string') {
    if (DIRECCION.test(valor.trim())) salida.push([ruta, valor.trim().toLowerCase()])
    else if (valor.length < 2000) for (const m of valor.match(DENTRO) || []) salida.push([ruta, m.toLowerCase()])
    return
  }
  if (Array.isArray(valor)) { valor.forEach((v) => recorrer(v, ruta, salida)); return }
  if (typeof valor === 'object' && !(valor instanceof Date) && !Buffer.isBuffer(valor) && valor._bsontype == null) {
    for (const [k, v] of Object.entries(valor)) recorrer(v, ruta ? `${ruta}.${k}` : k, salida)
  }
}

;(async () => {
  const uri = process.env.MONGODB_URI || process.env.DB_URL || process.env.MONGO_URI
  if (!uri) throw new Error('La app no tiene MONGODB_URI, DB_URL ni MONGO_URI')
  const cliente = await new mongodb.MongoClient(uri).connect()
  const db = cliente.db(process.env.MONGODB_DB || undefined)
  const porCampo = new Map()
  const todas = new Set()
  const resumen = { base: db.databaseName, colecciones: {} }
  for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (c.name.startsWith('system.')) continue
    let docs = 0
    for await (const doc of db.collection(c.name).find({}).limit(TOPE_POR_COLECCION)) {
      docs++
      const hallazgos = []
      recorrer(doc, '', hallazgos)
      for (const [ruta, d] of hallazgos) {
        const campo = `${c.name}.${ruta.replace(/\.\d+(?=\.|$)/g, '')}`
        if (!porCampo.has(campo)) porCampo.set(campo, new Set())
        porCampo.get(campo).add(d)
        todas.add(d)
      }
    }
    resumen.colecciones[c.name] = docs
  }
  resumen.direcciones = todas.size
  resumen.campos = Object.fromEntries([...porCampo].map(([k, v]) => [k, v.size]))
  console.log('RESUMEN ' + JSON.stringify(resumen))
  // De a 100 por línea, con el campo: Heroku corta las líneas largas.
  for (const [campo, dirs] of porCampo) {
    const lista = [...dirs].sort()
    for (let i = 0; i < lista.length; i += 100) console.log('CAMPO ' + JSON.stringify({ campo, d: lista.slice(i, i + 100) }))
  }
  await cliente.close()
})().catch((e) => { console.error('ERROR ' + e.message); process.exit(1) })
