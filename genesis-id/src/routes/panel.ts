// Rutas del panel de cumplimiento. Todas exigen sesión de operador y el
// permiso que corresponda al rol.

import { Router } from 'express'
import { exigeOperador, exigePermiso } from '../middleware/proteger.js'
import { store } from '../store.js'
import * as ids from '../motor/identidades.js'
import * as biz from '../motor/negocios.js'
import * as casos from '../aml/casos.js'
import {
  cargarListas, estadoListas, buscar as buscarEnListas,
  importarDeOfac, importarTexto, cargarDesdeMongo,
} from '../aml/listas.js'
import { consultar, verificarCadena, anclaje, registrar } from '../audit/bitacora.js'
import { crearOperador, PERMISOS } from '../auth/operadores.js'
import { crearAplicacion, revocar, rotar, ALCANCES } from '../auth/aplicaciones.js'
import { biometriaConfigurada, proveedorBiometria } from '../kyc/biometria.js'
import { estadoGafi, aplicarGafi, guardarGafiEnMongo, fechaListasGafi, diasDesdeActualizacion } from '../aml/paises.js'
import { DOCUMENTOS_EXIGIDOS, UMBRAL_UBO } from '../motor/negocios.js'
import type { Rol } from '../types.js'

export const panelRouter = Router()

panelRouter.use(exigeOperador)

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/resumen', (_req, res) => {
  const d = store.todo()
  const porEstado = (estado: string) => d.identidades.filter((i) => i.estado === estado).length

  res.json({
    identidades: {
      total: d.identidades.length,
      verificadas: porEstado('verificada'),
      enRevision: porEstado('en-revision') + porEstado('biometria') + porEstado('documento'),
      rechazadas: porEstado('rechazada'),
      suspendidas: porEstado('suspendida'),
      sinTerminar: porEstado('iniciada') + porEstado('datos'),
      riesgoAlto: d.identidades.filter((i) => i.riesgo?.nivel === 'alto' || i.riesgo?.nivel === 'inaceptable').length,
      pep: d.identidades.filter((i) => i.pep).length,
    },
    negocios: {
      total: d.negocios.length,
      verificados: d.negocios.filter((n) => n.estado === 'verificado').length,
      enRevision: d.negocios.filter((n) => n.estado === 'documentos' || n.estado === 'en-revision').length,
      rechazados: d.negocios.filter((n) => n.estado === 'rechazado').length,
    },
    casos: casos.resumenCasos(),
    movimientos: {
      total: d.movimientos.length,
      volumenUsd: d.movimientos.reduce((s, m) => s + m.montoUsd, 0),
    },
    // Este bloque es el que dice si el sistema está en condiciones de operar.
    salud: {
      almacen: store.estado(),
      listas: estadoListas(),
      biometria: biometriaConfigurada() ? proveedorBiometria() : 'sin proveedor',
      listasGafi: estadoGafi(),
      bitacora: verificarCadena(),
      apps: d.aplicaciones.filter((a) => a.activa).length,
      sso: Boolean(process.env.GENESIS_SSO_SECRETO),
    },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Identidades
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/identidades', exigePermiso('identidad.ver'), (req, res) => {
  const { estado, riesgo, texto } = req.query as Record<string, string>
  const t = (texto || '').toLowerCase()
  const lista = store.todo().identidades
    .filter((i) =>
      (!estado || i.estado === estado) &&
      (!riesgo || i.riesgo?.nivel === riesgo) &&
      (!t || i.email.includes(t) || (i.nombreLegal || '').toLowerCase().includes(t) ||
        (i.nombreDeclarado || '').toLowerCase().includes(t) || (i.gid || '').toLowerCase().includes(t)))
    .sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn))
    .slice(0, 300)
    .map((i) => ({
      id: i.id, email: i.email, gid: i.gid, estado: i.estado,
      nombre: i.nombreLegal ?? i.nombreDeclarado,
      nacionalidad: i.nacionalidad,
      riesgo: i.riesgo?.nivel ?? null,
      puntuacion: i.riesgo?.puntuacion ?? null,
      bloqueos: i.riesgo?.bloqueos.length ?? 0,
      coincidencias: i.tamiz?.coincidencias.length ?? 0,
      pep: i.pep,
      apps: i.vinculos.map((v) => v.app),
      actualizadaEn: i.actualizadaEn,
    }))
  res.json({ identidades: lista, total: lista.length })
})

