// Operadores del panel y sus sesiones.
//
// Antes no había ninguno: el panel y todas las rutas de administración estaban
// abiertos a internet. Cualquiera podía listar las identidades con sus nombres,
// documentos y nacionalidades, o borrar la base entera con una sola petición.
//
// SEPARACION DE FUNCIONES
//
// Los roles no son decorativos. Quien revisa un caso no debería ser quien lo
// aprueba, y el auditor no debe poder cambiar nada. Es lo que exige cualquier
// marco de cumplimiento, y lo que evita que una sola cuenta comprometida pueda
// fabricar identidades verificadas.

import { store } from '../store.js'
import { hashContrasena, verificarContrasena, azar } from '../lib/cripto.js'
import { id } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import type { Operador, Rol, Sesion } from '../types.js'

/** Qué puede hacer cada rol. */
export const PERMISOS: Record<Rol, string[]> = {
  // Manda: gestiona operadores y aplicaciones, además de todo lo demás.
  admin: ['*'],
  // Cumplimiento: decide sobre identidades y casos, pero no crea operadores.
  cumplimiento: [
    'identidad.ver', 'identidad.revisar', 'identidad.aprobar', 'identidad.rechazar', 'identidad.suspender',
    'negocio.ver', 'negocio.revisar', 'negocio.aprobar', 'negocio.rechazar',
    'caso.ver', 'caso.gestionar', 'caso.reportar',
    'listas.ver', 'listas.recargar', 'bitacora.ver',
    'analitica.ver', 'analitica.gestionar', 'usuarios.ver',
  ],
  // Revisor: prepara el caso y recomienda, pero no firma la aprobación.
  revisor: [
    'identidad.ver', 'identidad.revisar',
    'negocio.ver', 'negocio.revisar',
    'caso.ver', 'caso.gestionar', 'listas.ver',
    'analitica.ver',
  ],
  // Auditor: lo ve todo, no toca nada. Incluye la analítica: es justo el rol
  // que necesita mirar cifras sin poder cerrar un error como «resuelto».
  auditor: [
    'identidad.ver', 'negocio.ver', 'caso.ver', 'listas.ver', 'bitacora.ver',
    'analitica.ver',
  ],
}

export function puede(rol: Rol, permiso: string): boolean {
  const suyos = PERMISOS[rol] || []
  return suyos.includes('*') || suyos.includes(permiso)
}

const DURACION_SESION_H = Number(process.env.GENESIS_SESION_HORAS || 8)

// ─────────────────────────────────────────────────────────────────────────────
// Alta y arranque
// ─────────────────────────────────────────────────────────────────────────────

export function crearOperador(input: {
  email: string; nombre: string; rol: Rol; contrasena: string; debeCambiar?: boolean
}): Operador {
  const email = input.email.toLowerCase().trim()
  if (store.todo().operadores.some((o) => o.email === email)) {
    throw new Error('Ya existe un operador con ese correo')
  }
  const operador: Operador = {
    id: id('opr'),
    email,
    nombre: input.nombre,
    rol: input.rol,
    hashContrasena: hashContrasena(input.contrasena),
    activo: true,
    creadoEn: new Date().toISOString(),
    ultimoAcceso: null,
    debeCambiarContrasena: input.debeCambiar ?? true,
  }
  store.todo().operadores.push(operador)
  store.guardar()
  return operador
}

/**
 * Crea el primer administrador si no hay ninguno.
 *
 * Si no se define GENESIS_ADMIN_PASSWORD se genera una al azar y se imprime UNA
 * sola vez en el registro de arranque. Es preferible a dejar una contraseña por
 * defecto: una contraseña fija en el código acaba publicada en el repositorio y
 * es la puerta de entrada más común que hay.
 */
