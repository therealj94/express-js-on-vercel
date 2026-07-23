import { Router } from 'express'
import { store } from '../store.js'
import { stats } from '../engine.js'

export const adminRouter = Router()

adminRouter.get('/stats', (_req, res) => {
  res.json(stats())
})

adminRouter.get('/identities', (_req, res) => {
  const items = [...store.all().identities].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  res.json({ identities: items })
})

adminRouter.get('/business', (_req, res) => {
  const items = [...store.all().businesses].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
  res.json({ businesses: items })
})