/** Ficha completa. Es la vista donde el operador decide, así que va todo. */
panelRouter.get('/identidades/:id', exigePermiso('identidad.ver'), (req, res) => {
  const i = ids.porId(req.params.id)
  if (!i) return res.status(404).json({ error: 'Identidad no encontrada' })
  ids.recalcularRiesgo(i)
  res.json({ identidad: i })
})

panelRouter.post('/identidades/:id/aprobar', exigePermiso('identidad.aprobar'), async (req, res) => {
  const { motivo, anulacion } = req.body ?? {}
  const r = await ids.aprobar(req.params.id, req.operador!, String(motivo || ''), anulacion ? String(anulacion) : undefined)
  if (!r.ok) return res.status(400).json({ error: r.motivo, bloqueos: r.bloqueos })
  res.json({ ok: true, gid: r.identidad!.gid, identidad: r.identidad })
})

panelRouter.post('/identidades/:id/rechazar', exigePermiso('identidad.rechazar'), async (req, res) => {
  const r = await ids.rechazar(req.params.id, req.operador!, String(req.body?.motivo || ''))
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, identidad: r.identidad })
})

panelRouter.post('/identidades/:id/suspender', exigePermiso('identidad.suspender'), async (req, res) => {
  const r = await ids.suspender(req.params.id, req.operador!, String(req.body?.motivo || 'Sin motivo'))
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, identidad: r.identidad })
})

panelRouter.post('/identidades/:id/revision', exigePermiso('identidad.revisar'), (req, res) => {
  const i = ids.enviarARevision(req.params.id, req.operador!.email, String(req.body?.motivo || ''))
  if (!i) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ ok: true, identidad: i })
})

/** Cotejo del rostro hecho por una persona, mientras no haya proveedor. */
panelRouter.post('/identidades/:id/biometria', exigePermiso('identidad.revisar'), (req, res) => {
  const { coincide, nota } = req.body ?? {}
  if (typeof coincide !== 'boolean') {
    return res.status(400).json({ error: 'Hace falta indicar si el rostro coincide (true/false)' })
  }
  const i = ids.resolverBiometriaManual(req.params.id, req.operador!, coincide, nota)
  if (!i) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ ok: true, identidad: i })
})

/**
 * Reinicia una verificación para que la persona la rehaga.
 *
 * No borra el expediente —en cumplimiento no se borra— sino que limpia lo que
 * hay que volver a aportar. Exige el permiso de revisar y un motivo escrito.
 */
panelRouter.post('/identidades/:id/reiniciar', exigePermiso('identidad.revisar'), (req, res) => {
  const motivo = String(req.body?.motivo || '').trim()
  if (motivo.length < 8) {
    return res.status(400).json({ error: 'Hace falta un motivo escrito para reiniciar una verificación' })
  }
  const i = ids.reiniciar(req.params.id, req.operador!, motivo)
  if (!i) {
    return res.status(400).json({
      error: 'No se encontró la identidad, o ya está verificada (habría que suspenderla primero)',
    })
  }
  res.json({ ok: true, identidad: i })
})

panelRouter.post('/identidades/:id/pep', exigePermiso('identidad.revisar'), (req, res) => {
  const { pep, nota } = req.body ?? {}
  const i = ids.marcarPep(req.params.id, req.operador!, Boolean(pep), String(nota || ''))
  if (!i) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ ok: true, identidad: i })
})

