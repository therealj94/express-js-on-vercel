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
import { saldosDe, monedas, emisiones } from './monedas.js'
import { presenciaDe, ultimaSenal, tramoDe } from './presencia.js'

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
  /** Se registró en los últimos N días. */
  registradoDias?: number
  /** Nunca abrió sesión: se dio de alta y no volvió. */
  nuncaEntro?: boolean
  /** Saldo mínimo, en la moneda filtrada o sumando todas. */
  saldoMin?: number
  estado?: string
  /** `ahora` | `hoy` | `semana` | `mes` | `dormido` | `nunca`. */
  tramo?: string
  orden?: 'ultimoAcceso' | 'creadoEn' | 'saldo' | 'email' | 'nombre' | 'app' | 'pais'
  /** `desc` es mayor a menor y más reciente primero; `asc` al revés. */
  direccion?: 'asc' | 'desc'
  limite?: number
  desde?: number
}

/**
 * @param visto la señal combinada padrón + telemetría, ya resuelta. Se pasa en
 *   vez de leerla aquí porque calcularla es un cruce sobre todo el padrón, y
 *   hacerlo dentro del filtro sería repetirlo una vez por persona.
 */
function pasaFiltro(e: EntradaDirectorio, f: FiltroDirectorio, visto: string | null): boolean {
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
  if (f.estado && (e.estado || '') !== f.estado) return false
  // «Nunca entró» quiere decir que NINGUNA de las dos fuentes le ha visto.
  // Antes miraba solo el padrón y marcaba como fantasmas a personas que
  // entraban todos los días desde una app que no escribía ese campo.
  if (f.nuncaEntro !== undefined && Boolean(visto) === f.nuncaEntro) return false
  if (f.saldoMin !== undefined && f.saldoMin > 0) {
    const s = f.moneda ? ((e.saldos || {})[f.moneda.toUpperCase()] || 0) : saldoTotal(e)
    if (s < f.saldoMin) return false
  }
  if (f.registradoDias) {
    const corte = Date.now() - f.registradoDias * 86400000
    const alta = e.creadoEn ? Date.parse(e.creadoEn) : 0
    if (!alta || alta < corte) return false
  }
  if (f.inactivosDias) {
    const corte = Date.now() - f.inactivosDias * 86400000
    const ult = visto ? Date.parse(visto) : 0
    if (ult >= corte) return false
  }
  // El tramo de presencia: `ahora`, `hoy`, `semana`, `mes`, `dormido`, `nunca`.
  if (f.tramo && tramoDe(visto) !== f.tramo) return false
  return true
}

const saldoTotal = (e: EntradaDirectorio) =>
  Object.values(e.saldos || {}).reduce((s, n) => s + (Number(n) || 0), 0)

/**
 * Todas las entradas de una app, tal cual.
 *
 * La usa la analítica para poner nombre a una huella de telemetría: se le
 * calcula a cada persona la misma huella y se cruza. Devuelve un puñado de
 * campos y no la entrada entera — pasar el teléfono, los saldos o el histórico
 * sería repartir datos personales a un módulo que no los pidió.
 *
 * `direccionWallet` está en la lista porque las últimas conexiones se miran
 * para saber QUIEN entró, y en este ecosistema una persona se reconoce por su
 * correo y por su billetera: sin ella la pantalla enseña un nombre que no
 * lleva a la cadena. Va por la misma puerta y con el mismo permiso
 * (`usuarios.ver`) que el resto del directorio.
 */
export async function entradasDe(app: string): Promise<Array<
  Pick<EntradaDirectorio, 'app' | 'idExterno' | 'email' | 'nombre' | 'pais' | 'gid' | 'direccionWallet'>
