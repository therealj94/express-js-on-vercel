// Anuncios: la oferta del mercado P2P.
//
// Un anuncio de VENTA es alguien que vende activo; aparece en la pestaña
// «Comprar» de los demás. Un anuncio de COMPRA es alguien que quiere activo y
// paga en moneda local; aparece en «Vender». El activo no se congela al
// publicar sino al abrirse cada orden: por eso un anuncio de venta exige que
// el anunciante tenga el disponible, y se pausa solo si deja de tenerlo.

import { store } from '../store.js'
import { Dec } from '../lib/decimal.js'
import { id, numeroAnuncio } from '../lib/uid.js'
import { malaPeticion, conflicto, noEncontrado, sinPermiso } from '../lib/errores.js'
import { pais as paisDe, metodoDe } from '../data/latam.js'
import { decimalesMoneda, monedaValida } from '../data/monedas.js'
import { activo as defActivo } from '../data/activos.js'
import { registrar } from './bitacora.js'
import * as usuarios from './usuarios.js'
import * as billetera from './billetera.js'
import * as metodosPago from './metodosPago.js'
import { precioFlotante, aUsd, referenciaFiat } from './precios.js'
import type { Anuncio, AnuncioPublico, Lado, Usuario, VentanaPago, RequisitosAnuncio, MetodoEnAnuncio, TipoPrecio } from '../types.js'

const VENTANAS: VentanaPago[] = [15, 30, 45, 60]
const MARGEN_MIN = 80
const MARGEN_MAX = 120

export const porId = (idAnuncio: string): Anuncio | undefined => store.todo().anuncios.find((a) => a.id === idAnuncio)

export function exigir(idAnuncio: string): Anuncio {
  const a = porId(idAnuncio)
  if (!a) throw noEncontrado('Anuncio no encontrado')
  return a
}

export const misAnuncios = (usuarioId: string): Anuncio[] =>
  store.todo().anuncios.filter((a) => a.usuarioId === usuarioId).reverse()

/** Precio por unidad ahora mismo, o null si es flotante y no hay referencia. */
export function precioEfectivo(a: Anuncio): string | null {
  if (a.tipoPrecio === 'fijo') return a.precio
  return precioFlotante(a.activo, a.moneda, a.margen ?? 100)
}

// ── Validación ───────────────────────────────────────────────────────────────

function montoFiat(x: unknown, moneda: string, nombre: string): string {
  if (!Dec.esValido(x)) throw malaPeticion(`${nombre} tiene que ser un número`, 'monto')
  const v = Dec.n(x as string)
  if (!Dec.esPositivo(v)) throw malaPeticion(`${nombre} tiene que ser mayor que cero`, 'monto')
  if (Dec.decimalesDe(v) > decimalesMoneda(moneda)) throw malaPeticion(`${nombre}: ${moneda} admite ${decimalesMoneda(moneda)} decimales`, 'monto')
  return v
}

function validarRequisitos(entrada: unknown, base?: RequisitosAnuncio): RequisitosAnuncio {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>
  const num = (v: unknown, def: number, max: number, nombre: string) => {
    if (v === undefined) return def
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > max) throw malaPeticion(`${nombre} tiene que ser un entero entre 0 y ${max}`, 'requisitos')
    return n
  }
  return {
    ordenesMin: num(e.ordenesMin, base?.ordenesMin ?? 0, 10000, 'ordenesMin'),
    tasaFinalizacionMin: num(e.tasaFinalizacionMin, base?.tasaFinalizacionMin ?? 0, 100, 'tasaFinalizacionMin'),
    diasRegistroMin: num(e.diasRegistroMin, base?.diasRegistroMin ?? 0, 3650, 'diasRegistroMin'),
    soloAgentes: e.soloAgentes === undefined ? (base?.soloAgentes ?? false) : Boolean(e.soloAgentes),
  }
}

