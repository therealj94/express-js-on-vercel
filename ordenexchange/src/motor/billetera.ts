// Billetera interna y custodia (escrow).
//
// Cada usuario tiene, por activo, dos bolsillos: DISPONIBLE y CONGELADO. Lo
// congelado es lo que está en custodia: el activo de las órdenes abiertas, los
// retiros que un operador todavía no envió y la garantía de los agentes.
//
// INVARIANTES que este módulo defiende y que nada más puede romper:
//
//   1. Ningún bolsillo baja de cero. Un movimiento que lo haría se rechaza
//      entero, antes de tocar nada.
//   2. Todo cambio de saldo deja un Movimiento con su referencia. La suma de
//      los movimientos de una persona ES su saldo; si no cuadra, la bitácora
//      dice dónde.
//   3. El activo no se crea: entra por depósito comprobado en la cadena (o
//      por el grifo de demostración, que se ve como tal) y sale por retiro.
//      Liberar una orden mueve lo congelado del vendedor al disponible del
//      comprador, y la comisión a la tesorería; nunca aparece ni desaparece.

import { store } from '../store.js'
import { Dec, CERO } from '../lib/decimal.js'
import { id } from '../lib/uid.js'
import { Falla, malaPeticion, conflicto, noEncontrado, sinPermiso } from '../lib/errores.js'
import { activo as defActivo, SIMBOLOS, esActivo } from '../data/activos.js'
import { registrar } from './bitacora.js'
import { verificarDeposito, esDireccion, esHash } from './cadena.js'
import { tamizDireccion, genesisConfigurado } from './genesis.js'
import type { Activo, Saldo, Movimiento, TipoMovimiento, Usuario, Retiro, Deposito } from '../types.js'

/** La cuenta de la plataforma: recibe las comisiones. No es un usuario. */
export const TESORERIA_ID = 'tesoreria'

export function saldo(usuarioId: string, activo: Activo): Saldo {
  const lista = store.todo().saldos
  let s = lista.find((x) => x.usuarioId === usuarioId && x.activo === activo)
  if (!s) {
    s = { usuarioId, activo, disponible: CERO, congelado: CERO }
    lista.push(s)
  }
  return s
}

export const saldos = (usuarioId: string): Saldo[] => SIMBOLOS.map((a) => saldo(usuarioId, a))

/** Valida y normaliza una cantidad del activo: positiva y con los decimales permitidos. */
export function cantidadValida(x: unknown, activo: Activo, permitirCero = false): string {
  if (!Dec.esValido(x)) throw malaPeticion('La cantidad tiene que ser un número decimal', 'cantidad')
  const c = Dec.n(x as string)
  const def = defActivo(activo)!
  if (Dec.decimalesDe(c) > def.decimales) throw malaPeticion(`${activo} admite hasta ${def.decimales} decimales`, 'cantidad')
  if (Dec.esNegativo(c) || (!permitirCero && Dec.esCero(c))) throw malaPeticion('La cantidad tiene que ser mayor que cero', 'cantidad')
  return c
}

export function validarActivo(x: unknown): Activo {
  if (!esActivo(x)) throw malaPeticion(`Activo desconocido. Válidos: ${SIMBOLOS.join(', ')}`, 'activo')
  return String(x).toUpperCase() as Activo
}

/**
 * El único punto por el que cambia un saldo.
 *
 * Aplica los dos deltas juntos o ninguno: se calcula el resultado, se
 * comprueba que ningún bolsillo quede negativo, y solo entonces se escribe.
 */
