// Operadores del panel y sus sesiones.
//
// Los roles siguen la separación de funciones: `soporte` resuelve apelaciones,
// retiros y agentes; `auditor` lo lee todo y no toca nada; `admin` además
// gestiona operadores, configuración y ajustes de saldo.

import { store } from '../store.js'
import { hashContrasena, contrasenaCoincide, hashToken } from '../lib/cripto.js'
import { id, tokenSesion, contrasenaTemporal } from '../lib/uid.js'
import { registrar } from './bitacora.js'
import { malaPeticion, conflicto, noEncontrado, sinPermiso } from '../lib/errores.js'
import type { Operador, RolOperador } from '../types.js'

const HORAS_SESION = Number(process.env.ORDENEX_SESION_PANEL_HORAS || 8)

export const PERMISOS: Record<string, RolOperador[]> = {
  'leer': ['admin', 'soporte', 'auditor'],
  'ordenes.resolver': ['admin', 'soporte'],
  'ordenes.cancelar': ['admin', 'soporte'],
  'ordenes.chatear': ['admin', 'soporte'],
  'agentes.decidir': ['admin', 'soporte'],
  'retiros.decidir': ['admin', 'soporte'],
  'usuarios.congelar': ['admin', 'soporte'],
  'saldos.ajustar': ['admin'],
  'precios.editar': ['admin', 'soporte'],
  'configuracion.editar': ['admin'],
  'operadores.gestionar': ['admin'],
}

export const puede = (rol: RolOperador, permiso: string): boolean => (PERMISOS[permiso] ?? []).includes(rol)

const ROLES: RolOperador[] = ['admin', 'soporte', 'auditor']

const emailValido = (e: unknown): e is string => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export function sinHash(o: Operador) {
  const { hashContrasena: _h, ...resto } = o
  return resto
}

/** Crea el primer administrador si no existe. Devuelve la contraseña solo si la generó. */
export function asegurarAdministrador(): { creado: boolean; email: string; contrasena: string | null } {
  const email = (process.env.ORDENEX_ADMIN_EMAIL || 'admin@ordenglobal.link').toLowerCase()
  const lista = store.todo().operadores
  if (lista.some((o) => o.rol === 'admin')) return { creado: false, email, contrasena: null }
  const fijada = process.env.ORDENEX_ADMIN_PASSWORD || ''
  const contrasena = fijada || contrasenaTemporal()
  lista.push({
    id: id('opr'),
    email,
    nombre: 'Administración',
    rol: 'admin',
    hashContrasena: hashContrasena(contrasena),
    activo: true,
    creadoEn: new Date().toISOString(),
    ultimoAcceso: null,
    debeCambiarContrasena: !fijada,
  })
  registrar('sistema', 'operador.creado', email, { rol: 'admin' })
  store.guardar()
  return { creado: true, email, contrasena: fijada ? null : contrasena }
}

const intentos = new Map<string, { fallos: number; hasta: number }>()

export function entrar(email: unknown, contrasena: unknown): { token: string; operador: ReturnType<typeof sinHash> } {
  const e = String(email || '').toLowerCase().trim()
  const bloqueo = intentos.get(e)
  if (bloqueo && bloqueo.hasta > Date.now()) {
    throw sinPermiso('Demasiados intentos fallidos. Espere 15 minutos.', 'bloqueado')
  }
  const operador = store.todo().operadores.find((o) => o.email === e)
  if (!operador || !operador.activo || !contrasenaCoincide(String(contrasena || ''), operador.hashContrasena)) {
    const reg = intentos.get(e) ?? { fallos: 0, hasta: 0 }
    reg.fallos += 1
    if (reg.fallos >= 5) { reg.hasta = Date.now() + 15 * 60000; reg.fallos = 0 }
    intentos.set(e, reg)
    registrar('anonimo', 'panel.entrada-fallida', e, {})
    throw sinPermiso('Credenciales inválidas', 'credenciales')
  }
  intentos.delete(e)
  const token = tokenSesion()
  const ahora = new Date()
  store.todo().sesionesOperador.push({
    token: hashToken(token),
    operadorId: operador.id,
    creadaEn: ahora.toISOString(),
    expiraEn: new Date(ahora.getTime() + HORAS_SESION * 3600000).toISOString(),
  })
  operador.ultimoAcceso = ahora.toISOString()
  registrar(operador.email, 'panel.entrada', operador.id, {})
  store.guardar()
  return { token, operador: sinHash(operador) }
}

