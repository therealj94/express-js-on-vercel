import { Router } from 'express'
import { categories } from '../data/categories.js'
import { countries } from '../data/locations.js'

export const metaRouter = Router()

metaRouter.get('/categories', (_req, res) => {
  res.json({ categories })
})

metaRouter.get('/countries', (_req, res) => {
  res.json({ countries })
})
