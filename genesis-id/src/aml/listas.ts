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
import { coleccionAparte } from '../store.js'

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
/* `fechaDescarga` se puede pasar en nulo a proposito: es el caso real de unas
   listas guardadas en Mongo sin ese campo (ver `cargarDesdeMongo`), y es el
   unico que hace falta poder montar para probar que se cuentan como vencidas. */
export function cargarEnMemoria(
  registros: RegistroSancion[],
  fuente = 'memoria',
  fechaDescarga: string | null = new Date().toISOString().slice(0, 10),
): number {
  indice = indexar(registros, [`${fuente} (${registros.length})`], fechaDescarga)
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
    /* SIN FECHA ES MOTIVO DE ALARMA, NO DE SILENCIO.
       Antes esto era `dias != null && dias > 30`, o sea que unas listas
       cargadas sin fecha de descarga se daban por frescas PARA SIEMPRE. En un
       modulo cuyo principio es fallar cerrado, ese contador fallaba abierto:
       el panel habria dicho «al dia» con listas de dos anios. Si no se sabe
       cuando se bajaron, hay que tratarlas como viejas. */
    vencidas: dias == null || dias > 30,
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



// ─────────────────────────────────────────────────────────────────────────────
// Persistencia en MongoDB
// ─────────────────────────────────────────────────────────────────────────────
//
// POR QUE EN MONGO Y NO EN UN ARCHIVO
//
// La alternativa era un disco montado en Render, pero el plan gratuito no
// tiene discos y el estado del motor ya vive en Mongo. Guardar aqui las listas
// las hace sobrevivir a los despliegues sin costo adicional, y de paso permite
// cargarlas desde el panel sin tocar el servidor.
//
// Van en su PROPIA coleccion, no en el documento de estado: son unas 17 000
// fichas y un documento de MongoDB no pasa de 16 MB. Ademas, meterlas ahi haria
// que cada guardado de cualquier cosa reescribiera esos megabytes.

const COLECCION = 'sanciones'
const META = 'sanciones_meta'

/**
 * Reemplaza las listas guardadas por las nuevas.
 *
 * Se borra y se vuelve a insertar en vez de ir actualizando ficha por ficha:
 * una lista de sanciones es una foto de un momento, y mezclar la de hoy con la
 * del mes pasado dejaria dentro a gente que ya salio. Eso es peor que no
 * tenerla, porque bloquea a personas que ya no estan sancionadas.
 */
export async function guardarEnMongo(
  registros: RegistroSancion[],
  fuente: string,
  fechaDescarga: string,
): Promise<number> {
  const col = coleccionAparte(COLECCION)
  const meta = coleccionAparte(META)
  if (!col || !meta) throw new Error('No hay MongoDB configurado: defina GENESIS_MONGO_URL')

  await col.deleteMany({})
  // Por lotes: un insertMany de 17 000 documentos de golpe puede pasarse del
  // limite de tamaño de mensaje del servidor.
  const LOTE = 2000
  for (let i = 0; i < registros.length; i += LOTE) {
    await col.insertMany(registros.slice(i, i + LOTE), { ordered: false })
  }

  await meta.updateOne(
    { _id: 'meta' },
    { $set: { fuente, fechaDescarga, registros: registros.length, guardadoEn: new Date().toISOString() } },
    { upsert: true },
  )
  return registros.length
}

/** Trae las listas de Mongo y las indexa en memoria. */
export async function cargarDesdeMongo(): Promise<number> {
  const col = coleccionAparte(COLECCION)
  const meta = coleccionAparte(META)
  if (!col || !meta) return 0

  const registros: RegistroSancion[] = await col.find({}, { projection: { _id: 0 } }).toArray()
  if (!registros.length) {
    indice = vacio()
    return 0
  }
  const m = await meta.findOne({ _id: 'meta' })
  indice = indexar(registros, [m?.fuente || `mongodb (${registros.length})`], m?.fechaDescarga ?? null)
  return registros.length
}

// ─────────────────────────────────────────────────────────────────────────────
// Descarga directa desde la OFAC
// ─────────────────────────────────────────────────────────────────────────────

const URL_SDN = process.env.GENESIS_OFAC_SDN || 'https://www.treasury.gov/ofac/downloads/sdn.csv'
const URL_ALT = process.env.GENESIS_OFAC_ALT || 'https://www.treasury.gov/ofac/downloads/alt.csv'

async function bajar(url: string): Promise<string> {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 120000)
  try {
    const r = await fetch(url, { signal: control.signal })
    if (!r.ok) throw new Error(`${url} respondio ${r.status}`)
    return await r.text()
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Baja la lista de la OFAC, la guarda en Mongo y la deja indexada.
 *
 * Es la via normal para poner el tamizado en marcha: no hace falta subir
 * archivos ni montar discos, solo pulsar el boton del panel.
 */
export async function importarDeOfac(): Promise<{ registros: number; conAlias: number; fuente: string }> {
  const sdn = await bajar(URL_SDN)
  const registros = leerSdnCsv(sdn)
  if (!registros.length) {
    throw new Error('La descarga de la OFAC no trajo ninguna ficha: puede que hayan cambiado el formato o la direccion')
  }

  // Los alias van en otro archivo. Si ese falla no se aborta todo: una lista
  // sin alias sigue sirviendo, solo encuentra algo menos.
  let conAlias = 0
  try {
    aplicarAlias(await bajar(URL_ALT), registros)
    conAlias = registros.filter((r) => r.alias.length > 0).length
  } catch (e) {
    console.warn('[listas] no se pudieron traer los alias de la OFAC:', (e as Error)?.message)
  }

  const fecha = new Date().toISOString().slice(0, 10)
  const fuente = `OFAC-SDN (${registros.length})`
  await guardarEnMongo(registros, fuente, fecha)
  await cargarDesdeMongo()
  return { registros: registros.length, conAlias, fuente }
}

/**
 * Importa una lista propia pegada como texto: JSON con el formato de
 * `RegistroSancion`, o un CSV con el formato de la OFAC.
 *
 * Se conserva lo que ya hubiera de otras fuentes; solo se reemplaza lo que
 * venga de esta misma.
 */
export async function importarTexto(
  texto: string,
  nombreFuente: string,
): Promise<{ registros: number }> {
  const t = texto.trim()
  let nuevos: RegistroSancion[]

  if (t.startsWith('[') || t.startsWith('{')) {
    const crudo = JSON.parse(t)
    const lista: RegistroSancion[] = Array.isArray(crudo) ? crudo : crudo.registros || []
    nuevos = lista.filter((r) => r && r.nombre).map((r, i) => ({
      ...r,
      id: r.id || `${nombreFuente}-${i}`,
      alias: r.alias || [],
      tipo: r.tipo || 'persona',
      lista: r.lista || nombreFuente,
      programa: r.programa || '',
    }))
  } else {
    nuevos = leerSdnCsv(t).map((r) => ({ ...r, lista: nombreFuente }))
  }

  if (!nuevos.length) throw new Error('No se reconocio ninguna ficha en el texto')

  const col = coleccionAparte(COLECCION)
  if (!col) throw new Error('No hay MongoDB configurado')

  await col.deleteMany({ lista: nombreFuente })
  const LOTE = 2000
  for (let i = 0; i < nuevos.length; i += LOTE) {
    await col.insertMany(nuevos.slice(i, i + LOTE), { ordered: false })
  }
  const total = await col.countDocuments({})
  const meta = coleccionAparte(META)!
  await meta.updateOne(
    { _id: 'meta' },
    { $set: { fuente: `varias (${total})`, fechaDescarga: new Date().toISOString().slice(0, 10), registros: total } },
    { upsert: true },
  )
  await cargarDesdeMongo()
  return { registros: nuevos.length }
}

/**
 * Carga al arrancar. Prefiere Mongo; si no hay, cae a la carpeta.
 * Si no hay ninguna de las dos, queda vacio a proposito.
 */
export async function iniciarListas(): Promise<number> {
  const deMongo = await cargarDesdeMongo().catch(() => 0)
  if (deMongo > 0) return deMongo
  return cargarListas()
}

export { parecidoNombres }
