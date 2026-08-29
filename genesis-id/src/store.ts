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
    aplicaciones: [], casos: [], movimientos: [], bitacora: [], anclas: [], version: 2,
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

/**
 * Copias exactas descartadas al cargar, y filas con el mismo sitio pero
 * contenido distinto. Se publica en `/healthz`: un descarte silencioso en el
 * almacén de auditoría es justo lo que no puede pasar.
 */
let bitacoraCopias = 0
let bitacoraChoques: number[] = []

/**
 * Índice ÚNICO sobre `i`.
 *
 * `i` es el sitio de la entrada en la cadena, y dos entradas no pueden ocupar
 * el mismo sitio. Sin este índice, un volcado repetido escribe la misma entrada
 * dos veces, la colección deja de ser una lista y la cadena se rompe al
 * siguiente reinicio. Eso pasó de verdad el 20 de agosto.
 *
 * El índice es la red de abajo. La de arriba —que los volcados no se pisen— es
 * `volcando`, más abajo. Van las dos: la primera evita el fallo, la segunda lo
 * convierte en un error ruidoso en vez de un dato corrupto.
 */
async function indiceBitacora(): Promise<void> {
  const c = coleccionAparte(COL_BITACORA)
  if (!c) return
  try {
    await c.createIndex({ i: 1 }, { unique: true, name: 'i_unico' })
  } catch (e: any) {
    /* Si ya hay duplicados, el índice no se puede crear. No se aborta el
       arranque por eso: `cargarBitacora` los aparta, y el siguiente arranque
       —ya sin ellos— sí lo crea. Pero queda dicho en el registro. */
    console.error('[store] no se pudo crear el índice único de la bitácora:', e?.message)
  }
}

async function cargarBitacora(): Promise<void> {
  const c = coleccionAparte(COL_BITACORA)
  if (!c) return
  // Por `i`, que es el orden de la cadena. Ordenar por `_id` o por fecha sería
  // confiar en que coincidan con el orden real, y en una cadena de hashes un
  // orden distinto es una cadena rota.
  const filas = await c.find({}).sort({ i: 1 }).toArray()

  /* SE APARTAN LAS COPIAS EXACTAS, Y NADA MÁS.
   *
   * Un volcado que corrió dos veces dejó la MISMA entrada escrita dos veces:
   * mismo `i`, mismo `id`, mismo hash. Cargar las dos mete un eslabón repetido
   * en medio de la cadena y la rompe ahí, aunque ninguna entrada se haya
   * tocado. Apartar la copia no es reparar la cadena ni recalcular nada: es
   * corregir una fila que el almacén escribió de más.
   *
   * Si dos filas comparten `i` pero NO son la misma entrada, eso ya no es una
   * copia: es una anomalía de verdad. Ahí no se elige ninguna —elegir sería
   * decidir qué versión de la historia vale— se guardan las dos, la cadena
   * saldrá rota como debe, y el sitio queda anotado en `bitacoraChoques`. */
  const porSitio = new Map<number, any>()
  const orden: any[] = []
  bitacoraCopias = 0
  bitacoraChoques = []
  for (const f of filas as any[]) {
    const sitio = typeof f.i === 'number' ? f.i : orden.length
    const ya = porSitio.get(sitio)
    if (!ya) {
      porSitio.set(sitio, f.entrada)
      orden.push(f.entrada)
      continue
    }
    if (ya.id === f.entrada?.id && ya.hash === f.entrada?.hash) {
      bitacoraCopias += 1
      continue
    }
    bitacoraChoques.push(sitio)
    orden.push(f.entrada)
  }
  if (bitacoraCopias) {
    console.error(`[store] bitácora: ${bitacoraCopias} copias exactas apartadas al cargar ` +
      '(un volcado corrió dos veces; ver el índice único de `i`)')
  }
  if (bitacoraChoques.length) {
    console.error(`[store] bitácora: ${bitacoraChoques.length} sitios con entradas DISTINTAS ` +
      `compartiendo el mismo \`i\`: ${bitacoraChoques.slice(0, 10).join(', ')}`)
  }

  datos.bitacora = orden
  bitacoraGuardadas = datos.bitacora.length

  /* Se limpian también en el almacén: si se quedan, el índice único no se puede
     crear nunca y la próxima carga vuelve a tener que apartarlas. Solo las
     copias exactas, y solo cuando no hay choques que decidir. */
  if (bitacoraCopias && !bitacoraChoques.length) {
    try {
      await c.deleteMany({})
      await c.insertMany(orden.map((entrada, i) => ({ i, entrada })), { ordered: true })
      console.log(`[store] bitácora reescrita sin copias: ${orden.length} entradas`)
    } catch (e: any) {
      console.error('[store] no se pudieron quitar las copias del almacén:', e?.message)
    }
  }
}

