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

/**
 * La ruta de un archivo hermano del de estado, para el motor de archivo.
 *
 * Es la otra mitad de `coleccionAparte`: lo que en Mongo va en su propia
 * colección, aquí va en su propio archivo, al lado de `genesis.json`. Sirve
 * para que quien tenga que sacar algo del documento de estado pueda hacerlo
 * SIEMPRE, y no solo cuando hay Mongo — si el único camino fuera la colección,
 * el motor de archivo acabaría metiéndolo otra vez donde no cabe.
 *
 * Se separa por archivos y no por claves dentro del mismo JSON a propósito: lo
 * que se saca del estado se saca para no reescribirlo en cada guardado.
 */
export function archivoAparte(nombre: string): string {
  return join(dirname(ARCHIVO), `${nombre}.json`)
}

// ─────────────────────────────────────────────────────────────────────────────
// La bitácora, fuera del documento de estado
// ─────────────────────────────────────────────────────────────────────────────

/*
 * POR QUE SE SACÓ, CON LA CUENTA HECHA
 *
 * Todo el estado vivía en `estado/genesis`, un solo documento, y MongoDB no deja
 * pasar de 16 MB. Medido el 18/08/2026 con un expediente real y completo:
 *
 *     una identidad verificada ......... 2.058 bytes
 *     una entrada de bitácora .............. 442 bytes
 *     entradas por usuario ..................... 6
 *     ─────────────────────────────────────────────
 *     por usuario .......................  4.710 bytes
 *     TECHO .............................  3.562 usuarios
 *
 * Con 435 usuarios ya dentro y una campaña en puerta, ese techo estaba cerca. Y
 * al pasarlo no falla la bitácora: falla `volcar()`, o sea el guardado de TODO
 * —identidades, operadores, aprobaciones—, mientras el servicio sigue
 * contestando 200 y los datos viven solo en memoria hasta el siguiente
 * reinicio. Es el mismo fallo que ya obligó a sacar las fotos del documento.
 *
 * La bitácora es lo que más crece y no para nunca: cada acción de cada usuario
 * añade una entrada, para siempre. Sacándola, el techo pasa de 3.562 a más de
 * 8.000 usuarios sin tocar nada más.
 *
 * SE QUEDA EN MEMORIA, Y ESO ES A PROPÓSITO
 *
 * `verificarCadena()` recorre la cadena entera comprobando que cada eslabón
 * cuadre con el anterior, y `registrar()` necesita el hash de la última entrada
 * para encadenar la siguiente. Las dos cosas quieren la lista completa y en
 * orden. Así que la bitácora se carga entera al arrancar y se mantiene en
 * memoria igual que antes; lo único que cambia es DÓNDE se guarda.
 *
 * SE ESCRIBE LO NUEVO, NUNCA SE REESCRIBE LO VIEJO
 *
 * Cada volcado inserta solo las entradas que aún no están guardadas. Una
 * bitácora es un registro de auditoría: reescribir una entrada ya escrita no
 * debería poder pasar ni por accidente, y aquí no hay código que lo haga.
 *
 * El contador solo avanza si la inserción salió bien. Si Mongo falla, las
 * entradas siguen marcadas como pendientes y se reintentan en el siguiente
 * volcado — antes que perder un renglón de auditoría, se repite el intento.
 */

const COL_BITACORA = 'bitacora'

/** Cuántas entradas de `datos.bitacora` están ya escritas en su colección. */
let bitacoraGuardadas = 0

async function cargarBitacora(): Promise<void> {
  const c = coleccionAparte(COL_BITACORA)
  if (!c) return
  // Por `i`, que es el orden de la cadena. Ordenar por `_id` o por fecha sería
  // confiar en que coincidan con el orden real, y en una cadena de hashes un
  // orden distinto es una cadena rota.
  const filas = await c.find({}).sort({ i: 1 }).toArray()
  datos.bitacora = filas.map((f: any) => f.entrada)
  bitacoraGuardadas = datos.bitacora.length
}

/** Mueve al su colección la bitácora que quedara dentro del estado. */
async function migrarBitacoraDelEstado(dentroDelEstado: any[]): Promise<number> {
  const c = coleccionAparte(COL_BITACORA)
  if (!c || !dentroDelEstado.length) return 0
  // Delante de lo que ya hubiera en la colección: lo del estado es lo viejo.
  const nuevas = dentroDelEstado.map((entrada, i) => ({ i, entrada }))
  const desplazo = datos.bitacora.length
  if (desplazo) {
    // Ya había entradas cargadas de la colección: se recolocan detrás.
    await c.deleteMany({})
    const todas = [...dentroDelEstado, ...datos.bitacora]
    await c.insertMany(todas.map((entrada, i) => ({ i, entrada })), { ordered: true })
    datos.bitacora = todas
  } else {
    await c.insertMany(nuevas, { ordered: true })
    datos.bitacora = dentroDelEstado
  }
  bitacoraGuardadas = datos.bitacora.length
  return dentroDelEstado.length
}