export function operadorDeSesion(token: string): Operador | null {
  if (!token) return null
  const h = hashToken(token)
  const s = store.todo().sesionesOperador.find((x) => x.token === h)
  if (!s || Date.parse(s.expiraEn) < Date.now()) return null
  const o = store.todo().operadores.find((x) => x.id === s.operadorId)
  return o && o.activo ? o : null
}

export function salir(token: string): void {
  const h = hashToken(token)
  const d = store.todo()
  d.sesionesOperador = d.sesionesOperador.filter((s) => s.token !== h)
  store.guardar()
}

export function limpiarSesiones(): void {
  const d = store.todo()
  const ahora = Date.now()
  d.sesionesOperador = d.sesionesOperador.filter((s) => Date.parse(s.expiraEn) > ahora)
}

export function cambiarContrasena(operador: Operador, actual: unknown, nueva: unknown): void {
  if (!contrasenaCoincide(String(actual || ''), operador.hashContrasena)) throw sinPermiso('La contraseña actual no coincide', 'contrasena')
  if (typeof nueva !== 'string' || nueva.length < 10) throw malaPeticion('La contraseña nueva debe tener al menos 10 caracteres')
  operador.hashContrasena = hashContrasena(nueva)
  operador.debeCambiarContrasena = false
  registrar(operador.email, 'operador.contrasena', operador.id, {})
  store.guardar()
}

export function crear(actor: Operador, entrada: { email?: unknown; nombre?: unknown; rol?: unknown }) {
  if (!emailValido(entrada.email)) throw malaPeticion('Hace falta un correo válido')
  const email = entrada.email.toLowerCase().trim()
  const nombre = String(entrada.nombre || '').trim()
  const rol = String(entrada.rol || '') as RolOperador
  if (!nombre) throw malaPeticion('Hace falta el nombre')
  if (!ROLES.includes(rol)) throw malaPeticion(`Rol inválido. Válidos: ${ROLES.join(', ')}`)
  if (store.todo().operadores.some((o) => o.email === email)) throw conflicto('Ya existe un operador con ese correo')
  const contrasena = contrasenaTemporal()
  const operador: Operador = {
    id: id('opr'), email, nombre, rol,
    hashContrasena: hashContrasena(contrasena),
    activo: true, creadoEn: new Date().toISOString(), ultimoAcceso: null, debeCambiarContrasena: true,
  }
  store.todo().operadores.push(operador)
  registrar(actor.email, 'operador.creado', email, { rol })
  store.guardar()
  return { operador: sinHash(operador), contrasenaTemporal: contrasena }
}

export function fijarEstado(actor: Operador, idOperador: string, activo: boolean) {
  const o = store.todo().operadores.find((x) => x.id === idOperador)
  if (!o) throw noEncontrado('Operador no encontrado')
  if (o.id === actor.id && !activo) throw conflicto('No puede desactivar su propia cuenta')
  if (!activo && o.rol === 'admin' && store.todo().operadores.filter((x) => x.rol === 'admin' && x.activo).length <= 1) {
    throw conflicto('Tiene que quedar al menos un administrador activo')
  }
  o.activo = activo
  if (!activo) {
    const d = store.todo()
    d.sesionesOperador = d.sesionesOperador.filter((s) => s.operadorId !== o.id)
  }
  registrar(actor.email, activo ? 'operador.activado' : 'operador.desactivado', o.email, {})
  store.guardar()
  return sinHash(o)
}

export function restablecer(actor: Operador, idOperador: string): string {
  const o = store.todo().operadores.find((x) => x.id === idOperador)
  if (!o) throw noEncontrado('Operador no encontrado')
  const contrasena = contrasenaTemporal()
  o.hashContrasena = hashContrasena(contrasena)
  o.debeCambiarContrasena = true
  const d = store.todo()
  d.sesionesOperador = d.sesionesOperador.filter((s) => s.operadorId !== o.id)
  registrar(actor.email, 'operador.restablecido', o.email, {})
  store.guardar()
  return contrasena
}

export const listar = () => store.todo().operadores.map(sinHash)
