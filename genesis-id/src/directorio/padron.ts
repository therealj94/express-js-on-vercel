// ─────────────────────────────────────────────────────────────────────────────
// Directorio de usuarios del ecosistema.
//
// Una sola lista con toda la gente que usa Veta Wallet y MyTokenPay: correo,
// billetera, última conexión, qué tiene y si está verificada en Genesis ID.
// Es la vista que hace falta para dar soporte, revisar una cuenta o entender
// quién es quién sin entrar a tres bases distintas.
//
// ESTO NO ES LA ANALITICA, Y NO DEBE MEZCLARSE CON ELLA
//
// El panel de analítica es anónimo a propósito: cuenta gente sin saber quién
// es, y por eso lo puede abrir cualquiera del equipo. Este directorio es lo
// contrario — son datos personales con nombre y apellido. Por eso vive aparte,
// exige su propio permiso, y CADA consulta queda escrita en la bitácora con el
// nombre de quien la hizo. Si mañana hay que explicar quién miró los datos de
// quién, la respuesta tiene que existir.
//
// LA LISTA BLANCA DE CAMPOS ES LO MAS IMPORTANTE DE ESTE ARCHIVO
//
// La tabla de usuarios de Veta Wallet tiene, en las mismas filas, el correo y
// la LLAVE PRIVADA cifrada, la frase de respaldo y el hash de la contraseña.
// Si esta sincronización copiara «todo lo que venga», una segunda copia de las
// llaves de los clientes acabaría en otra base de datos, con otra superficie de
// ataque, sin que nadie lo hubiera decidido.
//
// Por eso los campos se aceptan por lista blanca explícita y no por descarte:
// un campo nuevo en el origen NO llega aquí hasta que alguien lo agregue a
// mano en `CAMPOS`. Con una lista negra, el día que alguien agregue
// `seedRespaldo` al modelo, se copiaría solo.
// ─────────────────────────────────────────────────────────────────────────────

import { coleccionAparte, store } from '../store.js'
import { saldosDe, monedas } from './monedas.js'

/** Lo único que se guarda. Todo lo demás que llegue se descarta en silencio. */
const CAMPOS = [
  'idExterno', 'email', 'nombre', 'usuario', 'telefono', 'pais', 'ciudad',
  'direccionWallet', 'estado', 'kyc', 'verificado', 'rol',
  'creadoEn', 'ultimoAcceso', 'saldos', 'extra',
] as const

/**
 * Lo que jamás se acepta, ni aunque alguien lo meta en `extra`.
 *
 * La lista blanca ya lo impediría; esto es el segundo cerrojo, por si un día
 * alguien agrega un campo a `CAMPOS` sin pensarlo dos veces.
 */
const PROHIBIDO = /contrasena|password|privatekey|llaveprivada|seed|semilla|token|secreto|pin|cvv|hash/i

export interface EntradaDirectorio {
  _id: string            // `app|idExterno`
  app: string
  idExterno: string
  email: string
  nombre?: string
  usuario?: string
  telefono?: string
  pais?: string
  ciudad?: string
  direccionWallet?: string
  estado?: string
  kyc?: string
  verificado?: boolean
  rol?: string
  creadoEn?: string
  ultimoAcceso?: string
  saldos?: Record<string, number>
  extra?: Record<string, unknown>
  /** Se rellena aquí, no lo manda la app: el GID de esa persona si lo tiene. */
  gid?: string | null
  estadoGenesis?: string | null
  sincronizadoEn: Date
}

const memoria = new Map<string, EntradaDirectorio>()
const col = () => coleccionAparte('directorio')

export async function prepararDirectorio(): Promise<void> {
  const c = col()
  if (!c) return
  await c.createIndex({ app: 1, email: 1 })
  await c.createIndex({ email: 1 })
  await c.createIndex({ direccionWallet: 1 })
  await c.createIndex({ ultimoAcceso: -1 })
}

const texto = (v: unknown, max = 200): string | undefined => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : undefined
}