// ─────────────────────────────────────────────────────────────────────────────
// Negocios
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/negocios', exigePermiso('negocio.ver'), (req, res) => {
  const { estado } = req.query as Record<string, string>
  const lista = store.todo().negocios
    .filter((n) => !estado || n.estado === estado)
    .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))
    .map((n) => ({
      id: n.id, gid: n.gid, razonSocial: n.razonSocial, nombreComercial: n.nombreComercial,
      pais: n.pais, estado: n.estado, categoria: n.categoria,
      riesgo: n.riesgo?.nivel ?? null,
      bloqueos: n.riesgo?.bloqueos.length ?? 0,
      beneficiarios: n.beneficiarios.length,
      documentosPendientes: n.documentos.filter((d) => !d.recibidoEn).length,
      actualizadoEn: n.actualizadoEn,
    }))
  res.json({ negocios: lista, umbralUbo: UMBRAL_UBO, documentosExigidos: DOCUMENTOS_EXIGIDOS })
})

panelRouter.get('/negocios/:id', exigePermiso('negocio.ver'), (req, res) => {
  const n = biz.porId(req.params.id)
  if (!n) return res.status(404).json({ error: 'Negocio no encontrado' })
  biz.recalcular(n)
  res.json({ negocio: n })
})

panelRouter.post('/negocios/:id/documento', exigePermiso('negocio.revisar'), (req, res) => {
  const { clave, referencia } = req.body ?? {}
  const n = biz.recibirDocumento(req.params.id, String(clave || ''), String(referencia || ''), req.operador!.email)
  if (!n) return res.status(404).json({ error: 'Negocio o documento no encontrado' })
  res.json({ ok: true, negocio: n })
})

panelRouter.post('/negocios/:id/aprobar', exigePermiso('negocio.aprobar'), async (req, res) => {
  const { motivo, anulacion } = req.body ?? {}
  const r = await biz.aprobarNegocio(req.params.id, req.operador!, String(motivo || ''), anulacion ? String(anulacion) : undefined)
  if (!r.ok) return res.status(400).json({ error: r.motivo, bloqueos: r.bloqueos })
  res.json({ ok: true, gid: r.negocio!.gid, negocio: r.negocio })
})

panelRouter.post('/negocios/:id/rechazar', exigePermiso('negocio.rechazar'), async (req, res) => {
  const r = await biz.rechazarNegocio(req.params.id, req.operador!, String(req.body?.motivo || ''))
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, negocio: r.negocio })
})

// ─────────────────────────────────────────────────────────────────────────────
// Casos
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/casos', exigePermiso('caso.ver'), (req, res) => {
  const { estado, gravedad } = req.query as Record<string, string>
  res.json({ casos: casos.listarCasos({ estado: estado as any, gravedad }) })
})

panelRouter.get('/casos/:id', exigePermiso('caso.ver'), (req, res) => {
  const c = casos.porIdCaso(req.params.id)
  if (!c) return res.status(404).json({ error: 'Caso no encontrado' })
  res.json({ caso: c })
})

panelRouter.post('/casos/:id/asignar', exigePermiso('caso.gestionar'), (req, res) => {
  const c = casos.asignar(req.params.id, req.operador!, String(req.body?.a || req.operador!.email))
  if (!c) return res.status(404).json({ error: 'Caso no encontrado' })
  res.json({ ok: true, caso: c })
})

panelRouter.post('/casos/:id/nota', exigePermiso('caso.gestionar'), (req, res) => {
  const c = casos.anotar(req.params.id, req.operador!, String(req.body?.texto || ''))
  if (!c) return res.status(400).json({ error: 'Caso no encontrado o nota vacía' })
  res.json({ ok: true, caso: c })
})

panelRouter.post('/casos/:id/cerrar', exigePermiso('caso.reportar'), async (req, res) => {
  const { conReporte, conclusion, referencia } = req.body ?? {}
  const r = await casos.cerrar(req.params.id, req.operador!, Boolean(conReporte), String(conclusion || ''), referencia)
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, caso: r.caso })
})

panelRouter.get('/casos/:id/reporte', exigePermiso('caso.reportar'), (req, res) => {
  const borrador = casos.borradorReporte(req.params.id)
  if (!borrador) return res.status(404).json({ error: 'Caso no encontrado' })
  registrar(req.operador!.email, 'caso.reporteGenerado', req.params.id, {})
  res.json(borrador)
})

// ─────────────────────────────────────────────────────────────────────────────
// Listas
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/listas', exigePermiso('listas.ver'), (_req, res) => {
  res.json({ estado: estadoListas(), gafi: estadoGafi() })
})