export function mover(
  usuarioId: string, activo: Activo,
  delta: { disponible?: string; congelado?: string },
  tipo: TipoMovimiento, referencia: string | null, detalle: string,
): Saldo {
  const s = saldo(usuarioId, activo)
  const dDisp = Dec.n(delta.disponible ?? CERO)
  const dCong = Dec.n(delta.congelado ?? CERO)
  const disponible = Dec.sumar(s.disponible, dDisp)
  const congelado = Dec.sumar(s.congelado, dCong)
  if (Dec.esNegativo(disponible)) {
    throw conflicto(`Saldo insuficiente de ${activo}: disponible ${s.disponible}, hace falta ${Dec.abs(dDisp)}`, 'sin-saldo',
      { disponible: s.disponible, requerido: Dec.abs(dDisp), activo })
  }
  if (Dec.esNegativo(congelado)) {
    // Esto nunca debería pasar: significa que se intenta liberar más de lo que
    // hay en custodia. Se rechaza y queda anotado, porque es un error de
    // programación, no de la persona.
    registrar('sistema', 'custodia.incoherente', usuarioId, { activo, congelado: s.congelado, delta: dCong, tipo, referencia })
    throw conflicto('La custodia no cuadra; la operación se rechazó y quedó registrada', 'custodia-incoherente')
  }
  s.disponible = disponible
  s.congelado = congelado
  const mov: Movimiento = {
    id: id('mov'), usuarioId, activo, tipo,
    disponibleDelta: dDisp, congeladoDelta: dCong,
    referencia, detalle, en: new Date().toISOString(),
  }
  store.todo().movimientos.push(mov)
  store.guardar()
  return s
}

export const congelar = (usuarioId: string, activo: Activo, cantidad: string, tipo: TipoMovimiento, ref: string, detalle: string) =>
  mover(usuarioId, activo, { disponible: Dec.negar(cantidad), congelado: cantidad }, tipo, ref, detalle)

export const descongelar = (usuarioId: string, activo: Activo, cantidad: string, tipo: TipoMovimiento, ref: string, detalle: string) =>
  mover(usuarioId, activo, { disponible: cantidad, congelado: Dec.negar(cantidad) }, tipo, ref, detalle)

export const acreditar = (usuarioId: string, activo: Activo, cantidad: string, tipo: TipoMovimiento, ref: string | null, detalle: string) =>
  mover(usuarioId, activo, { disponible: cantidad }, tipo, ref, detalle)

/**
 * Liberar una orden: la custodia del vendedor pasa al comprador, menos la
 * comisión, que va a la tesorería. Tres movimientos que se anotan juntos.
 */
export function liberarCustodia(vendedorId: string, compradorId: string, activo: Activo, cantidad: string, comision: string, ordenId: string): void {
  const neto = Dec.restar(cantidad, comision)
  if (Dec.esNegativo(neto)) throw conflicto('La comisión supera la cantidad', 'comision')
  // Primero se comprueba que el vendedor tenga esa custodia: si falla, no se
  // tocó nada del comprador.
  mover(vendedorId, activo, { congelado: Dec.negar(cantidad) }, 'orden-liberar', ordenId, `Liberación de la orden ${ordenId}`)
  mover(compradorId, activo, { disponible: neto }, 'orden-recibir', ordenId, `Recibido por la orden ${ordenId}`)
  if (Dec.esPositivo(comision)) {
    mover(TESORERIA_ID, activo, { disponible: comision }, 'comision', ordenId, `Comisión de la orden ${ordenId}`)
  }
}

export function movimientos(usuarioId: string, filtro: { activo?: string; pagina?: number; porPagina?: number } = {}) {
  const porPagina = Math.min(200, Math.max(1, Number(filtro.porPagina) || 50))
  const pagina = Math.max(1, Number(filtro.pagina) || 1)
  const todos = store.todo().movimientos.filter((m) =>
    m.usuarioId === usuarioId && (!filtro.activo || m.activo === String(filtro.activo).toUpperCase()))
  const desde = (pagina - 1) * porPagina
  return { movimientos: todos.slice().reverse().slice(desde, desde + porPagina), total: todos.length }
}

/** Cuánto hay en custodia en total, por activo. */
export function custodiaTotal(): Record<Activo, string> {
  const salida = {} as Record<Activo, string>
  for (const a of SIMBOLOS) salida[a] = CERO
  for (const s of store.todo().saldos) {
    if (s.usuarioId === TESORERIA_ID) continue
    salida[s.activo] = Dec.sumar(salida[s.activo], s.congelado)
  }
  return salida
}

// ── Depósitos ────────────────────────────────────────────────────────────────

