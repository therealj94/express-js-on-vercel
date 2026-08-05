// Sesiones de los operadores del panel.

import { Router } from 'express'
import { entrar, salir, cambiarContrasena, PERMISOS } from '../auth/operadores.js'
import { exigeOperador, limite } from '../middleware/proteger.js'

export const sesionRouter = Router()

// El límite es bajo a propósito: es la puerta de entrada al panel y no hay
// ningún motivo legítimo para intentar entrar diez veces por minuto.
sesionRouter.post('/entrar', limite(10), (req, res) => {
  const { email, contrasena } = req.body ?? {}
  if (!email || !contrasena) {
    return res.status(400).json({ error: 'Faltan el correo y la contraseña' })
  }
  const ip = req.ip ?? null
  const r = entrar(String(email), String(contrasena), ip)
  if (!r.ok) return res.status(401).json({ error: r.motivo })

  res.json({
    token: r.sesion!.token,
    expiraEn: r.sesion!.expiraEn,
    operador: {
      id: r.operador!.id,
      email: r.operador!.email,
      nombre: r.operador!.nombre,
      rol: r.operador!.rol,
      permisos: PERMISOS[r.operador!.rol],
      debeCambiarContrasena: r.operador!.debeCambiarContrasena,
    },
  })
})

sesionRouter.post('/salir', exigeOperador, (req, res) => {
  const cabecera = String(req.headers.authorization || '')
  salir(cabecera.startsWith('Bearer ') ? cabecera.slice(7) : String(req.headers['x-genesis-sesion'] || ''))
  res.json({ ok: true })
})

sesionRouter.get('/yo', exigeOperador, (req, res) => {
  const o = req.operador!
  res.json({
    operador: {
      id: o.id, email: o.email, nombre: o.nombre, rol: o.rol,
      permisos: PERMISOS[o.rol], debeCambiarContrasena: o.debeCambiarContrasena,
      ultimoAcceso: o.ultimoAcceso,
    },
  })
})

sesionRouter.post('/contrasena', exigeOperador, (req, res) => {
  const { actual, nueva } = req.body ?? {}
  if (!actual || !nueva) return res.status(400).json({ error: 'Faltan la contraseña actual y la nueva' })
  const r = cambiarContrasena(req.operador!.id, String(actual), String(nueva))
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  // Se cerraron todas las sesiones, incluida esta: hay que volver a entrar.
  res.json({ ok: true, aviso: 'Se cerraron todas las sesiones. Vuelva a entrar con la contraseña nueva.' })
})
