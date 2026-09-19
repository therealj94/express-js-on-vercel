// Las reglas del negocio viven en ../app/reglas.js y la semilla en ../app/datos.js.
//
// Son los MISMOS archivos que carga el navegador. El servidor no tiene una
// copia suya de las reglas: si la tuviera, tarde o temprano divergirían, y un
// front que dice «esto se puede» con un back que dice «esto no» es la receta
// para no fiarse de ninguno de los dos. Aquí se cargan tal cual con require()
// (la carpeta app/ se declara CommonJS para eso).

import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
export const CARPETA_APP = join(__dirname, '..', '..', 'app')
export const CARPETA_FRONT = join(__dirname, '..', '..')

export interface Evento {
  id: string; ts: string; actor: string; rol: string; tipo: string; detalle: string; nivel: string; hashPrev: string; hash: string
}

export interface Contexto {
  actor: string
  rol: string
  ahora?: Date
  id?: (pre: string) => string
  hash?: (txt: string) => string
  firmar?: (canon: string) => { firma: string; clavePublica: string }
}

export interface Reglas {
  ACCIONES: Record<string, string>
  CAUSAS: Record<string, { v: string; t: string; pide: string }[]>
  PERMISOS: Record<string, string[]>
  ROLES: string[]
  puede: (rol: string, permiso: string) => boolean
  respaldo: (estado: any, ahora?: Date) => any
  puedeEmitir: (estado: any, monto: number, ahora?: Date) => { ok: boolean; faltas: string[] }
  saludSecurity: (t: any, ahora?: Date) => any
  valorAdmisible: (r: any, ahora?: Date) => number
  reservasAdmisibles: (estado: any, ahora?: Date) => number
  saludUtility: (t: any) => any
  avisos: (estado: any, ahora?: Date) => [string, string, string][]
  buscar: Record<string, (estado: any, id?: string) => any>
  comandos: Record<string, { permiso: string; run: Function }>
  nombresComandos: string[]
  ejecutar: (estado: any, nombre: string, datos: any, ctx: Contexto) => { estado: any; evento: Evento; resultado: any }
  sellarLibro: (estado: any, hashFn?: (s: string) => string) => void
  verificarLibro: (estado: any, hashFn?: (s: string) => string) => { ok: boolean; total?: number; sello?: string; en?: string }
  canonSolicitud: (s: any) => string
  clon: <T>(o: T) => T
  idAzar: (pre: string) => string
  fmt: { num: Function; compacto: Function; usd: Function; pct: Function }
}

export const R: Reglas = require(join(CARPETA_APP, 'reglas.js'))
export const SEMILLA: { version: number; estado: any } = require(join(CARPETA_APP, 'datos.js'))
