// Cuándo se le vio de verdad a cada persona.
//
// EL PROBLEMA QUE RESUELVE
//
// Genesis ID sabía dos veces quién había entrado, y las dos por separado:
//
//   · El PADRÓN trae `ultimoAcceso` dentro de la sincronización que cada app
//     manda cada seis horas. Llega tarde por diseño, y solo existe si el
//     backend de esa app se molesta en escribir ese campo al iniciar sesión.
//     Si no lo escribe —y Veta Wallet no lo hacía— el directorio enseña
//     «nunca entró» para gente que entra todos los días.
//
//   · La TELEMETRÍA sabe la verdad y la sabe al minuto: cada evento trae
//     cuándo, desde qué plataforma y desde qué país. Ya se guardaba en
//     `ultimaEn`, una marca por plataforma.
//
// El directorio nunca miraba la segunda. Este módulo las junta.
//
// POR QUE HACE FALTA RECALCULAR LA HUELLA
//
// La telemetría es anónima a propósito: guarda `huella(app, usuario)`, no el
// correo. Esa huella es un HMAC determinista, así que para saber a quién
// corresponde se le calcula la misma huella a cada persona del padrón y se
// cruzan. No se guarda nada nuevo, no se desanonimiza a nadie que no esté ya
// en el padrón, y quien no esté sigue sin poder identificarse.
//
// Es exactamente el mismo camino que usa `afectadosPorError`, y por la misma
// razón: es la única forma de responder «¿quién?» sin romper la propiedad de
// que la telemetría, por sí sola, no identifica a nadie.

import { almacen, huella } from '../analitica/eventos.js'

export interface Presencia {
  /** Lo más reciente que se le vio, mirando todas las plataformas. */
  ultima: string
  /** La última vez en cada plataforma: `{ android: iso, web: iso }`. */
  plataformas: Record<string, string>
  /** Cuántos eventos ha mandado en total. */
  eventos: number
  /** El país de la última señal — el de verdad, no el que declaró al alta. */
  pais?: string
}

const iso = (v: any): string | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * La presencia de todo el padrón de unas apps, indexada por `app|idExterno`.
 *
 * Se devuelve un mapa y no se consulta persona a persona a propósito: el
 * directorio pinta cien filas de una vez, y cien consultas sueltas a Mongo
 * por pantalla es lo que convierte una lista en una espera.
 *
 * @param entradas el padrón ya leído, para no volver a pedirlo.
 */
export async function presenciaDe(
  entradas: Array<{ app: string; idExterno: string }>,
): Promise<Map<string, Presencia>> {
  const salida = new Map<string, Presencia>()
  if (!entradas.length) return salida

  // 1. Huella → clave del padrón. Solo de las apps que aparecen aquí.
  const porHuella = new Map<string, string>()
  const apps = new Set<string>()
  for (const e of entradas) {
    if (!e.idExterno) continue
    apps.add(e.app)
    porHuella.set(`${e.app}|${huella(e.app, e.idExterno)}`, `${e.app}|${e.idExterno}`)
  }
  if (!porHuella.size) return salida

  // 2. Los registros de telemetría de esas apps.
  const filas: any[] = almacen.hayMongo()
    ? await almacen.cUsuarios()!.find(
        { app: { $in: [...apps] } },
        { projection: { app: 1, huella: 1, ultima: 1, ultimaEn: 1, eventos: 1, pais: 1 } },
      ).toArray()
    : [...almacen.memoria.usuarios.values()].filter((u: any) => apps.has(u.app))

  // 3. El cruce.
  for (const u of filas) {
    const clave = porHuella.get(`${u.app}|${u.huella}`)
    // Sin correspondencia es alguien que usa la app pero no está en el padrón
    // que esa app manda. Se ignora aquí — sale en la analítica como anónimo,
    // que es donde tiene sentido mirarlo.
    if (!clave) continue

    const plataformas: Record<string, string> = {}
    for (const [p, ts] of Object.entries(u.ultimaEn || {})) {
      const t = iso(ts)
      if (t) plataformas[p] = t
    }
    const ultima = iso(u.ultima)
    if (!ultima) continue

    salida.set(clave, {
      ultima,
      plataformas,
      eventos: Number(u.eventos) || 0,
      pais: u.pais || undefined,
    })
  }
  return salida
}

/**
 * La señal más reciente entre las dos fuentes, y de cuál vino.
 *
 * Gana la más nueva, siempre. El padrón puede ir seis horas por detrás y la
 * telemetría puede no haberse encendido todavía en esa app: quedarse con una
 * sola de las dos es enseñar «nunca entró» a alguien que acaba de entrar.
 */
export function ultimaSenal(
  ultimoAcceso: string | undefined,
  p: Presencia | undefined,
): { en: string | null; fuente: 'telemetria' | 'padron' | null } {
  const a = ultimoAcceso ? Date.parse(ultimoAcceso) : NaN
  const b = p?.ultima ? Date.parse(p.ultima) : NaN
  const hayA = Number.isFinite(a)
  const hayB = Number.isFinite(b)

  if (!hayA && !hayB) return { en: null, fuente: null }
  if (hayB && (!hayA || b >= a)) return { en: p!.ultima, fuente: 'telemetria' }
  return { en: ultimoAcceso!, fuente: 'padron' }
}

/** Los tramos con los que se mira «quién anda por aquí». */
export const TRAMOS = [
  { clave: 'ahora', nombre: 'Última hora', horas: 1 },
  { clave: 'hoy', nombre: 'Hoy', horas: 24 },
  { clave: 'semana', nombre: 'Esta semana', horas: 24 * 7 },
  { clave: 'mes', nombre: 'Este mes', horas: 24 * 30 },
] as const

/**
 * En qué tramo cae una fecha: `ahora`, `hoy`, `semana`, `mes`, `dormido` o
 * `nunca`.
 *
 * Los tramos son acumulativos —quien entró hace diez minutos también entró
 * hoy— pero cada persona se cuenta en el más estrecho que le toque, para que
 * los recuentos sumen el total y no lo tripliquen.
 */
export function tramoDe(en: string | null, ahora = Date.now()): string {
  if (!en) return 'nunca'
  const ms = ahora - Date.parse(en)
  if (!Number.isFinite(ms)) return 'nunca'
  for (const t of TRAMOS) if (ms < t.horas * 3600000) return t.clave
  return 'dormido'
}
