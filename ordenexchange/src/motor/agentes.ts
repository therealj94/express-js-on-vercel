// Agentes de cambio: los comerciantes verificados de OrdenExchange.
//
// Un agente deja una garantía en ORIGEN en custodia y lo aprueba un operador.
// A cambio lleva insignia en el mercado, puede publicar sin el tope de monto
// de los usuarios corrientes, y los anunciantes pueden exigir «solo agentes».
// La garantía es lo que responde si un operador resuelve una apelación en su
// contra y hay que compensar a alguien: por eso un agente SUSPENDIDO no la
// recupera por su cuenta —solo un operador levanta la suspensión o la
// devuelve—, y una cuenta bloqueada no mueve custodia.

import { store } from '../store.js'
import { Dec } from '../lib/decimal.js'
import { id } from '../lib/uid.js'
import { malaPeticion, conflicto, noEncontrado } from '../lib/errores.js'
import { registrar } from './bitacora.js'
import * as usuarios from './usuarios.js'
import * as billetera from './billetera.js'
import * as anuncios from './anuncios.js'
import type { SolicitudAgente, Usuario } from '../types.js'

const ORDENES_MIN = Number(process.env.ORDENEX_AGENTE_ORDENES_MIN || 0)

export const garantiaRequerida = (): string => store.todo().configuracion.garantiaAgente

export const solicitudDe = (usuarioId: string): SolicitudAgente | null =>
  store.todo().solicitudesAgente.filter((s) => s.usuarioId === usuarioId).pop() ?? null

/** La solicitud aprobada vigente: la que tiene la garantía en custodia. */
const aprobadaDe = (usuarioId: string): SolicitudAgente | null =>
  store.todo().solicitudesAgente.filter((s) => s.usuarioId === usuarioId && s.estado === 'aprobada').pop() ?? null

export function estado(u: Usuario) {
  const solicitud = solicitudDe(u.id)
  const garantia = garantiaRequerida()
  const disponible = billetera.saldo(u.id, 'ORIGEN').disponible
  const requisitos = {
    gidVerificado: u.gidEstado === 'verificada',
    saldoSuficiente: Dec.mayorIgual(disponible, garantia),
    ordenesMin: ORDENES_MIN,
    ordenesCompletadas: u.reputacion.ordenesCompletadas,
  }
  const cumple = requisitos.gidVerificado && requisitos.saldoSuficiente && requisitos.ordenesCompletadas >= ORDENES_MIN && !u.congelado && !u.agenteSuspendido
  return { estadoAgente: u.agente, solicitud, garantiaRequerida: garantia, requisitos, cumple, suspendido: u.agenteSuspendido }
}

export function solicitar(u: Usuario, descripcion: unknown): SolicitudAgente {
  usuarios.exigirOperar(u)
  if (u.agente === 'aprobado') throw conflicto('Ya es agente de cambio', 'estado-invalido')
  if (u.agente === 'suspendido' || u.agenteSuspendido) throw conflicto('Su condición de agente está suspendida; escriba a soporte', 'estado-invalido')
  if (u.agente === 'solicitado') throw conflicto('Ya tiene una solicitud pendiente', 'estado-invalido')
  if (u.reputacion.ordenesCompletadas < ORDENES_MIN) throw malaPeticion(`Hacen falta al menos ${ORDENES_MIN} órdenes completadas`, 'requisitos')
  const texto = String(descripcion || '').trim().slice(0, 1000)
  if (texto.length < 20) throw malaPeticion('Cuente en al menos 20 caracteres cómo va a operar (países, volumen, horarios)', 'descripcion')
  const garantia = garantiaRequerida()
  const solicitud: SolicitudAgente = {
    id: id('sol'), usuarioId: u.id, garantia, descripcion: texto, estado: 'pendiente',
    solicitadaEn: new Date().toISOString(), resueltaEn: null, resueltaPor: null, nota: null,
  }
  billetera.congelar(u.id, 'ORIGEN', garantia, 'garantia-agente', solicitud.id, 'Garantía de agente de cambio')
  store.todo().solicitudesAgente.push(solicitud)
  u.agente = 'solicitado'
  registrar(u.id, 'agente.solicitado', solicitud.id, { garantia })
  store.guardar()
  return solicitud
}

export function retirar(u: Usuario): SolicitudAgente {
  usuarios.exigirNoCongelado(u)
  const s = solicitudDe(u.id)
  if (!s || s.estado !== 'pendiente') throw conflicto('No hay una solicitud pendiente', 'estado-invalido')
  s.estado = 'retirada'
  s.resueltaEn = new Date().toISOString()
  s.resueltaPor = u.id
  billetera.descongelar(u.id, 'ORIGEN', s.garantia, 'garantia-devuelta', s.id, 'Solicitud de agente retirada')
  u.agente = 'no'
  registrar(u.id, 'agente.retirado', s.id, {})
  store.guardar()
  return s
}

