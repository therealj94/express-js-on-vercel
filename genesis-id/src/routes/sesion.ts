// Sesiones de los operadores del panel.

import { Router } from 'express'
import {
  entrar, salir, cambiarContrasena, PERMISOS,
  prepararSegundoFactor, activarSegundoFactor, exigeSegundoFactor,
} from '../auth/operadores.js'
import { exigeOperador, limite } from '../middleware/proteger.js'
import { store } from '../store.js'

export const sesionRouter = Router()

// El límite es bajo a propósito: es la puerta de entrada al panel y no hay
// ningún motivo legítimo para intentar entrar diez veces por minuto.
sesionRouter.post('/entrar', limite(10), async (req, res, siguiente) => {
  try {
    const { email, contrasena, codigo } = req.body ?? {}
    if (!email || !contrasena) {
      return res.status(400).json({ error: 'Faltan el correo y la contraseña' })
    }
    const ip = req.ip ?? null
    const r = entrar(String(email), String(contrasena), ip, String(codigo ?? ''))

    // Un bloqueo por intentos no es lo mismo que unas credenciales malas y no
    // puede viajar con el mismo código: 429 dice «espere», 401 dice «esos datos
    // no valen». Mezclarlos obligaba al panel a adivinar, y adivinaba mal.
    if (!r.ok && r.bloqueado) {
      res.setHeader('Retry-After', '900')
      return res.status(429).json({ error: r.motivo })
    }
    /* Que FALTE el codigo se distingue de que los datos esten mal, y eso no
       filtra nada: para llegar hasta aca ya hay que traer la contrasena buena.
       Sin distinguirlo el panel no sabria si pedir el codigo o decir que el
       correo no existe. */
    if (!r.ok && r.faltaSegundoFactor) {
      return res.status(401).json({ error: r.motivo, segundoFactor: true })
    }
    if (!r.ok) return res.status(401).json({ error: r.motivo })

    // La sesión se guarda ANTES de entregar el token. Con el volcado diferido,
    // un reinicio dentro de esa ventana dejaba en el navegador un token que no
    // existía en la base: el único caso en que «la sesión caducó» era verdad, y
    // la causa era una escritura perdida, no un vencimiento.
    await store.guardarYa()

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
        segundoFactorActivo: Boolean(r.operador!.segundoFactor?.activadoEn),
        debeActivarSegundoFactor: Boolean(r.debeActivarSegundoFactor),
      },
    })
  } catch (e) {
    siguiente(e)
  }
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
      segundoFactorActivo: Boolean(o.segundoFactor?.activadoEn),
      debeActivarSegundoFactor:
        !o.segundoFactor?.activadoEn && exigeSegundoFactor(o.rol),
      respaldosQueQuedan: o.segundoFactor?.respaldos.length ?? 0,
    },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Segundo factor
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Cada operador se pone el suyo: no hay ruta para ponerselo a otro, ni siquiera
 * siendo administrador. Un secreto de segundo factor que alguien mas ha visto
 * no es un segundo factor. Lo unico que un administrador puede hacer sobre el
 * de otro es QUITARLO, y eso queda escrito en la bitacora con los dos nombres.
 */

/** Paso 1: se prepara y se devuelve el secreto y la dirección del código QR. */
sesionRouter.post('/segundo-factor/preparar', exigeOperador, (req, res) => {
  const r = prepararSegundoFactor(req.operador!.id)
  if (!r.ok) return res.status(400).json({ error: r.error })
  // El secreto sale una vez, para que el operador lo escanee. A partir de que
  // se active no vuelve a salir por ninguna ruta.
  res.json({ secreto: r.secreto, uri: r.uri })
})

/** Paso 2: se activa demostrando con un código que el teléfono ya lo tiene. */
sesionRouter.post('/segundo-factor/activar', exigeOperador, async (req, res) => {
  const r = activarSegundoFactor(req.operador!.id, String(req.body?.codigo ?? ''))
  if (!r.ok) return res.status(400).json({ error: r.error })
  await store.guardarYa()
  // Los códigos de recuperación salen esta única vez: después solo existen sus
  // hashes. Hay que decirle al operador que los apunte AHORA.
  res.json({
    ok: true,
    respaldos: r.respaldos,
    aviso: 'Apunte estos códigos ahora y guárdelos fuera del teléfono. ' +
      'No se van a volver a mostrar, y son la única forma de entrar si pierde el teléfono.',
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
