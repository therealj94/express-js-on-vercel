// Los movimientos del ecosistema, fuera del documento de estado.
//
// POR QUE SE SACARON, ANTES DE QUE HICIERA FALTA
//
// Todo el estado del motor vive en un solo documento (`estado/genesis`) y
// MongoDB no deja pasar de 16 MB. Ya obligó a sacar dos veces: las fotos del
// documento y la bitácora. Los movimientos son el tercer candidato y el peor de
// los tres, porque no crecen con los usuarios: crecen con lo que hacen. Un
// usuario que opera a diario genera cientos al año, y no se borran nunca.
//
// La cuenta, con un movimiento real medido:
//
//     un movimiento ..................... ~280 bytes
//     movimientos por usuario activo/año ..... 300
//     ────────────────────────────────────────────
//     por usuario y año ................. 84.000 bytes
//     TECHO (compartiendo con todo lo demás) ~150 usuarios activos
//
// Con la wallet, ordenex y MyTokenPay reportando, ese techo se cruza el primer
// mes. Y al cruzarlo no falla el monitoreo: falla `volcar()`, o sea el guardado
// de TODO —identidades, aprobaciones, operadores— mientras el servicio sigue
// contestando 200 y los datos viven en memoria hasta el siguiente reinicio.
// Sacarlos ahora cuesta una tarde; descubrirlo en producción cuesta un día de
// aprobaciones perdidas sin saber cuáles.
//
// NO SE CARGAN EN MEMORIA, Y ESA ES LA DIFERENCIA CON LA BITACORA
//
// La bitácora se carga entera al arrancar porque es una cadena de hashes y hay
// que recorrerla en orden. Los movimientos no encadenan nada: cada consulta
// quiere UN subconjunto —los de una persona, los de una app, los de un mes— y
// pedirlos a la base es más barato que sostener el histórico entero en RAM.
// Por eso todas las funciones de aquí son asíncronas.

import { coleccionAparte, archivoAparte } from '../store.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { Movimiento } from './monitoreo.js'

const NOMBRE = 'movimientos'

const coleccion = () => coleccionAparte(NOMBRE)

// ── Motor de archivo (desarrollo) ────────────────────────────────────────────

function leerArchivo(): Movimiento[] {
  const ruta = archivoAparte(NOMBRE)
  if (!existsSync(ruta)) return []
  try {
    const d = JSON.parse(readFileSync(ruta, 'utf8'))
    return Array.isArray(d) ? d : []
  } catch {
    return []
  }
}

function escribirArchivo(lista: Movimiento[]): void {
  writeFileSync(archivoAparte(NOMBRE), JSON.stringify(lista), 'utf8')
}

/**
 * Los índices, una sola vez.
 *
 * Sin el de `gid` cada reporte de movimiento recorrería la colección entera
 * para evaluar las reglas de una persona, y eso empeora justo cuando el
 * ecosistema crece. El de `id` es único: es lo que impide que un cliente que
 * reintenta un lote duplique lo que ya mandó.
 */
let indicesListos = false
async function asegurarIndices(): Promise<void> {
  if (indicesListos) return
  const c = coleccion()
  if (!c) { indicesListos = true; return }
  try {
    await c.createIndex({ id: 1 }, { unique: true })
    await c.createIndex({ gid: 1, fecha: -1 })
    await c.createIndex({ fecha: -1 })
    await c.createIndex({ app: 1, fecha: -1 })
  } catch (e: any) {
    console.error('[movimientos] no se pudieron crear los índices:', e?.message)
  }
  indicesListos = true
}

// ── Escritura ────────────────────────────────────────────────────────────────

/**
 * Guarda los que no estuvieran ya. Devuelve cuántos eran nuevos.
 *
 * La deduplicación es por `id` y la pone la base con un índice único, no un
 * `if` en el código: un cliente que reintenta un lote —porque se le cortó la
 * red a mitad— tiene que poder mandarlo entero otra vez sin duplicar nada.
 */
