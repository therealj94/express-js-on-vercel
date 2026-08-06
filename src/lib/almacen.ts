// ─────────────────────────────────────────────────────────────────────────────
// El almacén: una colección mínima con dos respaldos.
//
// Todo el backend guarda a través de esta única interfaz. Detrás hay dos
// implementaciones y se elige una sola vez, al arrancar:
//
//   • MongoDB, si `MONGODB_URI` está definida. Es lo que corre en producción y
//     sobrevive a que se reinicie el servidor.
//   • Memoria, si no lo está. Sirve para desarrollo y para las pruebas, que no
//     deben depender de una base de datos externa para correr.
//
// La interfaz es a propósito diminuta —buscar uno, buscar varios, guardar,
// borrar— porque el dominio (cobros, saldos, retiros) no necesita más. Filtrar
// y ordenar listas se hace en `caja.ts` y `db.ts`, igual que antes; el volumen
// de un POS de comercios no justifica empujar esa lógica a la consulta.
// ─────────────────────────────────────────────────────────────────────────────

import { MongoClient, type Db } from 'mongodb'

/** Un documento cualquiera del dominio: siempre tiene `id` propio (no el `_id` de Mongo). */
export interface Coleccion<T extends { id: string }> {
  /** El primer documento que cumple la igualdad de todos los campos del filtro. */
  uno(filtro?: Partial<T>): Promise<T | undefined>
  /** Todos los documentos que cumplen el filtro (o todos, si no hay filtro). */
  varios(filtro?: Partial<T>): Promise<T[]>
  /** Inserta o reemplaza por `id`. */
  guardar(doc: T): Promise<void>
  /** Borra los que cumplan el filtro. */
  borrar(filtro: Partial<T>): Promise<void>
}

let modo: 'mongo' | 'memoria' = 'memoria'
let baseMongo: Db | null = null
let cliente: MongoClient | null = null

export function modoAlmacen(): 'mongo' | 'memoria' {
  return modo
}

/**
 * Conecta el almacén una sola vez, antes de aceptar peticiones.
 *
 * Si hay `MONGODB_URI` intenta Mongo y, si falla, no arranca en memoria a
 * escondidas: lanza. Un servidor de dinero que se suponía persistente y termina
 * guardando en RAM sin que nadie lo note es exactamente el fallo silencioso que
 * queremos evitar. Sin `MONGODB_URI`, memoria es la elección explícita.
 */
export async function conectarAlmacen(): Promise<'mongo' | 'memoria'> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    modo = 'memoria'
    return modo
  }

  cliente = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    retryWrites: true,
  })
  await cliente.connect()
  baseMongo = cliente.db(process.env.MONGODB_DB || 'mytokenpay')
  modo = 'mongo'

  // Índices únicos: donde el dominio ya asume que no hay repetidos, la base lo
  // garantiza aunque dos peticiones lleguen a la vez. El sello es la defensa
  // contra el doble cobro; el código y el correo, contra colisiones.
  await Promise.allSettled([
    baseMongo.collection('sellos').createIndex({ sello: 1 }, { unique: true }),
    baseMongo.collection('cobros').createIndex({ codigo: 1 }, { unique: true }),
    baseMongo.collection('cobros').createIndex({ id: 1 }, { unique: true }),
    baseMongo.collection('cobros').createIndex({ companyId: 1 }),
    baseMongo.collection('usuarios').createIndex({ id: 1 }, { unique: true }),
    baseMongo.collection('usuarios').createIndex({ email: 1 }, { unique: true }),
    baseMongo.collection('comercios').createIndex({ id: 1 }, { unique: true }),
    baseMongo.collection('comercios').createIndex({ ownerId: 1 }),
    baseMongo.collection('movimientos').createIndex({ companyId: 1 }),
    baseMongo.collection('retiros').createIndex({ id: 1 }, { unique: true }),
    baseMongo.collection('retiros').createIndex({ companyId: 1 }),
  ])

  return modo
}

export async function cerrarAlmacen(): Promise<void> {
  await cliente?.close()
  cliente = null
  baseMongo = null
}

/** Igualdad campo por campo, para el respaldo en memoria. */
function coincide<T>(doc: T, filtro?: Partial<T>): boolean {
  if (!filtro) return true
  for (const clave of Object.keys(filtro) as (keyof T)[]) {
    if (doc[clave] !== filtro[clave]) return false
  }
  return true
}

/**
 * Devuelve una colección con nombre. Resuelve el respaldo en cada llamada según
 * el modo activo, así que da igual que se construya al importar el módulo (antes
 * de conectar): para cuando llega la primera petición, el modo ya está fijado.
 */
export function coleccion<T extends { id: string }>(nombre: string): Coleccion<T> {
  const memoria = new Map<string, T>()

  const clon = (doc: T): T => structuredClone(doc)

  return {
    async uno(filtro) {
      if (modo === 'mongo' && baseMongo) {
        const doc = await baseMongo.collection<any>(nombre).findOne(filtro ?? {}, {
          projection: { _id: 0 },
        })
        return (doc ?? undefined) as T | undefined
      }
      for (const doc of memoria.values()) if (coincide(doc, filtro)) return clon(doc)
      return undefined
    },

    async varios(filtro) {
      if (modo === 'mongo' && baseMongo) {
        const docs = await baseMongo
          .collection<any>(nombre)
          .find(filtro ?? {}, { projection: { _id: 0 } })
          .toArray()
        return docs as T[]
      }
      const salida: T[] = []
      for (const doc of memoria.values()) if (coincide(doc, filtro)) salida.push(clon(doc))
      return salida
    },

    async guardar(doc) {
      if (modo === 'mongo' && baseMongo) {
        await baseMongo
          .collection<any>(nombre)
          .replaceOne({ id: doc.id }, doc, { upsert: true })
        return
      }
      memoria.set(doc.id, clon(doc))
    },

    async borrar(filtro) {
      if (modo === 'mongo' && baseMongo) {
        await baseMongo.collection<any>(nombre).deleteMany(filtro as any)
        return
      }
      for (const [id, doc] of memoria) if (coincide(doc, filtro)) memoria.delete(id)
    },
  }
}