export async function acreditarDeposito(u: Usuario, entrada: { txHash?: unknown; activo?: unknown }): Promise<Deposito> {
  const activo = validarActivo(entrada.activo)
  if (!esHash(entrada.txHash)) throw malaPeticion('El hash de la transacción tiene que empezar con 0x y llevar 64 caracteres hexadecimales', 'tx-hash')
  const txHash = entrada.txHash.toLowerCase()
  const cfg = store.todo().configuracion
  if (!cfg.tesoreria) throw new Falla(503, 'La tesorería de la plataforma no está configurada (ORDENEX_TESORERIA); los depósitos no se pueden comprobar', 'cadena-no-configurada')
  if (!u.direccionCadena) throw malaPeticion('Registre primero su dirección de la cadena 5550 en el perfil', 'sin-direccion')
  if (u.congelado) throw sinPermiso('La cuenta está bloqueada', 'congelado')
  if (store.todo().depositos.some((d) => d.txHash === txHash && d.estado === 'acreditado')) {
    throw conflicto('Esa transacción ya fue acreditada', 'tx-ya-acreditada')
  }

  const r = await verificarDeposito({ txHash, activo, tesoreria: cfg.tesoreria, desde: u.direccionCadena, confirmaciones: cfg.confirmacionesDeposito })
  if (!r.ok) throw malaPeticion(r.error, r.codigo)

  const def = defActivo(activo)!
  const cantidad = Dec.truncar(r.cantidad, def.decimales)
  const deposito: Deposito = {
    id: id('dep'), usuarioId: u.id, activo, cantidad, txHash, desde: r.desde.toLowerCase(),
    bloque: r.bloque, confirmaciones: r.confirmaciones, estado: 'acreditado', motivo: null, en: new Date().toISOString(),
  }
  store.todo().depositos.push(deposito)
  acreditar(u.id, activo, cantidad, 'deposito', txHash, `Depósito desde la cadena 5550, bloque ${r.bloque}`)
  registrar(u.id, 'deposito.acreditado', deposito.id, { activo, cantidad, txHash, bloque: r.bloque })
  await store.guardarYa()
  return deposito
}

export const depositosDe = (usuarioId: string): Deposito[] =>
  store.todo().depositos.filter((d) => d.usuarioId === usuarioId).reverse()

/** Solo en modo demostración: crea activo de la nada, y se ve como tal en los movimientos. */
export function grifo(u: Usuario, entrada: { activo?: unknown; cantidad?: unknown }): Saldo[] {
  const activo = validarActivo(entrada.activo)
  const cantidad = cantidadValida(entrada.cantidad ?? '100', activo)
  if (Dec.mayor(cantidad, '10000')) throw malaPeticion('El grifo entrega hasta 10 000 por vez', 'cantidad')
  acreditar(u.id, activo, cantidad, 'faucet', null, 'Activo de prueba (modo demostración)')
  return saldos(u.id)
}

// ── Retiros ──────────────────────────────────────────────────────────────────

export async function solicitarRetiro(u: Usuario, entrada: { activo?: unknown; cantidad?: unknown; direccion?: unknown }): Promise<Retiro> {
  const activo = validarActivo(entrada.activo)
  const cantidad = cantidadValida(entrada.cantidad, activo)
  if (!esDireccion(entrada.direccion)) throw malaPeticion('La dirección tiene que empezar con 0x y llevar 40 caracteres hexadecimales', 'direccion')
  if (u.congelado) throw sinPermiso(`La cuenta está bloqueada: ${u.motivoCongelado || ''}`, 'congelado')
  const direccion = entrada.direccion as string

  if (genesisConfigurado()) {
    const t = await tamizDireccion(direccion)
    if (t.ok && t.cuerpo?.sancionada) {
      registrar(u.id, 'retiro.direccion-sancionada', direccion, { activo, cantidad })
      throw malaPeticion('Esa dirección aparece en una lista de sanciones; el retiro no se puede procesar', 'direccion-sancionada')
    }
  }

  const retiro: Retiro = {
    id: id('ret'), usuarioId: u.id, activo, cantidad, direccion, estado: 'pendiente',
    txHash: null, motivo: null, solicitadoEn: new Date().toISOString(), resueltoEn: null, resueltoPor: null,
  }
  congelar(u.id, activo, cantidad, 'retiro-solicitado', retiro.id, `Retiro solicitado a ${direccion}`)
  store.todo().retiros.push(retiro)
  registrar(u.id, 'retiro.solicitado', retiro.id, { activo, cantidad, direccion })
  await store.guardarYa()
  return retiro
}

