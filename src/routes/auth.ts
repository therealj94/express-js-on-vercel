import { Router } from 'express'
import { db, toPublicUser } from '../lib/db.js'
import { hashPassword, signResetToken, signToken, verifyPassword, verifyResetToken } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { h } from '../lib/ruta.js'

export const authRouter = Router()

authRouter.post('/signup', h(async (req, res) => {
  const { email, password, fullName } = req.body as {
    email?: string
    password?: string
    fullName?: string
  }

  if (!email || !password || !fullName) {
    res.status(400).json({ error: 'Correo, contraseña y nombre completo son requeridos' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    return
  }
  if (await db.findUserByEmail(email)) {
    res.status(409).json({ error: 'Ya existe una cuenta con este correo' })
    return
  }

  const user = await db.createUser({ email, fullName, passwordHash: hashPassword(password) })
  const token = signToken(user.id)
  res.status(201).json({ token, user: toPublicUser(user) })
}))

authRouter.post('/login', h(async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) {
    res.status(400).json({ error: 'Correo y contraseña son requeridos' })
    return
  }

  const user = await db.findUserByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Credenciales inválidas' })
    return
  }

  const token = signToken(user.id)
  res.json({ token, user: toPublicUser(user) })
}))

authRouter.get('/me', requireAuth, h(async (req, res) => {
  const user = await db.findUserById(req.userId!)
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }
  res.json({ user: toPublicUser(user) })
}))

authRouter.delete('/me', requireAuth, h(async (req, res) => {
  const user = await db.findUserById(req.userId!)
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }
  await db.deleteUser(user.id)
  res.status(204).end()
}))

// No real email delivery exists in this demo backend. In production this endpoint
// would send a reset link by email and always respond generically to avoid leaking
// whether an account exists. Here it responds generically too, but also returns the
// token directly so the mobile app can complete the reset flow end to end without a
// mail provider.
authRouter.post('/forgot-password', h(async (req, res) => {
  const { email } = req.body as { email?: string }
  if (!email) {
    res.status(400).json({ error: 'El correo es requerido' })
    return
  }

  const user = await db.findUserByEmail(email)
  const genericResponse = {
    message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
  }
  if (!user) {
    res.json(genericResponse)
    return
  }

  const resetToken = signResetToken(user.id)
  res.json({ ...genericResponse, demoResetToken: resetToken })
}))

authRouter.post('/reset-password', h(async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string }
  if (!token || !newPassword) {
    res.status(400).json({ error: 'Token y nueva contraseña son requeridos' })
    return
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    return
  }

  const userId = verifyResetToken(token)
  if (!userId || !(await db.findUserById(userId))) {
    res.status(400).json({ error: 'El enlace de restablecimiento no es válido o ha expirado' })
    return
  }

  await db.updateUserPassword(userId, hashPassword(newPassword))
  res.json({ message: 'Contraseña actualizada correctamente' })
}))