function validarMetodos(u: Usuario, lado: Lado, moneda: string, pais: string, ids: unknown, tipos: unknown): MetodoEnAnuncio[] {
  if (lado === 'venta') {
    const lista = Array.isArray(ids) ? ids.map(String) : []
    if (!lista.length || lista.length > 5) throw malaPeticion('Elija entre 1 y 5 métodos de pago donde recibirá el dinero', 'metodos')
    const salida: MetodoEnAnuncio[] = []
    for (const idMetodo of new Set(lista)) {
      const m = metodosPago.porId(u.id, idMetodo)
      if (!m || !m.activo) throw malaPeticion('Uno de los métodos de pago no existe o está desactivado', 'metodos')
      if (m.moneda !== moneda && !(moneda === 'USD' && m.moneda === 'USD')) {
        throw malaPeticion(`El método «${m.nombreMetodo}» recibe ${m.moneda}, no ${moneda}`, 'metodos')
      }
      salida.push({ id: m.id, tipo: m.tipo, nombre: m.nombreMetodo, categoria: m.categoria, banco: m.banco })
    }
    return salida
  }
  const lista = Array.isArray(tipos) ? tipos.map((t) => String(t).toLowerCase()) : []
  if (!lista.length || lista.length > 5) throw malaPeticion('Elija entre 1 y 5 métodos de pago con los que pagará', 'metodos')
  const salida: MetodoEnAnuncio[] = []
  for (const tipo of new Set(lista)) {
    const def = metodoDe(pais, tipo)
    if (!def) throw malaPeticion(`El método «${tipo}» no existe en ese país`, 'metodos')
    salida.push({ id: null, tipo: def.tipo, nombre: def.nombre, categoria: def.categoria, banco: null })
  }
  return salida
}

function validarPrecio(tipoPrecio: unknown, precio: unknown, margen: unknown, activo: Anuncio['activo'], moneda: string): { tipoPrecio: TipoPrecio; precio: string | null; margen: number | null } {
  if (tipoPrecio === 'fijo') {
    if (!Dec.esValido(precio)) throw malaPeticion('Hace falta el precio por unidad', 'precio')
    const p = Dec.n(precio as string)
    if (!Dec.esPositivo(p)) throw malaPeticion('El precio tiene que ser mayor que cero', 'precio')
    if (Dec.decimalesDe(p) > decimalesMoneda(moneda) + 4) throw malaPeticion('Demasiados decimales en el precio', 'precio')
    // Un precio diez veces fuera de la referencia casi siempre es un error de
    // tecleo (un cero de más), y en un mercado de dinero un error así se paga.
    const ref = referenciaFiat(activo, moneda)
    if (ref && (Dec.mayor(p, Dec.multiplicar(ref, '10')) || Dec.menor(p, Dec.dividir(ref, '10')))) {
      throw malaPeticion(`El precio está muy lejos de la referencia (${ref} ${moneda}); revíselo`, 'precio-fuera-de-rango')
    }
    return { tipoPrecio: 'fijo', precio: p, margen: null }
  }
  if (tipoPrecio === 'flotante') {
    const m = Number(margen)
    if (!Number.isFinite(m) || m < MARGEN_MIN || m > MARGEN_MAX) throw malaPeticion(`El margen tiene que estar entre ${MARGEN_MIN} % y ${MARGEN_MAX} %`, 'margen')
    if (precioFlotante(activo, moneda, m) == null) {
      throw malaPeticion(`No hay precio de referencia para ${activo} en ${moneda}; publique con precio fijo`, 'sin-referencia')
    }
    return { tipoPrecio: 'flotante', precio: null, margen: Math.round(m * 100) / 100 }
  }
  throw malaPeticion('tipoPrecio tiene que ser «fijo» o «flotante»', 'precio')
}

