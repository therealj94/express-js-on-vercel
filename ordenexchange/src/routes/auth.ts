// Cuentas: registro, entrada, sesión única del ecosistema y perfil propio.

import { Router } from 'express'
import { seguro, conflicto, noEncontrado, Falla } from '../lib/errores.js'
import { firmarSesion } from '../lib/cripto.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import * as usuarios from '../motor/usuarios.js'
import * as billetera from '../motor/billetera.js'
import { verificarSso, genesisConfigurado, estadoGidDe } from '../motor/genesis.js'
import { modoDemo, usuariosDemo, entrarDemo } from '../motor/demo.js'
import { registrar } from '../motor/bitacora.js'

export const authRouter = Router()

const respuesta = (u: ReturnType<typeof usuarios.crear>) => ({ token: firmarSesion(u.id), usuario: usuarios.propio(u) })

authRouter.post('/registro', limite(10), seguro((req, res) => {
  const b = req.body ?? {}
  const u = usuarios.crear({ email: b.email, contrasena: b.contrasena, apodo: b.apodo, pais: b.pais, idioma: b.idioma })
  res.status(201).json(respuesta(u))
}))

authRouter.post('/entrar', limite(15), seguro((req, res) => {
  const b = req.body ?? {}
  const u = usuarios.entrar(b.email, b.contrasena)
  res.json(respuesta(u))
}))

/**
 * Entrar con un token de sesión única emitido por otra app del ecosistema
 * (Veta Wallet, MyTokenPay). Si ya hay una cuenta atada a ese GID, entra; si
 * no, hace falta registrarse aportando correo, apodo y país, y la cuenta nace
 * ya verificada.
 */
authRouter.post('/sso', limite(15), seguro(async (req, res) => {
  const b = req.body ?? {}
  if (!genesisConfigurado()) throw new Falla(503, 'El inicio de sesión único no está configurado en este servidor', 'genesis-no-configurado')
  const r = await verificarSso(String(b.token || ''))
  if (!r.ok || !r.cuerpo?.valido || !r.cuerpo.gid) {
    res.status(401).json({ error: r.cuerpo?.error || 'Token de sesión única inválido o vencido', codigo: 'sso-invalido' })
    return
  }
  const gid = r.cuerpo.gid.toUpperCase()
  const nombre = r.cuerpo.perfil?.nombre ?? null
  let u = usuarios.porGid(gid)
  let nuevo = false
  if (!u) {
    if (!b.email || !b.apodo || !b.pais) {
      res.status(409).json({ error: 'No hay una cuenta de OrdenExchange con ese Genesis ID; complete el registro', codigo: 'necesita-registro', gid })
      return
    }
    const existente = usuarios.porEmail(String(b.email))
    if (existente) throw conflicto('Ya existe una cuenta con ese correo; entre con su contraseña y vincule el Genesis ID desde el perfil', 'email-en-uso')
    u = usuarios.crear({ email: b.email, contrasena: b.contrasena || `sso-${Math.random().toString(36).slice(2)}${Date.now()}`, apodo: b.apodo, pais: b.pais, idioma: b.idioma }, `sso:${r.cuerpo.emitidoPor}`)
    nuevo = true
  }
  usuarios.sincronizarGenesis(u, 'verificada', gid, nombre)
  registrar(u.id, 'usuario.sso', u.id, { emitidoPor: r.cuerpo.emitidoPor })
  res.json({ ...respuesta(u), nuevo })
}))

authRouter.get('/yo', exigirSesion, (req, res) => {
  const u = req.usuario!
  res.json({ usuario: usuarios.propio(u), saldos: billetera.saldos(u.id) })
})

authRouter.patch('/yo', exigirSesion, seguro((req, res) => {
  const b = req.body ?? {}
  const u = usuarios.actualizar(req.usuario!, { apodo: b.apodo, pais: b.pais, idioma: b.idioma, telefono: b.telefono, direccionCadena: b.direccionCadena })
  res.json({ usuario: usuarios.propio(u) })
}))

authRouter.post('/contrasena', exigirSesion, limite(10), seguro((req, res) => {
  const b = req.body ?? {}
  usuarios.cambiarContrasena(req.usuario!, b.actual, b.nueva)
  res.json({ ok: true })
}))

authRouter.post('/salir', (_req, res) => {
  res.status(204).end()
})

// ── Demostración ─────────────────────────────────────────────────────────────

authRouter.get('/demo/usuarios', (_req, res) => {
  if (!modoDemo()) { res.status(404).json({ error: 'Solo en modo demostración', codigo: 'demo-solamente' }); return }
  res.json({ usuarios: usuariosDemo().map(({ email: _e, ...u }) => u) })
})

authRouter.post('/demo/entrar', limite(30), seguro((req, res) => {
  if (!modoDemo()) throw noEncontrado('Solo en modo demostración', 'demo-solamente')
  const u = entrarDemo(req.body?.apodo)
  if (!u) throw noEncontrado('Ese usuario de demostración no existe')
  u.ultimoAcceso = new Date().toISOString()
  res.json(respuesta(u))
}))
