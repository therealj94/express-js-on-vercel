// Lo que consulta el panel de analítica. Todo exige sesión de operador.
//
// Ninguna ruta de aquí devuelve un dato que identifique a una persona: los
// usuarios se cuentan por huella y las huellas no se publican. Es una decisión
// deliberada — el panel de métricas lo abre mucha más gente que el de
// cumplimiento, y no tiene por qué ver a nadie en particular.
//
// LA EXCEPCION, Y POR QUE EXISTE
//
// Dos rutas —`/afectados` y `/sesiones`— sí ponen nombre: son las que
// responden «a quién le pasó esto» y «quién entró». Sin ellas, instrumentar un
// error sirve para saber que algo se rompe pero no para llamar a quien lo
// sufrió, que es la mitad del trabajo. Se resuelven cruzando el padrón, no
// guardando nada nuevo, y por eso piden el permiso del padrón
// (`usuarios.ver`), no el de analítica, y quedan escritas en la bitácora.

import { Router } from 'express'
import { exigeOperador, exigePermiso } from '../middleware/proteger.js'
import {
  resumen, porApp, paises, retencion, errores, errorDetalle, marcarError,
  embudoKyc, tiemposDeVerificacion, saludEcosistema, serviciosVigilados,
} from '../analitica/consultas.js'
import { explorar, afectadosPorError, ultimasSesiones } from '../analitica/explorador.js'
import { almacen, leerCenso } from '../analitica/eventos.js'
import { clavePublicaDe, rotarPublica } from '../auth/aplicaciones.js'
import { consultar as bitacoraConsultar, registrar } from '../audit/bitacora.js'
import { store } from '../store.js'
import type { EstadoError } from '../analitica/eventos.js'

export const analiticaRouter = Router()

analiticaRouter.use(exigeOperador, exigePermiso('analitica.ver'))

/** Los días de la ventana, acotados: nadie pide 4000 días por gusto. */
const dias = (v: unknown, porDefecto = 30) =>
  Math.max(1, Math.min(365, Number(v) || porDefecto))

const app = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s && s !== 'todas' ? s.slice(0, 40) : undefined
}

/** Texto acotado: nada de expresiones regulares gigantes en la consulta. */
const txt = (v: unknown, max = 80) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : undefined
}
const num = (v: unknown) => (v === undefined || v === '' || v === null ? undefined
  : Number.isFinite(Number(v)) ? Number(v) : undefined)
const hora = (v: unknown) => {
  const n = num(v)
  return n === undefined ? undefined : Math.max(0, Math.min(23, Math.round(n)))
}

// ── Explorador de eventos ────────────────────────────────────────────────────

/**
 * Consulta libre sobre los eventos crudos, con las cuentas por dimensión.
 *
 * Es lo que permite responder «los pagos fallidos de ayer por la noche, en la
 * web, desde Honduras, de más de 500 dólares» sin que nadie haya previsto esa
 * combinación.
 */
analiticaRouter.get('/eventos', async (req, res) => {
  const q = req.query as Record<string, string>
  res.json(await explorar({
    app: app(q.app),
    plataforma: txt(q.plataforma, 40),
    tipo: txt(q.tipo, 20) as any,
    gravedad: txt(q.gravedad, 10) as any,
    pais: txt(q.pais, 2)?.toUpperCase(),
    moneda: txt(q.moneda, 12)?.toUpperCase(),
    version: txt(q.version, 30),
    texto: txt(q.texto),
    desde: txt(q.desde, 10),
    hasta: txt(q.hasta, 10),
    horaDesde: hora(q.horaDesde),
    horaHasta: hora(q.horaHasta),
    montoMin: num(q.montoMin),
    montoMax: num(q.montoMax),
    grupo: txt(q.grupo, 64),
    sesion: txt(q.sesion, 64),
    limite: num(q.limite),
    saltar: num(q.saltar),
  }))
})

/**
 * A quién le pasó un error concreto.
 *
 * Permiso de padrón y bitácora: identificar a alguien no es mirar una métrica.
 */
analiticaRouter.get('/errores/:grupo/afectados', exigePermiso('usuarios.ver'), async (req, res) => {
  const r = await afectadosPorError(req.params.grupo, Math.min(200, Number(req.query.limite) || 50))
  registrar(req.operador!.email, 'analitica.afectados', req.params.grupo, {
    total: r.total, identificados: r.identificados,
  })
  res.json(r)
})