/**
 * Sustituye las listas del GAFI sin desplegar nada.
 *
 * Se pide `listas.recargar` porque cambiar esto cambia el riesgo de cada país:
 * quitar un código de aquí es dejar de marcar a todo un país, y eso tiene que
 * quedar firmado en la bitácora con nombre y apellido.
 *
 *   { "fecha": "2026-06-19", "altoRiesgo": ["IRN","PRK","MMR"], "vigilancia": ["AGO", ...] }
 */
panelRouter.post('/listas/gafi', exigePermiso('listas.recargar'), async (req, res) => {
  const antes = estadoGafi()
  const r = aplicarGafi(req.body ?? {}, `panel:${req.operador!.email}`, req.operador!.email)
  if (!r.ok) return res.status(400).json({ error: r.error, desconocidos: r.desconocidos })

  const guardadas = await guardarGafiEnMongo(req.operador!.email).catch(() => false)
  const ahora = estadoGafi()
  const salieron = antes.vigilancia.filter((c) => !ahora.vigilancia.includes(c))
  const entraron = ahora.vigilancia.filter((c) => !antes.vigilancia.includes(c))

  registrar(req.operador!.email, 'listas.gafi', 'gafi', {
    fecha: ahora.fecha, entraron, salieron, persistidas: guardadas,
  })
  res.json({
    gafi: ahora,
    cambios: { entraron, salieron },
    // Si no hay Mongo, esto se pierde en el próximo despliegue y hay que
    // decirlo: creer que quedó guardado y que no sea así es peor que no tenerlo.
    persistidas: guardadas,
    aviso: guardadas ? undefined
      : 'No hay almacén persistente: estas listas se pierden en el próximo reinicio',
  })
})

panelRouter.get('/listas/buscar', exigePermiso('listas.ver'), (req, res) => {
  res.json({ resultados: buscarEnListas(String(req.query.q || '')) })
})

/** Recarga desde el almacen (Mongo, o la carpeta) y vuelve a tamizar a todos. */
panelRouter.post('/listas/recargar', exigePermiso('listas.recargar'), async (req, res) => {
  const deMongo = await cargarDesdeMongo().catch(() => 0)
  const cargados = deMongo > 0 ? deMongo : cargarListas()
  const r = ids.retamizarTodas(req.operador!.email)
  registrar(req.operador!.email, 'listas.recargadas', 'listas', { registros: cargados, ...r })
  res.json({ ok: true, registros: cargados, ...r, estado: estadoListas() })
})

/**
 * Baja la lista de la OFAC, la guarda y vuelve a tamizar a todo el mundo.
 *
 * Es la via normal para poner el tamizado en marcha: no hace falta subir
 * archivos ni montar discos. Puede tardar un minuto — son varios megabytes y
 * unas 17 000 fichas que hay que insertar e indexar.
 */
panelRouter.post('/listas/ofac', exigePermiso('listas.recargar'), async (req, res) => {
  try {
    const r = await importarDeOfac()
    // Retamizar despues de cargar es lo que convierte esto en algo util: si
    // alguien ya registrado esta en la lista, aparece ahora, no la proxima vez
    // que toque su expediente.
    const t = ids.retamizarTodas(req.operador!.email)
    registrar(req.operador!.email, 'listas.ofac', 'listas', { ...r, ...t })
    res.json({ ok: true, ...r, ...t, estado: estadoListas() })
  } catch (e: any) {
    res.status(502).json({ error: `No se pudo traer la lista de la OFAC: ${e.message}` })
  }
})

