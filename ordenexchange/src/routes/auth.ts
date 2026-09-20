// Cuentas: registro, confirmación del correo, entrada, sesión única del
// ecosistema y perfil propio.

import { Router } from 'express'
import { seguro, conflicto, noEncontrado, malaPeticion, Falla } from '../lib/errores.js'
import { firmarSesion } from '../lib/cripto.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import { EN_PRODUCCION, modoDemo } from '../lib/entorno.js'
import * as usuarios from '../motor/usuarios.js'
import * as billetera from '../motor/billetera.js'
import { verificarSso, genesisConfigurado } from '../motor/genesis.js'
import { enviarCodigo, correoConfigurado } from '../motor/correo.js'
import { usuariosDemo, entrarDemo } from '../motor/demo.js'
import { registrar } from '../motor/bitacora.js'
import type { Usuario } from '../types.js'

export const authRouter = Router()

const respuesta = (u: Usuario) => ({ token: firmarSesion(u.id), usuario: usuarios.propio(u) })

/**
 * Manda el código de confirmación. Sin proveedor de correo y fuera de
 * producción, el código vuelve en la respuesta (`codigoDemo`) para poder
 * completar el flujo en desarrollo y en la demostración; en producción sin
 * proveedor, se avisa con `correoEnviado:false` y el arranque ya lo advirtió.
 */
async function mandarCodigo(u: Usuario): Promise<{ correoEnviado: boolean; codigoDemo?: string }> {
  const codigo = usuarios.emitirCodigo(u)
  const enviado = await enviarCodigo(u.email, codigo, u.idioma)
  return enviado || EN_PRODUCCION ? { correoEnviado: enviado } : { correoEnviado: false, codigoDemo: codigo }
}

authRouter.post('/registro', limite(10), seguro(async (req, res) => {
  const b = req.body ?? {}
  const u = usuarios.crear({ email: b.email, contrasena: b.contrasena, apodo: b.apodo, pais: b.pais, idioma: b.idioma })
  const envio = await mandarCodigo(u)
  res.status(201).json({ ...respuesta(u), verificacionPendiente: true, ...envio })
}))

authRouter.post('/verificar-correo', exigirSesion, limite(20), seguro((req, res) => {
  const u = usuarios.confirmarCorreo(req.usuario!, req.body?.codigo)
  res.json({ usuario: usuarios.propio(u) })
}))

authRouter.post('/reenviar-codigo', exigirSesion, limite(5), seguro(async (req, res) => {
  const u = req.usuario!
  if (u.emailVerificado) throw conflicto('El correo ya está confirmado', 'estado-invalido')
  res.json({ ok: true, ...(await mandarCodigo(u)) })
}))

authRouter.post('/entrar', limite(15), seguro((req, res) => {
  const b = req.body ?? {}
  const u = usuarios.entrar(b.email, b.contrasena)
  res.json(respuesta(u))
}))

/**
 * Entrar con un token de sesión única emitido por otra app del ecosistema
 * (Veta Wallet, MyTokenPay). Si ya hay una cuenta atada a ese GID, entra; si
 * no, hace falta registrarse aportando correo, apodo, país y contraseña (la
 * contraseña se pide después para liberar y retirar), y la cuenta nace ya
 * verificada en Genesis ID. El correo queda por confirmar: el puente con
 * Genesis lo exige.
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
  let envio: { correoEnviado: boolean; codigoDemo?: string } | null = null
  if (!u) {
    if (!b.email || !b.apodo || !b.pais || !b.contrasena) {
      res.status(409).json({ error: 'No hay una cuenta de OrdenExchange con ese Genesis ID; complete el registro (correo, apodo, país y contraseña)', codigo: 'necesita-registro', gid })
      return
    }
    if (usuarios.porEmail(String(b.email))) throw conflicto('Ya existe una cuenta con ese correo; entre con su contraseña y vincule el Genesis ID desde el perfil', 'email-en-uso')
    u = usuarios.crear({ email: b.email, contrasena: b.contrasena, apodo: b.apodo, pais: b.pais, idioma: b.idioma }, `sso:${r.cuerpo.emitidoPor}`)
    nuevo = true
    envio = await mandarCodigo(u)
  }
  usuarios.sincronizarGenesis(u, 'verificada', gid, nombre)
  registrar(u.id, 'usuario.sso', u.id, { emitidoPor: r.cuerpo.emitidoPor })
  res.json({ ...respuesta(u), nuevo, ...(envio ?? {}) })
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

/** Cambiar la contraseña cierra todas las sesiones; se devuelve una nueva para esta. */
authRouter.post('/contrasena', exigirSesion, limite(10), seguro((req, res) => {
  const b = req.body ?? {}
  usuarios.cambiarContrasena(req.usuario!, b.actual, b.nueva)
  res.json({ ok: true, token: firmarSesion(req.usuario!.id) })
}))

/** Cerrar sesión invalida los tokens de todos los dispositivos. */
authRouter.post('/salir', (req, res, siguiente) => {
  exigirSesion(req, res, () => {
    usuarios.cerrarSesiones(req.usuario!)
    res.status(204).end()
  })
  void siguiente
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

export { malaPeticion, correoConfigurado }
