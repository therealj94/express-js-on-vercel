// Almacenamiento.
//
// Dos motores, elegidos por variable de entorno:
//
//   - archivo (por defecto): un JSON en disco. Vale para desarrollo y para
//     demostraciones.
//   - MongoDB (GENESIS_MONGO_URL): el que hay que usar en producción.
//
// POR QUE HACE FALTA MONGO Y NO BASTA EL ARCHIVO
//
// El servicio corre en Render, y ahí el disco es efímero: se borra en cada
// despliegue y en cada reinicio del contenedor. Con el motor de archivo, todas
// las identidades verificadas desaparecerían la próxima vez que se suba una
// versión. Para datos de demostración da igual; para identidades de personas
// reales es inadmisible, y por eso el motor avisa al arrancar si está en modo
// archivo con datos que no son de prueba.
//
// SOBRE LA ESCRITURA DIFERIDA
//
// Los datos viven en memoria y se vuelcan enteros poco después de cada cambio.
// A esta escala —miles de registros, no millones— volcar todo es más simple y
// más seguro que llevar escrituras parciales, y evita que un fallo a mitad deje
// el conjunto incoherente. `guardarYa()` fuerza el volcado cuando hace falta
// tenerlo en disco antes de responder, como al aprobar una identidad.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { DatosGenesis } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ARCHIVO = process.env.GENESIS_DATA_FILE || join(__dirname, '..', 'data', 'genesis.json')
const MONGO_URL = (process.env.GENESIS_MONGO_URL || '').trim()
const MONGO_BASE = process.env.GENESIS_MONGO_DB || 'genesisid'

export const motor = MONGO_URL ? 'mongodb' : 'archivo'

function vacio(): DatosGenesis {
  return {
    identidades: [], negocios: [], operadores: [], sesiones: [],
    aplicaciones: [], casos: [], movimientos: [], bitacora: [], version: 2,
  }
}

let datos: DatosGenesis = vacio()
let coleccion: any = null
let baseMongo: any = null
let pendiente: NodeJS.Timeout | null = null
let volcando: Promise<void> = Promise.resolve()

// ─────────────────────────────────────────────────────────────────────────────
// Motor de archivo
// ─────────────────────────────────────────────────────────────────────────────

function leerArchivo(): DatosGenesis | null {
  if (!existsSync(ARCHIVO)) return null
  try {
    return { ...vacio(), ...JSON.parse(readFileSync(ARCHIVO, 'utf8')) }
  } catch {
    return null
  }
}

function escribirArchivo(d: DatosGenesis): void {
  mkdirSync(dirname(ARCHIVO), { recursive: true })
  // Se escribe a un temporal y se renombra: el renombrado es atómico, así que
  // un corte a mitad no deja el archivo truncado.
  const temporal = `${ARCHIVO}.tmp`
  writeFileSync(temporal, JSON.stringify(d, null, 2))
  renameSync(temporal, ARCHIVO)
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor MongoDB
// ─────────────────────────────────────────────────────────────────────────────

async function abrirMongo(): Promise<void> {
  const { MongoClient } = await import('mongodb')
  const cliente = new MongoClient(MONGO_URL)
  await cliente.connect()
  baseMongo = cliente.db(MONGO_BASE)
  coleccion = baseMongo.collection('estado')
}

/**
 * Una colección aparte, para lo que NO cabe en el documento de estado.
 *
 * Todo el estado del motor vive en un único documento (`estado/genesis`), que
 * es simple y suficiente para identidades, negocios y casos: son miles de
 * registros, no millones.
 *
 * Las listas de sanciones no entran ahí. La lista de la OFAC son unas 17 000
 * fichas con sus alias, y un documento de MongoDB no puede pasar de 16 MB —
 * pero además, aunque cupieran, cada guardado de cualquier cosa reescribiría
 * esos megabytes enteros. Van en su propia colección.
 *
 * Devuelve `null` cuando el motor es de archivo: quien la use tiene que saber
 * arreglárselas sin ella.
 */
export function coleccionAparte(nombre: string): any | null {
  return baseMongo ? baseMongo.collection(nombre) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de vida
// ─────────────────────────────────────────────────────────────────────────────

export async function iniciar(): Promise<void> {
  if (motor === 'mongodb') {
    await abrirMongo()
    const doc = await coleccion.findOne({ _id: 'genesis' })
    datos = doc?.datos ? { ...vacio(), ...doc.datos } : vacio()
  } else {
    datos = leerArchivo() ?? vacio()
  }
}

async function volcar(): Promise<void> {
  const copia = datos
  if (motor === 'mongodb' && coleccion) {
    await coleccion.updateOne({ _id: 'genesis' }, { $set: { datos: copia, actualizado: new Date() } }, { upsert: true })
  } else {
    escribirArchivo(copia)
  }
}

export const store = {
  todo: (): DatosGenesis => datos,

  /** Programa un volcado. Varias llamadas seguidas se juntan en uno solo. */
  guardar(): void {
    if (pendiente) return
    pendiente = setTimeout(() => {
      pendiente = null
      volcando = volcar().catch((e) => console.error('[store] no se pudo guardar:', e?.message))
    }, 100)
  },

  /** Vuelca ahora y espera. Se usa antes de responder a algo irreversible. */
  async guardarYa(): Promise<void> {
    if (pendiente) {
      clearTimeout(pendiente)
      pendiente = null
    }
    volcando = volcar()
    await volcando
  },

  /** Solo para pruebas y para la primera puesta en marcha. */
  async reiniciar(nuevo: DatosGenesis = vacio()): Promise<void> {
    datos = nuevo
    await store.guardarYa()
  },

  estado() {
    return {
      motor,
      efimero: motor === 'archivo',
      archivo: motor === 'archivo' ? ARCHIVO : null,
      identidades: datos.identidades.length,
      negocios: datos.negocios.length,
      operadores: datos.operadores.length,
      entradasBitacora: datos.bitacora.length,
    }
  },
}
