// ─────────────────────────────────────────────────────────────────────────────
// Las preguntas que el panel le hace a la telemetría.
//
// Todo lo de aquí se apoya en los resúmenes que `eventos.ts` va escribiendo al
// vuelo. Ninguna consulta recorre los eventos crudos salvo el detalle de un
// error concreto, que sí los necesita y va acotado a unas decenas de filas.
//
// La regla que se sigue en todo el módulo: si una cifra no se puede calcular
// con honestidad, se devuelve `null` y el panel lo dice. Una gráfica que
// inventa un cero donde no hubo medición es peor que una gráfica vacía, porque
// se ve igual de bien.
// ─────────────────────────────────────────────────────────────────────────────

import { almacen, leerCenso } from './eventos.js'
import type { EstadoError, GrupoError } from './eventos.js'
import { store } from '../store.js'

const DIA = 86400000

/** Los últimos `n` días como cadenas `AAAA-MM-DD`, del más viejo al de hoy. */
export function ventana(n: number): string[] {
  const hoy = Date.now()
  return Array.from({ length: n }, (_, i) =>
    new Date(hoy - (n - 1 - i) * DIA).toISOString().slice(0, 10))
}

const sumar = (o: Record<string, number> = {}) =>
  Object.values(o).reduce((s, n) => s + (Number(n) || 0), 0)