function validarLimites(limiteMin: unknown, limiteMax: unknown, moneda: string, cantidadTotal: string, precio: string | null): { limiteMin: string; limiteMax: string } {
  const min = montoFiat(limiteMin, moneda, 'El límite mínimo')
  const max = montoFiat(limiteMax, moneda, 'El límite máximo')
  if (Dec.mayor(min, max)) throw malaPeticion('El límite mínimo no puede superar al máximo', 'limites')
  const cfg = store.todo().configuracion
  const minUsd = aUsd(min, moneda)
  if (minUsd != null && minUsd < cfg.minOrdenUsd) {
    throw malaPeticion(`El límite mínimo tiene que equivaler al menos a ${cfg.minOrdenUsd} USD`, 'limites')
  }
  if (precio) {
    const tope = Dec.multiplicar(cantidadTotal, precio)
    if (Dec.mayor(max, tope)) {
      throw malaPeticion(`El límite máximo (${max}) supera el valor total del anuncio (${Dec.redondear(tope, decimalesMoneda(moneda))} ${moneda})`, 'limites')
    }
  }
  return { limiteMin: min, limiteMax: max }
}

// ── Crear / editar ───────────────────────────────────────────────────────────

export function crear(u: Usuario, e: Record<string, unknown>): Anuncio {
  usuarios.exigirOperar(u)
  const lado = e.lado as Lado
  if (lado !== 'compra' && lado !== 'venta') throw malaPeticion('lado tiene que ser «compra» o «venta»', 'lado')
  const activo = billetera.validarActivo(e.activo)
  const pais = usuarios.validarPais(e.pais ?? u.pais)
  const moneda = String(e.moneda || paisDe(pais)!.moneda.codigo).toUpperCase()
  if (!monedaValida(moneda)) throw malaPeticion('Moneda desconocida', 'moneda')
  if (moneda !== paisDe(pais)!.moneda.codigo && moneda !== 'USD') {
    throw malaPeticion(`En ${paisDe(pais)!.nombre} se opera en ${paisDe(pais)!.moneda.codigo} o en USD`, 'moneda')
  }
  const cantidadTotal = billetera.cantidadValida(e.cantidadTotal, activo)
  const precioV = validarPrecio(e.tipoPrecio, e.precio, e.margen, activo, moneda)
  const precioAhora = precioV.tipoPrecio === 'fijo' ? precioV.precio : precioFlotante(activo, moneda, precioV.margen!)
  const limites = validarLimites(e.limiteMin, e.limiteMax, moneda, cantidadTotal, precioAhora)
  const metodos = validarMetodos(u, lado, moneda, pais, e.metodosPagoIds, e.metodosTipos)
  const ventana = Number(e.ventanaPagoMin || 30) as VentanaPago
  if (!VENTANAS.includes(ventana)) throw malaPeticion(`La ventana de pago tiene que ser ${VENTANAS.join(', ')} minutos`, 'ventana')
  const terminos = e.terminos == null ? null : String(e.terminos).trim().slice(0, 1000) || null
  const respuesta = e.respuestaAutomatica == null ? null : String(e.respuestaAutomatica).trim().slice(0, 500) || null
  const requisitos = validarRequisitos(e.requisitos)

  const abierto = store.todo().anuncios.find((a) =>
    a.usuarioId === u.id && a.lado === lado && a.activo === activo && a.moneda === moneda && (a.estado === 'activo' || a.estado === 'pausado' || a.estado === 'agotado'))
  if (abierto) throw conflicto(`Ya tiene un anuncio de ${lado} de ${activo} en ${moneda} (${abierto.numero}); edítelo o ciérrelo`, 'anuncio-duplicado')

  if (lado === 'venta') {
    const s = billetera.saldo(u.id, activo)
    if (Dec.menor(s.disponible, cantidadTotal)) {
      throw conflicto(`Para vender ${cantidadTotal} ${activo} necesita tenerlos disponibles (tiene ${s.disponible})`, 'sin-saldo', { disponible: s.disponible, requerido: cantidadTotal, activo })
    }
  }

  const ahora = new Date().toISOString()
  const anuncio: Anuncio = {
    id: id('anu'), numero: numeroAnuncio(), usuarioId: u.id, lado, activo, moneda, pais,
    tipoPrecio: precioV.tipoPrecio, precio: precioV.precio, margen: precioV.margen,
    cantidadTotal, cantidadDisponible: cantidadTotal,
    limiteMin: limites.limiteMin, limiteMax: limites.limiteMax,
    metodos, ventanaPagoMin: ventana, terminos, respuestaAutomatica: respuesta, requisitos,
    estado: 'activo', ordenesAbiertas: 0, ordenesCompletadas: 0, creadoEn: ahora, actualizadoEn: ahora,
  }
  store.todo().anuncios.push(anuncio)
  registrar(u.id, 'anuncio.creado', anuncio.id, { numero: anuncio.numero, lado, activo, moneda, pais, tipoPrecio: anuncio.tipoPrecio, precio: anuncio.precio, margen: anuncio.margen, cantidadTotal })
  store.guardar()
  return anuncio
}

