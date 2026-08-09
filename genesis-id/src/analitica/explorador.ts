// Consulta libre sobre los eventos crudos.
//
// POR QUE HACE FALTA ADEMAS DE LOS RESUMENES
//
// `consultas.ts` responde preguntas ya decididas —cuántos activos, qué apps,
// qué errores— leyendo los resúmenes por día, y por eso abre instantáneo. Pero
// no sirve para la pregunta que aparece cuando algo va mal: «los pagos que
// fallaron ayer entre las 8 y las 10 de la noche, en la web, desde Honduras,
// por más de 500 dólares». Esa no se puede precalcular: es una combinación que
// nadie previó.
//
// Aquí se consulta el evento crudo, con índice, y se devuelven ADEMAS las
// cuentas por cada dimensión (las «facetas»). Eso es lo que permite que la
// pantalla enseñe «Honduras 412 · Guatemala 88» en el propio filtro, en vez de
// obligar a probar combinaciones a ciegas hasta que una devuelva algo.

import { almacen, huella, type TipoEvento, type Gravedad, type EventoGuardado } from './eventos.js'

export interface FiltroEventos {
  app?: string
  plataforma?: string
  tipo?: TipoEvento
  gravedad?: Gravedad
  pais?: string
  moneda?: string
  version?: string
  /** Busca en el nombre, el mensaje y la ruta. */
  texto?: string
  /** ISO `YYYY-MM-DD`, ambos inclusive. */
  desde?: string
  hasta?: string
  /** Hora local del evento, 0-23, ambas inclusive. Para «ayer de noche». */
  horaDesde?: number
  horaHasta?: number
  /** Sobre el campo `valor` — el importe de una transacción. */
  montoMin?: number
  montoMax?: number
  grupo?: string
  sesion?: string
  limite?: number
  saltar?: number
}

const DIMENSIONES = ['app', 'plataforma', 'tipo', 'gravedad', 'pais', 'moneda', 'version'] as const
export type Dimension = typeof DIMENSIONES[number]

/** Traduce el filtro a una consulta de Mongo. */
function aMongo(f: FiltroEventos): Record<string, unknown> {
  const q: Record<string, any> = {}
  for (const k of ['app', 'plataforma', 'tipo', 'gravedad', 'pais', 'moneda', 'version', 'grupo', 'sesion'] as const) {
    const v = f[k]
    if (v) q[k] = v
  }
  if (f.desde || f.hasta) {
    q.dia = {}
    if (f.desde) q.dia.$gte = f.desde
    if (f.hasta) q.dia.$lte = f.hasta
  }
  if (f.horaDesde != null || f.horaHasta != null) {
    q.hora = {}
    if (f.horaDesde != null) q.hora.$gte = f.horaDesde
    if (f.horaHasta != null) q.hora.$lte = f.horaHasta
  }
  if (f.montoMin != null || f.montoMax != null) {
    q.valor = {}
    if (f.montoMin != null) q.valor.$gte = f.montoMin
    if (f.montoMax != null) q.valor.$lte = f.montoMax
  }
  if (f.texto) {
    const re = { $regex: f.texto.slice(0, 80), $options: 'i' }
    q.$or = [{ nombre: re }, { mensaje: re }, { ruta: re }]
  }
  return q
}

