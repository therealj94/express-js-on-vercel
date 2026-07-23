import { Router } from 'express'
import {
  startIdentity,
  getIdentity,
  findIdentityByEmail,
  advanceStep,
  processIdentity,
  sendToReview,
  retryScan,
} from '../engine.js'

export const identitiesRouter = Router()

// Crear o retomar una identidad a partir del correo (reanuda donde quedó).
identitiesRouter.post('/', (req, res) => {
  const { email, fullName } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Correo válido requerido' })
  }
  const identity = startIdentity(email, typeof fullName === 'string' ? fullName : undefined)
  res.json({ identity })
})

identitiesRouter.get('/by-email/:email', (req, res) => {
  const identity = findIdentityByEmail(req.params.email)
  if (!identity) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identity })
})

identitiesRouter.get('/:id', (req, res) => {
  const identity = getIdentity(req.params.id)
  if (!identity) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identity })
})

// Capturas (documento/rostro): avanzan la máquina de estados.
identitiesRouter.post('/:id/capture', (req, res) => {
  const identity = advanceStep(req.params.id)
  if (!identity) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identity })
})

identitiesRouter.post('/:id/process', (req, res) => {
  const identity = processIdentity(req.params.id)
  if (!identity) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identity })
})

identitiesRouter.post('/:id/review', (req, res) => {
  const identity = sendToReview(req.params.id)
  if (!identity) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identity })
})

identitiesRouter.post('/:id/retry', (req, res) => {
  const identity = retryScan(req.params.id)
  if (!identity) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identity })
})
