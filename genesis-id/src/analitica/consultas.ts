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

/**
 * Cuánto tarda una verificación, y cuánto lleva esperando la cola.
 *
 * ── POR QUE FALTABA, Y POR QUE IMPORTA ──────────────────────────────────────
 *
 * La analítica medía cuántas identidades hay en cada estado, y `duracionMedia`
 * —que es de la telemetría de las apps, o sea lo que tarda una pantalla en
 * cargar, nada que ver—. Cuánto tarda una PERSONA en quedar verificada no se
 * medía en ningún sitio, teniendo `verificadaEn` guardado desde siempre.
 *
 * Es la cifra sobre la que vive una operación de cumplimiento. «Tenemos 40 en
 * revisión» no dice nada por sí solo: cuarenta con dos horas de espera es un
 * equipo trabajando, y cuarenta con nueve días es una persona que ya se fue a
 * otra app y no vuelve.
 *
 * ── LA MEDIANA Y EL PERCENTIL 90, NO EL PROMEDIO ────────────────────────────
 *
 * Un promedio de espera lo destroza un solo caso raro: una identidad olvidada
 * tres semanas sube la media de todo el mes y hace pensar que el equipo va mal
 * cuando va bien. La mediana dice cómo le fue a la mitad de la gente; el p90,
 * qué tan malo es el mal día. Las dos juntas son la verdad; el promedio solo,
 * casi nunca.
 */