export function asegurarAdministrador(): { creado: boolean; email?: string; contrasena?: string } {
  if (store.todo().operadores.length > 0) return { creado: false }

  const email = (process.env.GENESIS_ADMIN_EMAIL || 'admin@ordenglobal.link').toLowerCase()
  const contrasena = process.env.GENESIS_ADMIN_PASSWORD || azar(18)
  crearOperador({
    email,
    nombre: 'Administrador',
    rol: 'admin',
    contrasena,
    debeCambiar: !process.env.GENESIS_ADMIN_PASSWORD,
  })
  registrar('sistema', 'operador.creado', email, { rol: 'admin', origen: 'arranque' })

  return {
    creado: true,
    email,
    contrasena: process.env.GENESIS_ADMIN_PASSWORD ? undefined : contrasena,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada y sesiones
// ─────────────────────────────────────────────────────────────────────────────

/** Intentos fallidos por correo, para frenar la fuerza bruta. */
const fallos = new Map<string, { veces: number; hasta: number }>()
const MAX_FALLOS = 5
const BLOQUEO_MS = 15 * 60 * 1000

export function entrar(email: string, contrasena: string, ip: string | null): {
  ok: boolean; sesion?: Sesion; operador?: Operador; motivo?: string
} {
  const correo = String(email || '').toLowerCase().trim()
  const bloqueo = fallos.get(correo)
  if (bloqueo && bloqueo.veces >= MAX_FALLOS && Date.now() < bloqueo.hasta) {
    const minutos = Math.ceil((bloqueo.hasta - Date.now()) / 60000)
    return { ok: false, motivo: `Demasiados intentos. Vuelva a probar en ${minutos} minuto(s).` }
  }

  const operador = store.todo().operadores.find((o) => o.email === correo)

  // Se responde lo mismo si el correo no existe o si la contraseña está mal:
  // distinguirlos permitiría averiguar qué correos son operadores válidos.
  const valido = operador?.activo && verificarContrasena(contrasena, operador.hashContrasena)
  if (!valido) {
    const previo = fallos.get(correo) ?? { veces: 0, hasta: 0 }
    fallos.set(correo, { veces: previo.veces + 1, hasta: Date.now() + BLOQUEO_MS })
    registrar(correo, 'sesion.fallida', correo, { ip })
    return { ok: false, motivo: 'Correo o contraseña incorrectos' }
  }

  fallos.delete(correo)

  const ahora = new Date()
  const sesion: Sesion = {
    token: azar(32),
    operadorId: operador!.id,
    creadaEn: ahora.toISOString(),
    expiraEn: new Date(ahora.getTime() + DURACION_SESION_H * 3600000).toISOString(),
    ip,
  }
  store.todo().sesiones.push(sesion)
  operador!.ultimoAcceso = ahora.toISOString()
  store.guardar()
  registrar(operador!.email, 'sesion.abierta', operador!.id, { ip, rol: operador!.rol })

  return { ok: true, sesion, operador: operador! }
}

export function operadorDeSesion(token: string): Operador | null {
  if (!token) return null
  const sesion = store.todo().sesiones.find((s) => s.token === token)
  if (!sesion) return null
  if (new Date(sesion.expiraEn) < new Date()) return null
  const operador = store.todo().operadores.find((o) => o.id === sesion.operadorId)
  return operador?.activo ? operador : null
}

export function salir(token: string): void {
  const datos = store.todo()
  const i = datos.sesiones.findIndex((s) => s.token === token)
  if (i >= 0) {
    const operador = datos.operadores.find((o) => o.id === datos.sesiones[i].operadorId)
    datos.sesiones.splice(i, 1)
    store.guardar()
    if (operador) registrar(operador.email, 'sesion.cerrada', operador.id, {})
  }
}

export function cambiarContrasena(operadorId: string, actual: string, nueva: string): { ok: boolean; motivo?: string } {
  const operador = store.todo().operadores.find((o) => o.id === operadorId)
  if (!operador) return { ok: false, motivo: 'Operador no encontrado' }
  if (!verificarContrasena(actual, operador.hashContrasena)) {
    return { ok: false, motivo: 'La contraseña actual no es correcta' }
  }
  if (nueva.length < 12) {
    return { ok: false, motivo: 'La contraseña nueva debe tener al menos 12 caracteres' }
  }
  operador.hashContrasena = hashContrasena(nueva)
  operador.debeCambiarContrasena = false
  // Se cierran las demás sesiones: si la contraseña se cambia porque se filtró,
  // dejar sesiones vivas no sirve de nada.
  store.todo().sesiones = store.todo().sesiones.filter((s) => s.operadorId !== operadorId)
  store.guardar()
  registrar(operador.email, 'contrasena.cambiada', operador.id, {})
  return { ok: true }
}

/** Quita las sesiones vencidas. Se llama cada tanto desde el arranque. */
export function limpiarSesiones(): number {
  const datos = store.todo()
  const antes = datos.sesiones.length
  const ahora = new Date().toISOString()
  datos.sesiones = datos.sesiones.filter((s) => s.expiraEn > ahora)
  if (datos.sesiones.length !== antes) store.guardar()
  return antes - datos.sesiones.length
}