export function saludBitacora(): { copiasApartadas: number; sitiosEnChoque: number[] } {
  return { copiasApartadas: bitacoraCopias, sitiosEnChoque: bitacoraChoques }
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
    await indiceBitacora()
    if (enElEstado.length) {
      const movidas = await migrarBitacoraDelEstado(enElEstado)
      console.log(`[store] bitácora movida fuera del estado: ${movidas} entradas`)
      // Un volcado inmediato deja el documento de estado ya sin ella.
      await store.guardarYa()
    }

    /* Los MOVIMIENTOS, por la misma razón y con el mismo cuidado.
       Son el tercero en salir del documento de estado —después de las fotos y
       la bitácora— y el que peor crecía: no crece con cuánta gente hay sino con
       cuánto opera, así que no tiene techo. Se importa a su colección con el
       módulo que ya sabe deduplicar por id, y solo cuando eso salió bien se
       vacía el estado: un corte a mitad deja duplicados —que el índice único
       descarta— y nunca un movimiento perdido. */
    const movsEnEstado = Array.isArray((datos as any).movimientos) ? (datos as any).movimientos : []
    if (movsEnEstado.length) {
      const { migrarMovimientosDelEstado } = await import('./aml/almacenMovimientos.js')
      const n = await migrarMovimientosDelEstado(movsEnEstado)
      ;(datos as any).movimientos = []
      console.log(`[store] movimientos movidos fuera del estado: ${n} de ${movsEnEstado.length}`)
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

/**
 * EL CANDADO. Los volcados van en fila de a uno, nunca a la vez.
 *
 * `volcarBitacora()` lee cuántas entradas lleva guardadas, se va a esperar al
 * `insertMany`, y solo al volver adelanta el contador. Entre esas dos cosas hay
 * un `await`, y ahí cabía otro volcado entero: leía el mismo contador, veía las
 * mismas entradas pendientes y las volvía a escribir con el MISMO `i`.
 *
 * En memoria no se notaba nada. Se notaba al reiniciar, cuando la entrada
 * duplicada volvía dos veces y el eslabón repetido no encadenaba con el que
 * ahora tenía delante. Así se rompió la bitácora de producción el 20 de agosto.
 *
 * `volcando` existía desde siempre —se le asignaba la promesa del último
 * volcado— pero nadie la esperaba nunca. Era una variable muerta. Aquí pasa a
 * ser la fila: cada volcado espera al anterior antes de empezar.
 *
 * Se engancha con `.catch()` y no con `await` a secas para que un volcado que
 * falla no deje la fila atascada para siempre: el siguiente arranca igual y
 * reintenta lo que quedó pendiente, que es justo lo que hay que hacer.
 */
function enFila(): Promise<void> {
  const mio = volcando.catch(() => {}).then(volcar)
  volcando = mio.catch(() => {})
  return mio
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

      // El documento de estado va SIN bitácora NI movimientos. Es todo el punto
      // del cambio: lo que no está aquí no cuenta para los 16 MB.
      const { bitacora: _fuera, movimientos: _tampoco, ...estado } = datos
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
      volcando = enFila().catch((e) => console.error('[store] no se pudo guardar:', e?.message))
    }, 100)
  },

  /** Vuelca ahora y espera. Se usa antes de responder a algo irreversible. */
  async guardarYa(): Promise<void> {
    if (pendiente) {
      clearTimeout(pendiente)
      pendiente = null
    }
    volcando = enFila()
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
