// La conexión a MongoDB.
//
// POR QUE ESTO NO EXISTIA
//
// El almacén de MyTokenPay eran tres `Map()` de JavaScript en memoria. Las
// variables `MONGODB_URI` y `MONGODB_DB` ya estaban puestas en Heroku desde
// hacía tiempo — alguien aprovisionó la base y el código nunca la usó. El
// resultado: cada reinicio del dyno borraba todas las cuentas y todos los
// comercios registrados, y Heroku reinicia los dynos al menos una vez al día.
// Quien se registraba un martes no existía el miércoles.
//
// La conexión es PEREZOSA y compartida: se abre en la primera consulta que la
// necesite y se reutiliza. Abrirla al importar el módulo haría que el proceso
// no arrancara si la base está lenta, y un backend que no levanta es peor que
// uno que contesta despacio la primera petición.

import { MongoClient, type Db } from 'mongodb'

const URI = (process.env.MONGODB_URI || '').trim()
const NOMBRE_BASE = (process.env.MONGODB_DB || 'mytokenpay').trim()

export const hayMongo = () => Boolean(URI)

let cliente: MongoClient | null = null
let base: Db | null = null
let conectando: Promise<Db | null> | null = null

/**
 * La base, o null si no hay URI configurada.
 *
 * Devolver null en vez de lanzar es deliberado: sin URI el almacén cae al motor
 * de memoria, que es lo que usan las pruebas y el desarrollo local. Lo que NO
 * puede pasar es que un despliegue de producción se quede en memoria sin que
 * nadie lo note, y de eso se encarga `exigirPersistencia()` al arrancar.
 */
export async function baseDatos(): Promise<Db | null> {
  if (base) return base
  if (!URI) return null
  if (conectando) return conectando

  conectando = (async () => {
    try {
      cliente = new MongoClient(URI, {
        // Si la base no contesta en cinco segundos, mejor un error claro que
        // una petición colgada hasta el timeout del cliente.
        serverSelectionTimeoutMS: 5000,
        retryWrites: true,
      })
      await cliente.connect()
      base = cliente.db(NOMBRE_BASE)
      await crearIndices(base)
      console.log(`[mongo] conectado a ${NOMBRE_BASE}`)
      return base
    } catch (e: any) {
      console.error('[mongo] no se pudo conectar:', e?.message)
      // Se limpia para que el siguiente intento vuelva a probar en vez de
      // quedarse con una promesa fallida para siempre.
      conectando = null
      cliente = null
      throw e
    }
  })()

  return conectando
}

/**
 * Los índices, una sola vez al conectar.
 *
 * El de `email` es ÚNICO y es lo que de verdad impide dos cuentas con el mismo
 * correo. La comprobación que hay en la ruta de registro —buscar antes de
 * insertar— pierde la carrera si dos peticiones llegan a la vez; la base no.
 */
async function crearIndices(db: Db): Promise<void> {
  try {
    await Promise.all([
      db.collection('usuarios').createIndex({ email: 1 }, { unique: true }),
      db.collection('usuarios').createIndex({ id: 1 }, { unique: true }),
      /* UNICO y disperso: dos cuentas no pueden reclamar la misma identidad, y
         las que todavía no tienen GID quedan fuera del índice — siempre que el
         campo NO EXISTA. Ver la nota en `createUser`: escribirlo como `null`
         mete a todas en el índice y la segunda cuenta ya choca. */
      db.collection('usuarios').createIndex({ gid: 1 }, { unique: true, sparse: true }),
      db.collection('comercios').createIndex({ id: 1 }, { unique: true }),
      db.collection('comercios').createIndex({ ownerId: 1 }),
      db.collection('comercios').createIndex({ countrySlug: 1, citySlug: 1, categorySlug: 1 }),
      db.collection('cobros').createIndex({ id: 1 }, { unique: true }),
      /* La REFERENCIA también es única y buscable: es lo que va dentro del QR y
         lo que un cajero dicta por teléfono cuando el lector no funciona. Sin
         índice, resolverla obligaría a recorrer la colección en cada pago. */
      db.collection('cobros').createIndex({ referencia: 1 }, { unique: true }),
      db.collection('cobros').createIndex({ companyId: 1, creadoEn: -1 }),
      db.collection('cobros').createIndex({ 'pago.pagadorId': 1, creadoEn: -1 }),
      // Un cobro sin pagar no vive para siempre: caduca solo. Sin esto la
      // colección acumularía para siempre los QR que nadie llegó a escanear.
      db.collection('cobros').createIndex({ caducaEn: 1 }, { expireAfterSeconds: 0 }),
    ])
  } catch (e: any) {
    console.error('[mongo] no se pudieron crear los índices:', e?.message)
  }
}

/**
 * Aborta el arranque si producción se quedó sin base.
 *
 * Es la lección del almacén en memoria: el fallo silencioso —el servicio
 * contesta 200 y los datos mueren en el siguiente reinicio— es mucho peor que
 * el ruidoso. En producción, sin `MONGODB_URI` no se arranca.
 */
export function exigirPersistencia(): void {
  const enProduccion = process.env.NODE_ENV === 'production' || Boolean(process.env.DYNO)
  if (enProduccion && !URI) {
    throw new Error(
      'MONGODB_URI es obligatoria en producción: sin ella las cuentas y los cobros ' +
      'viven en memoria y se pierden en cada reinicio del dyno.',
    )
  }
}

export async function cerrarMongo(): Promise<void> {
  if (cliente) await cliente.close()
  cliente = null; base = null; conectando = null
}