export const retirosDe = (usuarioId: string): Retiro[] =>
  store.todo().retiros.filter((r) => r.usuarioId === usuarioId).reverse()

export function cancelarRetiro(u: Usuario, idRetiro: string): Retiro {
  const r = store.todo().retiros.find((x) => x.id === idRetiro && x.usuarioId === u.id)
  if (!r) throw noEncontrado('Retiro no encontrado')
  if (r.estado !== 'pendiente') throw conflicto('Solo se puede cancelar un retiro pendiente', 'estado-invalido')
  r.estado = 'cancelado'
  r.resueltoEn = new Date().toISOString()
  r.resueltoPor = u.id
  descongelar(u.id, r.activo, r.cantidad, 'retiro-rechazado', r.id, 'Retiro cancelado por el usuario')
  registrar(u.id, 'retiro.cancelado', r.id, {})
  store.guardar()
  return r
}

export function decidirRetiro(idRetiro: string, decision: unknown, extra: { txHash?: unknown; motivo?: unknown }, actor: string): Retiro {
  const r = store.todo().retiros.find((x) => x.id === idRetiro)
  if (!r) throw noEncontrado('Retiro no encontrado')
  if (r.estado !== 'pendiente') throw conflicto('El retiro ya fue resuelto', 'estado-invalido')
  const ahora = new Date().toISOString()
  if (decision === 'enviado') {
    if (!esHash(extra.txHash)) throw malaPeticion('Hace falta el hash de la transacción de envío', 'tx-hash')
    r.txHash = (extra.txHash as string).toLowerCase()
    r.estado = 'enviado'
    // Sale de la custodia y de la plataforma.
    mover(r.usuarioId, r.activo, { congelado: Dec.negar(r.cantidad) }, 'retiro-enviado', r.id, `Retiro enviado, tx ${r.txHash}`)
  } else if (decision === 'rechazado') {
    r.estado = 'rechazado'
    r.motivo = String(extra.motivo || 'Rechazado por un operador').slice(0, 300)
    descongelar(r.usuarioId, r.activo, r.cantidad, 'retiro-rechazado', r.id, `Retiro rechazado: ${r.motivo}`)
  } else {
    throw malaPeticion('La decisión tiene que ser «enviado» o «rechazado»')
  }
  r.resueltoEn = ahora
  r.resueltoPor = actor
  registrar(actor, `retiro.${r.estado}`, r.id, { usuarioId: r.usuarioId, activo: r.activo, cantidad: r.cantidad, txHash: r.txHash, motivo: r.motivo })
  store.guardar()
  return r
}

export const retirosPendientes = (): Retiro[] => store.todo().retiros.filter((r) => r.estado === 'pendiente')

/** Ajuste manual de un administrador. Queda a la vista en los movimientos y en la bitácora. */
export function ajustar(usuarioId: string, entrada: { activo?: unknown; cantidad?: unknown; motivo?: unknown }, actor: string): Saldo[] {
  const activo = validarActivo(entrada.activo)
  if (!Dec.esValido(entrada.cantidad)) throw malaPeticion('La cantidad tiene que ser un decimal, con signo si es un débito', 'cantidad')
  const cantidad = Dec.n(entrada.cantidad as string)
  if (Dec.esCero(cantidad)) throw malaPeticion('La cantidad no puede ser cero', 'cantidad')
  const motivo = String(entrada.motivo || '').trim()
  if (motivo.length < 5) throw malaPeticion('Hace falta un motivo (mínimo 5 caracteres)', 'motivo')
  mover(usuarioId, activo, { disponible: cantidad }, 'ajuste', null, `Ajuste manual: ${motivo}`)
  registrar(actor, 'saldo.ajustado', usuarioId, { activo, cantidad, motivo })
  return saldos(usuarioId)
}