export function actualizar(u: Usuario, idAnuncio: string, e: Record<string, unknown>): Anuncio {
  const a = exigir(idAnuncio)
  if (a.usuarioId !== u.id) throw noEncontrado('Anuncio no encontrado')
  if (a.estado === 'cerrado') throw conflicto('Un anuncio cerrado no se puede editar', 'estado-invalido')
  usuarios.exigirOperar(u)
  const cambios: Record<string, unknown> = {}

  if (e.tipoPrecio !== undefined || e.precio !== undefined || e.margen !== undefined) {
    const tipo = e.tipoPrecio ?? a.tipoPrecio
    const v = validarPrecio(tipo, e.precio ?? a.precio, e.margen ?? a.margen, a.activo, a.moneda)
    a.tipoPrecio = v.tipoPrecio; a.precio = v.precio; a.margen = v.margen
    Object.assign(cambios, { tipoPrecio: v.tipoPrecio, precio: v.precio, margen: v.margen })
  }
  if (e.cantidadTotal !== undefined) {
    const nueva = billetera.cantidadValida(e.cantidadTotal, a.activo)
    const consumido = Dec.restar(a.cantidadTotal, a.cantidadDisponible)
    const disponible = Dec.restar(nueva, consumido)
    if (Dec.esNegativo(disponible)) throw malaPeticion(`La cantidad total no puede bajar de lo ya comprometido (${consumido} ${a.activo})`, 'cantidad')
    if (a.lado === 'venta') {
      const s = billetera.saldo(u.id, a.activo)
      if (Dec.menor(s.disponible, disponible)) throw conflicto(`No tiene ${disponible} ${a.activo} disponibles (tiene ${s.disponible})`, 'sin-saldo')
    }
    a.cantidadTotal = nueva
    a.cantidadDisponible = disponible
    cambios.cantidadTotal = nueva
    if (a.estado === 'agotado' && Dec.esPositivo(disponible)) a.estado = 'activo'
    if (Dec.esCero(disponible) && a.estado === 'activo') a.estado = 'agotado'
  }
  if (e.limiteMin !== undefined || e.limiteMax !== undefined) {
    const l = validarLimites(e.limiteMin ?? a.limiteMin, e.limiteMax ?? a.limiteMax, a.moneda, a.cantidadTotal, precioEfectivo(a))
    a.limiteMin = l.limiteMin; a.limiteMax = l.limiteMax
    Object.assign(cambios, l)
  }
  if (e.metodosPagoIds !== undefined || e.metodosTipos !== undefined) {
    a.metodos = validarMetodos(u, a.lado, a.moneda, a.pais, e.metodosPagoIds, e.metodosTipos)
    cambios.metodos = a.metodos.map((m) => m.tipo)
  }
  if (e.ventanaPagoMin !== undefined) {
    const v = Number(e.ventanaPagoMin) as VentanaPago
    if (!VENTANAS.includes(v)) throw malaPeticion(`La ventana de pago tiene que ser ${VENTANAS.join(', ')} minutos`, 'ventana')
    a.ventanaPagoMin = v
    cambios.ventanaPagoMin = v
  }
  if (e.terminos !== undefined) a.terminos = e.terminos == null ? null : String(e.terminos).trim().slice(0, 1000) || null
  if (e.respuestaAutomatica !== undefined) a.respuestaAutomatica = e.respuestaAutomatica == null ? null : String(e.respuestaAutomatica).trim().slice(0, 500) || null
  if (e.requisitos !== undefined) a.requisitos = validarRequisitos(e.requisitos, a.requisitos)

  a.actualizadoEn = new Date().toISOString()
  registrar(u.id, 'anuncio.actualizado', a.id, cambios)
  store.guardar()
  return a
}

