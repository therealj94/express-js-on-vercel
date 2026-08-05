// Listas de sanciones y personas expuestas políticamente (PEP).
//
// UNA DECISION DELIBERADA: DE FABRICA VIENEN VACIAS
//
// Es tentador incrustar unos cuantos nombres para que el sistema "funcione" en
// las demostraciones. Sería un error grave. Una lista de mentira devuelve "sin
// coincidencias" ante cualquier consulta, y ese resultado es indistinguible del
// de una lista real bien consultada. El equipo de cumplimiento vería verde y
// creería estar tamizando cuando no lo está.
//
// Por eso: si no hay listas cargadas, el motor NO dice "sin coincidencias".
// Dice "sin tamizar", y el riesgo pasa a bloqueante — ninguna identidad puede
// aprobarse sin haber sido contrastada de verdad.
//
// COMO SE CARGAN
//
// Se apunta GENESIS_LISTAS_DIR a una carpeta y se dejan ahí los archivos:
//
//   - `SDN.CSV` y `ALT.CSV`  → formato oficial de la OFAC
//     https://sanctionslist.ofac.treas.gov/Home/SdnList
//   - `*.json`               → formato propio (ver `RegistroSancion`), útil
//     para listas locales, PEP nacionales o la lista consolidada de la UE ya
//     convertida
//
// El archivo `meta.json` de esa carpeta indica la fecha de descarga; si pasa de
// 30 días, el panel avisa de que están viejas.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { fichas, parecidoNombres, normalizar } from '../lib/texto.js'

export type TipoSancionado = 'persona' | 'entidad' | 'buque' | 'aeronave'

export interface RegistroSancion {
  id: string
  nombre: string
  alias: string[]
  tipo: TipoSancionado
  /** Programa de sanciones (SDGT, UKRAINE-EO13662, …). */
  programa: string
  /** De qué lista salió: OFAC-SDN, UE, ONU, PEP-local… */
  lista: string
  fechaNacimiento?: string | null
  nacionalidades?: string[]
  /** Direcciones de criptomonedas sancionadas, si la lista las publica. */
  direcciones?: string[]
  notas?: string
}

interface Indice {
  registros: RegistroSancion[]
  /** ficha del nombre → índices de los registros que la contienen. */
  porFicha: Map<string, number[]>
  /** dirección cripto en minúsculas → índice del registro. */
  porDireccion: Map<string, number>
  fuentes: string[]
  cargadaEn: string | null
  fechaDescarga: string | null
}

let indice: Indice = vacio()