function limpiar(app: string, bruto: any): EntradaDirectorio | null {
  const idExterno = texto(bruto?.idExterno, 80)
  const email = texto(bruto?.email, 160)?.toLowerCase()
  if (!idExterno || !email) return null

  const e: any = { app, idExterno, email, _id: `${app}|${idExterno}`, sincronizadoEn: new Date() }

  for (const campo of CAMPOS) {
    if (campo === 'idExterno' || campo === 'email') continue
    const v = bruto?.[campo]
    if (v === undefined || v === null) continue

    if (campo === 'saldos' && typeof v === 'object') {
      // Solo números, y con la moneda en mayúsculas: un saldo que llega como
      // texto ordenaría mal la tabla y sumaría mal los totales.
      e.saldos = Object.fromEntries(Object.entries(v).slice(0, 20)
        .filter(([, n]) => Number.isFinite(Number(n)))
        .map(([k, n]) => [String(k).toUpperCase().slice(0, 12), Number(n)]))
    } else if (campo === 'extra' && typeof v === 'object') {
      e.extra = Object.fromEntries(Object.entries(v).slice(0, 15)
        .filter(([k]) => !PROHIBIDO.test(k))
        .map(([k, x]) => [String(k).slice(0, 40),
          typeof x === 'object' ? texto(JSON.stringify(x), 120) : (typeof x === 'boolean' || typeof x === 'number' ? x : texto(x, 120))]))
    } else if (campo === 'verificado') {
      e.verificado = Boolean(v)
    } else if (campo === 'direccionWallet') {
      const d = texto(v, 80)
      // Una dirección o no está, pero no una a medias: un `0x` suelto en la
      // columna hace creer que la persona tiene billetera cuando no la tiene.
      e.direccionWallet = d && /^0x[0-9a-fA-F]{40}$/.test(d) ? d.toLowerCase() : undefined
    } else {
      e[campo] = texto(v)
    }
  }
  return e as EntradaDirectorio
}

export interface ResultadoSync { recibidos: number; guardados: number; descartados: number }

/**
 * Recibe un lote del directorio de una app.
 *
 * Se cruza con el padrón de Genesis ID por correo: si esa persona ya tiene una
 * identidad verificada, su GID aparece en la ficha. Ese cruce es la razón de
 * que el directorio viva aquí y no en cada app por separado.
 */