export function cambiarEstado(u: Usuario, idAnuncio: string, estado: unknown): Anuncio {
  const a = exigir(idAnuncio)
  if (a.usuarioId !== u.id) throw noEncontrado('Anuncio no encontrado')
  if (estado !== 'activo' && estado !== 'pausado' && estado !== 'cerrado') throw malaPeticion('Estado inválido: activo, pausado o cerrado', 'estado')
  if (a.estado === 'cerrado') throw conflicto('Un anuncio cerrado no se reabre; cree uno nuevo', 'estado-invalido')
  if (estado === 'cerrado' && a.ordenesAbiertas > 0) throw conflicto('Tiene órdenes abiertas; espere a que terminen para cerrarlo', 'ordenes-abiertas')
  if (estado === 'activo') {
    usuarios.exigirOperar(u)
    if (Dec.esCero(a.cantidadDisponible)) throw conflicto('El anuncio está agotado; aumente la cantidad total para reactivarlo', 'agotado')
    if (a.lado === 'venta' && Dec.menor(billetera.saldo(u.id, a.activo).disponible, a.cantidadDisponible)) {
      throw conflicto('No tiene saldo disponible para cubrir el anuncio', 'sin-saldo')
    }
    if (a.tipoPrecio === 'flotante' && precioEfectivo(a) == null) throw conflicto('No hay precio de referencia; edite el anuncio a precio fijo', 'sin-referencia')
  }
  a.estado = estado
  a.actualizadoEn = new Date().toISOString()
  registrar(u.id, `anuncio.${estado}`, a.id, {})
  store.guardar()
  return a
}

// ── Lo que usan las órdenes ──────────────────────────────────────────────────

export function reservar(a: Anuncio, cantidad: string): void {
  if (Dec.mayor(cantidad, a.cantidadDisponible)) throw conflicto('El anuncio ya no tiene esa cantidad disponible', 'fuera-de-limites')
  a.cantidadDisponible = Dec.restar(a.cantidadDisponible, cantidad)
  a.ordenesAbiertas += 1
  if (Dec.esCero(a.cantidadDisponible) && a.estado === 'activo') a.estado = 'agotado'
  a.actualizadoEn = new Date().toISOString()
}

export function devolver(a: Anuncio, cantidad: string): void {
  a.cantidadDisponible = Dec.sumar(a.cantidadDisponible, cantidad)
  a.ordenesAbiertas = Math.max(0, a.ordenesAbiertas - 1)
  if (a.estado === 'agotado' && Dec.esPositivo(a.cantidadDisponible)) a.estado = 'activo'
  a.actualizadoEn = new Date().toISOString()
}

export function consumir(a: Anuncio): void {
  a.ordenesAbiertas = Math.max(0, a.ordenesAbiertas - 1)
  a.ordenesCompletadas += 1
  a.actualizadoEn = new Date().toISOString()
}