/** Los últimos ingresos, con hora exacta y quién fue. */
analiticaRouter.get('/sesiones', exigePermiso('usuarios.ver'), async (req, res) => {
  const q = req.query as Record<string, string>
  const r = await ultimasSesiones({
    app: app(q.app),
    plataforma: txt(q.plataforma, 40),
    pais: txt(q.pais, 2)?.toUpperCase(),
    limite: num(q.limite),
  })
  registrar(req.operador!.email, 'analitica.sesiones', q.app || 'todas', { total: r.total })
  res.json(r)
})

// ── Resumen ──────────────────────────────────────────────────────────────────

analiticaRouter.get('/resumen', async (req, res) => {
  res.json(await resumen(dias(req.query.dias), app(req.query.app)))
})

analiticaRouter.get('/apps', async (req, res) => {
  res.json({ apps: await porApp(dias(req.query.dias)) })
})

analiticaRouter.get('/paises', async (req, res) => {
  res.json({ paises: await paises(dias(req.query.dias), app(req.query.app)) })
})

analiticaRouter.get('/retencion', async (req, res) => {
  res.json({ cohortes: await retencion(app(req.query.app), Math.min(12, Number(req.query.semanas) || 6)) })
})

analiticaRouter.get('/embudo', (_req, res) => {
  res.json(embudoKyc())
})

/* Cuánto tarda una verificación y cuánto lleva esperando la cola. Es la cifra
   sobre la que vive una operación de cumplimiento y no se medía en ningún
   sitio, teniendo `verificadaEn` guardado desde siempre. */
analiticaRouter.get('/tiempos', (req, res) => {
  res.json(tiemposDeVerificacion(Math.min(365, Math.max(1, Number(req.query.dias) || 30))))
})

// ── Errores ──────────────────────────────────────────────────────────────────

analiticaRouter.get('/errores', async (req, res) => {
  const { estado, gravedad, texto } = req.query as Record<string, string>
  res.json({
    errores: await errores({
      app: app(req.query.app),
      estado: (estado as EstadoError) || undefined,
      gravedad: gravedad || undefined,
      texto: texto || undefined,
      limite: Math.min(300, Number(req.query.limite) || 100),
    }),
  })
})

analiticaRouter.get('/errores/:huella', async (req, res) => {
  const d = await errorDetalle(req.params.huella)
  if (!d) return res.status(404).json({ error: 'No hay ningún error con esa huella' })
  res.json(d)
})

/**
 * Cambiar el estado de un grupo de error.
 *
 * Queda en la bitácora encadenada como cualquier otra decisión: si mañana hay
 * que explicar por qué un fallo estuvo dos semanas marcado como «ignorado»,
 * la respuesta tiene que estar escrita y tener nombre.
 */
analiticaRouter.post('/errores/:huella/estado', exigePermiso('analitica.gestionar'), async (req, res) => {
  const { estado, nota, version } = req.body ?? {}
  const validos: EstadoError[] = ['nuevo', 'visto', 'resuelto', 'reabierto', 'ignorado']
  if (!validos.includes(estado)) {
    return res.status(400).json({ error: `El estado tiene que ser uno de: ${validos.join(', ')}` })
  }
  if ((estado === 'ignorado' || estado === 'resuelto') && !String(nota || '').trim()) {
    // Cerrar un fallo sin escribir por qué es la forma más común de perder
    // información: al mes nadie recuerda si se arregló o se tapó.
    return res.status(400).json({ error: 'Para resolver o ignorar hay que escribir el motivo' })
  }
  const ok = await marcarError(req.params.huella, estado, req.operador!.email, nota, version)
  if (!ok) return res.status(404).json({ error: 'No hay ningún error con esa huella' })

  registrar(req.operador!.email, `error.${estado}`, req.params.huella, { nota, version })
  res.json({ ok: true })
})

// ── Seguridad ────────────────────────────────────────────────────────────────

/**
 * Lo que pasó en el sistema y merece una mirada.
 *
 * Sale de la bitácora encadenada de Genesis ID, que ya registra cada aprobación,
 * cada rechazo, cada clave de API rotada y cada sesión. Aquí se filtra a lo que
 * importa desde el punto de vista de seguridad y se marca lo sensible.
 */
