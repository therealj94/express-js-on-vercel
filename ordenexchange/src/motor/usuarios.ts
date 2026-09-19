// Usuarios: cuentas, identidad y reputación.
//
// La cuenta de OrdenExchange es local (correo y contraseña) pero para OPERAR
// —publicar anuncios, abrir órdenes— hace falta un Genesis ID verificado. La
// verificación la decide un operador de cumplimiento en Genesis ID; aquí solo
// se refleja el estado. Nada en este módulo puede marcar a alguien como
// verificado, salvo en modo demostración y con un GID que se reconoce como
// de prueba.

import { store } from '../store.js'
import { hashContrasena, contrasenaCoincide } from '../lib/cripto.js'
import { id, gidDemo } from '../lib/uid.js'
import { malaPeticion, conflicto, sinPermiso, noEncontrado } from '../lib/errores.js'
import { pais as paisDe, PAISES } from '../data/latam.js'
import { esDireccion } from './cadena.js'
import { registrar } from './bitacora.js'
import type { Usuario, UsuarioPublico, UsuarioPropio, Reputacion, EstadoGid, Orden } from '../types.js'

const APODO = /^[A-Za-z0-9_]{3,20}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MINUTOS_EN_LINEA = 5

export function reputacionVacia(): Reputacion {
  return {
    ordenesTotales: 0, ordenesCompletadas: 0, ordenes30d: 0, completadas30d: 0, tasaFinalizacion30d: 100,
    positivas: 0, negativas: 0, tiempoPromedioLiberacionSeg: null, tiempoPromedioPagoSeg: null, apelacionesPerdidas: 0,
  }
}

export const porId = (idUsuario: string): Usuario | undefined => store.todo().usuarios.find((u) => u.id === idUsuario)
export const porEmail = (email: string): Usuario | undefined => {
  const e = String(email || '').toLowerCase().trim()
  return store.todo().usuarios.find((u) => u.email === e)
}
export const porApodo = (apodo: string): Usuario | undefined => {
  const a = String(apodo || '').toLowerCase().trim()
  return store.todo().usuarios.find((u) => u.apodo.toLowerCase() === a)
}
export const porGid = (gid: string): Usuario | undefined => {
  const g = String(gid || '').toUpperCase().trim()
  return g ? store.todo().usuarios.find((u) => u.gid === g) : undefined
}

export function exigir(idUsuario: string): Usuario {
  const u = porId(idUsuario)
  if (!u) throw noEncontrado('Usuario no encontrado')
  return u
}

export function validarApodo(apodo: unknown): string {
  const a = String(apodo || '').trim()
  if (!APODO.test(a)) throw malaPeticion('El apodo debe tener de 3 a 20 letras, números o guiones bajos', 'apodo')
  if (/^(sistema|operador|tesoreria|ordenexchange|admin)$/i.test(a)) throw malaPeticion('Ese apodo está reservado', 'apodo')
  return a
}

export function validarPais(pais: unknown): string {
  const p = String(pais || '').toUpperCase().trim()
  if (!paisDe(p)) throw malaPeticion('País no disponible en OrdenExchange', 'pais-no-permitido')
  return p
}

export function crear(entrada: { email?: unknown; contrasena?: unknown; apodo?: unknown; pais?: unknown; idioma?: unknown }, origen = 'registro'): Usuario {
  const email = String(entrada.email || '').toLowerCase().trim()
  if (!EMAIL.test(email)) throw malaPeticion('Hace falta un correo válido', 'email')
  const contrasena = String(entrada.contrasena || '')
  if (contrasena.length < 8) throw malaPeticion('La contraseña debe tener al menos 8 caracteres', 'contrasena-corta')
  const apodo = validarApodo(entrada.apodo)
  const pais = validarPais(entrada.pais)
  const idioma = entrada.idioma === 'en' ? 'en' : 'es'
  if (porEmail(email)) throw conflicto('Ya existe una cuenta con este correo', 'email-en-uso')
  if (porApodo(apodo)) throw conflicto('Ese apodo ya está en uso', 'apodo-en-uso')

  const ahora = new Date().toISOString()
  const usuario: Usuario = {
    id: id('usr'),
    email,
    hashContrasena: hashContrasena(contrasena),
    apodo,
    nombreLegal: null,
    pais,
    moneda: paisDe(pais)!.moneda.codigo,
    idioma,
    telefono: null,
    direccionCadena: null,
    gid: null,
    gidEstado: 'sin-verificar',
    gidComprobadoEn: null,
    agente: 'no',
    congelado: false,
    motivoCongelado: null,
    reputacion: reputacionVacia(),
    creadoEn: ahora,
    ultimoAcceso: ahora,
  }
  store.todo().usuarios.push(usuario)
  registrar(usuario.id, 'usuario.creado', usuario.id, { pais, origen })
  store.guardar()
  return usuario
}

