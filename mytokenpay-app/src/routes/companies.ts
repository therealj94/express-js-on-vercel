import { Router } from 'express'
import { envolver } from '../lib/asincrono.js'
import { randomUUID } from 'crypto'
import { db } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { anunciarEnGenesis } from './admin.js'
import { categoryBySlug } from '../data/categories.js'
import { countryBySlug } from '../data/locations.js'
import { defaultHours } from '../data/seed.js'
import type { Company, CompanySocials, KycDocument, WeekHours } from '../types.js'

export const companiesRouter = Router()

companiesRouter.get('/', envolver(async (req, res) => {
  const { country, city, category, q, verified } = req.query as Record<string, string | undefined>
  const list = await db.listCompanies({
    country,
    city,
    category,
    q,
    verifiedOnly: verified === 'true',
  })
  res.json({ companies: list })
}))

companiesRouter.get('/mine', requireAuth, envolver(async (req, res) => {
  const company = await db.findCompanyByOwner(req.userId!)
  res.json({ company: company ?? null })
}))

companiesRouter.get('/:id', envolver(async (req, res) => {
  const company = await db.findCompanyById(req.params.id)
  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }
  res.json({ company })
}))

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

companiesRouter.post('/', requireAuth, envolver(async (req, res) => {
  if (await db.findCompanyByOwner(req.userId!)) {
    res.status(409).json({ error: 'Ya tienes una empresa registrada' })
    return
  }

  const body = req.body as Record<string, unknown>
  const error = validateCompanyPayload(body)
  if (error) {
    res.status(400).json({ error })
    return
  }

  const company = await db.createCompany({
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
    coverDataUrl: typeof body.coverDataUrl === 'string' ? body.coverDataUrl : null,
    gallery: Array.isArray(body.gallery) ? (body.gallery as string[]) : [],
    socials: (body.socials as CompanySocials) ?? {},
    hours: (body.hours as WeekHours) ?? defaultHours,
    acceptsOrigen: true,
  })

  await db.setUserRole(req.userId!, 'business')
  res.status(201).json({ company })
}))

companiesRouter.put('/:id', requireAuth, envolver(async (req, res) => {
  const existing = await db.findCompanyById(req.params.id)
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
  ]
  for (const key of editable) {
    if (body[key] !== undefined) {
      // @ts-expect-error narrow assignment across a whitelisted key set
      patch[key] = body[key]
    }
  }

  const updated = await db.updateCompany(existing.id, patch)
  res.json({ company: updated })
}))

companiesRouter.post('/:id/kyc', requireAuth, envolver(async (req, res) => {
  const existing = await db.findCompanyById(req.params.id)
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

  const updated = await db.updateCompany(existing.id, {
    kyc: {
      status: 'pending',
      documents: kycDocuments,
      submittedAt: now,
      reviewedAt: null,
      note: null,
    },
  })

  /* Y que Genesis ID se entere: ahi vive el KYB de verdad del ecosistema, con
     sus documentos exigidos, sus beneficiarios finales y la decision firmada
     por un operador. Va en segundo plano —el tramite no se cae porque el
     sistema de cumplimiento este ocupado— y sin poder lanzar. */
  anunciarEnGenesis(existing.id).catch(() => {})

  res.json({ company: updated })
}))