export async function guardarMovimientos(nuevos: Movimiento[]): Promise<number> {
  if (!nuevos.length) return 0
  await asegurarIndices()
  const c = coleccion()
  if (c) {
    // `ordered: false` para que un duplicado a la mitad no frene los que vienen
    // detrás. Los errores de clave duplicada son el resultado normal aquí.
    try {
      const r = await c.insertMany(nuevos, { ordered: false })
      return r.insertedCount ?? 0
    } catch (e: any) {
      if (e?.code === 11000 || e?.writeErrors) return e.result?.nInserted ?? e.insertedCount ?? 0
      throw e
    }
  }
  const lista = leerArchivo()
  const conocidos = new Set(lista.map((m) => m.id))
  const frescos = nuevos.filter((m) => !conocidos.has(m.id))
  if (frescos.length) escribirArchivo([...lista, ...frescos])
  return frescos.length
}

// ── Lectura ──────────────────────────────────────────────────────────────────

/**
 * Todos los de una persona, de más viejo a más nuevo.
 *
 * Van TODOS y no solo los de la ventana de 30 días porque una de las reglas
 * —«cuenta nueva con volumen alto»— necesita saber cuándo fue la PRIMERA
 * operación. Recortar aquí la desactivaría sin que nada lo dijera.
 */