export function renunciar(u: Usuario): Usuario {
  usuarios.exigirNoCongelado(u)
  if (u.agente === 'suspendido' || u.agenteSuspendido) throw conflicto('Un agente suspendido no puede renunciar; la garantía la resuelve un operador', 'estado-invalido')
  if (u.agente !== 'aprobado') throw conflicto('No es agente de cambio', 'estado-invalido')
  const abiertas = store.todo().ordenes.some((o) =>
    (o.compradorId === u.id || o.vendedorId === u.id) && (o.estado === 'pendiente-pago' || o.estado === 'pagado' || o.estado === 'apelacion'))
  if (abiertas) throw conflicto('Tiene órdenes abiertas; espere a que terminen', 'ordenes-abiertas')
  const anunciosAbiertos = store.todo().anuncios.some((a) => a.usuarioId === u.id && a.estado !== 'cerrado')
  if (anunciosAbiertos) throw conflicto('Cierre sus anuncios antes de renunciar', 'anuncios-abiertos')
  const s = aprobadaDe(u.id)
  if (s) {
    billetera.descongelar(u.id, 'ORIGEN', s.garantia, 'garantia-devuelta', s.id, 'Renuncia como agente de cambio')
    s.nota = `${s.nota ? s.nota + ' · ' : ''}garantía devuelta por renuncia`
  }
  u.agente = 'no'
  registrar(u.id, 'agente.renuncia', u.id, {})
  store.guardar()
  return u
}

export function decidir(idSolicitud: string, decision: unknown, nota: unknown, actor: string): SolicitudAgente {
  const s = store.todo().solicitudesAgente.find((x) => x.id === idSolicitud)
  if (!s) throw noEncontrado('Solicitud no encontrada')
  if (s.estado !== 'pendiente') throw conflicto('La solicitud ya fue resuelta', 'estado-invalido')
  const u = usuarios.exigir(s.usuarioId)
  const texto = String(nota || '').trim().slice(0, 500)
  if (decision === 'aprobar') {
    s.estado = 'aprobada'
    u.agente = 'aprobado'
    u.agenteSuspendido = null
  } else if (decision === 'rechazar') {
    if (!texto) throw malaPeticion('Hace falta una nota con el motivo del rechazo', 'nota')
    s.estado = 'rechazada'
    u.agente = 'no'
    billetera.descongelar(u.id, 'ORIGEN', s.garantia, 'garantia-devuelta', s.id, `Solicitud rechazada: ${texto}`)
  } else {
    throw malaPeticion('La decisión tiene que ser «aprobar» o «rechazar»')
  }
  s.nota = texto || null
  s.resueltaEn = new Date().toISOString()
  s.resueltaPor = actor
  registrar(actor, `agente.${s.estado}`, s.id, { usuarioId: u.id, nota: texto })
  store.guardar()
  return s
}

/**
 * Suspender o reactivar a un agente. Suspender deja la garantía en custodia
 * y pausa sus anuncios; `retirado` (solo operador) además la devuelve y lo
 * saca del rol.
 */
export function fijarEstado(u: Usuario, estadoNuevo: unknown, nota: unknown, actor: string): Usuario {
  const texto = String(nota || '').trim().slice(0, 500)
  if (estadoNuevo !== 'aprobado' && estadoNuevo !== 'suspendido' && estadoNuevo !== 'retirado') {
    throw malaPeticion('El estado tiene que ser «aprobado», «suspendido» o «retirado»')
  }
  if (u.agente !== 'aprobado' && u.agente !== 'suspendido') throw conflicto('Ese usuario no es agente', 'estado-invalido')
  if (estadoNuevo === 'suspendido') {
    if (texto.length < 5) throw malaPeticion('Hace falta el motivo de la suspensión', 'nota')
    u.agente = 'suspendido'
    u.agenteSuspendido = { en: new Date().toISOString(), motivo: texto }
    anuncios.pausarTodos(u.id, 'agente suspendido')
  } else if (estadoNuevo === 'aprobado') {
    u.agente = 'aprobado'
    u.agenteSuspendido = null
  } else {
    const s = aprobadaDe(u.id)
    if (s) billetera.descongelar(u.id, 'ORIGEN', s.garantia, 'garantia-devuelta', s.id, `Garantía devuelta por un operador: ${texto || 'sin nota'}`)
    u.agente = 'no'
    u.agenteSuspendido = null
    anuncios.pausarTodos(u.id, 'dejó de ser agente')
  }
  registrar(actor, `agente.${estadoNuevo}`, u.id, { nota: texto })
  store.guardar()
  return u
}

export const solicitudes = (estado?: string): SolicitudAgente[] =>
  store.todo().solicitudesAgente.filter((s) => !estado || s.estado === estado).slice().reverse()