export function tiemposDeVerificacion(dias = 30) {
  const ids = store.todo().identidades
  const ahora = Date.now()
  const desde = ahora - dias * 24 * 3600 * 1000

  const horas = (ms: number) => Math.round((ms / 3600000) * 10) / 10

  /* Las DECIDIDAS en la ventana, medidas de que empezó a que se aprobó. Se
     filtra por la fecha de decisión y no por la de creación: si no, una
     identidad que empezó hace dos meses y se aprobó ayer no contaría, que es
     justo la que más tardó. */
  const decididas = ids
    .filter((i) => i.verificadaEn && Date.parse(i.verificadaEn) >= desde)
    .map((i) => Date.parse(i.verificadaEn!) - Date.parse(i.creadaEn))
    .filter((ms) => ms >= 0)
    .sort((a, b) => a - b)

  const percentil = (p: number) =>
    decididas.length ? horas(decididas[Math.min(decididas.length - 1,
      Math.floor(decididas.length * p))]) : null

  /* Y la cola de AHORA, que es otra pregunta: no cuánto tardaron las que ya
     salieron, sino cuánto lleva esperando quien todavía está dentro. Una cola
     puede estar creciendo con los tiempos históricos preciosos. */
  const enCola = ids
    .filter((i) => i.estado === 'en-revision')
    .map((i) => ahora - Date.parse(i.actualizadaEn))
    .sort((a, b) => b - a)

  return {
    dias,
    decididas: decididas.length,
    medianaHoras: percentil(0.5),
    p90Horas: percentil(0.9),
    masRapidaHoras: decididas.length ? horas(decididas[0]) : null,
    masLentaHoras: decididas.length ? horas(decididas[decididas.length - 1]) : null,
    cola: {
      esperando: enCola.length,
      /* La más vieja de la cola es el número que hay que mirar: es el peor
         caso que está ocurriendo AHORA, y el que se convierte en una queja. */
      masViejaHoras: enCola.length ? horas(enCola[0]) : null,
      medianaEsperaHoras: enCola.length ? horas(enCola[Math.floor(enCola.length / 2)]) : null,
      /* Cuántas llevan más de un día. Es el umbral a partir del cual alguien
         que se estaba dando de alta ya se fue a hacer otra cosa. */
      masDeUnDia: enCola.filter((ms) => ms > 24 * 3600000).length,
    },
  }
}

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

  /* ── LA CAIDA DEL ULTIMO PASO NO ERA UNA CAIDA ──────────────────────────
   *
   * «Aprobada» cuenta solo `verificada`, y el paso anterior incluye a todo el
   * que pasó la biometría. Así que la diferencia entre los dos metía en el
   * mismo saco tres cosas que no se parecen en nada:
   *
   *   · quien ESTA ESPERANDO a que el equipo lo mire  (en-revision)
   *   · quien fue RECHAZADO
   *   · quien estaba verificado y se le SUSPENDIO
   *
   * Y eso se lee como «se nos cae la gente al final del embudo» cuando lo que
   * hay es una cola sin atender. Son problemas opuestos: uno se arregla
   * cambiando el producto, el otro poniendo a alguien a revisar. Un embudo que
   * los confunde manda a arreglar lo que no está roto.
   */
  const esperando = cuenta('en-revision')
  const rechazadas = cuenta('rechazada')
  const suspendidas = cuenta('suspendida')

  return {
    pasos: pasos.map((p, i) => ({
      ...p,
      porcentaje: ids.length ? Math.round((p.n / ids.length) * 1000) / 10 : 0,
      /** Cuántos se pierden en ESTE paso respecto del anterior. */
      caida: i === 0 ? 0 : pasos[i - 1].n - p.n,
      /* En el último paso, de esa «caída» hay que descontar a quien no se ha
         ido a ningún sitio: sigue esperando. Va aparte y con su nombre. */
      esperando: i === pasos.length - 1 ? esperando : 0,
      /* Lo que de verdad se perdió en el paso: la caída MENOS los que esperan.
         En los pasos de en medio es igual que `caida`; en el último es la
         diferencia entre «se nos va la gente» y «hay cola». */
      perdidos: i === 0 ? 0
        : Math.max(0, (pasos[i - 1].n - p.n) - (i === pasos.length - 1 ? esperando : 0)),
    })),
    esperandoDecision: esperando,
    rechazadas,
    suspendidas,
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

// ─────────────────────────────────────────────────────────────────────────────
// Silencio de telemetría
//
// El fallo que esto vigila ya ocurrió y no se notó: la clave de ingesta que
// viaja dentro del APK dejó de valer contra el servidor, todas las apps de la
// calle empezaron a chocar contra un 401, y el panel siguió enseñando «no hay
// datos» — que es indistinguible de «no entra nadie». Un panel de uso no puede
// tener ese punto ciego: si la app que TIENE gente lleva días sin decir ni una
// palabra, lo más probable no es que nadie la abra, es que el conducto está
// roto y hay que ir a mirarlo.
//
// Se vigilan solo las apps de las que se ESPERA reporte. Una app cuyo cliente
// todavía no se ha puesto no está callada: está sin encender, y confundir las
// dos cosas convierte el aviso en ruido que se acaba ignorando.
// ─────────────────────────────────────────────────────────────────────────────

const APPS_QUE_REPORTAN = (process.env.GENESIS_TELEMETRIA_ESPERA || 'veta-wallet')
  .split(',').map((s) => s.trim()).filter(Boolean)

const HORAS_DE_SILENCIO = Number(process.env.GENESIS_TELEMETRIA_SILENCIO_H || 48)

export async function silencioDeTelemetria(): Promise<{
  vigiladas: string[]
  calladas: { app: string; ultimoDia: string | null; diasCallada: number }[]
}> {
  const v = ventana(14)
  const calladas = []
  for (const app of APPS_QUE_REPORTAN) {
    const docs = await diasDe(v, app)
    const conEventos = docs.filter((d) => (d.eventos ?? 0) > 0).map((d) => d.dia).sort()
    const ultimoDia = conEventos.length ? conEventos[conEventos.length - 1] : null
    const diasCallada = ultimoDia
      ? Math.floor((Date.now() - new Date(ultimoDia + 'T23:59:59Z').getTime()) / DIA)
      : v.length
    if (diasCallada * 24 >= HORAS_DE_SILENCIO) calladas.push({ app, ultimoDia, diasCallada })
  }
  return { vigiladas: APPS_QUE_REPORTAN, calladas }
}