/** El mismo filtro, aplicado en memoria cuando no hay Mongo. */
function pasa(e: EventoGuardado, f: FiltroEventos): boolean {
  if (f.app && e.app !== f.app) return false
  if (f.plataforma && e.plataforma !== f.plataforma) return false
  if (f.tipo && e.tipo !== f.tipo) return false
  if (f.gravedad && e.gravedad !== f.gravedad) return false
  if (f.pais && e.pais !== f.pais) return false
  if (f.moneda && e.moneda !== f.moneda) return false
  if (f.version && e.version !== f.version) return false
  if (f.grupo && e.grupo !== f.grupo) return false
  if (f.sesion && e.sesion !== f.sesion) return false
  if (f.desde && e.dia < f.desde) return false
  if (f.hasta && e.dia > f.hasta) return false
  if (f.horaDesde != null && e.hora < f.horaDesde) return false
  if (f.horaHasta != null && e.hora > f.horaHasta) return false
  if (f.montoMin != null && !(Number(e.valor) >= f.montoMin)) return false
  if (f.montoMax != null && !(Number(e.valor) <= f.montoMax)) return false
  if (f.texto) {
    const t = f.texto.toLowerCase()
    const donde = `${e.nombre} ${e.mensaje ?? ''} ${e.ruta ?? ''}`.toLowerCase()
    if (!donde.includes(t)) return false
  }
  return true
}

/**
 * Cuenta por cada dimensión SIN aplicar el filtro de esa misma dimensión.
 *
 * Es la diferencia entre un filtro que sirve y uno que se cierra solo: si al
 * elegir «Honduras» la lista de países se reduce a Honduras, ya no se puede
 * cambiar de país sin borrar el filtro primero. Cada faceta se calcula con
 * todos los demás filtros puestos y el suyo quitado, así que siempre enseña a
 * dónde más se puede ir.
 */
