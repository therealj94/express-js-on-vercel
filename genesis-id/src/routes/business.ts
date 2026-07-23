import { Router } from 'express'
import { registerBusiness, getBusiness, findBusinessByOwner, reviewBusiness } from '../engine.js'
import type { BusinessStatus } from '../types.js'

export const businessRouter = Router()

const REQUIRED = ['ownerEmail', 'legalName', 'tradeName', 'taxId', 'category', 'country', 'city', 'address'] as const

businessRouter.post('/', (req, res) => {
  const body = req.body ?? {}
  for (const field of REQUIRED) {
    if (!body[field] || typeof body[field] !== 'string') {
      return res.status(400).json({ error: `Campo requerido: ${field}` })
    }
  }
  const record = registerBusiness({
    ownerEmail: body.ownerEmail,
    legalName: body.legalName,
    tradeName: body.tradeName,
    taxId: body.taxId,
    category: body.category,
    country: body.country,
    city: body.city,
    address: body.address,
  })
  res.json({ business: record })
})

businessRouter.get('/by-owner/:email', (req, res) => {
  const record = findBusinessByOwner(req.params.email)
  if (!record) return res.status(404).json({ error: 'Negocio no encontrado' })
  res.json({ business: record })
})

businessRouter.get('/:id', (req, res) => {
  const record = getBusiness(req.params.id)
  if (!record) return res.status(404).json({ error: 'Negocio no encontrado' })
  res.json({ business: record })
})

// Revisión KYB (aprobar/rechazar) — usada por el panel admin.
businessRouter.post('/:id/review', (req, res) => {
  const status = req.body?.status as BusinessStatus
  if (status !== 'verified' && status !== 'rejected') {
    return res.status(400).json({ error: 'status debe ser "verified" o "rejected"' })
  }
  const record = reviewBusiness(req.params.id, status, req.body?.note)
  if (!record) return res.status(404).json({ error: 'Negocio no encontrado' })
  res.json({ business: record })
})