export async function movimientosDe(gid: string): Promise<Movimiento[]> {
  const c = coleccion()
  if (c) return await c.find({ gid }).sort({ fecha: 1 }).toArray() as Movimiento[]
  return leerArchivo().filter((m) => m.gid === gid).sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Los que dispararon una alerta, para enseñar el caso. */
export async function movimientosPorIds(ids: string[]): Promise<Movimiento[]> {
  if (!ids.length) return []
  const c = coleccion()
  if (c) return await c.find({ id: { $in: ids } }).toArray() as Movimiento[]
  const set = new Set(ids)
  return leerArchivo().filter((m) => set.has(m.id))
}

/** Cuántos hay y cuánto suman, para el tablero. */
export async function resumenMovimientos(): Promise<{ total: number; volumenUsd: number }> {
  const c = coleccion()
  if (c) {
    const r = await c.aggregate([
      { $group: { _id: null, total: { $sum: 1 }, volumenUsd: { $sum: '$montoUsd' } } },
    ]).toArray()
    return { total: r[0]?.total ?? 0, volumenUsd: r[0]?.volumenUsd ?? 0 }
  }
  const lista = leerArchivo()
  return { total: lista.length, volumenUsd: lista.reduce((s, m) => s + (m.montoUsd || 0), 0) }
}

export interface FiltroMovimientos {
  gid?: string
  app?: string
  direccion?: 'entrada' | 'salida'
  activo?: string
  desde?: string
  hasta?: string
  montoMin?: number
  /** Busca en contraparte, hash o activo. */
  texto?: string
  limite?: number
  saltar?: number
}

export interface PaginaMovimientos {
  movimientos: Movimiento[]
  total: number
  volumenUsd: number
  porApp: { app: string; n: number; volumenUsd: number }[]
}

function condicion(f: FiltroMovimientos): Record<string, any> {
  const q: Record<string, any> = {}
  if (f.gid) q.gid = f.gid
  if (f.app) q.app = f.app
  if (f.direccion) q.direccion = f.direccion
  if (f.activo) q.activo = f.activo
  if (f.montoMin !== undefined) q.montoUsd = { $gte: f.montoMin }
  if (f.desde || f.hasta) {
    q.fecha = {}
    if (f.desde) q.fecha.$gte = f.desde
    if (f.hasta) q.fecha.$lte = f.hasta + 'T23:59:59.999Z'
  }
  if (f.texto) {
    // Se escapa lo que el operador escriba: un `.*` suelto en una consulta con
    // índice convierte una búsqueda en un recorrido de toda la colección.
    const t = f.texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    q.$or = [
      { contraparte: { $regex: t, $options: 'i' } },
      { hash: { $regex: t, $options: 'i' } },
      { activo: { $regex: t, $options: 'i' } },
      { gid: { $regex: t, $options: 'i' } },
    ]
  }
  return q
}

/** La consulta del tablero: una página de movimientos y sus totales. */
export async function buscarMovimientos(f: FiltroMovimientos): Promise<PaginaMovimientos> {
  const limite = Math.max(1, Math.min(500, f.limite ?? 100))
  const saltar = Math.max(0, f.saltar ?? 0)
  const c = coleccion()

  if (c) {
    const q = condicion(f)
    const [movimientos, agregado, porApp] = await Promise.all([
      c.find(q, { projection: { _id: 0 } }).sort({ fecha: -1 }).skip(saltar).limit(limite).toArray(),
      c.aggregate([{ $match: q }, { $group: { _id: null, n: { $sum: 1 }, v: { $sum: '$montoUsd' } } }]).toArray(),
      c.aggregate([
        { $match: q },
        { $group: { _id: '$app', n: { $sum: 1 }, v: { $sum: '$montoUsd' } } },
        { $sort: { n: -1 } },
      ]).toArray(),
    ])
    return {
      movimientos: movimientos as Movimiento[],
      total: agregado[0]?.n ?? 0,
      volumenUsd: agregado[0]?.v ?? 0,
      porApp: porApp.map((a: any) => ({ app: a._id || 'sin app', n: a.n, volumenUsd: a.v })),
    }
  }

  // Motor de archivo: se filtra en memoria. Es el motor de desarrollo y la
  // colección es pequeña por definición.
  let lista = leerArchivo()
  if (f.gid) lista = lista.filter((m) => m.gid === f.gid)
  if (f.app) lista = lista.filter((m) => m.app === f.app)
  if (f.direccion) lista = lista.filter((m) => m.direccion === f.direccion)
  if (f.activo) lista = lista.filter((m) => m.activo === f.activo)
  if (f.montoMin !== undefined) lista = lista.filter((m) => m.montoUsd >= f.montoMin!)
  if (f.desde) lista = lista.filter((m) => m.fecha >= f.desde!)
  if (f.hasta) lista = lista.filter((m) => m.fecha <= f.hasta! + 'T23:59:59.999Z')
  if (f.texto) {
    const t = f.texto.toLowerCase()
    lista = lista.filter((m) =>
      (m.contraparte || '').toLowerCase().includes(t) ||
      (m.hash || '').toLowerCase().includes(t) ||
      (m.activo || '').toLowerCase().includes(t) ||
      (m.gid || '').toLowerCase().includes(t))
  }
  lista.sort((a, b) => b.fecha.localeCompare(a.fecha))
  const porApp = new Map<string, { n: number; v: number }>()
  for (const m of lista) {
    const k = m.app || 'sin app'
    const y = porApp.get(k) ?? { n: 0, v: 0 }
    y.n++; y.v += m.montoUsd || 0
    porApp.set(k, y)
  }
  return {
    movimientos: lista.slice(saltar, saltar + limite),
    total: lista.length,
    volumenUsd: lista.reduce((s, m) => s + (m.montoUsd || 0), 0),
    porApp: [...porApp].map(([app, y]) => ({ app, n: y.n, volumenUsd: y.v }))
      .sort((a, b) => b.n - a.n),
  }
}

/**
 * Mueve fuera del estado los movimientos que hubieran quedado dentro.
 *
 * Se llama una vez al arrancar. Igual que con la bitácora: primero se guardan
 * en su sitio nuevo y solo después se vacía el estado, para que un corte a
 * mitad deje datos duplicados —que el índice único resuelve— y nunca perdidos.
 */
export async function migrarMovimientosDelEstado(dentro: Movimiento[]): Promise<number> {
  if (!dentro.length) return 0
  return await guardarMovimientos(dentro)
}
