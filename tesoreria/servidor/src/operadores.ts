// Operadores de la Tesorería y sus sesiones.
//
// Los roles salen de app/reglas.js (PERMISOS), así que el navegador y el
// servidor coinciden en qué puede hacer cada quien. Los que tienen rol de
// presidente o consejero forman el Consejo firmante: su nombre es lo que
// aparece en las firmas, y su llave Ed25519 lo que las respalda.

import { store, type Operador, type Sesion } from './store.js'
import { R } from './reglas.js'
import { hashContrasena, verificarContrasena, azar, generarLlaves } from './cripto.js'

const DURACION_SESION_H = Number(process.env.TESORERIA_SESION_HORAS || 8)
const ROLES_CONSEJO = ['presidente', 'consejero']

export const puede = (rol: string, permiso: string) => R.puede(rol, permiso)

/** Nombres de los consejeros activos, en el orden en que se dieron de alta. */
export function consejo(): string[] {
  return store.todo().operadores.filter((o) => o.activo && ROLES_CONSEJO.includes(o.rol)).map((o) => o.nombre)
}

export function crearOperador(input: { email: string; nombre: string; rol: string; contrasena: string; gid?: string | null; debeCambiar?: boolean }): Operador {
  const email = String(input.email || '').toLowerCase().trim()
  const nombre = String(input.nombre || '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Correo inválido')
  if (!nombre || nombre.length > 80) throw new Error('Nombre inválido')
  if (!R.ROLES.includes(input.rol)) throw new Error(`Rol desconocido: ${input.rol}`)
  if (String(input.contrasena || '').length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres')
  const datos = store.todo()
  if (datos.operadores.some((o) => o.email === email)) throw new Error('Ya existe un operador con ese correo')
  if (datos.operadores.some((o) => o.nombre === nombre && o.activo)) throw new Error('Ya hay un operador activo con ese nombre; el nombre es lo que firma')
  const gid = input.gid ? String(input.gid).trim().toUpperCase() : null
  if (gid && !/^G[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]$/.test(gid)) throw new Error('El GID no tiene el formato de Genesis ID (GEN-XXXX-XXXX-X)')

  const llaves = generarLlaves()
  const operador: Operador = {
    id: 'opr_' + azar(9), email, nombre, rol: input.rol,
    hashContrasena: hashContrasena(input.contrasena),
    clavePublica: llaves.clavePublica, clavePrivada: llaves.clavePrivada,
    gid, activo: true, creadoEn: new Date().toISOString(), ultimoAcceso: null,
    debeCambiarContrasena: input.debeCambiar ?? true,
  }
  datos.operadores.push(operador)
  store.guardar()
  return operador
}

/**
 * Crea el primer presidente si no hay ningún operador.
 * Sin TESORERIA_ADMIN_PASSWORD se genera una al azar y se imprime UNA vez.
 */
export function asegurarPresidente(): { creado: boolean; email?: string; contrasena?: string } {
  if (store.todo().operadores.length > 0) return { creado: false }
  const email = (process.env.TESORERIA_ADMIN_EMAIL || 'tesoreria@ordenglobal.org').toLowerCase()
  const contrasena = process.env.TESORERIA_ADMIN_PASSWORD || azar(18)
  crearOperador({
    email, nombre: process.env.TESORERIA_ADMIN_NOMBRE || 'Presidente del Consejo', rol: 'presidente',
    contrasena, debeCambiar: !process.env.TESORERIA_ADMIN_PASSWORD,
  })
  return { creado: true, email, contrasena: process.env.TESORERIA_ADMIN_PASSWORD ? undefined : contrasena }
}

const fallos = new Map<string, { veces: number; hasta: number }>()
const MAX_FALLOS = 5
const BLOQUEO_MS = 15 * 60 * 1000

function abrirSesion(operador: Operador, ip: string | null, origen: Sesion['origen']): Sesion {
  const ahora = new Date()
  const sesion: Sesion = {
    token: azar(32), operadorId: operador.id, creadaEn: ahora.toISOString(),
    expiraEn: new Date(ahora.getTime() + DURACION_SESION_H * 3600000).toISOString(), ip, origen,
  }
  store.todo().sesiones.push(sesion)
  operador.ultimoAcceso = ahora.toISOString()
  store.guardar()
  return sesion
}

export function entrar(email: string, contrasena: string, ip: string | null): { ok: boolean; sesion?: Sesion; operador?: Operador; motivo?: string } {
  const correo = String(email || '').toLowerCase().trim()
  const bloqueo = fallos.get(correo)
  if (bloqueo && bloqueo.veces >= MAX_FALLOS && Date.now() < bloqueo.hasta) {
    return { ok: false, motivo: `Demasiados intentos. Vuelva a probar en ${Math.ceil((bloqueo.hasta - Date.now()) / 60000)} minuto(s).` }
  }
  const operador = store.todo().operadores.find((o) => o.email === correo)
  // Misma respuesta si el correo no existe o si la contraseña falla.
  const valido = operador?.activo && verificarContrasena(contrasena, operador.hashContrasena)
  if (!valido) {
    const previo = fallos.get(correo) ?? { veces: 0, hasta: 0 }
    fallos.set(correo, { veces: previo.veces + 1, hasta: Date.now() + BLOQUEO_MS })
    return { ok: false, motivo: 'Correo o contraseña incorrectos' }
  }
  fallos.delete(correo)
  return { ok: true, sesion: abrirSesion(operador!, ip, 'contrasena'), operador: operador! }
}

/** Entrada con una identidad ya verificada por Genesis ID: se busca el operador por su GID. */
export function entrarPorGid(gid: string, ip: string | null): { ok: boolean; sesion?: Sesion; operador?: Operador; motivo?: string } {
  const g = String(gid || '').trim().toUpperCase()
  const operador = store.todo().operadores.find((o) => o.activo && o.gid === g)
  if (!operador) return { ok: false, motivo: 'Esa identidad de Genesis ID no está dada de alta como operador de la Tesorería' }
  return { ok: true, sesion: abrirSesion(operador, ip, 'genesis'), operador }
}

export function operadorDeSesion(token: string): Operador | null {
  if (!token) return null
  const s = store.todo().sesiones.find((x) => x.token === token)
  if (!s || new Date(s.expiraEn) < new Date()) return null
  const o = store.todo().operadores.find((x) => x.id === s.operadorId)
  return o?.activo ? o : null
}

export function salir(token: string): void {
  const d = store.todo()
  const i = d.sesiones.findIndex((s) => s.token === token)
  if (i >= 0) { d.sesiones.splice(i, 1); store.guardar() }
}

export function cambiarContrasena(operadorId: string, actual: string, nueva: string): { ok: boolean; motivo?: string } {
  const o = store.todo().operadores.find((x) => x.id === operadorId)
  if (!o) return { ok: false, motivo: 'Operador no encontrado' }
  if (!verificarContrasena(actual, o.hashContrasena)) return { ok: false, motivo: 'La contraseña actual no es correcta' }
  if (String(nueva).length < 12) return { ok: false, motivo: 'La contraseña nueva debe tener al menos 12 caracteres' }
  o.hashContrasena = hashContrasena(nueva)
  o.debeCambiarContrasena = false
  store.todo().sesiones = store.todo().sesiones.filter((s) => s.operadorId !== operadorId)
  store.guardar()
  return { ok: true }
}

export function darDeBaja(operadorId: string): Operador {
  const d = store.todo()
  const o = d.operadores.find((x) => x.id === operadorId)
  if (!o) throw new Error('Operador no encontrado')
  if (o.rol === 'presidente' && d.operadores.filter((x) => x.activo && x.rol === 'presidente').length <= 1) {
    throw new Error('No puede darse de baja al único presidente')
  }
  o.activo = false
  d.sesiones = d.sesiones.filter((s) => s.operadorId !== operadorId)
  store.guardar()
  return o
}

export function limpiarSesiones(): number {
  const d = store.todo()
  const antes = d.sesiones.length
  const ahora = new Date().toISOString()
  d.sesiones = d.sesiones.filter((s) => s.expiraEn > ahora)
  if (d.sesiones.length !== antes) store.guardar()
  return antes - d.sesiones.length
}

/** Lo que se puede enseñar de un operador. La llave privada y el hash, nunca. */
export function publico(o: Operador) {
  return {
    id: o.id, email: o.email, nombre: o.nombre, rol: o.rol, permisos: R.PERMISOS[o.rol],
    clavePublica: o.clavePublica, gid: o.gid, activo: o.activo, creadoEn: o.creadoEn,
    ultimoAcceso: o.ultimoAcceso, debeCambiarContrasena: o.debeCambiarContrasena,
  }
}