export function entrar(email: unknown, contrasena: unknown): Usuario {
  const u = porEmail(String(email || ''))
  if (!u || !contrasenaCoincide(String(contrasena || ''), u.hashContrasena)) {
    throw sinPermiso('Correo o contraseña incorrectos', 'credenciales')
  }
  u.ultimoAcceso = new Date().toISOString()
  store.guardar()
  return u
}

export function cambiarContrasena(u: Usuario, actual: unknown, nueva: unknown): void {
  if (!contrasenaCoincide(String(actual || ''), u.hashContrasena)) throw sinPermiso('La contraseña actual no coincide', 'contrasena')
  if (typeof nueva !== 'string' || nueva.length < 8) throw malaPeticion('La contraseña nueva debe tener al menos 8 caracteres', 'contrasena-corta')
  u.hashContrasena = hashContrasena(nueva)
  registrar(u.id, 'usuario.contrasena', u.id, {})
  store.guardar()
}

export const contrasenaValida = (u: Usuario, contrasena: unknown): boolean =>
  contrasenaCoincide(String(contrasena || ''), u.hashContrasena)

export function actualizar(u: Usuario, entrada: { apodo?: unknown; pais?: unknown; idioma?: unknown; telefono?: unknown; direccionCadena?: unknown }): Usuario {
  const cambios: Record<string, unknown> = {}
  if (entrada.apodo !== undefined) {
    const a = validarApodo(entrada.apodo)
    const otro = porApodo(a)
    if (otro && otro.id !== u.id) throw conflicto('Ese apodo ya está en uso', 'apodo-en-uso')
    if (a !== u.apodo) { u.apodo = a; cambios.apodo = a }
  }
  if (entrada.pais !== undefined) {
    const p = validarPais(entrada.pais)
    u.pais = p
    u.moneda = paisDe(p)!.moneda.codigo
    cambios.pais = p
  }
  if (entrada.idioma !== undefined) {
    u.idioma = entrada.idioma === 'en' ? 'en' : 'es'
  }
  if (entrada.telefono !== undefined) {
    const t = entrada.telefono === null ? null : String(entrada.telefono).replace(/[^\d+\s-]/g, '').trim().slice(0, 24)
    u.telefono = t || null
  }
  if (entrada.direccionCadena !== undefined) {
    if (entrada.direccionCadena === null || entrada.direccionCadena === '') {
      u.direccionCadena = null
    } else {
      if (!esDireccion(entrada.direccionCadena)) throw malaPeticion('La dirección tiene que empezar con 0x y llevar 40 caracteres hexadecimales', 'direccion')
      const d = (entrada.direccionCadena as string).toLowerCase()
      const otro = store.todo().usuarios.find((x) => x.direccionCadena?.toLowerCase() === d && x.id !== u.id)
      if (otro) throw conflicto('Esa dirección ya está registrada en otra cuenta', 'direccion-en-uso')
      u.direccionCadena = entrada.direccionCadena as string
      cambios.direccionCadena = d
    }
  }
  if (Object.keys(cambios).length) registrar(u.id, 'usuario.actualizado', u.id, cambios)
  store.guardar()
  return u
}

export function tocar(u: Usuario): void {
  const ahora = Date.now()
  if (!u.ultimoAcceso || ahora - Date.parse(u.ultimoAcceso) > 60000) {
    u.ultimoAcceso = new Date(ahora).toISOString()
    store.guardar()
  }
}

