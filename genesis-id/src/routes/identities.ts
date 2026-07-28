import { Router } from 'express'
import {
  startIdentity,
  getIdentity,
  findIdentityByEmail,
  advanceStep,
  processIdentity,
  sendToReview,
  retryScan,
  linkWallet,
} from '../engine.js'

export const identitiesRouter = Router()

// Crear o retomar una identidad a partir del correo (reanuda donde quedó).
// Acepta walletAddress para dejar emparejada la Veta Wallet del usuario.
identitiesRouter.post('/', (req, res) => {
  const { email, fullName, walletAddress } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Correo válido requerido' })
  }
  const identity = startIdentity(
    email,
    typeof fullName === 'string' ? fullName : undefined,
    typeof walletAddress === 'string' && walletAddress.startsWith('0x') ? walletAddress : undefined,
  )
  res.json({ identity })
})

// Emparejar la Veta Wallet (address) con una identidad ya existente.
identitiesRouter.post('/link-wallet', (req, res) => {
  const { email, walletAddress } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Correo válido requerido' })
  }
  if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.startsWith('0x')) {
    return res.status(400).json({ error: 'walletAddress (0x…) requerido' })
  }
  const identity = linkWallet(email, walletAddress)
  if (!identity) return res.status(404).json({ error: 'Identidad no encontrada' })
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