/** Escribe las entradas nuevas. Devuelve cuántas se escribieron. */
async function volcarBitacora(): Promise<number> {
  const c = coleccionAparte(COL_BITACORA)
  if (!c) return 0
  const pendientes = datos.bitacora.slice(bitacoraGuardadas)
  if (!pendientes.length) return 0
  await c.insertMany(
    pendientes.map((entrada, k) => ({ i: bitacoraGuardadas + k, entrada })),
    { ordered: true },
  )
  // Solo ahora. Si el insertMany lanzó, no se avanza y se reintenta.
  bitacoraGuardadas += pendientes.length
  return pendientes.length
}

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de vida
// ─────────────────────────────────────────────────────────────────────────────

export async function iniciar(): Promise<void> {
  if (motor === 'mongodb') {
    await abrirMongo()
    const doc = await coleccion.findOne({ _id: 'genesis' })
    datos = doc?.datos ? { ...vacio(), ...doc.datos } : vacio()

    /* La bitácora ya no viaja dentro del estado. Se aparta lo que viniera en el
       documento —de versiones anteriores— y se carga la colección; después se
       junta todo en orden. Hasta que la migración termine bien, lo del estado
       no se borra: primero se guarda en su sitio nuevo. */
    const enElEstado = Array.isArray(datos.bitacora) ? datos.bitacora : []
    datos.bitacora = []
    bitacoraGuardadas = 0
    await cargarBitacora()
    if (enElEstado.length) {
      const movidas = await migrarBitacoraDelEstado(enElEstado)
      console.log(`[store] bitácora movida fuera del estado: ${movidas} entradas`)
      // Un volcado inmediato deja el documento de estado ya sin ella.
      await store.guardarYa()
    }
  } else {
    datos = leerArchivo() ?? vacio()
    // Con el motor de archivo la bitácora se queda dentro del JSON: no hay
    // límite de 16 MB que esquivar y este motor es para desarrollo.
    bitacoraGuardadas = datos.bitacora.length
  }
}

/**
 * Cómo fue el último volcado.
 *
 * Hasta ahora, un guardado que fallaba solo dejaba un `console.error` en el
 * registro y el servicio seguía respondiendo 200 a todo: los datos vivían en
 * memoria y morían en el siguiente reinicio, sin que nada lo delatara. Es
 * exactamente la forma de perder un operador recién creado —o una identidad
 * aprobada— sin que nadie se entere. Se publica en /healthz para que un fallo
 * de escritura se vea desde fuera.
 */
let ultimoVolcado: { en: string; ok: boolean; error?: string } | null = null

export function saludAlmacen(): { motor: string; ultimoVolcado: typeof ultimoVolcado } {
  return { motor, ultimoVolcado }
}

async function volcar(): Promise<void> {
  try {
    if (motor === 'mongodb' && coleccion) {
      /* La bitácora PRIMERO y aparte. Se escriben las entradas nuevas en su
         colección antes de tocar el estado: si el proceso se cae entre las dos
         escrituras, lo que sobra es una entrada de auditoría ya guardada, que
         es inofensivo. Al revés —estado guardado y bitácora perdida— faltaría
         el rastro de una decisión que sí ocurrió. */
      await volcarBitacora()

      // El documento de estado va SIN bitácora. Es todo el punto del cambio:
      // lo que no está aquí no cuenta para los 16 MB.
      const { bitacora: _fuera, ...estado } = datos
      await coleccion.updateOne(
        { _id: 'genesis' },
        { $set: { datos: estado, actualizado: new Date() } },
        { upsert: true },
      )
    } else {
      escribirArchivo(datos)
    }
    ultimoVolcado = { en: new Date().toISOString(), ok: true }
  } catch (e: any) {
    ultimoVolcado = { en: new Date().toISOString(), ok: false, error: e?.message || 'desconocido' }
    throw e
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
    // Se vacía también la colección: si no, una prueba que reinicia el estado
    // volvería a cargar la bitácora vieja en el siguiente arranque y la cadena
    // no cuadraría con unas identidades que ya no existen.
    const c = coleccionAparte(COL_BITACORA)
    if (c) await c.deleteMany({})
    bitacoraGuardadas = 0
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
