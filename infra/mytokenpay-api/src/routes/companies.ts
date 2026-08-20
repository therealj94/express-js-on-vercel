import { Router } from 'express'
import { randomUUID } from 'crypto'
import { db } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { h } from '../lib/ruta.js'
import { categoryBySlug } from '../data/categories.js'
import { countryBySlug } from '../data/locations.js'
import { defaultHours } from '../data/seed.js'
import type { Company, CompanySocials, KycDocument, PlatoMenu, WeekHours } from '../types.js'

export const companiesRouter = Router()

companiesRouter.get('/', h(async (req, res) => {
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

companiesRouter.get('/mine', requireAuth, h(async (req, res) => {
  const company = await db.findCompanyByOwner(req.userId!)
  res.json({ company: company ?? null })
}))

companiesRouter.get('/:id', h(async (req, res) => {
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

/**
 * El menú que manda el dueño, saneado plato por plato.
 *
 * El precio se limita a dos decimales y a un máximo sensato: un cero de más en
 * un plato no debe poder convertirse en un cobro de un millón por error.
 */
function sanearMenu(entrada: unknown): PlatoMenu[] | { error: string } {
  if (!Array.isArray(entrada)) return { error: 'El menú tiene que ser una lista de platos' }
  if (entrada.length > 80) return { error: 'El menú acepta hasta 80 platos' }
  const salida: PlatoMenu[] = []
  for (const p of entrada as Partial<PlatoMenu>[]) {
    const nombre = String(p?.nombre || '').trim().slice(0, 80)
    if (!nombre) return { error: 'Cada plato necesita un nombre' }
    const precio = Math.round(Number(p?.precio) * 100) / 100
    if (!Number.isFinite(precio) || precio <= 0 || precio > 200_000) {
      return { error: `El precio de «${nombre}» no es válido` }
    }
    salida.push({
      id: typeof p?.id === 'string' && p.id ? p.id : randomUUID(),
      nombre,
      descripcion: String(p?.descripcion || '').trim().slice(0, 200),
      precio,
      moneda: p?.moneda === 'USD' ? 'USD' : 'HNL',
    })
  }
  return salida
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

companiesRouter.post('/', requireAuth, h(async (req, res) => {
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
    walletAddress: direccionValida(body.walletAddress) ? (body.walletAddress as string) : null,
    coverDataUrl: typeof body.coverDataUrl === 'string' ? body.coverDataUrl : null,
    gallery: Array.isArray(body.gallery) ? (body.gallery as string[]) : [],
    socials: (body.socials as CompanySocials) ?? {},
    hours: (body.hours as WeekHours) ?? defaultHours,
    acceptsOrigen: true,
  })

  await db.setUserRole(req.userId!, 'business')
  res.status(201).json({ company })
}))

companiesRouter.put('/:id', requireAuth, h(async (req, res) => {
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
    'acceptsOrigen',
  ]
  // El menú va aparte de la lista blanca porque se sanea plato por plato.
  if ((body as any).menu !== undefined) {
    const menu = sanearMenu((body as any).menu)
    if ('error' in menu) {
      res.status(400).json({ error: menu.error })
      return
    }
    patch.menu = menu
  }
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

  const updated = await db.updateCompany(existing.id, patch)
  res.json({ company: updated })
}))

companiesRouter.post('/:id/kyc', requireAuth, h(async (req, res) => {
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
  res.json({ company: updated })
}))