>> {
  const c = col()
  const todas: EntradaDirectorio[] = c
    ? await c.find({ app }, {
        projection: {
          app: 1, idExterno: 1, email: 1, nombre: 1, pais: 1, gid: 1, direccionWallet: 1,
        },
      }).toArray()
    : [...memoria.values()].filter((e) => e.app === app)
  return todas.map((e) => ({
    app: e.app, idExterno: e.idExterno, email: e.email,
    nombre: e.nombre, pais: e.pais, gid: e.gid ?? null,
    direccionWallet: e.direccionWallet,
  }))
}

export async function consultar(f: FiltroDirectorio = {}) {
  const c = col()
  const todas: EntradaDirectorio[] = c ? await c.find({}).toArray() : [...memoria.values()]

  // La presencia real, de la telemetría, ANTES de filtrar: los filtros de
  // actividad («nunca entró», «dormidos 90 días») se deciden con la señal
  // combinada, no con el `ultimoAcceso` del padrón. Filtrar primero y mirar
  // la presencia después daría justo el fallo que se está arreglando —
  // esconder a alguien por inactivo cuando entró hace diez minutos.
  const presencia = await presenciaDe(todas)
  const vistas = new Map<string, ReturnType<typeof ultimaSenal>>()
  for (const e of todas) {
    vistas.set(e._id, ultimaSenal(e.ultimoAcceso, presencia.get(e._id)))
  }
  const visto = (e: EntradaDirectorio) => vistas.get(e._id)?.en || null

  const filtradas = todas.filter((e) => pasaFiltro(e, f, visto(e)))

  // `desc` significa lo que uno espera de cada columna: en números, mayor a
  // menor; en fechas, lo más reciente arriba; en texto, de la A a la Z. Que
  // «descendente» quiera decir Z-A en un nombre confunde más de lo que ayuda.
  const orden = f.orden || 'ultimoAcceso'
  const desc = (f.direccion || 'desc') === 'desc'
  const signo = desc ? 1 : -1

  filtradas.sort((a, b) => {
    let r = 0
    if (orden === 'saldo') {
      const val = (e: EntradaDirectorio) => f.moneda
        ? ((e.saldos || {})[f.moneda.toUpperCase()] || 0)
        : saldoTotal(e)
      r = val(b) - val(a)
    } else if (orden === 'email') {
      r = a.email.localeCompare(b.email) * -1
    } else if (orden === 'nombre') {
      r = (a.nombre || a.usuario || '~').localeCompare(b.nombre || b.usuario || '~') * -1
    } else if (orden === 'app') {
      r = a.app.localeCompare(b.app) * -1
    } else if (orden === 'pais') {
      r = (a.pais || '~').localeCompare(b.pais || '~') * -1
    } else {
      // Fechas. Quien nunca entró va al final en cualquier sentido: es la
      // ausencia de un dato, no el dato más antiguo.
      const ka = (orden === 'creadoEn' ? a.creadoEn : visto(a)) || ''
      const kb = (orden === 'creadoEn' ? b.creadoEn : visto(b)) || ''
      if (!ka && !kb) r = 0
      else if (!ka) return 1
      else if (!kb) return -1
      else r = kb.localeCompare(ka)
    }
    return r * signo
  })

  const desde = Math.max(0, f.desde || 0)
  const limite = Math.min(500, f.limite || 100)

  // Los tramos se cuentan con TODOS los filtros puestos menos el de tramo.
  //
  // No sobre la página devuelta —una foto de las cien filas visibles no dice
  // nada— pero tampoco sobre el directorio entero: si se está mirando Veta
  // Wallet, los contadores tienen que ser de Veta Wallet. Dejar fuera solo el
  // filtro de tramo es lo que permite tocar «Hoy» y que los demás tramos
  // sigan enseñando cuánta gente hay en cada uno; si se contaran ya filtrados,
  // al elegir uno los otros caerían a cero y no habría a dónde volver.
  const tramos: Record<string, number> = {
    ahora: 0, hoy: 0, semana: 0, mes: 0, dormido: 0, nunca: 0,
  }
  const sinTramo = { ...f, tramo: undefined }
  for (const e of todas) {
    if (pasaFiltro(e, sinTramo, visto(e))) tramos[tramoDe(visto(e))]++
  }

  return {
    total: filtradas.length,
    tramos,
    usuarios: filtradas.slice(desde, desde + limite).map((e) => {
      const v = vistas.get(e._id)
      const p = presencia.get(e._id)
      return {
        ...e,
        // La verdad sobre cuándo se le vio, y de dónde salió ese dato: si
        // vino de la telemetría es de hace minutos; si vino del padrón puede
        // ir seis horas por detrás, y quien mira merece saberlo.
        vistoEn: v?.en ?? null,
        fuenteVisto: v?.fuente ?? null,
        tramo: tramoDe(v?.en ?? null),
        /** La última vez en cada plataforma: `{ android: iso, web: iso }`. */
        plataformas: p?.plataformas ?? {},
        eventos: p?.eventos ?? 0,
        /** El país desde el que entra de verdad, que puede no ser el declarado. */
        paisReal: p?.pais ?? null,
      }
    }),
  }
}

