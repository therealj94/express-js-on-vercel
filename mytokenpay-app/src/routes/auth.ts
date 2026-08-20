import { Router } from 'express'
import { envolver } from '../lib/asincrono.js'
import { db, toPublicUser } from '../lib/db.js'
import { verificarSso, identidadPorGid } from '../lib/genesis.js'
import { randomBytes } from 'crypto'
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

/**
 * Entrar desde el ecosistema, sin volver a escribir contraseña.
 *
 * COMO FUNCIONA, Y POR QUE ASI
 *
 * Quien ya inició sesión en Veta Wallet pide allí un token de sesión única, lo
 * trae aquí, y a cambio recibe una sesión de MyTokenPay. El token lo emite y lo
 * verifica Genesis ID: MyTokenPay no se cree nada por su cuenta, y el navegador
 * nunca ve una clave — el token es la credencial, dura minutos y no sirve para
 * ninguna otra cosa. Es exactamente el mismo camino que ya usa Ordenex.
 *
 * SE ENLAZA POR CORREO, NO POR GID A SECAS
 *
 * Primero se busca por GID, que es lo barato. Si no hay nadie, se pregunta a
 * Genesis por el correo de esa identidad y se busca por correo: así, quien se
 * registró aquí con contraseña y luego entra desde la billetera cae en SU
 * cuenta —con sus cobros y su comercio— en vez de estrenar una segunda que no
 * se habla con la primera. Y solo si tampoco hay eso, se crea una cuenta nueva.
 *
 * La contraseña de una cuenta nacida por SSO es aleatoria y nadie la conoce: el
 * campo es obligatorio y dejarlo previsible sería abrir la puerta de al lado.
 * Quien quiera una la pide por «olvidé mi contraseña», que va a su correo.
 */
authRouter.post('/sso', envolver(async (req, res) => {
  const { token } = req.body as { token?: string }
  if (!token) {
    res.status(400).json({ error: 'Hace falta el token de sesión del ecosistema' })
    return
  }

  const sesion = await verificarSso(String(token))
  if (!sesion) {
    // No se detalla por qué falló: quien prueba tokens no necesita saber si erró
    // la firma, el vencimiento o la identidad.
    res.status(401).json({ error: 'No se pudo verificar tu sesión del ecosistema' })
    return
  }

  let user = await db.findUserByGid(sesion.gid)

  if (!user) {
    const identidad = await identidadPorGid(sesion.gid)
    if (!identidad?.email) {
      res.status(503).json({ error: 'No se pudo leer tu identidad del ecosistema. Probá otra vez en un momento.' })
      return
    }
    user = await db.findUserByEmail(identidad.email)
    if (user) {
      // Ya tenía cuenta aquí con contraseña: se le ata el GID y entra a la suya.
      await db.vincularGid(user.id, sesion.gid, user.direccionWallet ?? null)
      user = { ...user, gid: sesion.gid }
    } else {
      const creado = await db.createUser({
        email: identidad.email,
        fullName: identidad.nombreLegal || identidad.email.split('@')[0],
        passwordHash: hashPassword(randomBytes(32).toString('base64')),
      })
      if (!creado) {
        // Otro registro con el mismo correo ganó la carrera entre la búsqueda y
        // la escritura. Se recoge el que quedó en vez de fallar.
        user = await db.findUserByEmail(identidad.email)
        if (!user) {
          res.status(409).json({ error: 'No se pudo crear tu cuenta. Probá otra vez.' })
          return
        }
      } else {
        user = creado
      }
      await db.vincularGid(user.id, sesion.gid, null)
      user = { ...user, gid: sesion.gid }
    }
  }

  res.json({ token: signToken(user.id), user: toPublicUser(user), gid: sesion.gid })
}))