function fundir(destino: Record<string, number>, origen: Record<string, number> = {}) {
  for (const [k, v] of Object.entries(origen)) destino[k] = (destino[k] ?? 0) + (Number(v) || 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Resúmenes diarios
// ─────────────────────────────────────────────────────────────────────────────

async function diasDe(dias: string[], app?: string): Promise<any[]> {
  if (almacen.hayMongo()) {
    const filtro: any = { dia: { $in: dias } }
    if (app) filtro.app = app
    return almacen.cDias()!.find(filtro).toArray()
  }
  return [...almacen.memoria.dias.values()]
    .filter((d) => dias.includes(d.dia) && (!app || d.app === app))
}

/** Activos únicos por día, tal como se contaron ese día. */
async function activosPorDia(dias: string[], app?: string): Promise<Record<string, number>> {
  const salida: Record<string, number> = {}
  if (almacen.hayMongo()) {
    const filtro: any = { dia: { $in: dias } }
    if (app) filtro.app = app
    const docs = await almacen.cActivos()!.find(filtro, { projection: { dia: 1, n: 1, app: 1 } }).toArray()
    for (const d of docs) salida[d.dia] = (salida[d.dia] ?? 0) + (d.n ?? 0)
  } else {
    for (const [k, set] of almacen.memoria.activos) {
      const [a, dia] = k.split('|')
      if (!dias.includes(dia) || (app && a !== app)) continue
      salida[dia] = (salida[dia] ?? 0) + set.size
    }
  }
  return salida
}

/**
 * Usuarios activos en los últimos `n` días.
 *
 * Sale de la fecha de última actividad de cada persona, no de la unión de los
 * conjuntos diarios: es la misma cifra, cuesta una consulta en vez de treinta,
 * y no se desvía cuando alguien entra varios días seguidos.
 */
async function activosDesde(desde: Date, app?: string): Promise<number> {
  if (almacen.hayMongo()) {
    const filtro: any = { ultima: { $gte: desde } }
    if (app) filtro.app = app
    return almacen.cUsuarios()!.countDocuments(filtro)
  }
  return [...almacen.memoria.usuarios.values()]
    .filter((u) => u.ultima >= desde && (!app || u.app === app)).length
}

async function totalUsuarios(app?: string): Promise<number> {
  if (almacen.hayMongo()) {
    return almacen.cUsuarios()!.countDocuments(app ? { app } : {})
  }
  return [...almacen.memoria.usuarios.values()].filter((u) => !app || u.app === app).length
}

async function appsConocidas(): Promise<string[]> {
  if (almacen.hayMongo()) {
    const r = await almacen.cDias()!.distinct('app')
    return r.sort()
  }
  return [...new Set([...almacen.memoria.dias.values()].map((d) => d.app))].sort()
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen general
// ─────────────────────────────────────────────────────────────────────────────

export async function resumen(dias = 30, app?: string) {
  const v = ventana(dias)
  const hoy = v[v.length - 1]
  const ayer = v[v.length - 2]
  const docs = await diasDe(v, app)
  const ahora = Date.now()

  const porDia = new Map<string, any>()
  for (const d of docs) {
    const acc = porDia.get(d.dia) ?? {
      eventos: 0, errores: 0, criticos: 0, nuevos: 0, transacciones: 0,
      muestrasDuracion: 0, sumaDuracion: 0, paises: {}, plataformas: {}, tipos: {}, volumen: {},
    }
    acc.eventos += d.eventos ?? 0
    acc.errores += d.errores ?? 0
    acc.criticos += d.criticos ?? 0
    acc.nuevos += d.nuevos ?? 0
    acc.transacciones += d.transacciones ?? 0
    acc.muestrasDuracion += d.muestrasDuracion ?? 0
    acc.sumaDuracion += d.sumaDuracion ?? 0
    fundir(acc.paises, d.paises)
    fundir(acc.plataformas, d.plataformas)
    fundir(acc.tipos, d.tipos)
    fundir(acc.volumen, d.volumen)
    porDia.set(d.dia, acc)
  }

  const activos = await activosPorDia(v, app)
  const vacio = { eventos: 0, errores: 0, criticos: 0, nuevos: 0, transacciones: 0, muestrasDuracion: 0, sumaDuracion: 0, paises: {}, plataformas: {}, tipos: {}, volumen: {} }

  const serie = v.map((dia) => {
    const d = porDia.get(dia) ?? vacio
    return {
      dia,
      eventos: d.eventos,
      errores: d.errores,
      criticos: d.criticos,
      nuevos: d.nuevos,
      activos: activos[dia] ?? 0,
      transacciones: d.transacciones,
      duracionMedia: d.muestrasDuracion ? Math.round(d.sumaDuracion / d.muestrasDuracion) : null,
    }
  })

  const paises: Record<string, number> = {}
  const plataformas: Record<string, number> = {}
  const tipos: Record<string, number> = {}
  const volumen: Record<string, number> = {}
  for (const d of porDia.values()) {
    fundir(paises, d.paises); fundir(plataformas, d.plataformas)
    fundir(tipos, d.tipos); fundir(volumen, d.volumen)
  }

  const dHoy = porDia.get(hoy) ?? vacio
  const dAyer = porDia.get(ayer) ?? vacio

  // El padrón declarado por las apps. Va aparte del recuento de telemetría y
  // nunca se suma con él: uno dice cuánta gente hay, el otro cuánta se mueve.
  const censos = await leerCenso(app)
  const registrados = censos.reduce((s, c) => s + (c.registrados || 0), 0)

  return {
    ventanaDias: dias,
    app: app ?? null,
    censo: {
      registrados,
      /** Sin censo, el panel tiene que decir que no lo sabe, no inventar un 0. */
      hay: censos.length > 0,
      porApp: censos.map((c) => ({
        app: c.app, registrados: c.registrados, activos30: c.activos30 ?? null,
        verificados: c.verificados ?? null, negocios: c.negocios ?? null,
        extra: c.extra ?? null, en: c.en,
      })),
    },
    usuarios: {
      total: await totalUsuarios(app),
      activosHoy: activos[hoy] ?? 0,
      activos7: await activosDesde(new Date(ahora - 7 * DIA), app),
      activos30: await activosDesde(new Date(ahora - 30 * DIA), app),
      nuevosHoy: dHoy.nuevos,
      nuevosAyer: dAyer.nuevos,
      nuevosVentana: serie.reduce((s, d) => s + d.nuevos, 0),
    },
    actividad: {
      eventosHoy: dHoy.eventos,
      eventosVentana: serie.reduce((s, d) => s + d.eventos, 0),
      transaccionesVentana: serie.reduce((s, d) => s + d.transacciones, 0),
      volumen,
    },
    errores: {
      hoy: dHoy.errores,
      ayer: dAyer.errores,
      criticosHoy: dHoy.criticos,
      ventana: serie.reduce((s, d) => s + d.errores, 0),
      /** Errores por cada mil eventos: es lo que se compara entre versiones. */
      tasaPorMil: dHoy.eventos ? Math.round((dHoy.errores / dHoy.eventos) * 1000) : 0,
    },
    serie,
    paises: ordenar(paises),
    plataformas: ordenar(plataformas),
    tipos,
    /** Cuántos días de la ventana tienen alguna medición. Si es 0, no hay datos. */
    diasConDatos: serie.filter((d) => d.eventos > 0).length,
  }
}

function ordenar(o: Record<string, number>): { clave: string; n: number }[] {
  return Object.entries(o)
    .map(([clave, n]) => ({ clave, n }))
    .sort((a, b) => b.n - a.n)
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparativa entre apps
// ─────────────────────────────────────────────────────────────────────────────

export async function porApp(dias = 30) {
  const v = ventana(dias)
  const ahora = Date.now()
  const apps = await appsConocidas()
  const salida = []
  for (const app of apps) {
    const docs = await diasDe(v, app)
    const activos = await activosPorDia(v, app)
    const eventos = docs.reduce((s, d) => s + (d.eventos ?? 0), 0)
    const errores = docs.reduce((s, d) => s + (d.errores ?? 0), 0)
    salida.push({
      app,
      usuarios: await totalUsuarios(app),
      activos7: await activosDesde(new Date(ahora - 7 * DIA), app),
      nuevos: docs.reduce((s, d) => s + (d.nuevos ?? 0), 0),
      eventos,
      errores,
      tasaPorMil: eventos ? Math.round((errores / eventos) * 1000) : 0,
      serie: v.map((dia) => activos[dia] ?? 0),
    })
  }
  return salida.sort((a, b) => b.usuarios - a.usuarios)
}

// ─────────────────────────────────────────────────────────────────────────────
// Países
// ─────────────────────────────────────────────────────────────────────────────

const NOMBRES_PAIS: Record<string, string> = {
  HN: 'Honduras', US: 'Estados Unidos', MX: 'México', GT: 'Guatemala', SV: 'El Salvador',
  NI: 'Nicaragua', CR: 'Costa Rica', PA: 'Panamá', CO: 'Colombia', ES: 'España',
  AR: 'Argentina', CL: 'Chile', PE: 'Perú', EC: 'Ecuador', DO: 'Rep. Dominicana',
  BR: 'Brasil', CA: 'Canadá', VE: 'Venezuela', BZ: 'Belice', UY: 'Uruguay',
  '??': 'Sin determinar',
}
export const nombrePais = (c: string): string => NOMBRES_PAIS[c] ?? c

export async function paises(dias = 30, app?: string) {
  const docs = await diasDe(ventana(dias), app)
  const total: Record<string, number> = {}
  for (const d of docs) fundir(total, d.paises)

  // Usuarios por país: sale del último país visto de cada persona, que es lo
  // que interesa para saber dónde está la base — no dónde ocurrió cada toque.
  const usuarios: Record<string, number> = {}
  if (almacen.hayMongo()) {
    const filtro = app ? { app } : {}
    const agg = await almacen.cUsuarios()!.aggregate([
      { $match: filtro },
      { $group: { _id: '$pais', n: { $sum: 1 } } },
    ]).toArray()
    for (const r of agg) usuarios[r._id ?? '??'] = r.n
  } else {
    for (const u of almacen.memoria.usuarios.values()) {
      if (app && u.app !== app) continue
      usuarios[u.pais ?? '??'] = (usuarios[u.pais ?? '??'] ?? 0) + 1
    }
  }

  const claves = [...new Set([...Object.keys(total), ...Object.keys(usuarios)])]
  const suma = sumar(total) || 1
  return claves
    .map((c) => ({
      codigo: c,
      nombre: nombrePais(c),
      eventos: total[c] ?? 0,
      usuarios: usuarios[c] ?? 0,
      porcentaje: Math.round(((total[c] ?? 0) / suma) * 1000) / 10,
    }))
    .sort((a, b) => b.usuarios - a.usuarios || b.eventos - a.eventos)
}

// ─────────────────────────────────────────────────────────────────────────────
// Retención
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De los que se dieron de alta hace N días, ¿cuántos siguen apareciendo?
 *
 * Es la métrica más honesta que existe para saber si un producto sirve. Se
 * calcula por cohorte semanal para que no dependa del día de la semana.
 */
export async function retencion(app?: string, semanas = 6) {
  const filas = []
  for (let s = semanas; s >= 1; s--) {
    const ini = new Date(Date.now() - s * 7 * DIA)
    const fin = new Date(Date.now() - (s - 1) * 7 * DIA)
    let cohorte: any[] = []
    if (almacen.hayMongo()) {
      const f: any = { primera: { $gte: ini, $lt: fin } }
      if (app) f.app = app
      cohorte = await almacen.cUsuarios()!.find(f, { projection: { ultima: 1 } }).toArray()
    } else {
      cohorte = [...almacen.memoria.usuarios.values()]
        .filter((u) => u.primera >= ini && u.primera < fin && (!app || u.app === app))
    }
    if (!cohorte.length) {
      filas.push({ semana: `hace ${s}`, altas: 0, siguen: 0, porcentaje: null })
      continue
    }
    // «Sigue» = se le vio después de su primera semana.
    const siguen = cohorte.filter((u) => new Date(u.ultima).getTime() >= fin.getTime()).length
    filas.push({
      semana: `hace ${s}`,
      altas: cohorte.length,
      siguen,
      porcentaje: Math.round((siguen / cohorte.length) * 1000) / 10,
    })
  }
  return filas
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores
// ─────────────────────────────────────────────────────────────────────────────

export async function errores(filtro: {
  app?: string; estado?: EstadoError; gravedad?: string; texto?: string; limite?: number
} = {}) {
  const { limite = 100 } = filtro
  let lista: GrupoError[]
  if (almacen.hayMongo()) {
    const f: any = {}
    if (filtro.app) f.app = filtro.app
    if (filtro.estado) f.estado = filtro.estado
    if (filtro.gravedad) f.gravedad = filtro.gravedad
    if (filtro.texto) f.titulo = { $regex: filtro.texto.slice(0, 80), $options: 'i' }
    lista = await almacen.cErrores()!.find(f).sort({ ultima: -1 }).limit(limite).toArray()
  } else {
    lista = [...almacen.memoria.errores.values()]
      .filter((g) =>
        (!filtro.app || g.app === filtro.app) &&
        (!filtro.estado || g.estado === filtro.estado) &&
        (!filtro.gravedad || g.gravedad === filtro.gravedad) &&
        (!filtro.texto || g.titulo.toLowerCase().includes(filtro.texto.toLowerCase())))
      .sort((a, b) => +new Date(b.ultima) - +new Date(a.ultima))
      .slice(0, limite)
  }

  return lista.map((g) => ({
    huella: g._id,
    app: g.app,
    titulo: g.titulo,
    gravedad: g.gravedad,
    estado: g.estado,
    total: g.total,
    usuarios: g.usuarios?.length ?? 0,
    versiones: g.versiones ?? [],
    plataformas: g.plataformas ?? [],
    primera: g.primera,
    ultima: g.ultima,
    nota: g.nota ?? null,
  }))
}

export async function errorDetalle(huella: string) {
  let g: GrupoError | null
  if (almacen.hayMongo()) {
    g = await almacen.cErrores()!.findOne({ _id: huella })
  } else {
    g = almacen.memoria.errores.get(huella) ?? null
  }
  if (!g) return null

  // Cómo se reparte en el tiempo: dice si es un pico puntual o una hemorragia.
  const desde = new Date(Date.now() - 14 * DIA)
  let porDia: Record<string, number> = {}
  if (almacen.hayMongo()) {
    const agg = await almacen.cEventos()!.aggregate([
      { $match: { grupo: huella, ts: { $gte: desde } } },
      { $group: { _id: '$dia', n: { $sum: 1 } } },
    ]).toArray()
    for (const r of agg) porDia[r._id] = r.n
  } else {
    for (const e of almacen.memoria.eventos) {
      if (e.grupo === huella && e.ts >= desde) porDia[e.dia] = (porDia[e.dia] ?? 0) + 1
    }
  }

  return {
    huella: g._id,
    app: g.app,
    titulo: g.titulo,
    mensaje: g.mensaje,
    pila: g.pila ?? null,
    gravedad: g.gravedad,
    estado: g.estado,
    total: g.total,
    usuarios: g.usuarios?.length ?? 0,
    versiones: g.versiones ?? [],
    plataformas: g.plataformas ?? [],
    rutas: g.rutas ?? [],
    primera: g.primera,
    ultima: g.ultima,
    nota: g.nota ?? null,
    resueltaEn: g.resueltaEn ?? null,
    resueltaPor: g.resueltaPor ?? null,
    resueltaEnVersion: g.resueltaEnVersion ?? null,
    muestras: (g.muestras ?? []).slice().reverse(),
    serie: ventana(14).map((dia) => ({ dia, n: porDia[dia] ?? 0 })),
  }
}

export async function marcarError(
  huella: string,
  estado: EstadoError,
  operador: string,
  nota?: string,
  version?: string,
): Promise<boolean> {
  const set: Record<string, unknown> = { estado }
  if (nota !== undefined) set.nota = String(nota).slice(0, 500)
  if (estado === 'resuelto') {
    set.resueltaEn = new Date().toISOString()
    set.resueltaPor = operador
    // Se guarda en qué versión se dio por resuelto: sin eso no hay forma de
    // distinguir una regresión de un usuario con la app vieja.
    if (version) set.resueltaEnVersion = String(version).slice(0, 32)
  }
  if (almacen.hayMongo()) {
    const r = await almacen.cErrores()!.updateOne({ _id: huella }, { $set: set })
    return r.matchedCount > 0
  }
  const g = almacen.memoria.errores.get(huella)
  if (!g) return false
  Object.assign(g, set)
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Embudo de verificación
//
// Este no sale de la telemetría sino del propio padrón de Genesis ID, que ya
// sabe en qué paso quedó cada identidad. Es la métrica que más decisiones
// mueve: dice exactamente en qué pantalla se cae la gente.
// ─────────────────────────────────────────────────────────────────────────────

export function embudoKyc() {
  const ids = store.todo().identidades
  const cuenta = (...estados: string[]) => ids.filter((i) => estados.includes(i.estado)).length

  // Cada paso incluye a quienes lo pasaron, aunque hoy estén más adelante.
  const pasos = [
    { paso: 'Inició', n: ids.length },
    { paso: 'Cargó sus datos', n: ids.length - cuenta('iniciada') },
    { paso: 'Subió documento', n: ids.length - cuenta('iniciada', 'datos') },
    { paso: 'Pasó biometría', n: ids.length - cuenta('iniciada', 'datos', 'documento') },
    { paso: 'Aprobada', n: cuenta('verificada') },
  ]

  return {
    pasos: pasos.map((p, i) => ({
      ...p,
      porcentaje: ids.length ? Math.round((p.n / ids.length) * 1000) / 10 : 0,
      /** Cuántos se pierden en ESTE paso respecto del anterior. */
      caida: i === 0 ? 0 : pasos[i - 1].n - p.n,
    })),
    rechazadas: cuenta('rechazada'),
    suspendidas: cuenta('suspendida'),
    porNacionalidad: ordenar(
      ids.reduce((o: Record<string, number>, i) => {
        const k = i.nacionalidad || '??'
        o[k] = (o[k] ?? 0) + 1
        return o
      }, {}),
    ).slice(0, 12),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Salud del ecosistema
// ─────────────────────────────────────────────────────────────────────────────

interface Servicio { clave: string; nombre: string; url: string; espera?: string }

/**
 * Los servicios que se vigilan. Se pueden cambiar sin tocar código con
 * GENESIS_SERVICIOS = "clave|nombre|url,clave|nombre|url".
 */
export function serviciosVigilados(): Servicio[] {
  const crudo = (process.env.GENESIS_SERVICIOS || '').trim()
  if (crudo) {
    return crudo.split(',').map((linea) => {
      const [clave, nombre, url] = linea.split('|').map((s) => s.trim())
      return { clave, nombre: nombre || clave, url }
    }).filter((s) => s.clave && s.url)
  }
  return [
    { clave: 'mytokenpay', nombre: 'MyTokenPay · API', url: 'https://mytokenpay-api-5ab43b64205a.herokuapp.com/healthz' },
    { clave: 'veta-wallet', nombre: 'Veta Wallet · API', url: 'https://vetawallet-1a2e38ac52b1.herokuapp.com/' },
    { clave: 'ordenscan', nombre: 'Explorador ordenscan', url: 'https://orden-global-scan-c4abe71e8024.herokuapp.com/block/totalBlock' },
    { clave: 'rpc8532', nombre: 'Cadena 8532 · RPC', url: 'https://rpc.ordenglobal-rpc.com/' },
    { clave: 'web-veta', nombre: 'vetawallet.com', url: 'https://www.vetawallet.com/' },
  ]
}

// El panel se refresca solo; sin caché, cada operador con la pestaña abierta
// dispararía una ronda de peticiones a todos los servicios cada pocos segundos.
let cacheSalud: { en: number; datos: any[] } = { en: 0, datos: [] }
const CACHE_MS = 45000

export async function saludEcosistema(forzar = false) {
  if (!forzar && Date.now() - cacheSalud.en < CACHE_MS) return cacheSalud.datos

  const medir = async (s: Servicio) => {
    const t0 = Date.now()
    try {
      const ctrl = new AbortController()
      const alarma = setTimeout(() => ctrl.abort(), 8000)
      const r = await fetch(s.url, { signal: ctrl.signal, redirect: 'follow' })
      clearTimeout(alarma)
      const ms = Date.now() - t0
      return {
        clave: s.clave, nombre: s.nombre, url: s.url,
        estado: r.ok ? 'arriba' : 'degradado',
        codigo: r.status, ms,
      }
    } catch (e: any) {
      return {
        clave: s.clave, nombre: s.nombre, url: s.url,
        estado: 'caido', codigo: null, ms: Date.now() - t0,
        detalle: e?.name === 'AbortError' ? 'sin respuesta en 8 s' : String(e?.message || e).slice(0, 120),
      }
    }
  }

  cacheSalud = { en: Date.now(), datos: await Promise.all(serviciosVigilados().map(medir)) }
  return cacheSalud.datos
}