export function pausarPorSistema(a: Anuncio, motivo: string): void {
  if (a.estado !== 'activo') return
  a.estado = 'pausado'
  a.actualizadoEn = new Date().toISOString()
  registrar('sistema', 'anuncio.pausado', a.id, { motivo })
}

/** Pausa todos los anuncios abiertos de un usuario (al congelarlo o suspenderlo). */
export function pausarTodos(usuarioId: string, motivo: string): void {
  for (const a of store.todo().anuncios) if (a.usuarioId === usuarioId) pausarPorSistema(a, motivo)
  store.guardar()
}

// ── Requisitos y vista pública ───────────────────────────────────────────────

export function cumpleRequisitos(a: Anuncio, u: Usuario): { ok: boolean; motivo: string | null } {
  const r = a.requisitos
  if (r.soloAgentes && u.agente !== 'aprobado') return { ok: false, motivo: 'Este anuncio solo acepta agentes de cambio' }
  if (u.reputacion.ordenesCompletadas < r.ordenesMin) return { ok: false, motivo: `Hacen falta al menos ${r.ordenesMin} órdenes completadas` }
  if (u.reputacion.tasaFinalizacion30d < r.tasaFinalizacionMin) return { ok: false, motivo: `Hace falta una tasa de finalización de al menos ${r.tasaFinalizacionMin} %` }
  if (usuarios.diasRegistrado(u) < r.diasRegistroMin) return { ok: false, motivo: `Hace falta una cuenta con al menos ${r.diasRegistroMin} días` }
  return { ok: true, motivo: null }
}

export function publico(a: Anuncio, consultante: Usuario | null): AnuncioPublico | null {
  const precio = precioEfectivo(a)
  if (precio == null) return null
  const anunciante = usuarios.porId(a.usuarioId)
  if (!anunciante) return null
  const cumple = consultante ? cumpleRequisitos(a, consultante) : null
  return {
    id: a.id, numero: a.numero, lado: a.lado, activo: a.activo, moneda: a.moneda, pais: a.pais,
    tipoPrecio: a.tipoPrecio, precio, margen: a.margen,
    cantidadDisponible: a.cantidadDisponible, limiteMin: a.limiteMin, limiteMax: a.limiteMax,
    metodos: a.metodos.map(({ id: _i, ...m }) => m),
    ventanaPagoMin: a.ventanaPagoMin, terminos: a.terminos, requisitos: a.requisitos,
    anunciante: usuarios.publico(anunciante),
    cumpleRequisitos: cumple ? cumple.ok : null,
    motivoNoCumple: cumple?.motivo ?? null,
  }
}

/** Con el precio efectivo, para la lista de «mis anuncios». */
export function propio(a: Anuncio): Anuncio & { precioEfectivo: string | null } {
  return { ...a, precioEfectivo: precioEfectivo(a) }
}

export interface Filtros {
  quiero?: string; lado?: string; activo?: string; moneda?: string; pais?: string; monto?: string
  metodo?: string; soloAgentes?: string; orden?: string; pagina?: string; porPagina?: string
}

/**
 * ¿Se puede tomar este anuncio ahora mismo? Lo mismo que filtra el mercado.
 *
 * Un anuncio de venta necesita que el anunciante tenga disponible al menos
 * lo que cuesta una orden mínima; y cualquier anuncio necesita que lo que le
 * queda alcance para su propio límite mínimo, si no nadie puede tomarlo.
 */
export function disponibleEnMercado(a: Anuncio): boolean {
  if (a.estado !== 'activo') return false
  const anunciante = usuarios.porId(a.usuarioId)
  if (!anunciante || usuarios.motivoNoOpera(anunciante)) return false
  if (!Dec.esPositivo(a.cantidadDisponible)) return false
  const precio = precioEfectivo(a)
  if (precio == null) return false
  const valorRestante = Dec.multiplicar(a.cantidadDisponible, precio)
  if (Dec.menor(valorRestante, a.limiteMin)) return false
  if (a.lado === 'venta') {
    const minimoActivo = Dec.min(a.cantidadDisponible, Dec.dividir(a.limiteMin, precio))
    if (Dec.menor(billetera.saldo(a.usuarioId, a.activo).disponible, minimoActivo)) return false
  }
  return true
}

