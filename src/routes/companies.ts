import { Router } from 'express'
import { randomUUID } from 'crypto'
import { db } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { categoryBySlug } from '../data/categories.js'
import { countryBySlug } from '../data/locations.js'
import { defaultHours } from '../data/seed.js'
import type { Company, CompanySocials, KycDocument, WeekHours } from '../types.js'

export const companiesRouter = Router()

companiesRouter.get('/', (req, res) => {
  const { country, city, category, q, verified } = req.query as Record<string, string | undefined>
  const list = db.listCompanies({
    country,
    city,
    category,
    q,
    verifiedOnly: verified === 'true',
  })
  res.json({ companies: list })
})

companiesRouter.get('/mine', requireAuth, (req, res) => {
  const company = db.findCompanyByOwner(req.userId!)
  res.json({ company: company ?? null })
})

companiesRouter.get('/:id', (req, res) => {
  const company = db.findCompanyById(req.params.id)
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  res.json({ company })
})

function validateCompanyPayload(body: Record<string, unknown>): string | null {
  const required = ['legalName', 'tradeName', 'taxId', 'categorySlug', 'countrySlug', 'citySlug', 'address']
  for (const field of required) {
    if (!body[field] || typeof body[field] !== 'string' || (body[field] as string).trim() === '') {
      return `El campo "${field}" es requerido`
    }
  }
  if (!categoryBySlug.has(body.categorySlug as string)) return 'Categoría inválida'
  const country = countryBySlug.get(body.countrySlug as string)
  if (!country) return 'País inválido'
  if (!country.cities.some((c) => c.slug === body.citySlug)) return 'Ciudad inválida'
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') return 'Ubicación en el mapa es requerida'
  return null
}

/**
 * Una dirección de la cadena 8532: 0x y 40 hexadecimales.
 *
 * Se valida la forma, no que exista. Si el comercio se equivoca en un carácter
 * el dinero se va a una dirección que nadie controla y no vuelve — así que al
 * guardarla la app le enseña los últimos cuatro para que los compare.
 */
function direccionValida(v: unknown): boolean {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim())
}

companiesRouter.post('/', requireAuth, (req, res) => {
  if (db.findCompanyByOwner(req.userId!)) {
    res.status(409).json({ error: 'Ya tienes una empresa registrada' })
    return
  }

  const body = req.body as Record<string, unknown>
  const error = validateCompanyPayload(body)
  if (error) {
    res.status(400).json({ error })
    return
  }

  const company = db.createCompany({
    ownerId: req.userId!,
    legalName: (body.legalName as string).trim(),
    tradeName: (body.tradeName as string).trim(),
    taxId: (body.taxId as string).trim(),
    categorySlug: body.categorySlug as string,
    productsServices: Array.isArray(body.productsServices) ? (body.productsServices as string[]) : [],
    countrySlug: body.countrySlug as string,
    citySlug: body.citySlug as string,
    address: (body.address as string).trim(),
    lat: body.lat as number,
    lng: body.lng as number,
    description: typeof body.description === 'string' ? body.description : '',
    logoDataUrl: typeof body.logoDataUrl === 'string' ? body.logoDataUrl : null,
    walletAddress: direccionValida(body.walletAddress) ? (body.walletAddress as string) : null,
    coverDataUrl: typeof body.coverDataUrl === 'string' ? body.coverDataUrl : null,
    gallery: Array.isArray(body.gallery) ? (body.gallery as string[]) : [],
    socials: (body.socials as CompanySocials) ?? {},
    hours: (body.hours as WeekHours) ?? defaultHours,
    acceptsOrigen: true,
  })

  db.setUserRole(req.userId!, 'business')
  res.status(201).json({ company })
})

companiesRouter.put('/:id', requireAuth, (req, res) => {
  const existing = db.findCompanyById(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  if (existing.ownerId !== req.userId) {
    res.status(403).json({ error: 'No tienes permiso para editar esta empresa' })
    return
  }

  const body = req.body as Partial<Company>
  const patch: Partial<Company> = {}
  const editable: (keyof Company)[] = [
    'tradeName',
    'legalName',
    'taxId',
    'categorySlug',
    'productsServices',
    'countrySlug',
    'citySlug',
    'address',
    'lat',
    'lng',
    'description',
    'logoDataUrl',
    'coverDataUrl',
    'gallery',
    'socials',
    'hours',
    'acceptsOrigen',
  ]
  // La dirección de cobro va aparte de la lista blanca: se valida su forma,
  // porque un carácter mal escrito manda el dinero a un pozo sin fondo.
  if (body.walletAddress !== undefined) {
    if (body.walletAddress === null || body.walletAddress === '') {
      patch.walletAddress = null
    } else if (direccionValida(body.walletAddress)) {
      patch.walletAddress = String(body.walletAddress).trim()
    } else {
      res.status(400).json({
        error: 'La dirección no tiene la forma correcta',
        detalle: 'Debe empezar por 0x y tener 40 caracteres después.',
      })
      return
    }
  }
  for (const key of editable) {
    if (body[key] !== undefined) {
      // @ts-expect-error narrow assignment across a whitelisted key set
      patch[key] = body[key]
    }
  }

  const updated = db.updateCompany(existing.id, patch)
  res.json({ company: updated })
})

companiesRouter.post('/:id/kyc', requireAuth, (req, res) => {
  const existing = db.findCompanyById(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  if (existing.ownerId !== req.userId) {
    res.status(403).json({ error: 'No tienes permiso para verificar esta empresa' })
    return
  }

  const { documents } = req.body as { documents?: { label: string; dataUrl: string }[] }
  if (!documents || documents.length === 0) {
    res.status(400).json({ error: 'Debes adjuntar al menos un documento' })
    return
  }

  const now = new Date().toISOString()
  const kycDocuments: KycDocument[] = documents.map((doc) => ({
    id: randomUUID(),
    label: doc.label,
    dataUrl: doc.dataUrl,
    uploadedAt: now,
  }))

  const updated = db.updateCompany(existing.id, {
    kyc: {
      status: 'pending',
      documents: kycDocuments,
      submittedAt: now,
      reviewedAt: null,
      note: null,
    },
  })
  res.json({ company: updated })
})