// ── Genesis ID ───────────────────────────────────────────────────────────────

/** Refleja lo que Genesis ID dice de la identidad del usuario. */
export function sincronizarGenesis(u: Usuario, estado: EstadoGid, gid: string | null, nombreLegal?: string | null): Usuario {
  const gidNuevo = estado === 'verificada' && gid ? gid.toUpperCase() : (gid ? gid.toUpperCase() : u.gid)
  if (gidNuevo) {
    const otro = porGid(gidNuevo)
    if (otro && otro.id !== u.id) throw conflicto('Ese Genesis ID ya está atado a otra cuenta de OrdenExchange', 'gid-en-uso')
  }
  const cambio = u.gidEstado !== estado || u.gid !== gidNuevo
  u.gidEstado = estado
  u.gid = gidNuevo
  if (nombreLegal !== undefined) u.nombreLegal = estado === 'verificada' ? nombreLegal : null
  u.gidComprobadoEn = new Date().toISOString()
  if (cambio) registrar(u.id, 'usuario.genesis', u.id, { estado, gid: gidNuevo })
  store.guardar()
  return u
}

export function verificarDemo(u: Usuario, nombre?: string): Usuario {
  return sincronizarGenesis(u, 'verificada', u.gid?.endsWith('-D') ? u.gid : gidDemo(), nombre ?? `${u.apodo} Demo`)
}

// ── Operar ───────────────────────────────────────────────────────────────────

export function motivoNoOpera(u: Usuario): { codigo: string; motivo: string } | null {
  if (u.congelado) return { codigo: 'congelado', motivo: `Su cuenta está bloqueada: ${u.motivoCongelado || 'contacte a soporte'}` }
  if (!paisDe(u.pais)) return { codigo: 'pais-no-permitido', motivo: 'Su país no está disponible en OrdenExchange' }
  if (u.gidEstado !== 'verificada' || !u.gid) {
    return { codigo: 'no-verificado', motivo: 'Para comprar y vender hace falta un Genesis ID verificado' }
  }
  return null
}

export function exigirOperar(u: Usuario): void {
  const m = motivoNoOpera(u)
  if (m) throw sinPermiso(m.motivo, m.codigo)
}

export function congelar(u: Usuario, congelado: boolean, motivo: string, actor: string): Usuario {
  u.congelado = congelado
  u.motivoCongelado = congelado ? (motivo || 'Bloqueada por un operador') : null
  registrar(actor, congelado ? 'usuario.congelado' : 'usuario.descongelado', u.id, { motivo })
  store.guardar()
  return u
}

// ── Reputación ───────────────────────────────────────────────────────────────

const DIAS_30 = 30 * 86400000

/**
 * La reputación se recalcula desde las órdenes cada vez que una cambia. Es
 * O(órdenes) pero a esta escala vale más que sea correcta que rápida: un
 * contador que se desincroniza es una tasa de finalización falsa en el
 * mercado, y eso es lo que la gente usa para decidir con quién operar.
 */
