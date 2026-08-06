import { Router } from 'express'
import { randomBytes } from 'crypto'
import { db, toPublicUser } from '../lib/db.js'
import { hashPassword, signResetToken, signToken, verifyPassword, verifyResetToken } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { h } from '../lib/ruta.js'
import { llamarGenesis, identidadPorEmail } from '../lib/genesis.js'

export const authRouter = Router()

/**
 * Entrar con Genesis ID.
 *
 * El usuario viene de otra app del ecosistema (Veta Wallet) con un pase de
 * sesión única que Genesis ID firmó. El enlace profundo trae `token` y `email`;
 * el email NO se cree por venir en el enlace — se comprueba contra Genesis ID
 * que ese correo pertenezca exactamente al GID del pase. Sin esa comprobación,
 * cualquiera con un pase válido podría atarse a la cuenta de otra persona con
 * solo escribir su correo.
 *
 * Si el correo no tiene cuenta en MyTokenPay, se crea en el momento: esa es la
 * gracia del inicio de sesión único — el KYC ya está hecho en Genesis ID y no
 * se repite. La cuenta nueva nace sin contraseña utilizable (un azar de 32
 * bytes); si algún día quiere entrar sin Genesis ID, el flujo de «olvidé mi
 * contraseña» le deja fijar una, porque el correo es suyo de verdad.
 */
authRouter.post('/sso', h(async (req, res) => {
  const { token, email } = req.body as { token?: string; email?: string }
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Falta el pase de Genesis ID' })
    return
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'Falta el correo de la identidad' })
    return
  }

  const v = await llamarGenesis('/api/v1/sso/verificar', { method: 'POST', body: JSON.stringify({ token }) })
  if (!v.ok || !v.cuerpo?.valido || !v.cuerpo?.gid) {
    res.status(401).json({ error: v.cuerpo?.error || 'El pase de Genesis ID no es válido o ya venció' })
    return
  }
  const gid: string = v.cuerpo.gid
  const perfil = v.cuerpo.perfil ?? null

  // El correo tiene que ser el de ESA identidad, según Genesis ID.
  const identidad = await identidadPorEmail(email)
  if (!identidad || identidad.gid !== gid) {
    res.status(403).json({ error: 'El correo no corresponde a la identidad del pase' })
    return
  }

  // ¿Ya hay una cuenta atada a este GID? Entra directo.
  let user = await db.findUserByGid(gid)
  if (!user) {
    user = await db.findUserByEmail(email)
    if (user?.gid && user.gid !== gid) {
      // Una cuenta no cambia de identidad en silencio, jamás.
      res.status(403).json({ error: 'Esta cuenta ya está atada a otra identidad' })
      return
    }
    if (!user) {
      user = await db.createUser({
        email,
        fullName: perfil?.nombre || identidad.nombreLegal || 'Usuario de Genesis ID',
        passwordHash: hashPassword(randomBytes(32).toString('hex')),
      })
    }
    await db.setUserGid(user.id, gid)
    user.gid = gid
  }

  // Ata la cuenta al GID también del lado de Genesis ID, para que desde
  // MyTokenPay se pueda saltar a otras apps del ecosistema sin repetir nada.
  await llamarGenesis('/api/v1/vinculos', {
    method: 'POST',
    body: JSON.stringify({ identidadId: identidad.id, cuenta: user.id }),
  })

  res.json({
    token: signToken(user.id),
    user: toPublicUser(user),
    genesis: { gid, nombre: perfil?.nombre ?? identidad.nombreLegal ?? null, verificada: true },
  })
}))

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