function vacio(): Indice {
  return {
    registros: [],
    porFicha: new Map(),
    porDireccion: new Map(),
    fuentes: [],
    cargadaEn: null,
    fechaDescarga: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Indexado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye un índice invertido por palabra del nombre.
 *
 * Sin esto habría que comparar cada consulta con las ~17 000 entradas de la
 * OFAC usando Jaro-Winkler, que es caro. Con el índice solo se puntúan los
 * registros que comparten al menos una palabra —o el principio de una— con lo
 * buscado, que son unas decenas. La calidad no baja: dos nombres que no
 * comparten ni una palabra parecida no iban a superar el umbral de todos modos.
 */
function indexar(registros: RegistroSancion[], fuentes: string[], fechaDescarga: string | null): Indice {
  const porFicha = new Map<string, number[]>()
  const porDireccion = new Map<string, number>()

  registros.forEach((r, i) => {
    const nombres = [r.nombre, ...(r.alias || [])]
    for (const n of nombres) {
      for (const f of fichas(n)) {
        // Se indexa por la palabra entera y por su prefijo de 4, para que
        // "MARTINES" caiga en el mismo cajón que "MARTINEZ".
        for (const clave of [f, f.slice(0, 4)]) {
          const lista = porFicha.get(clave)
          if (lista) {
            if (lista[lista.length - 1] !== i) lista.push(i)
          } else {
            porFicha.set(clave, [i])
          }
        }
      }
    }
    for (const d of r.direcciones || []) {
      porDireccion.set(d.toLowerCase(), i)
    }
  })

  return {
    registros,
    porFicha,
    porDireccion,
    fuentes,
    cargadaEn: new Date().toISOString(),
    fechaDescarga,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura de archivos
// ─────────────────────────────────────────────────────────────────────────────

/** Divide una línea de CSV respetando las comillas dobles. */
function celdas(linea: string): string[] {
  const salida: string[] = []
  let actual = ''
  let dentro = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      if (dentro && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else {
        dentro = !dentro
      }
    } else if (c === ',' && !dentro) {
      salida.push(actual)
      actual = ''
    } else {
      actual += c
    }
  }
  salida.push(actual)
  // La OFAC escribe los campos vacíos como "-0-".
  return salida.map((s) => {
    const t = s.trim()
    return t === '-0-' ? '' : t
  })
}

const TIPOS_OFAC: Record<string, TipoSancionado> = {
  individual: 'persona',
  entity: 'entidad',
  vessel: 'buque',
  aircraft: 'aeronave',
}

/**
 * Lee `SDN.CSV` de la OFAC.
 *
 * Columnas: número, nombre, tipo, programa, cargo, indicativo, tipo de buque,
 * tonelaje, GRT, bandera, propietario, observaciones.
 *
 * De las observaciones se extraen la fecha de nacimiento y las direcciones de
 * criptomonedas, que la OFAC publica ahí en texto libre con la forma
 * `Digital Currency Address - XBT 1A2b3C…`.
 */
function leerSdnCsv(texto: string): RegistroSancion[] {
  const salida: RegistroSancion[] = []
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue
    const c = celdas(linea)
    if (c.length < 4) continue
    const num = c[0]
    if (!/^\d+$/.test(num)) continue // cabecera o basura

    const observaciones = c[11] || ''
    const direcciones = [...observaciones.matchAll(/Digital Currency Address\s*-\s*\w+\s+([A-Za-z0-9]+)/g)]
      .map((m) => m[1])
    const dob = observaciones.match(/DOB\s+(\d{1,2}\s+\w{3}\s+\d{4}|\d{4})/i)

    salida.push({
      id: `OFAC-${num}`,
      nombre: c[1],
      alias: [],
      tipo: TIPOS_OFAC[(c[2] || '').toLowerCase()] ?? 'entidad',
      programa: c[3] || '',
      lista: 'OFAC-SDN',
      fechaNacimiento: dob ? normalizarFecha(dob[1]) : null,
      direcciones,
      notas: c[4] || undefined,
    })
  }
  return salida
}

/** `ALT.CSV`: los alias, que se enganchan a su registro por el número. */
function aplicarAlias(texto: string, registros: RegistroSancion[]): void {
  const porNumero = new Map(registros.map((r) => [r.id.replace('OFAC-', ''), r]))
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue
    const c = celdas(linea)
    if (c.length < 4 || !/^\d+$/.test(c[0])) continue
    const r = porNumero.get(c[0])
    if (r && c[3]) r.alias.push(c[3])
  }
}

const MESES: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

function normalizarFecha(cruda: string): string | null {
  const m = cruda.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/)
  if (m) {
    const mes = MESES[m[2].toUpperCase()]
    if (mes) return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`
  }
  if (/^\d{4}$/.test(cruda)) return `${cruda}-00-00` // solo el año
  return null
}

/**
 * Carga las listas desde la carpeta configurada.
 * Devuelve cuántos registros quedaron cargados.
 */
export function cargarListas(dir = process.env.GENESIS_LISTAS_DIR): number {
  if (!dir || !existsSync(dir)) {
    indice = vacio()
    return 0
  }

  const registros: RegistroSancion[] = []
  const fuentes: string[] = []
  let fechaDescarga: string | null = null

  const archivos = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile())

  // Primero la OFAC, porque los alias vienen en un archivo aparte.
  const sdn = archivos.find((f) => /^SDN\.CSV$/i.test(f))
  if (sdn) {
    const deOfac = leerSdnCsv(readFileSync(join(dir, sdn), 'utf8'))
    const alt = archivos.find((f) => /^ALT\.CSV$/i.test(f))
    if (alt) aplicarAlias(readFileSync(join(dir, alt), 'utf8'), deOfac)
    registros.push(...deOfac)
    fuentes.push(`OFAC-SDN (${deOfac.length})`)
  }

  for (const f of archivos) {
    if (!/\.json$/i.test(f) || /^meta\.json$/i.test(f)) continue
    try {
      const crudo = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      const lista: RegistroSancion[] = Array.isArray(crudo) ? crudo : crudo.registros || []
      const normalizados = lista
        .filter((r) => r && r.nombre)
        .map((r, i) => ({
          ...r,
          id: r.id || `${f}-${i}`,
          alias: r.alias || [],
          tipo: r.tipo || 'persona',
          lista: r.lista || f.replace(/\.json$/i, ''),
          programa: r.programa || '',
        }))
      registros.push(...normalizados)
      fuentes.push(`${f} (${normalizados.length})`)
    } catch {
      fuentes.push(`${f} (ILEGIBLE)`)
    }
  }

  const meta = join(dir, 'meta.json')
  if (existsSync(meta)) {
    try {
      fechaDescarga = JSON.parse(readFileSync(meta, 'utf8')).fechaDescarga ?? null
    } catch {
      /* meta opcional */
    }
  }

  indice = indexar(registros, fuentes, fechaDescarga)
  return registros.length
}

/** Carga en caliente una lista ya parseada. Lo usan las pruebas y el importador. */
export function cargarEnMemoria(registros: RegistroSancion[], fuente = 'memoria'): number {
  indice = indexar(registros, [`${fuente} (${registros.length})`], new Date().toISOString().slice(0, 10))
  return registros.length
}

// ─────────────────────────────────────────────────────────────────────────────
// Consulta
// ─────────────────────────────────────────────────────────────────────────────

export const hayListas = () => indice.registros.length > 0

export function estadoListas() {
  const dias = indice.fechaDescarga
    ? Math.floor((Date.now() - new Date(indice.fechaDescarga).getTime()) / 86400000)
    : null
  return {
    cargadas: hayListas(),
    registros: indice.registros.length,
    fuentes: indice.fuentes,
    cargadaEn: indice.cargadaEn,
    fechaDescarga: indice.fechaDescarga,
    diasDesdeDescarga: dias,
    vencidas: dias != null && dias > 30,
  }
}

/** Registros que podrían parecerse al nombre buscado, según el índice. */
export function candidatos(nombre: string): RegistroSancion[] {
  const vistos = new Set<number>()
  for (const f of fichas(nombre)) {
    for (const clave of [f, f.slice(0, 4)]) {
      for (const i of indice.porFicha.get(clave) || []) vistos.add(i)
    }
  }
  return [...vistos].map((i) => indice.registros[i])
}

/** Búsqueda exacta por dirección de criptomoneda. */
export function porDireccionCripto(direccion: string): RegistroSancion | null {
  const i = indice.porDireccion.get(String(direccion || '').toLowerCase())
  return i == null ? null : indice.registros[i]
}

export const todosLosRegistros = () => indice.registros

/** Búsqueda literal, para el buscador del panel de cumplimiento. */
export function buscar(texto: string, limite = 50): RegistroSancion[] {
  const t = normalizar(texto)
  if (!t) return []
  return indice.registros
    .filter((r) => normalizar(r.nombre).includes(t) || (r.alias || []).some((a) => normalizar(a).includes(t)))
    .slice(0, limite)
}

/** Se intenta cargar al arrancar; si no hay carpeta, queda vacío a propósito. */
cargarListas()

export { parecidoNombres }
