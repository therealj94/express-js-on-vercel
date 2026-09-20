// Almacenamiento.
//
// Dos motores, elegidos por variable de entorno, igual que en Genesis ID:
//
//   - archivo (por defecto): un JSON en disco. Vale para desarrollo, pruebas
//     y demostraciones.
//   - MongoDB (ORDENEX_MONGO_URL): el que hay que usar en producción. En
//     Render y en Vercel el disco es efímero: con el motor de archivo, cada
//     despliegue borraría los saldos en custodia de todo el mundo.
//
// Los datos viven en memoria y se vuelcan enteros poco después de cada
// cambio. A esta escala es más simple y más seguro que llevar escrituras
// parciales. `guardarYa()` fuerza el volcado antes de responder a algo
// irreversible: liberar una orden, acreditar un depósito.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { DatosOrdenExchange, Configuracion, Precios } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// En Vercel el sistema de archivos es de solo lectura salvo /tmp: sin Mongo,
// el archivo va ahí y dura lo que dure la instancia (es decir, casi nada).
const ARCHIVO = process.env.ORDENEX_DATA_FILE
  || (process.env.VERCEL ? '/tmp/ordenexchange.json' : join(__dirname, '..', 'data', 'ordenexchange.json'))
const MONGO_URL = (process.env.ORDENEX_MONGO_URL || '').trim()
const MONGO_BASE = process.env.ORDENEX_MONGO_DB || 'ordenexchange'

export const motor: 'mongodb' | 'archivo' = MONGO_URL ? 'mongodb' : 'archivo'

export function configuracionPorDefecto(): Configuracion {
  return {
    comisionPct: Number(process.env.ORDENEX_COMISION_PCT || 0),
    garantiaAgente: process.env.ORDENEX_GARANTIA_AGENTE || '500',
    maxOrdenesAbiertas: Number(process.env.ORDENEX_MAX_ORDENES_ABIERTAS || 5),
    minOrdenUsd: Number(process.env.ORDENEX_MIN_ORDEN_USD || 5),
    maxOrdenUsdSinAgente: Number(process.env.ORDENEX_MAX_ORDEN_USD_SIN_AGENTE || 5000),
    confirmacionesDeposito: Number(process.env.ORDENEX_CONFIRMACIONES || 3),
    tesoreria: /^0x[0-9a-fA-F]{40}$/.test(process.env.ORDENEX_TESORERIA || '') ? process.env.ORDENEX_TESORERIA!.trim() : null,
  }
}

export function preciosPorDefecto(): Precios {
  return {
    oroUsdOnza: Number(process.env.ORDENEX_ORO_USD_ONZA || 0) || 0,
    plataUsdOnza: Number(process.env.ORDENEX_PLATA_USD_ONZA || 0) || 0,
    fx: {},
    actualizadoEn: new Date(0).toISOString(),
    fuente: 'semilla',
    actualizadoPor: null,
  }
}

function vacio(): DatosOrdenExchange {
  return {
    usuarios: [], saldos: [], movimientos: [], depositos: [], retiros: [], metodosPago: [],
    anuncios: [], ordenes: [], solicitudesAgente: [], operadores: [], sesionesOperador: [],
    precios: preciosPorDefecto(), configuracion: configuracionPorDefecto(), bitacora: [], version: 1,
  }
}

let datos: DatosOrdenExchange = vacio()
let coleccion: any = null
let pendiente: NodeJS.Timeout | null = null
let volcando: Promise<void> = Promise.resolve()

function leerArchivo(): DatosOrdenExchange | null {
  if (!existsSync(ARCHIVO)) return null
  try {
    return { ...vacio(), ...JSON.parse(readFileSync(ARCHIVO, 'utf8')) }
  } catch {
    return null
  }
}

function escribirArchivo(d: DatosOrdenExchange): void {
  mkdirSync(dirname(ARCHIVO), { recursive: true })
  // Temporal + renombrado atómico: un corte a mitad no deja el archivo truncado.
  const temporal = `${ARCHIVO}.tmp`
  writeFileSync(temporal, JSON.stringify(d))
  renameSync(temporal, ARCHIVO)
}

let baseMongo: any = null

async function abrirMongo(): Promise<void> {
  const { MongoClient } = await import('mongodb')
  const cliente = new MongoClient(MONGO_URL)
  await cliente.connect()
  baseMongo = cliente.db(MONGO_BASE)
  coleccion = baseMongo.collection('estado')
}

/**
 * Una colección aparte, para lo que no cabe en el documento de estado (las
 * imágenes del chat). Devuelve `null` con el motor de archivo: quien la use
 * tiene que saber arreglárselas sin ella.
 */
export function coleccionAparte(nombre: string): any | null {
  return baseMongo ? baseMongo.collection(nombre) : null
}

export async function iniciar(): Promise<void> {
  if (motor === 'mongodb') {
    await abrirMongo()
    const doc = await coleccion.findOne({ _id: 'ordenexchange' })
    datos = doc?.datos ? { ...vacio(), ...doc.datos } : vacio()
  } else {
    datos = leerArchivo() ?? vacio()
  }
  // La configuración que llega por variables de entorno manda sobre lo guardado
  // solo en lo que no se haya fijado desde el panel: la tesorería.
  const porDefecto = configuracionPorDefecto()
  datos.configuracion = { ...porDefecto, ...datos.configuracion, tesoreria: porDefecto.tesoreria ?? datos.configuracion?.tesoreria ?? null }
}

async function volcar(): Promise<void> {
  const copia = datos
  if (motor === 'mongodb' && coleccion) {
    await coleccion.updateOne({ _id: 'ordenexchange' }, { $set: { datos: copia, actualizado: new Date() } }, { upsert: true })
  } else {
    escribirArchivo(copia)
  }
}

export const store = {
  todo: (): DatosOrdenExchange => datos,

  /** Programa un volcado. Varias llamadas seguidas se juntan en uno solo. */
  guardar(): void {
    if (pendiente) return
    pendiente = setTimeout(() => {
      pendiente = null
      volcando = volcar().catch((e) => console.error('[store] no se pudo guardar:', e?.message))
    }, 100)
    pendiente.unref?.()
  },

  /** Vuelca ahora y espera. Antes de responder a algo irreversible. */
  async guardarYa(): Promise<void> {
    if (pendiente) {
      clearTimeout(pendiente)
      pendiente = null
    }
    volcando = volcar()
    await volcando
  },

  /** Solo para pruebas. */
  async reiniciar(nuevo: DatosOrdenExchange = vacio()): Promise<void> {
    datos = nuevo
    await store.guardarYa()
  },

  estado() {
    return {
      motor,
      efimero: motor === 'archivo',
      archivo: motor === 'archivo' ? ARCHIVO : null,
      usuarios: datos.usuarios.length,
      anuncios: datos.anuncios.length,
      ordenes: datos.ordenes.length,
      entradasBitacora: datos.bitacora.length,
    }
  },
}
