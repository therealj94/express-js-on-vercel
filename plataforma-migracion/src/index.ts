// Arranque de la plataforma de migración SFSP-700.
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { enArchivo, enMongo } from './almacen.js'
import { Cadena, transporteHttp } from './cadena.js'
import { crearApp, crearContexto } from './app.js'
import { leerOperadores } from './sesion.js'

const RPC = process.env.RPC_ORDEN_URL || 'https://rpc.ordenglobal-rpc.com/'
const MONGO = (process.env.MIGRACION_MONGO_URL || '').trim()

const almacen = MONGO
  ? await enMongo(MONGO, process.env.MIGRACION_MONGO_DB || 'migracion')
  : enArchivo(process.env.MIGRACION_ARCHIVO || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'migracion.json'))

if (almacen.motor === 'archivo') {
  console.warn('[migracion] AVISO: sin MIGRACION_MONGO_URL los datos van a un archivo, que en Render se borra en cada despliegue.')
}
if ((process.env.MIGRACION_SECRETO || '').length < 32) {
  console.warn('[migracion] AVISO: falta MIGRACION_SECRETO (32+ caracteres): el panel interno no va a dejar entrar a nadie.')
}
console.log(`[migracion] ${leerOperadores().length} operadores declarados, umbral de firmas ${process.env.MIGRACION_UMBRAL || 2}`)

// Una foto que estaba en curso cuando se reinició el servicio no va a terminar: se marca para repetirla.
for (const f of almacen.datos.fotos) {
  if (f.estado === 'en-curso') Object.assign(f, { estado: 'fallida', error: 'el servicio se reinició durante la foto; repetirla' })
}
await almacen.guardar()

const app = crearApp(crearContexto(almacen, new Cadena(transporteHttp(RPC))))
const puerto = Number(process.env.PORT) || 3000
app.listen(puerto, () => console.log(`[migracion] escuchando en ${puerto} · almacén ${almacen.motor} · RPC ${RPC}`))
