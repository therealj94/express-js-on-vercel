import { Router } from 'express'
import { envolver } from '../lib/asincrono.js'
import { db, toPublicUser } from '../lib/db.js'
import {
  hashPassword,
  passwordFingerprint,
  readResetToken,
  signResetToken,
  signToken,
  verifyPassword,
} from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

authRouter.post('/signup', envolver(async (req, res) => {
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
  /* El `if` de arriba pierde la carrera cuando dos registros del mismo correo
     llegan a la vez; el índice único de la base no. Aquí se recoge ese caso. */
  if (!user) {
    res.status(409).json({ error: 'Ya existe una cuenta con este correo' })
    return
  }
  const token = signToken(user.id)
  res.status(201).json({ token, user: toPublicUser(user) })
}))

authRouter.post('/login', envolver(async (req, res) => {
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

authRouter.get('/me', requireAuth, envolver(async (req, res) => {
  const user = await db.findUserById(req.userId!)
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }
  res.json({ user: toPublicUser(user) })
}))

authRouter.delete('/me', requireAuth, envolver(async (req, res) => {
  const user = await db.findUserById(req.userId!)
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }
  await db.deleteUser(user.id)
  res.status(204).end()
}))

// Returning the reset token in the response hands any account to whoever knows
// the email address: ask for the reset, read the token off the reply, spend it.
// The token only ever travels back to the caller when EXPOSE_RESET_TOKEN is set
// AND we are not running in production, so a deploy cannot leak it by accident —
// forgetting to unset a variable is a mistake that should fail closed.
//
// There is still no mail provider here, so with the flag off the reset flow has
// no delivery channel. That is the correct failure: better a flow nobody can
// finish than one anybody can finish on someone else's account. Wiring real
// delivery is what makes this endpoint useful in production.
const EXPOSE_RESET_TOKEN =
  process.env.EXPOSE_RESET_TOKEN === '1' &&
  process.env.NODE_ENV !== 'production' &&
  !process.env.VERCEL

authRouter.post('/forgot-password', envolver(async (req, res) => {
  const { email } = req.body as { email?: string }
  if (!email) {
    res.status(400).json({ error: 'El correo es requerido' })
    return
  }

  const user = await db.findUserByEmail(email)
  // The same body either way: a different shape for a registered address would
  // turn this endpoint into a way to check who has an account.
  const genericResponse = {
    message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
  }
  if (!user) {
    res.json(genericResponse)
    return
  }

  const resetToken = signResetToken(user.id, user.passwordHash)
  res.json(EXPOSE_RESET_TOKEN ? { ...genericResponse, demoResetToken: resetToken } : genericResponse)
}))

authRouter.post('/reset-password', envolver(async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string }
  if (!token || !newPassword) {
    res.status(400).json({ error: 'Token y nueva contraseña son requeridos' })
    return
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    return
  }

  const claim = readResetToken(token)
  const user = claim ? await db.findUserById(claim.userId) : null
  // The fingerprint stops a token from being spent twice: the first reset
  // changes the hash, so every link issued before it stops matching.
  if (!claim || !user || claim.passwordFingerprint !== passwordFingerprint(user.passwordHash)) {
    res.status(400).json({ error: 'El enlace de restablecimiento no es válido o ha expirado' })
    return
  }

  await db.updateUserPassword(user.id, hashPassword(newPassword))
  res.json({ message: 'Contraseña actualizada correctamente' })
}))
