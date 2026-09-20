// Las rutas de la Tesorería.
//
// Hay una sola puerta para cambiar el estado: POST /api/comandos. Recibe el
// nombre de un comando de app/reglas.js y sus datos, comprueba la sesión y el
// permiso del rol, lo ejecuta sobre una copia, sella el asiento con SHA-256 y
// solo entonces sustituye el estado y lo vuelca al almacén. Si el comando
// lanza, no cambia nada.
//
// El front valida para explicar; esto valida para impedir.

import { Router, type Request, type Response, type NextFunction } from 'express'
import { store, semillaFresca, type Operador } from './store.js'
import { R, type Contexto } from './reglas.js'
import { sha256, firmar, verificarFirma } from './cripto.js'
import * as op from './operadores.js'
import { conciliar } from './cadena.js'
import { verificarTokenGenesis, genesisConfigurado } from './genesis.js'
import { anclar, anclajeConfigurado } from './ancla.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { operador?: Operador } }
}

function tokenDe(req: Request): string {
  const c = String(req.headers.authorization || '')
  return c.startsWith('Bearer ') ? c.slice(7).trim() : ''
}

export function exigeSesion(req: Request, res: Response, siguiente: NextFunction) {
  const o = op.operadorDeSesion(tokenDe(req))
  if (!o) return res.status(401).json({ error: 'Hace falta una sesión de operador' })
  req.operador = o
  siguiente()
}

function exigePermiso(permiso: string) {
  return (req: Request, res: Response, siguiente: NextFunction) => {
    const o = req.operador ?? op.operadorDeSesion(tokenDe(req))
    if (!o) return res.status(401).json({ error: 'Hace falta una sesión de operador' })
    if (!op.puede(o.rol, permiso)) return res.status(403).json({ error: `El rol "${o.rol}" no tiene el permiso "${permiso}"` })
    req.operador = o
    siguiente()
  }
}