const ACCIONES_SENSIBLES = /aplicacion\.(creada|revocada|rotada)|operador\.|sesion\.fallida|identidad\.(suspendida|rechazada)|listas\.|error\.ignorado|anulacion/i

analiticaRouter.get('/seguridad', (req, res) => {
  const limite = Math.min(500, Number(req.query.limite) || 200)
  const entradas = bitacoraConsultar({ limite })
  const sensibles = entradas.filter((e) => ACCIONES_SENSIBLES.test(e.accion))

  // Cuántas veces hizo cada quien cada cosa: un operador que de pronto aprueba
  // diez veces más que de costumbre es algo que hay que ver.
  const porActor: Record<string, number> = {}
  const porAccion: Record<string, number> = {}
  for (const e of entradas) {
    porActor[e.actor] = (porActor[e.actor] ?? 0) + 1
    porAccion[e.accion] = (porAccion[e.accion] ?? 0) + 1
  }

  res.json({
    entradas: entradas.slice(0, 120),
    sensibles: sensibles.slice(0, 60),
    porActor: Object.entries(porActor).map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n),
    porAccion: Object.entries(porAccion).map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n).slice(0, 15),
    aplicaciones: store.todo().aplicaciones.map((a) => ({
      id: a.id, clave: a.clave, nombre: a.nombre, activa: a.activa,
      pista: a.pistaClave, alcances: a.alcances,
      // La pública se muestra entera porque no es un secreto: vive dentro de
      // las apps. La secreta no se puede mostrar ni queriendo — solo se guardó
      // su hash.
      clavePublica: a.alcances.includes('telemetria.enviar') ? clavePublicaDe(a) : null,
      creadaEn: a.creadaEn, ultimoUso: a.ultimoUso,
    })),
    operadores: store.todo().operadores.map((o) => ({
      email: o.email, nombre: o.nombre, rol: o.rol, activo: o.activo,
      ultimoAcceso: (o as any).ultimoAcceso ?? null,
    })),
  })
})

// ── Salud del ecosistema ─────────────────────────────────────────────────────

analiticaRouter.get('/salud', async (req, res) => {
  res.json({
    servicios: await saludEcosistema(req.query.forzar === '1'),
    vigilados: serviciosVigilados().length,
    almacenTelemetria: almacen.hayMongo() ? 'mongodb' : 'memoria',
    retencionDias: almacen.DIAS_RETENCION,
  })
})

// ── Versiones desplegadas ────────────────────────────────────────────────────

/**
 * Qué versión de cada app está viendo la gente de verdad.
 *
 * Es el dato que falta casi siempre cuando algo se rompe: no basta con saber
 * que se publicó la 1.4.0, hay que saber cuánta gente la tiene ya. Con
 * actualizaciones por aire, esa curva se mueve en horas.
 */
analiticaRouter.get('/versiones', async (_req, res) => {
  const salida: Record<string, { version: string; usuarios: number }[]> = {}
  if (almacen.hayMongo()) {
    const agg = await almacen.cUsuarios()!.aggregate([
      { $group: { _id: { app: '$app', version: '$version' }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]).toArray()
    for (const r of agg) {
      const a = r._id.app
      ;(salida[a] ??= []).push({ version: r._id.version ?? '0', usuarios: r.n })
    }
  } else {
    const cuenta = new Map<string, number>()
    for (const u of almacen.memoria.usuarios.values()) {
      const k = `${u.app}|${u.version}`
      cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
    }
    for (const [k, n] of cuenta) {
      const [a, v] = k.split('|')
      ;(salida[a] ??= []).push({ version: v, usuarios: n })
    }
    for (const a of Object.keys(salida)) salida[a].sort((x, y) => y.usuarios - x.usuarios)
  }
  res.json({ versiones: salida })
})

/** Rota la clave pública de ingesta de una app. La anterior deja de reportar. */
analiticaRouter.post('/apps/:id/clave-publica', exigePermiso('analitica.gestionar'), (req, res) => {
  const nueva = rotarPublica(req.params.id, req.operador!.email)
  if (!nueva) return res.status(404).json({ error: 'No hay ninguna aplicación con ese id' })
  res.json({ clavePublica: nueva })
})

/** El padrón declarado por cada app, tal cual lo mandaron. */
analiticaRouter.get('/censo', async (_req, res) => {
  res.json({ censo: await leerCenso() })
})