/** Los números de arriba de la pantalla, sobre TODO el directorio. */
export async function resumenDirectorio() {
  const emitido = await emisiones()
  const c = col()
  const todas: EntradaDirectorio[] = c ? await c.find({}).toArray() : [...memoria.values()]
  const hace30 = Date.now() - 30 * 86400000
  const hace90 = Date.now() - 90 * 86400000

  // Mismo arreglo que en `consultar`: «activos» y «dormidos» se cuentan con la
  // señal real. Con solo el padrón, una app que no escribe `ultimoAcceso`
  // aparecía entera como dormida.
  const presencia = await presenciaDe(todas)
  const tramos: Record<string, number> = {
    ahora: 0, hoy: 0, semana: 0, mes: 0, dormido: 0, nunca: 0,
  }

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
    const senal = ultimaSenal(e.ultimoAcceso, presencia.get(e._id)).en
    tramos[tramoDe(senal)]++
    const ult = senal ? Date.parse(senal) : 0
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
    /** Quién anda por aquí, por tramos. Suman el total: cada uno cuenta en el más estrecho. */
    tramos,
    /** Cuánta gente del padrón manda telemetría: si es 0, ninguna app la tiene montada. */
    conTelemetria: presencia.size,
    /** Cuántos NO están en Genesis ID: son los que faltan verificar. */
    sinGid: todas.length - conGid,
    porApp: ordenar(porApp),
    porPais: ordenar(porPais).slice(0, 15),
    porKyc: ordenar(porKyc),
    /** Una fila por moneda: cuánta hay en manos de la gente y cuántos la tienen. */
    porMoneda: monedas().map((m) => {
      const enManos = Math.round((saldos[m.simbolo] ?? 0) * 1e6) / 1e6
      const emision = emitido[m.simbolo] ?? null
      return {
        simbolo: m.simbolo, nombre: m.nombre, contrato: m.contrato,
        total: enManos,
        tenedores: tenedores[m.simbolo] ?? 0,
        emitido: emision,
        estado: (tenedores[m.simbolo] ?? 0) > 0 ? 'en circulación'
          : emision === null ? 'no se pudo leer'
          : emision > 0 ? 'emitida, sin repartir'
          : 'sin emisión',
      }
    }).sort((a, b) => b.tenedores - a.tenedores || (b.emitido ?? 0) - (a.emitido ?? 0)),
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

  // La presencia de cada cuenta suya. Alguien puede tener cuenta en dos apps y
  // entrar solo a una: enseñarlo por cuenta —y no una fecha sola para toda la
  // persona— es lo que deja ver cuál usa de verdad y cuál abandonó.
  const presencia = await presenciaDe(cuentas)

  return {
    email: e,
    cuentas: cuentas.map((x) => {
      const p = presencia.get(x._id)
      const v = ultimaSenal(x.ultimoAcceso, p)
      return {
        ...x,
        vistoEn: v.en, fuenteVisto: v.fuente, tramo: tramoDe(v.en),
        plataformas: p?.plataformas ?? {},
        eventos: p?.eventos ?? 0,
        paisReal: p?.pais ?? null,
      }
    }),
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
// tiene una persona es lo que dice la cadena 5550 sobre su dirección. Son dos
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
  consultadas: number; conSaldo: number; monedas: number; perdidas: number
  /** `true` = no se tocó ni un saldo porque el nodo contestó otra cadena. */
  cadenaEquivocada: boolean
}> {
  let perdidas = 0
  const c = col()
  const todas: EntradaDirectorio[] = c ? await c.find({}).toArray() : [...memoria.values()]
  const conDireccion = todas.filter((e) => e.direccionWallet).slice(0, maximo)

  let conSaldo = 0
  let cadenaMal = false
  // De cuarenta direcciones a la vez: cada una son quince llamadas, así que un
  // grupo es unas seiscientas y el nodo las aguanta sin despeinarse.
  for (let i = 0; i < conDireccion.length; i += 25) {
    const grupo = conDireccion.slice(i, i + 25)
    const lectura = await saldosDe(grupo.map((e) => e.direccionWallet!))
    const { saldos, fallidas, leidas, leidoEn, cadenaCorrecta } = lectura
    perdidas += fallidas
    if (!cadenaCorrecta) {
      // El nodo contestó otra cadena. No se escribe nada: lo que hay guardado
      // será viejo, pero al menos es de la cadena correcta.
      cadenaMal = true
      continue
    }
    for (const e of grupo) {
      const dir = e.direccionWallet!
      const contestaron = leidas.get(dir)
      const nuevos = saldos.get(dir)
      if (!contestaron?.size || nuevos === undefined) continue   // no contestó nada: se deja lo que hubiera

      /* SE ESCRIBE MONEDA POR MONEDA, y solo las que contestaron.
         Dos formas de equivocarse aquí, y las dos ya ocurrieron:
           - escribir el mapa entero metía un CERO INVENTADO en las monedas que
             el nodo no contestó;
           - saltarse la dirección si fallaba UNA sola de las quince dejaba la
             ficha congelada -- una cuenta recién vaciada siguió mostrando sus
             tokens.
         Lo que contestó con saldo se pone; lo que contestó con cero se quita;
         lo que no contestó ni se toca. */
      const poner: Record<string, unknown> = { saldosLeidosEn: leidoEn }
      const quitar: Record<string, ''> = {}
      for (const sim of contestaron) {
        const v = nuevos[sim]
        if (v !== undefined) poner[`saldos.${sim}`] = v
        else quitar[`saldos.${sim}`] = ''
      }
      if (Object.keys(nuevos).length) conSaldo++
      if (c) {
        const cambio: any = { $set: poner }
        if (Object.keys(quitar).length) cambio.$unset = quitar
        await c.updateOne({ _id: e._id }, cambio)
      } else {
        const m = memoria.get(e._id)! as any
        m.saldos = m.saldos || {}
        for (const sim of contestaron) {
          if (nuevos[sim] !== undefined) m.saldos[sim] = nuevos[sim]
          else delete m.saldos[sim]
        }
        m.saldosLeidosEn = leidoEn
      }
    }
  }
  if (perdidas) console.warn(`[directorio] ${perdidas} lecturas sin respuesta del nodo`)
  if (cadenaMal) {
    console.error('[directorio] NO se actualizó ningún saldo: el nodo contestó otra cadena')
  }
  return {
    consultadas: conDireccion.length,
    conSaldo,
    monedas: monedas().length,
    perdidas,
    /* Que quien aprieta el botón vea POR QUE no cambió nada, en vez de mirar
       los mismos números y pensar que la cadena está así. */
    cadenaEquivocada: cadenaMal,
  }
}