export async function sincronizar(app: string, lote: unknown[]): Promise<ResultadoSync> {
  const entradas = (Array.isArray(lote) ? lote : []).slice(0, 1000)
  const limpias: EntradaDirectorio[] = []
  for (const bruto of entradas) {
    const e = limpiar(app, bruto)
    if (e) limpias.push(e)
  }

  // El cruce con las identidades de Genesis ID, por correo.
  const identidades = new Map(store.todo().identidades.map((i) => [i.email?.toLowerCase(), i]))
  for (const e of limpias) {
    const id = identidades.get(e.email)
    e.gid = id?.gid ?? null
    e.estadoGenesis = id?.estado ?? null
  }

  const c = col()
  if (c && limpias.length) {
    await c.bulkWrite(limpias.map((e) => ({
      updateOne: { filter: { _id: e._id }, update: { $set: e }, upsert: true },
    })), { ordered: false })
  } else {
    for (const e of limpias) memoria.set(e._id, e)
  }

  return { recibidos: entradas.length, guardados: limpias.length, descartados: entradas.length - limpias.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Consulta
// ─────────────────────────────────────────────────────────────────────────────

export interface FiltroDirectorio {
  texto?: string
  app?: string
  pais?: string
  kyc?: string
  conWallet?: boolean
  conGid?: boolean
  conSaldo?: boolean
  /** Solo quien tenga esta moneda concreta. */
  moneda?: string
  /** Sin actividad desde hace N días. Para encontrar cuentas dormidas. */
  inactivosDias?: number
  orden?: 'ultimoAcceso' | 'creadoEn' | 'saldo' | 'email'
  limite?: number
  desde?: number
}

function pasaFiltro(e: EntradaDirectorio, f: FiltroDirectorio): boolean {
  const t = (f.texto || '').toLowerCase()
  if (t && !(e.email.includes(t) || (e.nombre || '').toLowerCase().includes(t) ||
      (e.direccionWallet || '').includes(t) || (e.gid || '').toLowerCase().includes(t) ||
      (e.telefono || '').includes(t))) return false
  if (f.app && e.app !== f.app) return false
  if (f.pais && (e.pais || '').toUpperCase() !== f.pais.toUpperCase()) return false
  if (f.kyc && (e.kyc || '') !== f.kyc) return false
  if (f.conWallet !== undefined && Boolean(e.direccionWallet) !== f.conWallet) return false
  if (f.conGid !== undefined && Boolean(e.gid) !== f.conGid) return false
  if (f.conSaldo !== undefined) {
    const tiene = Object.values(e.saldos || {}).some((n) => n > 0)
    if (tiene !== f.conSaldo) return false
  }
  if (f.moneda && !((e.saldos || {})[f.moneda.toUpperCase()] > 0)) return false
  if (f.inactivosDias) {
    const corte = Date.now() - f.inactivosDias * 86400000
    const ult = e.ultimoAcceso ? Date.parse(e.ultimoAcceso) : 0
    if (ult >= corte) return false
  }
  return true
}

const saldoTotal = (e: EntradaDirectorio) =>
  Object.values(e.saldos || {}).reduce((s, n) => s + (Number(n) || 0), 0)

export async function consultar(f: FiltroDirectorio = {}) {
  const c = col()
  const todas: EntradaDirectorio[] = c ? await c.find({}).toArray() : [...memoria.values()]
  const filtradas = todas.filter((e) => pasaFiltro(e, f))

  const orden = f.orden || 'ultimoAcceso'
  filtradas.sort((a, b) => {
    if (orden === 'saldo') {
      if (f.moneda) {
        const m = f.moneda.toUpperCase()
        return ((b.saldos || {})[m] || 0) - ((a.saldos || {})[m] || 0)
      }
      return saldoTotal(b) - saldoTotal(a)
    }
    if (orden === 'email') return a.email.localeCompare(b.email)
    const ka = (orden === 'creadoEn' ? a.creadoEn : a.ultimoAcceso) || ''
    const kb = (orden === 'creadoEn' ? b.creadoEn : b.ultimoAcceso) || ''
    return kb.localeCompare(ka)
  })

  const desde = Math.max(0, f.desde || 0)
  const limite = Math.min(500, f.limite || 100)
  return { total: filtradas.length, usuarios: filtradas.slice(desde, desde + limite) }
}

/** Los números de arriba de la pantalla, sobre TODO el directorio. */
export async function resumenDirectorio() {
  const c = col()
  const todas: EntradaDirectorio[] = c ? await c.find({}).toArray() : [...memoria.values()]
  const hace30 = Date.now() - 30 * 86400000
  const hace90 = Date.now() - 90 * 86400000

  const porApp: Record<string, number> = {}
  const porPais: Record<string, number> = {}
  const porKyc: Record<string, number> = {}
  const saldos: Record<string, number> = {}
  /** Cuánta gente tiene cada moneda. Sin esto, un total grande puede ser de una sola persona. */
  const tenedores: Record<string, number> = {}
  let conWallet = 0, conGid = 0, activos30 = 0, dormidos90 = 0, conSaldo = 0

  for (const e of todas) {
    porApp[e.app] = (porApp[e.app] ?? 0) + 1
    if (e.pais) porPais[e.pais.toUpperCase()] = (porPais[e.pais.toUpperCase()] ?? 0) + 1
    porKyc[e.kyc || 'sin dato'] = (porKyc[e.kyc || 'sin dato'] ?? 0) + 1
    if (e.direccionWallet) conWallet++
    if (e.gid) conGid++
    const ult = e.ultimoAcceso ? Date.parse(e.ultimoAcceso) : 0
    if (ult >= hace30) activos30++
    if (ult && ult < hace90) dormidos90++
    for (const [m, n] of Object.entries(e.saldos || {})) {
      if (!(n > 0)) continue
      saldos[m] = (saldos[m] ?? 0) + n
      tenedores[m] = (tenedores[m] ?? 0) + 1
    }
    if (saldoTotal(e) > 0) conSaldo++
  }

  const ordenar = (o: Record<string, number>) =>
    Object.entries(o).map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n)

  return {
    total: todas.length,
    conWallet, conGid, conSaldo, activos30, dormidos90,
    /** Cuántos NO están en Genesis ID: son los que faltan verificar. */
    sinGid: todas.length - conGid,
    porApp: ordenar(porApp),
    porPais: ordenar(porPais).slice(0, 15),
    porKyc: ordenar(porKyc),
    /** Una fila por moneda: cuánta hay en manos de la gente y cuántos la tienen. */
    porMoneda: monedas().map((m) => ({
      simbolo: m.simbolo, nombre: m.nombre, contrato: m.contrato,
      total: Math.round((saldos[m.simbolo] ?? 0) * 1e6) / 1e6,
      tenedores: tenedores[m.simbolo] ?? 0,
    })).sort((a, b) => b.tenedores - a.tenedores || b.total - a.total),
    saldos: Object.fromEntries(Object.entries(saldos).map(([m, n]) => [m, Math.round(n * 1e6) / 1e6])),
    /** Cuántas personas están en las dos apps (mismo correo). */
    enVariasApps: (() => {
      const cuenta = new Map<string, Set<string>>()
      for (const e of todas) {
        if (!cuenta.has(e.email)) cuenta.set(e.email, new Set())
        cuenta.get(e.email)!.add(e.app)
      }
      return [...cuenta.values()].filter((s) => s.size > 1).length
    })(),
  }
}

/** Todo lo que hay de una persona, juntando sus cuentas en varias apps. */
export async function fichaPorEmail(email: string) {
  const c = col()
  const e = email.toLowerCase().trim()
  const cuentas: EntradaDirectorio[] = c
    ? await c.find({ email: e }).toArray()
    : [...memoria.values()].filter((x) => x.email === e)
  if (!cuentas.length) return null

  const identidad = store.todo().identidades.find((i) => i.email?.toLowerCase() === e) ?? null
  return {
    email: e,
    cuentas,
    genesis: identidad ? {
      gid: identidad.gid, estado: identidad.estado,
      nombreLegal: identidad.nombreLegal, nacionalidad: identidad.nacionalidad,
      riesgo: identidad.riesgo?.nivel ?? null, pep: identidad.pep,
      actualizadaEn: identidad.actualizadaEn,
    } : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Saldos: se le preguntan a la cadena, no a las apps
//
// Veta Wallet es custodia y lleva su propia contabilidad, pero lo que de verdad
// tiene una persona es lo que dice la cadena 8532 sobre su dirección. Son dos
// cifras que deberían coincidir y a veces no coinciden — y cuando no coinciden,
// eso es exactamente lo que hay que ver en una revisión.
//
// Ya pasó una vez en este ecosistema: MyTokenPay mostraba 10,81 ORIGEN
// retirables sobre una billetera que en la cadena tenía 0,0.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refresca el saldo en cadena de TODAS las monedas del ecosistema.
 *
 * Devuelve cuántas direcciones se consultaron y cuántas tienen algo.
 */
export async function refrescarSaldos(maximo = 800): Promise<{
  consultadas: number; conSaldo: number; monedas: number
}> {
  const c = col()
  const todas: EntradaDirectorio[] = c ? await c.find({}).toArray() : [...memoria.values()]
  const conDireccion = todas.filter((e) => e.direccionWallet).slice(0, maximo)

  let conSaldo = 0
  // De cuarenta direcciones a la vez: cada una son quince llamadas, así que un
  // grupo es unas seiscientas y el nodo las aguanta sin despeinarse.
  for (let i = 0; i < conDireccion.length; i += 40) {
    const grupo = conDireccion.slice(i, i + 40)
    const saldos = await saldosDe(grupo.map((e) => e.direccionWallet!))
    for (const e of grupo) {
      const nuevos = saldos.get(e.direccionWallet!)
      if (nuevos === undefined) continue      // sin respuesta: se deja lo previo
      if (Object.keys(nuevos).length) conSaldo++
      if (c) await c.updateOne({ _id: e._id }, { $set: { saldos: nuevos } })
      else memoria.get(e._id)!.saldos = nuevos
    }
  }
  return { consultadas: conDireccion.length, conSaldo, monedas: monedas().length }
}
