// Métodos de pago de cada usuario: las cuentas donde recibe moneda local.
//
// Los datos de una cuenta bancaria solo se enseñan a la contraparte dentro de
// una orden abierta, y ahí van como COPIA: si el usuario edita el método
// después, la orden sigue mostrando lo que se pactó.

import { store } from '../store.js'
import { id } from '../lib/uid.js'
import { malaPeticion, conflicto, noEncontrado } from '../lib/errores.js'
import { pais as paisDe, metodoDe } from '../data/latam.js'
import { registrar } from './bitacora.js'
import type { MetodoPago, MetodoPagoEnOrden, Usuario } from '../types.js'

const MAXIMO = 20

export const listar = (usuarioId: string): MetodoPago[] =>
  store.todo().metodosPago.filter((m) => m.usuarioId === usuarioId)

export const porId = (usuarioId: string, idMetodo: string): MetodoPago | undefined =>
  store.todo().metodosPago.find((m) => m.id === idMetodo && m.usuarioId === usuarioId)

function limpiarCampos(campos: unknown, definicion: { clave: string; obligatorio: boolean }[]): Record<string, string> {
  const entrada = (campos && typeof campos === 'object' ? campos : {}) as Record<string, unknown>
  const salida: Record<string, string> = {}
  for (const c of definicion) {
    const v = String(entrada[c.clave] ?? '').trim().slice(0, 120)
    if (c.obligatorio && !v) throw malaPeticion(`Falta el campo «${c.clave}»`, 'campo-faltante')
    if (v) salida[c.clave] = v
  }
  return salida
}

export function crear(u: Usuario, entrada: { pais?: unknown; tipo?: unknown; banco?: unknown; titular?: unknown; campos?: unknown }): MetodoPago {
  if (listar(u.id).length >= MAXIMO) throw conflicto(`No se pueden tener más de ${MAXIMO} métodos de pago`)
  const iso2 = String(entrada.pais || u.pais).toUpperCase()
  const p = paisDe(iso2)
  if (!p) throw malaPeticion('País no disponible', 'pais-no-permitido')
  const def = metodoDe(iso2, String(entrada.tipo || ''))
  if (!def) throw malaPeticion('Ese método de pago no existe para ese país', 'metodo')
  const titular = String(entrada.titular || '').trim().slice(0, 80)
  if (titular.length < 3) throw malaPeticion('Hace falta el nombre del titular', 'titular')
  let banco: string | null = null
  if (def.bancos?.length) {
    banco = String(entrada.banco || '').trim().slice(0, 80)
    if (!banco) throw malaPeticion('Hace falta elegir el banco', 'banco')
  } else if (entrada.banco) {
    banco = String(entrada.banco).trim().slice(0, 80) || null
  }
  const metodo: MetodoPago = {
    id: id('mp'),
    usuarioId: u.id,
    pais: iso2,
    moneda: p.moneda.codigo,
    tipo: def.tipo,
    nombreMetodo: def.nombre,
    categoria: def.categoria,
    banco,
    titular,
    campos: limpiarCampos(entrada.campos, def.campos),
    activo: true,
    creadoEn: new Date().toISOString(),
  }
  store.todo().metodosPago.push(metodo)
  registrar(u.id, 'metodo.creado', metodo.id, { tipo: def.tipo, pais: iso2, banco })
  store.guardar()
  return metodo
}

export function actualizar(u: Usuario, idMetodo: string, entrada: { titular?: unknown; banco?: unknown; campos?: unknown; activo?: unknown }): MetodoPago {
  const m = porId(u.id, idMetodo)
  if (!m) throw noEncontrado('Método de pago no encontrado')
  const def = metodoDe(m.pais, m.tipo)
  if (entrada.titular !== undefined) {
    const t = String(entrada.titular || '').trim().slice(0, 80)
    if (t.length < 3) throw malaPeticion('Hace falta el nombre del titular', 'titular')
    m.titular = t
  }
  if (entrada.banco !== undefined) {
    const b = String(entrada.banco || '').trim().slice(0, 80)
    if (def?.bancos?.length && !b) throw malaPeticion('Hace falta elegir el banco', 'banco')
    m.banco = b || null
  }
  if (entrada.campos !== undefined && def) m.campos = limpiarCampos(entrada.campos, def.campos)
  if (entrada.activo !== undefined) m.activo = Boolean(entrada.activo)
  registrar(u.id, 'metodo.actualizado', m.id, {})
  store.guardar()
  return m
}

export function eliminar(u: Usuario, idMetodo: string): void {
  const m = porId(u.id, idMetodo)
  if (!m) throw noEncontrado('Método de pago no encontrado')
  const enAnuncio = store.todo().anuncios.some((a) =>
    a.usuarioId === u.id && a.estado !== 'cerrado' && a.metodos.some((x) => x.id === m.id))
  if (enAnuncio) throw conflicto('Ese método está en un anuncio abierto; cierre o edite el anuncio primero', 'metodo-en-uso')
  const d = store.todo()
  d.metodosPago = d.metodosPago.filter((x) => x.id !== m.id)
  registrar(u.id, 'metodo.eliminado', m.id, {})
  store.guardar()
}

export function copiaParaOrden(m: MetodoPago): MetodoPagoEnOrden {
  return { id: m.id, tipo: m.tipo, nombreMetodo: m.nombreMetodo, categoria: m.categoria, banco: m.banco, titular: m.titular, campos: { ...m.campos } }
}
