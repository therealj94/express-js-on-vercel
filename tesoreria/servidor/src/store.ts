// Almacenamiento.
//
// Dos motores, elegidos por variable de entorno, igual que en Genesis ID:
//
//   - archivo (por defecto): un JSON en disco. Vale para desarrollo y demos.
//   - MongoDB (TESORERIA_MONGO_URL): el que hay que usar en producción. En
//     Render el disco es efímero: sin Mongo, cada despliegue borra el libro.
//
// Todo el estado vive en memoria y se vuelca entero poco después de cada
// cambio. A esta escala es más simple y más seguro que escrituras parciales, y
// los comandos que mueven dinero llaman a `guardarYa()` antes de responder.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { R, SEMILLA } from './reglas.js'
import { sha256 } from './cripto.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ARCHIVO = process.env.TESORERIA_DATA_FILE || join(__dirname, '..', 'data', 'tesoreria.json')
const MONGO_URL = (process.env.TESORERIA_MONGO_URL || '').trim()
const MONGO_BASE = process.env.TESORERIA_MONGO_DB || 'tesoreria'

export const motor: 'mongodb' | 'archivo' = MONGO_URL ? 'mongodb' : 'archivo'

export interface Operador {
  id: string
  email: string
  nombre: string
  rol: string
  hashContrasena: string
  clavePublica: string
  clavePrivada: string
  gid: string | null
  activo: boolean
  creadoEn: string
  ultimoAcceso: string | null
  debeCambiarContrasena: boolean
}

export interface Sesion {
  token: string
  operadorId: string
  creadaEn: string
  expiraEn: string
  ip: string | null
  origen: 'contrasena' | 'genesis'
}

export interface Datos {
  version: number
  estado: any
  operadores: Operador[]
  sesiones: Sesion[]
}

/** Estado de fábrica: la semilla, con el libro re-encadenado con SHA-256. */
export function semillaFresca(): any {
  const estado = R.clon(SEMILLA.estado)
  R.sellarLibro(estado, sha256)
  return estado
}

function vacio(): Datos {
  return { version: 1, estado: semillaFresca(), operadores: [], sesiones: [] }
}

let datos: Datos = vacio()
let coleccion: any = null
let pendiente: NodeJS.Timeout | null = null
let volcando: Promise<void> = Promise.resolve()

function leerArchivo(): Datos | null {
  if (!existsSync(ARCHIVO)) return null
  try { return { ...vacio(), ...JSON.parse(readFileSync(ARCHIVO, 'utf8')) } } catch { return null }
}

function escribirArchivo(d: Datos): void {
  mkdirSync(dirname(ARCHIVO), { recursive: true })
  const temporal = `${ARCHIVO}.tmp`          // escribir y renombrar: atómico
  writeFileSync(temporal, JSON.stringify(d))
  renameSync(temporal, ARCHIVO)
}

async function abrirMongo(): Promise<void> {
  const { MongoClient } = await import('mongodb')
  const cliente = new MongoClient(MONGO_URL)
  await cliente.connect()
  coleccion = cliente.db(MONGO_BASE).collection('estado')
}

export async function iniciar(): Promise<void> {
  if (motor === 'mongodb') {
    await abrirMongo()
    const doc = await coleccion.findOne({ _id: 'tesoreria' })
    datos = doc?.datos ? { ...vacio(), ...doc.datos } : vacio()
  } else {
    datos = leerArchivo() ?? vacio()
  }
  // Si el estado guardado es de una semilla vieja se conserva igual: los datos
  // reales nunca se pisan por una semilla nueva. Solo se avisa.
  if (datos.estado?.version !== SEMILLA.version) {
    console.warn(`[tesoreria] el estado guardado es de la versión ${datos.estado?.version}; la semilla es ${SEMILLA.version}`)
  }
}

async function volcar(): Promise<void> {
  const copia = datos
  if (motor === 'mongodb' && coleccion) {
    await coleccion.updateOne({ _id: 'tesoreria' }, { $set: { datos: copia, actualizado: new Date() } }, { upsert: true })
  } else {
    escribirArchivo(copia)
  }
}

export const store = {
  todo: (): Datos => datos,

  /** Programa un volcado; varias llamadas seguidas se juntan en uno. */
  guardar(): void {
    if (pendiente) return
    pendiente = setTimeout(() => {
      pendiente = null
      volcando = volcar().catch((e) => console.error('[store] no se pudo guardar:', e?.message))
    }, 100)
  },

  /** Vuelca ahora y espera. Todo comando que cambia el libro pasa por aquí. */
  async guardarYa(): Promise<void> {
    if (pendiente) { clearTimeout(pendiente); pendiente = null }
    volcando = volcar()
    await volcando
  },

  /** Solo para pruebas y para volver a la semilla desde el panel. */
  async reiniciarEstado(): Promise<void> {
    datos.estado = semillaFresca()
    await store.guardarYa()
  },

  /** Solo para pruebas. */
  async reiniciarTodo(nuevo: Datos = vacio()): Promise<void> {
    datos = nuevo
    await store.guardarYa()
  },

  estado() {
    return {
      motor,
      efimero: motor === 'archivo',
      archivo: motor === 'archivo' ? ARCHIVO : null,
      operadores: datos.operadores.length,
      asientos: datos.estado?.libro?.length ?? 0,
    }
  },
}