export function recalcularReputacion(idUsuario: string): Reputacion {
  const u = porId(idUsuario)
  if (!u) return reputacionVacia()
  const ahora = Date.now()
  const r = reputacionVacia()
  r.positivas = u.reputacion.positivas
  r.negativas = u.reputacion.negativas
  r.apelacionesPerdidas = u.reputacion.apelacionesPerdidas
  let sumaPago = 0, nPago = 0, sumaLib = 0, nLib = 0
  let abiertas30 = 0

  for (const o of store.todo().ordenes) {
    const soyComprador = o.compradorId === idUsuario
    const soyVendedor = o.vendedorId === idUsuario
    if (!soyComprador && !soyVendedor) continue
    const reciente = ahora - Date.parse(o.creadaEn) < DIAS_30

    if (o.estado === 'completada') {
      r.ordenesTotales++
      r.ordenesCompletadas++
      if (reciente) { abiertas30++; r.completadas30d++ }
      if (soyComprador && o.pagadaEn) { sumaPago += (Date.parse(o.pagadaEn) - Date.parse(o.creadaEn)) / 1000; nPago++ }
      if (soyVendedor && o.completadaEn && o.pagadaEn) { sumaLib += (Date.parse(o.completadaEn) - Date.parse(o.pagadaEn)) / 1000; nLib++ }
    } else if (o.estado === 'cancelada') {
      r.ordenesTotales++
      // Cuenta en contra solo lo que el usuario canceló o dejó vencer siendo
      // comprador, o lo que perdió en apelación. Una orden que canceló la otra
      // parte no dice nada de él.
      const enContra = (o.canceladaPor === 'comprador' && soyComprador)
        || (o.canceladaPor === 'sistema' && soyComprador)
        || (o.canceladaPor === 'operador' && o.apelacion?.resolucion === 'devolver' && soyComprador)
      if (reciente && enContra) abiertas30++
    }
  }
  r.ordenes30d = abiertas30
  r.tasaFinalizacion30d = abiertas30 ? Math.round((r.completadas30d / abiertas30) * 1000) / 10 : 100
  r.tiempoPromedioPagoSeg = nPago ? Math.round(sumaPago / nPago) : null
  r.tiempoPromedioLiberacionSeg = nLib ? Math.round(sumaLib / nLib) : null
  u.reputacion = r
  return r
}

export function calificar(idUsuario: string, tipo: 'positiva' | 'negativa'): void {
  const u = porId(idUsuario)
  if (!u) return
  if (tipo === 'positiva') u.reputacion.positivas++
  else u.reputacion.negativas++
  store.guardar()
}

export function perdioApelacion(idUsuario: string): void {
  const u = porId(idUsuario)
  if (!u) return
  u.reputacion.apelacionesPerdidas++
  store.guardar()
}

// ── Vistas ───────────────────────────────────────────────────────────────────

function nombreAbreviado(u: Usuario): string | null {
  if (u.gidEstado !== 'verificada' || !u.nombreLegal) return null
  const partes = u.nombreLegal.trim().split(/\s+/)
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[1][0]}.`
}

export const diasRegistrado = (u: Usuario): number => Math.floor((Date.now() - Date.parse(u.creadoEn)) / 86400000)

export function publico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    apodo: u.apodo,
    nombreAbreviado: nombreAbreviado(u),
    pais: u.pais,
    agente: u.agente === 'aprobado',
    verificado: u.gidEstado === 'verificada',
    reputacion: u.reputacion,
    registradoHaceDias: diasRegistrado(u),
    enLinea: Boolean(u.ultimoAcceso && Date.now() - Date.parse(u.ultimoAcceso) < MINUTOS_EN_LINEA * 60000),
  }
}

export function propio(u: Usuario): UsuarioPropio {
  const { enLinea: _e, ...pub } = publico(u)
  const m = motivoNoOpera(u)
  return {
    ...pub,
    email: u.email,
    nombreLegal: u.nombreLegal,
    moneda: u.moneda,
    idioma: u.idioma,
    telefono: u.telefono,
    direccionCadena: u.direccionCadena,
    gid: u.gid,
    gidEstado: u.gidEstado,
    estadoAgente: u.agente,
    congelado: u.congelado,
    motivoCongelado: u.motivoCongelado,
    creadoEn: u.creadoEn,
    puedeOperar: !m,
    motivoNoOpera: m?.motivo ?? null,
  }
}

export function buscar(q: string, pagina = 1, porPagina = 30): { usuarios: Usuario[]; total: number } {
  const texto = String(q || '').toLowerCase().trim()
  const lista = store.todo().usuarios.filter((u) =>
    !texto || u.apodo.toLowerCase().includes(texto) || u.email.includes(texto) || (u.gid || '').toLowerCase().includes(texto) || u.id === texto)
  const desde = (pagina - 1) * porPagina
  return { usuarios: lista.slice().reverse().slice(desde, desde + porPagina), total: lista.length }
}

export const paisesDisponibles = () => PAISES.map((p) => p.iso2)

export type { Orden }