async function facetas(f: FiltroEventos) {
  const salida: Record<string, Array<{ clave: string; total: number }>> = {}

  for (const dim of DIMENSIONES) {
    const sinEsta = { ...f, [dim]: undefined }
    if (almacen.hayMongo()) {
      const agg = await almacen.cEventos()!.aggregate([
        { $match: aMongo(sinEsta) },
        { $group: { _id: `$${dim}`, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 25 },
      ]).toArray()
      salida[dim] = agg.map((r: any) => ({ clave: String(r._id ?? '??'), total: r.n }))
    } else {
      const cuenta = new Map<string, number>()
      for (const e of almacen.memoria.eventos) {
        if (!pasa(e, sinEsta)) continue
        const k = String((e as any)[dim] ?? '??')
        cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
      }
      salida[dim] = [...cuenta.entries()]
        .map(([clave, total]) => ({ clave, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 25)
    }
  }
  return salida
}

export async function explorar(f: FiltroEventos) {
  const limite = Math.min(200, Math.max(1, f.limite ?? 60))
  const saltar = Math.max(0, f.saltar ?? 0)

  let eventos: EventoGuardado[]
  let total: number
  let suma = 0

  if (almacen.hayMongo()) {
    const q = aMongo(f)
    const c = almacen.cEventos()!
    ;[eventos, total] = await Promise.all([
      c.find(q).sort({ ts: -1 }).skip(saltar).limit(limite).toArray() as Promise<any>,
      c.countDocuments(q),
    ])
    const agg = await c.aggregate([
      { $match: { ...q, valor: { $gt: 0 } } },
      { $group: { _id: null, suma: { $sum: '$valor' } } },
    ]).toArray()
    suma = agg[0]?.suma ?? 0
  } else {
    const todos = almacen.memoria.eventos.filter((e) => pasa(e, f))
      .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    total = todos.length
    suma = todos.reduce((s, e) => s + (Number(e.valor) || 0), 0)
    eventos = todos.slice(saltar, saltar + limite)
  }

  return {
    total,
    // La suma de importes de lo que quedó filtrado: cuando alguien filtra por
    // «transacciones fallidas», lo primero que quiere saber es cuánto dinero
    // hay ahí metido.
    sumaValor: Math.round(suma * 100) / 100,
    mostrados: eventos.length,
    saltar,
    eventos: eventos.map(limpiarEvento),
    facetas: await facetas(f),
  }
}

/**
 * Lo que sale por la API. La pila de un error va recortada y la huella NO
 * viaja: identifica a una persona dentro de una app y no hace falta para
 * pintar una lista.
 */
function limpiarEvento(e: EventoGuardado) {
  return {
    app: e.app,
    tipo: e.tipo,
    nombre: e.nombre,
    ts: e.ts,
    dia: e.dia,
    hora: e.hora,
    pais: e.pais,
    plataforma: e.plataforma,
    version: e.version,
    gravedad: e.gravedad,
    mensaje: e.mensaje,
    ruta: e.ruta,
    duracionMs: e.duracionMs,
    valor: e.valor,
    moneda: e.moneda,
    grupo: e.grupo,
    sesion: e.sesion,
    // Solo si el evento trae a alguien detrás, para poder pedir el detalle.
    tieneUsuario: Boolean(e.huellaUsuario),
  }
}

/**
 * Quién sufrió un error, con nombre y apellido.
 *
 * COMO SE RESUELVE SIN GUARDAR A NADIE
 *
 * La telemetría nunca guarda quién es el usuario: guarda `HMAC(sal, app|id)`,
 * que no se puede revertir. Pero SÍ se puede recorrer al revés: se toman las
 * personas del padrón de esa app —que ahí sí tienen nombre, porque la app las
 * mandó— se les calcula la misma huella, y se cruza.
 *
 * Ninguna propiedad de privacidad se pierde: sigue sin haber un identificador
 * en claro en la colección de eventos, y quien no esté en el padrón sigue sin
 * poder identificarse. Lo que cambia es que un operador AUTORIZADO puede
 * responder «a quién le pasó esto» para llamarlo, que es exactamente por lo
 * que se instrumenta un error.
 *
 * Por eso pide permiso de padrón, no de analítica, y queda en la bitácora.
 */
export async function afectadosPorError(grupo: string, tope = 50) {
  const { entradasDe } = await import('../directorio/padron.js')

  // 1. Las huellas distintas que dispararon ese error, con cuántas veces y cuándo.
  const porHuella = new Map<string, { app: string; veces: number; ultima: Date; pais: string; plataforma: string; version: string }>()

  if (almacen.hayMongo()) {
    const agg = await almacen.cEventos()!.aggregate([
      { $match: { grupo, huellaUsuario: { $ne: null } } },
      {
        $group: {
          _id: { h: '$huellaUsuario', app: '$app' },
          veces: { $sum: 1 }, ultima: { $max: '$ts' },
          pais: { $last: '$pais' }, plataforma: { $last: '$plataforma' }, version: { $last: '$version' },
        },
      },
      { $sort: { veces: -1 } },
      { $limit: tope },
    ]).toArray()
    for (const r of agg as any[]) {
      porHuella.set(r._id.h, {
        app: r._id.app, veces: r.veces, ultima: r.ultima,
        pais: r.pais, plataforma: r.plataforma, version: r.version,
      })
    }
  } else {
    for (const e of almacen.memoria.eventos) {
      if (e.grupo !== grupo || !e.huellaUsuario) continue
      const previo = porHuella.get(e.huellaUsuario)
      if (previo) { previo.veces++; if (e.ts > previo.ultima) previo.ultima = e.ts }
      else {
        porHuella.set(e.huellaUsuario, {
          app: e.app, veces: 1, ultima: e.ts,
          pais: e.pais, plataforma: e.plataforma, version: e.version,
        })
      }
    }
  }
  if (!porHuella.size) return { total: 0, identificados: 0, afectados: [] }

  // 2. Se recalcula la huella de cada persona del padrón de esas apps.
  const apps = new Set([...porHuella.values()].map((v) => v.app))
  const indice = new Map<string, { email: string; nombre?: string; pais?: string; gid?: string | null }>()
  for (const app of apps) {
    for (const p of await entradasDe(app)) {
      if (!p.idExterno) continue
      indice.set(huella(app, p.idExterno), {
        email: p.email, nombre: p.nombre, pais: p.pais, gid: p.gid ?? null,
      })
    }
  }

  const afectados = [...porHuella.entries()].map(([h, v]) => {
    const quien = indice.get(h)
    return {
      app: v.app,
      veces: v.veces,
      ultima: v.ultima,
      pais: v.pais,
      plataforma: v.plataforma,
      version: v.version,
      // Cuando no está en el padrón se dice, en vez de inventar un nombre.
      identificado: Boolean(quien),
      email: quien?.email ?? null,
      nombre: quien?.nombre ?? null,
      gid: quien?.gid ?? null,
    }
  }).sort((a, b) => b.veces - a.veces)

  return {
    total: afectados.length,
    identificados: afectados.filter((a) => a.identificado).length,
    afectados,
  }
}

/**
 * Los últimos que entraron, con su hora exacta.
 *
 * Sale de la colección de usuarios de telemetría —una fila por persona y app,
 * que se pisa en cada evento— y no de recorrer los eventos: preguntar «quién
 * entró hoy» no puede costar leer un millón de registros.
 */
export async function ultimasSesiones(opciones: {
  app?: string; plataforma?: string; pais?: string; limite?: number
} = {}) {
  const limite = Math.min(200, opciones.limite ?? 60)
  const { entradasDe } = await import('../directorio/padron.js')

  type Fila = {
    app: string; huella: string; ultima: Date; primera: Date
    pais: string; plataforma: string; version: string
    ultimaEn?: Record<string, Date>
  }
  let filas: Fila[]

  // Filtrar por plataforma NO puede mirar el campo `plataforma`: ese guarda la
  // del último evento, así que quien entró por la web esta mañana y por el
  // teléfono al mediodía desaparecería del filtro «web». Se mira la marca por
  // plataforma, y se ordena por ESA fecha — que es la que el operador pidió.
  const clave = opciones.plataforma ? `ultimaEn.${opciones.plataforma.replace(/\./g, '_')}` : null

  if (almacen.hayMongo()) {
    const q: Record<string, unknown> = {}
    if (opciones.app) q.app = opciones.app
    if (opciones.pais) q.pais = opciones.pais
    if (clave) q[clave] = { $exists: true }
    filas = await almacen.cUsuarios()!
      .find(q).sort({ [clave ?? 'ultima']: -1 }).limit(limite).toArray() as any
  } else {
    filas = [...almacen.memoria.usuarios.values()]
      .filter((u: any) =>
        (!opciones.app || u.app === opciones.app) &&
        (!opciones.pais || u.pais === opciones.pais) &&
        (!opciones.plataforma || Boolean(u.ultimaEn?.[opciones.plataforma])))
      .sort((a: any, b: any) => {
        const f = (u: any) => new Date(
          opciones.plataforma ? (u.ultimaEn?.[opciones.plataforma] ?? 0) : u.ultima).getTime()
        return f(b) - f(a)
      })
      .slice(0, limite) as any
  }

  const apps = new Set(filas.map((f) => f.app))
  const indice = new Map<string, { email: string; nombre?: string; gid?: string | null }>()
  for (const app of apps) {
    for (const p of await entradasDe(app)) {
      if (!p.idExterno) continue
      indice.set(huella(app, p.idExterno), { email: p.email, nombre: p.nombre, gid: p.gid ?? null })
    }
  }

  return {
    total: filas.length,
    sesiones: filas.map((f) => {
      const quien = indice.get(f.huella)
      return {
        app: f.app,
        plataforma: f.plataforma,
        version: f.version,
        pais: f.pais,
        // Cuando se filtró por plataforma, la fecha que importa es la de ESA
        // plataforma; si no, la del último acceso sea por donde sea.
        ultima: opciones.plataforma ? (f.ultimaEn?.[opciones.plataforma] ?? f.ultima) : f.ultima,
        primera: f.primera,
        // El desglose completo: «móvil hace 5 minutos, web hace tres días».
        ultimaEn: f.ultimaEn ?? {},
        identificado: Boolean(quien),
        email: quien?.email ?? null,
        nombre: quien?.nombre ?? null,
        gid: quien?.gid ?? null,
      }
    }),
  }
}