export function buscar(f: Filtros, consultante: Usuario | null): { anuncios: AnuncioPublico[]; total: number; pagina: number; porPagina: number } {
  let lado: Lado = 'venta'
  if (f.quiero === 'vender') lado = 'compra'
  else if (f.quiero === 'comprar') lado = 'venta'
  else if (f.lado === 'compra' || f.lado === 'venta') lado = f.lado
  const activo = String(f.activo || 'ORIGEN').toUpperCase()
  const moneda = f.moneda ? String(f.moneda).toUpperCase() : null
  const pais = f.pais ? String(f.pais).toUpperCase() : null
  const monto = f.monto && Dec.esValido(f.monto) && Dec.esPositivo(f.monto) ? Dec.n(f.monto) : null
  const metodo = f.metodo ? String(f.metodo).toLowerCase() : null
  const soloAgentes = f.soloAgentes === '1' || f.soloAgentes === 'true'
  const porPagina = Math.min(50, Math.max(1, Number(f.porPagina) || 20))
  const pagina = Math.max(1, Number(f.pagina) || 1)

  const lista: AnuncioPublico[] = []
  for (const a of store.todo().anuncios) {
    if (a.lado !== lado || a.activo !== activo) continue
    if (moneda && a.moneda !== moneda) continue
    if (pais && a.pais !== pais) continue
    if (consultante && a.usuarioId === consultante.id) continue
    if (!disponibleEnMercado(a)) continue
    if (metodo && !a.metodos.some((m) => m.tipo === metodo)) continue
    const p = publico(a, consultante)
    if (!p) continue
    if (soloAgentes && !p.anunciante.agente) continue
    if (monto) {
      if (Dec.menor(monto, a.limiteMin) || Dec.mayor(monto, a.limiteMax)) continue
      if (Dec.mayor(monto, Dec.multiplicar(a.cantidadDisponible, p.precio))) continue
    }
    lista.push(p)
  }

  const orden = f.orden || 'precio'
  lista.sort((x, y) => {
    if (orden === 'completadas') return y.anunciante.reputacion.ordenesCompletadas - x.anunciante.reputacion.ordenesCompletadas
    if (orden === 'reciente') return y.id.localeCompare(x.id)
    // Mejor precio para quien consulta: barato si compra, caro si vende.
    const c = Dec.comparar(x.precio, y.precio)
    if (c !== 0) return lado === 'venta' ? c : -c
    if (x.anunciante.agente !== y.anunciante.agente) return x.anunciante.agente ? -1 : 1
    return y.anunciante.reputacion.ordenesCompletadas - x.anunciante.reputacion.ordenesCompletadas
  })

  const desde = (pagina - 1) * porPagina
  return { anuncios: lista.slice(desde, desde + porPagina), total: lista.length, pagina, porPagina }
}

export function anunciosPublicosDe(usuarioId: string, consultante: Usuario | null): AnuncioPublico[] {
  return store.todo().anuncios
    .filter((a) => a.usuarioId === usuarioId && disponibleEnMercado(a))
    .map((a) => publico(a, consultante))
    .filter((x): x is AnuncioPublico => Boolean(x))
}

export function exigirPropietario(u: Usuario, idAnuncio: string): Anuncio {
  const a = exigir(idAnuncio)
  // 404 y no 403: un anuncio ajeno no existe para quien no es su dueño.
  if (a.usuarioId !== u.id) throw noEncontrado('Anuncio no encontrado')
  return a
}

export const decimalesActivo = (a: Anuncio['activo']) => defActivo(a)!.decimales
