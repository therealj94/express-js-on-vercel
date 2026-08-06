import { Router } from 'express'
import { categories } from '../data/categories.js'
import { countries } from '../data/locations.js'
import { cotizacion } from '../lib/tasas.js'

export const metaRouter = Router()

metaRouter.get('/categories', (_req, res) => {
  res.json({ categories })
})

metaRouter.get('/countries', (_req, res) => {
  res.json({ countries })
})

/**
 * La cotización del día: cuántos lempiras vale un ORIGEN y un dólar.
 * Es pública — es el precio del oro, no un secreto — y la app la usa para
 * mostrar menús en dólares o lempiras y convertir al cobrar.
 */
metaRouter.get('/tasa', async (_req, res) => {
  try {
    res.json({ tasa: await cotizacion() })
  } catch {
    res.status(503).json({ error: 'No se pudo consultar el precio de ORIGEN. Intentá en unos segundos.' })
  }
})