// Cubo con goteo por IP, para la puerta de entrada.
const cubos = new Map<string, { fichas: number; ultimo: number }>()
export function limite(porMinuto: number) {
  const relleno = porMinuto / 60000
  return (req: Request, res: Response, siguiente: NextFunction) => {
    const llave = `${req.ip}|${req.path}`
    const ahora = Date.now()
    const cubo = cubos.get(llave) ?? { fichas: porMinuto, ultimo: ahora }
    cubo.fichas = Math.min(porMinuto, cubo.fichas + (ahora - cubo.ultimo) * relleno)
    cubo.ultimo = ahora
    if (cubo.fichas < 1) { cubos.set(llave, cubo); res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Demasiadas peticiones. Espere un momento.' }) }
    cubo.fichas -= 1
    cubos.set(llave, cubo)
    siguiente()
  }
}
setInterval(() => { const t = Date.now() - 600000; for (const [k, v] of cubos) if (v.ultimo < t) cubos.delete(k) }, 300000).unref?.()

/**
 * El estado tal como lo ve un operador: con su sesión puesta y el Consejo
 * real (los operadores con rol de consejero). Si todavía no hay consejeros
 * dados de alta, se conserva la lista de la semilla para que la demostración
 * siga teniendo sentido.
 */
export function estadoPara(o: Operador) {
  const e = R.clon(store.todo().estado)
  const c = op.consejo()
  if (c.length) e.consejo = c
  e.sesion = { usuario: o.nombre, email: o.email, rol: o.rol, permisos: R.PERMISOS[o.rol], modo: 'api', operadorId: o.id, debeCambiarContrasena: o.debeCambiarContrasena }
  return e
}

/** Estado interno con el Consejo sincronizado, para ejecutar comandos. */
function estadoInterno() {
  const e = store.todo().estado
  const c = op.consejo()
  if (c.length) e.consejo = c
  return e
}

const sesionPublica = (r: { sesion?: any; operador?: Operador }) => ({
  token: r.sesion!.token, expiraEn: r.sesion!.expiraEn, operador: op.publico(r.operador!),
})

export function rutas(info: { commit: string; rama: string; arranque: string }) {
  const api = Router()

  // ── salud y descripción ────────────────────────────────────────────────────
  api.get('/salud', (_req, res) => {
    const v = R.verificarLibro(store.todo().estado, sha256)
    const s = store.estado()
    res.json({
      estado: v.ok && s.motor === 'mongodb' ? 'ok' : 'degradado',
      en: new Date().toISOString(),
      version: info, almacen: s.motor, efimero: s.efimero, asientos: s.asientos, operadores: s.operadores,
      libroIntegro: v.ok, sello: v.sello ?? null, genesis: genesisConfigurado(), anclaje: anclajeConfigurado(),
    })
  })

  api.get('/', (_req, res) => {
    res.json({
      nombre: 'Tesorería de Orden Global', version: 1,
      rutas: {
        sesion: 'POST /api/sesion/entrar · /genesis · /salir · GET /api/sesion/yo · POST /api/sesion/contrasena',
        estado: 'GET /api/estado (sesión)',
        comandos: 'POST /api/comandos {nombre, datos} (sesión + permiso) · GET /api/comandos',
        libro: 'GET /api/libro · /api/libro/verificar · /api/libro/ancla',
        publico: 'GET /api/prueba-de-reservas · GET /api/respaldo',
        cadena: 'GET /api/cadena/conciliacion (sesión)',
        operadores: 'GET/POST /api/operadores · POST /api/operadores/:id/baja (presidente)',
      },
    })
  })

  // ── sesión ────────────────────────────────────────────────────────────────
  api.post('/sesion/entrar', limite(10), (req, res) => {
    const { email, contrasena } = req.body ?? {}
    if (!email || !contrasena) return res.status(400).json({ error: 'Faltan el correo y la contraseña' })
    const r = op.entrar(String(email), String(contrasena), req.ip ?? null)
    if (!r.ok) return res.status(401).json({ error: r.motivo })
    res.json(sesionPublica(r))
  })

  api.post('/sesion/genesis', limite(10), async (req, res) => {
    const v = await verificarTokenGenesis(String(req.body?.token || ''))
    if (!v.ok) return res.status(401).json({ error: v.motivo })
    const r = op.entrarPorGid(v.gid!, req.ip ?? null)
    if (!r.ok) return res.status(403).json({ error: r.motivo })
    res.json(sesionPublica(r))
  })

  api.post('/sesion/salir', exigeSesion, (req, res) => { op.salir(tokenDe(req)); res.json({ ok: true }) })
  api.get('/sesion/yo', exigeSesion, (req, res) => res.json({ operador: op.publico(req.operador!) }))
  api.post('/sesion/contrasena', exigeSesion, (req, res) => {
    const { actual, nueva } = req.body ?? {}
    if (!actual || !nueva) return res.status(400).json({ error: 'Faltan la contraseña actual y la nueva' })
    const r = op.cambiarContrasena(req.operador!.id, String(actual), String(nueva))
    if (!r.ok) return res.status(400).json({ error: r.motivo })
    res.json({ ok: true, aviso: 'Se cerraron todas las sesiones. Vuelva a entrar con la contraseña nueva.' })
  })

  // ── estado ────────────────────────────────────────────────────────────────
  api.get('/estado', exigeSesion, (req, res) => res.json({ estado: estadoPara(req.operador!) }))

  api.post('/estado/reiniciar', exigePermiso('*'), async (req, res) => {
    await store.reiniciarEstado()
    const e = estadoInterno()
    const r = R.ejecutar(e, 'sistema.freno', { congelar: false }, { actor: req.operador!.nombre, rol: req.operador!.rol, hash: sha256 })
    // El reinicio queda asentado como primer movimiento del libro nuevo.
    r.estado.libro[0].tipo = 'estado.reiniciado'
    r.estado.libro[0].detalle = `${req.operador!.nombre} devolvió el estado a la semilla de demostración`
    r.estado.libro[0].nivel = 'warn'
    R.sellarLibro(r.estado, sha256)
    store.todo().estado = r.estado
    await store.guardarYa()
    res.json({ estado: estadoPara(req.operador!) })
  })

  // ── comandos: la única puerta de escritura ────────────────────────────────
  api.get('/comandos', exigeSesion, (req, res) => {
    res.json({ comandos: R.nombresComandos.map((n) => ({ nombre: n, permiso: R.comandos[n].permiso, permitido: op.puede(req.operador!.rol, R.comandos[n].permiso) })) })
  })

  api.post('/comandos', exigeSesion, async (req, res) => {
    const nombre = String(req.body?.nombre || '')
    const datos = req.body?.datos && typeof req.body.datos === 'object' ? req.body.datos : {}
    const cmd = R.comandos[nombre]
    if (!cmd) return res.status(400).json({ error: `Comando desconocido: ${nombre}` })
    const o = req.operador!
    if (!op.puede(o.rol, cmd.permiso)) return res.status(403).json({ error: `El rol "${o.rol}" no tiene el permiso "${cmd.permiso}"` })
    if (o.debeCambiarContrasena && nombre !== 'sistema.freno') {
      // Con contraseña provisional se puede mirar y frenar, no mover dinero.
      return res.status(403).json({ error: 'Cambia la contraseña provisional antes de operar' })
    }

    const ctx: Contexto = {
      actor: o.nombre, rol: o.rol, ahora: new Date(), hash: sha256,
      // Solo los consejeros firman; el resto ni siquiera recibe la función.
      firmar: ['presidente', 'consejero'].includes(o.rol)
        ? (canon: string) => ({ firma: firmar(o.clavePrivada, canon), clavePublica: o.clavePublica })
        : undefined,
    }
    let r
    try {
      r = R.ejecutar(estadoInterno(), nombre, datos, ctx)
    } catch (e: any) {
      return res.status(e?.codigo === 403 ? 403 : 422).json({ error: e?.message || 'Comando rechazado' })
    }
    store.todo().estado = r.estado
    await store.guardarYa()
    res.json({ estado: estadoPara(o), evento: r.evento, resultado: r.resultado })
  })

  // ── libro ─────────────────────────────────────────────────────────────────
  api.get('/libro', exigeSesion, (req, res) => {
    const desde = Math.max(0, Number(req.query.desde) || 0)
    const cuantos = Math.min(500, Math.max(1, Number(req.query.cuantos) || 100))
    const l = store.todo().estado.libro
    res.json({ total: l.length, asientos: l.slice(desde, desde + cuantos) })
  })
  api.get('/libro/verificar', (_req, res) => res.json(R.verificarLibro(store.todo().estado, sha256)))
  api.get('/libro/ancla', (_req, res) => {
    const e = store.todo().estado
    const v = R.verificarLibro(e, sha256)
    // Lo que se publica en la cadena: el sello y cuántos asientos cubre. Con eso
    // cualquiera puede pedir el libro y comprobar que llega exactamente a ese hash.
    res.json({ sello: v.sello, asientos: v.total, integro: v.ok, en: new Date().toISOString(), algoritmo: 'SHA-256 encadenado', cadena: 5550, anclajeConfigurado: anclajeConfigurado(), ultimaAncla: (e.anclas || [])[0] ?? null })
  })

  /** Las anclas ya publicadas (sello, asientos, transacción, bloque). Público: es la prueba de que el pasado no se reescribió. */
  api.get('/libro/anclas', (_req, res) => res.json({ anclas: store.todo().estado.anclas || [], configurado: anclajeConfigurado() }))

  /** Publica el sello actual en la cadena 5550. Solo el presidente; queda asentado en el libro. */
  api.post('/libro/anclar', exigePermiso('*'), async (req, res) => {
    const e = store.todo().estado
    const v = R.verificarLibro(e, sha256)
    if (!v.ok) return res.status(409).json({ error: `El libro no verifica (asiento ${v.en}); no se ancla un libro roto` })
    try {
      const a = await anclar(v.sello!, v.total!)
      const ancla = { sello: v.sello, asientos: v.total, tx: a.tx, bloque: a.bloque, de: a.de, en: a.carga.en, por: req.operador!.nombre, cadena: 5550 }
      e.anclas = [ancla, ...(e.anclas || [])].slice(0, 500)
      R.asentar(e, { tipo: 'libro.anclado', detalle: `Sello ${v.sello!.slice(0, 12)}… (${v.total} asientos) anclado en la cadena 5550 · tx ${a.tx.slice(0, 14)}…`, nivel: 'ok', actor: req.operador!.nombre, rol: req.operador!.rol, ahora: new Date() }, sha256)
      await store.guardarYa()
      res.json({ ancla, estado: estadoPara(req.operador!) })
    } catch (err: any) {
      res.status(err?.codigo === 503 ? 503 : 502).json({ error: err?.message || 'No se pudo anclar' })
    }
  })

  /** El libro en CSV, para auditores que trabajan en hoja de cálculo. */
  api.get('/libro.csv', exigeSesion, (_req, res) => {
    const l = store.todo().estado.libro
    const celda = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const filas = [['id', 'fecha', 'actor', 'rol', 'tipo', 'nivel', 'detalle', 'hash', 'hashPrev'].join(',')]
    for (const a of l) filas.push([a.id, a.ts, a.actor, a.rol, a.tipo, a.nivel, a.detalle, a.hash, a.hashPrev].map(celda).join(','))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="libro-tesoreria.csv"')
    res.send('\ufeff' + filas.join('\n'))
  })

  /** Verifica una firma Ed25519 de una solicitud contra la llave pública de un consejero. */
  api.get('/solicitudes/:id/firmas', (req, res) => {
    const s = R.buscar.solicitud(store.todo().estado, req.params.id)
    if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' })
    const canon = R.canonSolicitud(s)
    res.json({
      id: s.id, canon,
      firmas: s.firmas.map((f: any) => ({ quien: f.quien, ts: f.ts, clavePublica: f.clavePublica || null,
        verificada: f.firma && f.clavePublica ? verificarFirma(f.clavePublica, canon, f.firma) : null })),
    })
  })

  // ── público: prueba de reservas ───────────────────────────────────────────
  // No pide sesión a propósito: es el documento que cualquier tenedor, auditor
  // o regulador tiene derecho a leer. No lleva datos de personas.
  api.get('/respaldo', (_req, res) => res.json(R.respaldo(store.todo().estado)))
  api.get('/prueba-de-reservas', (_req, res) => {
    const e = store.todo().estado
    const r = R.respaldo(e)
    const v = R.verificarLibro(e, sha256)
    res.json({
      emisor: 'Orden Global Corp', en: new Date().toISOString(),
      origen: { unidad: e.origen.unidad, paridad: e.origen.paridad, cadena: e.origen.cadena, enCirculacion: r.emitidoUnidades, valorUsd: r.emitido, valorUnidadUsd: r.valorUnidad },
      oro: { usdPorGramo: e.politica.oroUsdPorGramo, fuente: e.politica.oroFuente, fecha: e.politica.oroFecha },
      respaldo: { admisibleUsd: r.admisible, ratio: Number.isFinite(r.ratio) ? r.ratio : null, salud: r.salud, comprometidoUsd: r.comprometido, libreUsd: r.libre },
      reservas: e.reservas.map((x: any) => ({ id: x.id, nombre: x.nombre, clase: x.clase, custodio: x.custodio, auditor: x.auditor, certificado: x.certificado, valorCertificado: x.valorCertificado, haircut: x.haircut, admisible: R.valorAdmisible(x), estado: x.estado, vence: x.vence })),
      tokens: [...e.securities, ...e.utilities].filter((t: any) => t.origenAsignado > 0).map((t: any) => ({
        simbolo: t.simbolo, nombre: t.nombre, clase: t.precioUnitario !== undefined ? 'security' : 'utility', contrato: t.contrato || null,
        emitido: t.supply.emitido - t.supply.quemado, autorizado: t.supply.autorizado, origenAsignadoUsd: t.origenAsignado,
      })),
      libro: { sello: v.sello, asientos: v.total, integro: v.ok },
    })
  })

  // ── cadena 5550 ───────────────────────────────────────────────────────────
  api.get('/cadena/conciliacion', exigeSesion, async (_req, res) => {
    try { res.json(await conciliar(store.todo().estado)) }
    catch (e: any) { res.status(502).json({ error: 'No se pudo leer la cadena: ' + (e?.message || '') }) }
  })

  // ── operadores (solo el presidente) ───────────────────────────────────────
  api.get('/operadores', exigePermiso('*'), (_req, res) => res.json({ operadores: store.todo().operadores.map(op.publico), consejo: op.consejo() }))
  api.post('/operadores', exigePermiso('*'), async (req, res) => {
    try {
      const o = op.crearOperador({ email: req.body?.email, nombre: req.body?.nombre, rol: req.body?.rol, contrasena: req.body?.contrasena, gid: req.body?.gid })
      await store.guardarYa()
      res.status(201).json({ operador: op.publico(o) })
    } catch (e: any) { res.status(400).json({ error: e.message }) }
  })
  api.post('/operadores/:id/baja', exigePermiso('*'), async (req, res) => {
    try {
      if (req.params.id === req.operador!.id) return res.status(400).json({ error: 'No puedes darte de baja a ti mismo' })
      const o = op.darDeBaja(req.params.id)
      await store.guardarYa()
      res.json({ operador: op.publico(o) })
    } catch (e: any) { res.status(400).json({ error: e.message }) }
  })

  api.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))
  return api
}

export { semillaFresca }
