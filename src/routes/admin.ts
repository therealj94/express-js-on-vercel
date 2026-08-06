// ─────────────────────────────────────────────────────────────────────────────
// Panel de administración de Orden Global.
//
// Es quien paga los retiros: ve la cola, hace la transferencia en el banco y la
// marca como hecha. Es también quien aprueba o rechaza la verificación de un
// negocio.
//
// Dos reglas que no se negocian:
//
//   · Solo aquí se ven los datos bancarios completos, y solo del retiro que se
//     está pagando. En el resto del sistema el número de cuenta viaja tapado.
//     El POS anterior los servía en abierto y sin contraseña — de ahí sale esta
//     regla.
//
//   · Toda resolución queda con nombre y fecha. Si mañana hay que explicar por
//     qué un comercio no cobró, la respuesta tiene que estar escrita.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { db } from '../lib/db.js'
import { caja } from '../lib/caja.js'
import { cotizacion } from '../lib/tasas.js'

export const adminRouter = Router()

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const usuario = db.findUserById(req.userId!)
  if (usuario?.role !== 'admin') {
    // Se responde 404 y no 403: a quien no es administrador no hace falta
    // confirmarle que este panel existe.
    res.status(404).json({ error: 'Ruta no encontrada' })
    return
  }
  next()
}

adminRouter.use(requireAuth, requireAdmin)

// ── Resumen ──────────────────────────────────────────────────────────────────

adminRouter.get('/resumen', async (_req, res) => {
  const pendientes = caja.listarRetiros({ estado: 'solicitado' })
  const enProceso = caja.listarRetiros({ estado: 'en_proceso' })
  const negocios = db.listCompanies({})

  let tasa = null
  try {
    tasa = await cotizacion()
  } catch {
    // El resumen se puede dar sin cotización; los lempiras, no.
  }

  res.json({
    retiros: {
      solicitados: pendientes.length,
      enProceso: enProceso.length,
      origenPorPagar: Math.round(
        [...pendientes, ...enProceso].reduce((s, r) => s + r.montoOrigen, 0) * 1e6,
      ) / 1e6,
      lempirasPorPagar: [...pendientes, ...enProceso].reduce((s, r) => s + r.montoHnl, 0),
    },
    negocios: {
      total: negocios.length,
      verificados: negocios.filter((n) => n.kyc.status === 'verified').length,
      enRevision: negocios.filter((n) => n.kyc.status === 'pending').length,
      rechazados: negocios.filter((n) => n.kyc.status === 'rejected').length,
    },
    tasa,
  })
})

// ── Retiros ──────────────────────────────────────────────────────────────────

adminRouter.get('/retiros', (req, res) => {
  const estado = req.query.estado as any
  const retiros = caja.listarRetiros(estado ? { estado } : {}).map((r) => {
    const negocio = db.findCompanyById(r.companyId)
    return {
      ...r,
      negocio: negocio ? { id: negocio.id, nombre: negocio.tradeName, verificado: negocio.verified } : null,
    }
  })
  res.json({ retiros })
})

adminRouter.post('/retiros/:id/estado', (req, res) => {
  const { estado, nota } = req.body as { estado?: string; nota?: string }
  const validos = ['en_proceso', 'pagado', 'rechazado']
  if (!estado || !validos.includes(estado)) {
    res.status(400).json({ error: `El estado tiene que ser uno de: ${validos.join(', ')}` })
    return
  }
  if (estado === 'rechazado' && !String(nota || '').trim()) {
    // Un rechazo sin motivo escrito deja al comercio sin saber qué corregir.
    res.status(400).json({ error: 'Para rechazar hay que escribir el motivo' })
    return
  }

  const retiro = caja.resolverRetiro(req.params.id, estado as any, req.userId!, nota)
  if (!retiro) {
    res.status(404).json({ error: 'Retiro no encontrado' })
    return
  }
  res.json({ retiro })
})

// ── Verificación de negocios ─────────────────────────────────────────────────

adminRouter.get('/negocios', (req, res) => {
  const estado = req.query.estado as string | undefined
  const negocios = db
    .listCompanies({})
    .filter((n) => (estado ? n.kyc.status === estado : true))
    .map((n) => ({
      id: n.id,
      nombre: n.tradeName,
      razonSocial: n.legalName,
      rtn: n.taxId,
      pais: n.countrySlug,
      ciudad: n.citySlug,
      categoria: n.categorySlug,
      kyc: { ...n.kyc, documents: n.kyc.documents.map((d) => ({ id: d.id, label: d.label, uploadedAt: d.uploadedAt })) },
      verificado: n.verified,
      saldo: caja.saldo(n.id),
      creadoEn: n.createdAt,
    }))
  res.json({ negocios })
})

/** El documento se sirve de uno en uno y solo al administrador que lo revisa. */
adminRouter.get('/negocios/:id/documento/:docId', (req, res) => {
  const negocio = db.findCompanyById(req.params.id)
  const doc = negocio?.kyc.documents.find((d) => d.id === req.params.docId)
  if (!doc) {
    res.status(404).json({ error: 'Documento no encontrado' })
    return
  }
  res.json({ documento: doc })
})

adminRouter.post('/negocios/:id/resolver', (req, res) => {
  const { decision, nota } = req.body as { decision?: 'verificar' | 'rechazar'; nota?: string }
  const negocio = db.findCompanyById(req.params.id)
  if (!negocio) {
    res.status(404).json({ error: 'Negocio no encontrado' })
    return
  }
  if (decision !== 'verificar' && decision !== 'rechazar') {
    res.status(400).json({ error: 'La decisión tiene que ser «verificar» o «rechazar»' })
    return
  }
  if (decision === 'rechazar' && !String(nota || '').trim()) {
    res.status(400).json({ error: 'Para rechazar hay que escribir el motivo' })
    return
  }

  const actualizado = db.updateCompany(negocio.id, {
    verified: decision === 'verificar',
    kyc: {
      ...negocio.kyc,
      status: decision === 'verificar' ? 'verified' : 'rejected',
      reviewedAt: new Date().toISOString(),
      note: nota ?? null,
    },
  })

  res.json({ negocio: actualizado })
})