/** Importa una lista propia pegada como texto (JSON o CSV con formato OFAC). */
panelRouter.post('/listas/importar', exigePermiso('listas.recargar'), async (req, res) => {
  const { texto, fuente } = req.body ?? {}
  if (!texto || !fuente) return res.status(400).json({ error: 'Hacen falta el texto y el nombre de la fuente' })
  try {
    const r = await importarTexto(String(texto), String(fuente))
    const t = ids.retamizarTodas(req.operador!.email)
    registrar(req.operador!.email, 'listas.importadas', String(fuente), { ...r, ...t })
    res.json({ ok: true, ...r, ...t, estado: estadoListas() })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Bitácora
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/bitacora', exigePermiso('bitacora.ver'), (req, res) => {
  const { actor, accion, objeto, limite } = req.query as Record<string, string>
  res.json({
    entradas: consultar({ actor, accion, objeto, limite: limite ? Number(limite) : 200 }),
    cadena: verificarCadena(),
    anclaje: anclaje(),
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Operadores y aplicaciones (solo admin)
// ─────────────────────────────────────────────────────────────────────────────

panelRouter.get('/operadores', exigePermiso('*'), (_req, res) => {
  res.json({
    operadores: store.todo().operadores.map((o) => ({
      id: o.id, email: o.email, nombre: o.nombre, rol: o.rol, activo: o.activo,
      ultimoAcceso: o.ultimoAcceso, debeCambiarContrasena: o.debeCambiarContrasena,
    })),
    roles: Object.keys(PERMISOS),
    permisos: PERMISOS,
  })
})

panelRouter.post('/operadores', exigePermiso('*'), (req, res) => {
  const { email, nombre, rol, contrasena } = req.body ?? {}
  if (!email || !nombre || !rol || !contrasena) {
    return res.status(400).json({ error: 'Faltan email, nombre, rol y contraseña' })
  }
  if (!PERMISOS[rol as Rol]) return res.status(400).json({ error: `Rol desconocido: ${rol}` })
  if (String(contrasena).length < 12) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres' })
  }
  try {
    const o = crearOperador({ email, nombre, rol, contrasena })
    registrar(req.operador!.email, 'operador.creado', o.email, { rol })
    res.json({ ok: true, operador: { id: o.id, email: o.email, rol: o.rol } })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

panelRouter.post('/operadores/:id/activo', exigePermiso('*'), (req, res) => {
  const o = store.todo().operadores.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Operador no encontrado' })
  if (o.id === req.operador!.id) {
    return res.status(400).json({ error: 'No puede desactivarse a sí mismo' })
  }
  o.activo = Boolean(req.body?.activo)
  // Al desactivar se cierran sus sesiones en el acto.
  if (!o.activo) store.todo().sesiones = store.todo().sesiones.filter((s) => s.operadorId !== o.id)
  store.guardar()
  registrar(req.operador!.email, 'operador.activo', o.email, { activo: o.activo })
  res.json({ ok: true })
})

panelRouter.get('/aplicaciones', exigePermiso('*'), (_req, res) => {
  res.json({
    aplicaciones: store.todo().aplicaciones.map((a) => ({
      id: a.id, clave: a.clave, nombre: a.nombre, pistaClave: a.pistaClave,
      alcances: a.alcances, activa: a.activa, creadaEn: a.creadaEn, ultimoUso: a.ultimoUso,
    })),
    alcancesDisponibles: ALCANCES,
  })
})

panelRouter.post('/aplicaciones', exigePermiso('*'), (req, res) => {
  const { clave, nombre, alcances } = req.body ?? {}
  if (!clave || !nombre || !Array.isArray(alcances)) {
    return res.status(400).json({ error: 'Faltan clave, nombre y alcances' })
  }
  const { aplicacion, clave_secreta } = crearAplicacion(String(clave), String(nombre), alcances)
  registrar(req.operador!.email, 'aplicacion.creada', aplicacion.clave, { alcances })
  // La clave se enseña aquí y nunca más.
  res.json({ ok: true, aplicacion: { id: aplicacion.id, clave: aplicacion.clave }, clave_secreta })
})

panelRouter.post('/aplicaciones/:id/rotar', exigePermiso('*'), (req, res) => {
  const secreta = rotar(req.params.id, req.operador!.email)
  if (!secreta) return res.status(404).json({ error: 'Aplicación no encontrada' })
  res.json({ ok: true, clave_secreta: secreta })
})

panelRouter.post('/aplicaciones/:id/revocar', exigePermiso('*'), (req, res) => {
  if (!revocar(req.params.id, req.operador!.email)) {
    return res.status(404).json({ error: 'Aplicación no encontrada' })
  }
  res.json({ ok: true })
})
