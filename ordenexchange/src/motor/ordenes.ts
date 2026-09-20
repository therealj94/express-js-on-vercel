// Órdenes: el ciclo de vida de una compraventa.
//
//   pendiente-pago ──(comprador marca pagado)──▶ pagado ──(vendedor libera)──▶ completada
//        │                                          │
//        ├─(comprador cancela / vence)──▶ cancelada │
//        └───────────(apelación)──▶ apelacion ◀─────┘
//                                       │
//                       operador: liberar ▶ completada · devolver ▶ cancelada
//                       vendedor: liberar ▶ completada (zanja la apelación)
//
// Lo que este módulo garantiza:
//   - el activo del vendedor está en custodia desde que la orden existe hasta
//     que termina, y solo sale hacia el comprador (liberar) o de vuelta al
//     vendedor (cancelar / devolver);
//   - cada transición comprueba el estado actual y quién la pide; nadie libera
//     lo ajeno ni cancela lo que ya se pagó; una cuenta bloqueada no inicia
//     ninguna transición (la contraparte y el operador sí);
//   - todo cambio deja mensaje de sistema en el chat y entrada en la bitácora.

import { store } from '../store.js'
import { Dec } from '../lib/decimal.js'
import { id, numeroOrden } from '../lib/uid.js'
import { firmaCorta } from '../lib/cripto.js'
import { Falla, malaPeticion, conflicto, noEncontrado, sinPermiso } from '../lib/errores.js'
import { decimalesMoneda } from '../data/monedas.js'
import { activo as defActivo } from '../data/activos.js'
import { registrar } from './bitacora.js'
import * as usuarios from './usuarios.js'
import * as billetera from './billetera.js'
import * as anuncios from './anuncios.js'
import * as metodosPago from './metodosPago.js'
import * as imagenes from './imagenes.js'
import { aUsd } from './precios.js'
import { enviarMovimientos } from './genesis.js'
import type { Orden, Usuario, Mensaje, UsuarioPublico, EstadoOrden, Apelacion, Calificacion } from '../types.js'

const ABIERTOS: EstadoOrden[] = ['pendiente-pago', 'pagado', 'apelacion']
const MAX_MENSAJES = 300
const MAX_TEXTO = 2000
const MAX_IMAGEN = 2_100_000 // ~1,5 MB en base64
const MAX_IMAGENES_POR_ORDEN = 6
const HORAS_CHAT_TRAS_CIERRE = 24
const HORAS_APELAR_TRAS_VENCER = 24
const MOTIVOS_APELACION = ['no-recibi-pago', 'no-liberan', 'monto-incorrecto', 'otro']

export const porId = (idOrden: string): Orden | undefined => store.todo().ordenes.find((o) => o.id === idOrden)

export function exigir(idOrden: string): Orden {
  const o = porId(idOrden)
  if (!o) throw noEncontrado('Orden no encontrada')
  if (!o.apelacionesPrevias) o.apelacionesPrevias = []
  if (o.imagenesChat === undefined) o.imagenesChat = o.mensajes.filter((m) => m.imagen).length
  return o
}

export const esAbierta = (o: Orden): boolean => ABIERTOS.includes(o.estado)

export const abiertasDe = (usuarioId: string): number =>
  store.todo().ordenes.filter((o) => (o.compradorId === usuarioId || o.vendedorId === usuarioId) && esAbierta(o)).length

function sistema(o: Orden, texto: string): void {
  o.mensajes.push({ id: id('msg'), de: 'sistema', texto, imagen: null, en: new Date().toISOString() })
}

function rolDe(o: Orden, usuarioId: string): 'comprador' | 'vendedor' | null {
  if (o.compradorId === usuarioId) return 'comprador'
  if (o.vendedorId === usuarioId) return 'vendedor'
  return null
}

function exigirParte(o: Orden, u: Usuario): 'comprador' | 'vendedor' {
  const rol = rolDe(o, u.id)
  if (!rol) throw noEncontrado('Orden no encontrada')
  return rol
}

// ── Vencimiento ──────────────────────────────────────────────────────────────

/** Si venció la ventana de pago sin que el comprador marcara «pagado», se cancela sola. */
export function expirarSiCorresponde(o: Orden): boolean {
  if (o.estado !== 'pendiente-pago') return false
  if (Date.parse(o.venceEn) > Date.now()) return false
  cerrarCancelada(o, 'sistema', 'Venció el tiempo de pago sin que el comprador marcara la orden como pagada')
  return true
}

export function revisarVencidas(): number {
  let n = 0
  for (const o of store.todo().ordenes) if (expirarSiCorresponde(o)) n++
  if (n) store.guardar()
  return n
}

function cerrarCancelada(o: Orden, por: 'comprador' | 'sistema' | 'operador', motivo: string): void {
  const a = anuncios.porId(o.anuncioId)
  if (o.enCustodia) {
    billetera.descongelar(o.vendedorId, o.activo, o.cantidadActivo, 'orden-descongelar', o.id, `Orden ${o.numero} cancelada: ${motivo}`)
    o.enCustodia = false
  }
  // Solo se devuelve al anuncio lo que seguía reservado: una orden que ya
  // había vencido lo devolvió entonces.
  if (a && o.estado !== 'cancelada') anuncios.devolver(a, o.cantidadActivo)
  o.estado = 'cancelada'
  o.canceladaEn = o.canceladaEn ?? new Date().toISOString()
  o.canceladaPor = o.canceladaPor ?? por
  o.motivoCancelacion = motivo
  sistema(o, `Orden cancelada (${por === 'comprador' ? 'por el comprador' : por === 'sistema' ? 'por vencimiento' : 'por un operador'}): ${motivo}`)
  registrar(por === 'comprador' ? o.compradorId : por, 'orden.cancelada', o.id, { numero: o.numero, motivo, por })
  usuarios.recalcularReputacion(o.compradorId)
  usuarios.recalcularReputacion(o.vendedorId)
}

function cerrarCompletada(o: Orden, actor: string): void {
  const a = anuncios.porId(o.anuncioId)
  const veniaDeCancelada = o.estadoAntesApelacion === 'cancelada'
  const r = billetera.liberarCustodia(o.vendedorId, o.compradorId, o.activo, o.cantidadActivo, o.comision, o.id)
  o.enCustodia = false
  if (a && !veniaDeCancelada) anuncios.consumir(a)
  else if (a) { a.ordenesCompletadas += 1 }
  o.estado = 'completada'
  o.completadaEn = new Date().toISOString()
  if (!o.pagadaEn) o.pagadaEn = o.completadaEn
  const recibido = r.comisionDelVendedor ? o.cantidadActivo : Dec.restar(o.cantidadActivo, o.comision)
  sistema(o, `El vendedor liberó ${recibido} ${o.activo}. Orden completada.`)
  registrar(actor, 'orden.completada', o.id, { numero: o.numero, cantidad: o.cantidadActivo, comision: o.comision, comisionDelVendedor: r.comisionDelVendedor, montoFiat: o.montoFiat, moneda: o.moneda })
  usuarios.recalcularReputacion(o.compradorId)
  usuarios.recalcularReputacion(o.vendedorId)
  reportarAml(o)
}

/** Monitoreo AML en Genesis ID: un movimiento por cada parte, sin esperar respuesta. */
function reportarAml(o: Orden): void {
  const comprador = usuarios.porId(o.compradorId)
  const vendedor = usuarios.porId(o.vendedorId)
  const montoUsd = aUsd(o.montoFiat, o.moneda) ?? 0
  const base = { activo: o.activo, monto: Dec.aNumero(o.cantidadActivo), montoUsd: Math.round(montoUsd * 100) / 100, fecha: o.completadaEn!, app: 'ordenexchange', hash: null }
  if (comprador?.gid) {
    enviarMovimientos(comprador.gid, [{ ...base, id: `${o.id}:compra`, gid: comprador.gid, direccion: 'entrada', contraparte: vendedor?.gid || o.vendedorId, paisContraparte: vendedor?.pais ?? null }])
  }
  if (vendedor?.gid) {
    enviarMovimientos(vendedor.gid, [{ ...base, id: `${o.id}:venta`, gid: vendedor.gid, direccion: 'salida', contraparte: comprador?.gid || o.compradorId, paisContraparte: comprador?.pais ?? null }])
  }
}

// ── Crear ────────────────────────────────────────────────────────────────────

export function crear(tomador: Usuario, e: { anuncioId?: unknown; montoFiat?: unknown; cantidadActivo?: unknown; metodoId?: unknown; metodoTipo?: unknown; metodoBanco?: unknown }): Orden {
  usuarios.exigirOperar(tomador)
  const a = anuncios.exigir(String(e.anuncioId || ''))
  if (a.usuarioId === tomador.id) throw conflicto('No puede tomar su propio anuncio', 'anuncio-propio')
  const anunciante = usuarios.exigir(a.usuarioId)
  if (!anuncios.disponibleEnMercado(a)) throw conflicto('Ese anuncio ya no está disponible', 'anuncio-no-disponible')
  const req = anuncios.cumpleRequisitos(a, tomador)
  if (!req.ok) throw sinPermiso(req.motivo!, 'requisitos')
  const cfg = store.todo().configuracion
  if (abiertasDe(tomador.id) >= cfg.maxOrdenesAbiertas) {
    throw conflicto(`Tiene ${cfg.maxOrdenesAbiertas} órdenes abiertas; termine alguna antes de abrir otra`, 'ordenes-abiertas')
  }
  const precio = anuncios.precioEfectivo(a)
  if (precio == null) throw conflicto('El anuncio no tiene precio de referencia ahora mismo', 'sin-referencia')

  const decAct = defActivo(a.activo)!.decimales
  const decMon = decimalesMoneda(a.moneda)
  let montoFiat: string, cantidadActivo: string
  if (e.montoFiat !== undefined && e.montoFiat !== null && e.montoFiat !== '') {
    if (!Dec.esValido(e.montoFiat) || !Dec.esPositivo(e.montoFiat as string)) throw malaPeticion('El monto tiene que ser un número mayor que cero', 'monto')
    montoFiat = Dec.n(e.montoFiat as string)
    if (Dec.decimalesDe(montoFiat) > decMon) throw malaPeticion(`${a.moneda} admite ${decMon} decimales`, 'monto')
    cantidadActivo = Dec.truncar(Dec.dividir(montoFiat, precio), decAct)
  } else if (e.cantidadActivo !== undefined && e.cantidadActivo !== null && e.cantidadActivo !== '') {
    cantidadActivo = billetera.cantidadValida(e.cantidadActivo, a.activo)
    montoFiat = Dec.redondear(Dec.multiplicar(cantidadActivo, precio), decMon)
  } else {
    throw malaPeticion('Indique el monto en moneda local o la cantidad del activo', 'monto')
  }
  if (!Dec.esPositivo(cantidadActivo)) throw malaPeticion('El monto es demasiado pequeño para ese precio', 'fuera-de-limites')
  if (Dec.menor(montoFiat, a.limiteMin) || Dec.mayor(montoFiat, a.limiteMax)) {
    throw malaPeticion(`El monto tiene que estar entre ${a.limiteMin} y ${a.limiteMax} ${a.moneda}`, 'fuera-de-limites', { limiteMin: a.limiteMin, limiteMax: a.limiteMax })
  }
  if (Dec.mayor(cantidadActivo, a.cantidadDisponible)) {
    throw malaPeticion(`El anuncio solo tiene ${a.cantidadDisponible} ${a.activo} disponibles`, 'fuera-de-limites', { disponible: a.cantidadDisponible })
  }
  const enUsd = aUsd(montoFiat, a.moneda)
  if (enUsd != null && enUsd > cfg.maxOrdenUsdSinAgente && tomador.agente !== 'aprobado' && anunciante.agente !== 'aprobado') {
    throw malaPeticion(`Las órdenes de más de ${cfg.maxOrdenUsdSinAgente} USD requieren que una de las partes sea agente de cambio`, 'fuera-de-limites')
  }

  const vendedor = a.lado === 'venta' ? anunciante : tomador
  const comprador = a.lado === 'venta' ? tomador : anunciante

  // El método de pago: del vendedor, siempre. En un anuncio de venta lo eligió
  // el anunciante entre los suyos; en uno de compra lo aporta el tomador.
  let metodo
  if (a.lado === 'venta') {
    // Al público no salen los ids de los métodos del anunciante (son suyos),
    // así que el comprador elige por TIPO y, si hay varios del mismo tipo, por
    // banco; el id se acepta por si lo tiene.
    const tipo = e.metodoTipo ? String(e.metodoTipo).toLowerCase() : null
    const banco = e.metodoBanco ? String(e.metodoBanco) : null
    const candidatos = e.metodoId
      ? a.metodos.filter((m) => m.id === String(e.metodoId))
      : tipo
        ? a.metodos.filter((m) => m.tipo === tipo && (!banco || m.banco === banco))
        : (a.metodos.length === 1 ? a.metodos : [])
    const enAnuncio = candidatos[0]
    if (!enAnuncio || !enAnuncio.id) throw malaPeticion('Elija uno de los métodos de pago del anuncio', 'metodo')
    const real = metodosPago.porId(anunciante.id, enAnuncio.id)
    if (!real || !real.activo) throw conflicto('El anunciante desactivó ese método de pago; elija otro', 'metodo')
    metodo = metodosPago.copiaParaOrden(real)
  } else {
    const real = e.metodoId ? metodosPago.porId(tomador.id, String(e.metodoId)) : null
    if (!real || !real.activo) throw malaPeticion('Elija uno de sus métodos de pago para recibir el dinero', 'metodo')
    if (!a.metodos.some((m) => m.tipo === real.tipo)) throw malaPeticion(`El anunciante no paga por ${real.nombreMetodo}; elija un método aceptado`, 'metodo')
    if (real.moneda !== a.moneda) throw malaPeticion(`Ese método recibe ${real.moneda}, no ${a.moneda}`, 'metodo')
    metodo = metodosPago.copiaParaOrden(real)
  }

  const comision = Dec.truncar(Dec.multiplicar(cantidadActivo, Dec.deNumero(cfg.comisionPct / 100, 8)), decAct)
  const ahora = new Date()
  const orden: Orden = {
    id: id('ord'), numero: numeroOrden(ahora), anuncioId: a.id, anuncioNumero: a.numero, ladoAnuncio: a.lado,
    compradorId: comprador.id, vendedorId: vendedor.id, anuncianteId: anunciante.id, tomadorId: tomador.id,
    activo: a.activo, moneda: a.moneda, pais: a.pais, precio, cantidadActivo, montoFiat, comision,
    metodoPago: metodo, estado: 'pendiente-pago', estadoAntesApelacion: null,
    ventanaPagoMin: a.ventanaPagoMin, venceEn: new Date(ahora.getTime() + a.ventanaPagoMin * 60000).toISOString(),
    referenciaPago: null, creadaEn: ahora.toISOString(), pagadaEn: null, completadaEn: null, canceladaEn: null,
    canceladaPor: null, motivoCancelacion: null, apelacion: null, apelacionesPrevias: [], imagenesChat: 0,
    calificaciones: { delComprador: null, delVendedor: null }, mensajes: [], enCustodia: false,
    vistaPor: { [tomador.id]: ahora.toISOString() },
  }

  // La custodia: si el vendedor no tiene el activo, la orden no nace.
  try {
    billetera.congelar(vendedor.id, a.activo, cantidadActivo, 'orden-congelar', orden.id, `En custodia por la orden ${orden.numero}`)
  } catch (err: any) {
    if (err?.codigo === 'sin-saldo' && vendedor.id === anunciante.id) {
      anuncios.pausarPorSistema(a, 'sin saldo disponible para cubrir una orden')
      store.guardar()
      throw conflicto('El anunciante no tiene saldo disponible ahora mismo; el anuncio quedó pausado', 'sin-saldo')
    }
    throw err
  }
  orden.enCustodia = true
  anuncios.reservar(a, cantidadActivo)

  sistema(orden, `Orden creada. ${vendedor.apodo} vende ${cantidadActivo} ${a.activo} a ${comprador.apodo} por ${montoFiat} ${a.moneda}. El activo está en custodia de OrdenExchange. El comprador tiene ${a.ventanaPagoMin} minutos para pagar y marcar la orden como pagada.`)
  if (a.respuestaAutomatica) {
    orden.mensajes.push({ id: id('msg'), de: anunciante.id, texto: a.respuestaAutomatica, imagen: null, en: ahora.toISOString() })
  }
  store.todo().ordenes.push(orden)
  registrar(tomador.id, 'orden.creada', orden.id, { numero: orden.numero, anuncio: a.numero, comprador: comprador.id, vendedor: vendedor.id, activo: a.activo, cantidad: cantidadActivo, montoFiat, moneda: a.moneda, precio })
  store.guardar()
  return orden
}

// ── Transiciones ─────────────────────────────────────────────────────────────

export function marcarPagado(u: Usuario, idOrden: string, referencia: unknown): Orden {
  const o = exigir(idOrden)
  if (exigirParte(o, u) !== 'comprador') throw sinPermiso('Solo el comprador puede marcar la orden como pagada', 'estado-invalido')
  usuarios.exigirNoCongelado(u)
  if (expirarSiCorresponde(o)) { store.guardar(); throw conflicto('La orden venció y se canceló', 'estado-invalido') }
  if (o.estado !== 'pendiente-pago') throw conflicto('La orden no está pendiente de pago', 'estado-invalido')
  o.estado = 'pagado'
  o.pagadaEn = new Date().toISOString()
  o.referenciaPago = referencia ? String(referencia).trim().slice(0, 120) : null
  sistema(o, `El comprador marcó la orden como pagada${o.referenciaPago ? ` (referencia: ${o.referenciaPago})` : ''}. Vendedor: compruebe que el dinero llegó a su cuenta antes de liberar.`)
  registrar(u.id, 'orden.pagada', o.id, { numero: o.numero, referencia: o.referenciaPago })
  store.guardar()
  return o
}

export async function liberar(u: Usuario, idOrden: string, contrasena: unknown): Promise<Orden> {
  const o = exigir(idOrden)
  if (exigirParte(o, u) !== 'vendedor') throw sinPermiso('Solo el vendedor puede liberar el activo', 'estado-invalido')
  usuarios.exigirNoCongelado(u)
  if (expirarSiCorresponde(o)) { store.guardar(); throw conflicto('La orden venció y se canceló', 'estado-invalido') }
  if (o.estado !== 'pagado' && o.estado !== 'pendiente-pago' && o.estado !== 'apelacion') throw conflicto('La orden no se puede liberar en su estado actual', 'estado-invalido')
  if (!usuarios.contrasenaValida(u, contrasena)) throw sinPermiso('Contraseña incorrecta', 'contrasena')
  if (o.estado === 'apelacion' && o.apelacion) {
    // El vendedor zanja la apelación entregando: es la resolución más limpia.
    o.apelacion.estado = 'resuelta'
    o.apelacion.resolucion = 'liberar'
    o.apelacion.resueltaPor = u.id
    o.apelacion.resueltaEn = new Date().toISOString()
    o.apelacion.nota = 'El vendedor liberó durante la apelación'
    o.apelacionesPrevias.push(o.apelacion)
    o.apelacion = null
  }
  cerrarCompletada(o, u.id)
  o.estadoAntesApelacion = null
  await store.guardarYa()
  return o
}

export function cancelar(u: Usuario, idOrden: string, motivo: unknown): Orden {
  const o = exigir(idOrden)
  const rol = exigirParte(o, u)
  if (rol !== 'comprador') throw sinPermiso('Solo el comprador puede cancelar; si hay un problema, abra una apelación', 'estado-invalido')
  usuarios.exigirNoCongelado(u)
  if (o.estado !== 'pendiente-pago') throw conflicto('Una orden marcada como pagada ya no se cancela; abra una apelación', 'estado-invalido')
  cerrarCancelada(o, 'comprador', String(motivo || 'cancelada por el comprador').trim().slice(0, 300))
  store.guardar()
  return o
}

export function apelar(u: Usuario, idOrden: string, e: { motivo?: unknown; detalle?: unknown }): Orden {
  const o = exigir(idOrden)
  const rol = exigirParte(o, u)
  usuarios.exigirNoCongelado(u)
  if (expirarSiCorresponde(o)) store.guardar()
  if (o.estado === 'apelacion') throw conflicto('La orden ya está en apelación', 'estado-invalido')
  if (o.apelacionesPrevias.some((a) => a.abiertaPor === u.id)) {
    throw conflicto('Ya abrió una apelación en esta orden; si la retiró y sigue el problema, escriba a soporte', 'estado-invalido')
  }
  // Una orden que venció y se canceló sola todavía se puede apelar un día: el
  // comprador que pagó tarde tiene que tener a quién recurrir. La custodia se
  // vuelve a tomar del vendedor; si ya no la tiene, lo resuelve soporte.
  const vencidaReciente = o.estado === 'cancelada' && o.canceladaPor === 'sistema' && rol === 'comprador'
    && o.canceladaEn && Date.now() - Date.parse(o.canceladaEn) < HORAS_APELAR_TRAS_VENCER * 3600000
  if (o.estado !== 'pagado' && !(o.estado === 'pendiente-pago' && rol === 'comprador') && !vencidaReciente) {
    throw conflicto('Solo se apela una orden pagada (o pendiente, si usted es el comprador y ya pagó; o vencida hace menos de 24 h)', 'estado-invalido')
  }
  const motivo = String(e.motivo || '')
  if (!MOTIVOS_APELACION.includes(motivo)) throw malaPeticion(`El motivo tiene que ser uno de: ${MOTIVOS_APELACION.join(', ')}`, 'motivo')
  const detalle = String(e.detalle || '').trim().slice(0, 2000)
  if (detalle.length < 10) throw malaPeticion('Explique qué pasó (al menos 10 caracteres)', 'detalle')
  if (vencidaReciente) {
    try {
      billetera.congelar(o.vendedorId, o.activo, o.cantidadActivo, 'orden-congelar', o.id, `En custodia de nuevo por apelación de la orden ${o.numero}`)
    } catch (err: any) {
      if (err?.codigo === 'sin-saldo') throw conflicto('El vendedor ya no tiene el activo disponible; escriba a soporte con su comprobante', 'sin-saldo')
      throw err
    }
    o.enCustodia = true
  }
  o.estadoAntesApelacion = o.estado
  o.estado = 'apelacion'
  o.apelacion = { abiertaPor: u.id, motivo, detalle, abiertaEn: new Date().toISOString(), estado: 'abierta', resolucion: null, resueltaPor: null, resueltaEn: null, nota: null }
  sistema(o, `${u.apodo} abrió una apelación (${motivo}). Un operador de OrdenExchange revisará el chat y los comprobantes. El activo está en custodia; ninguna de las partes puede cancelar hasta que se resuelva (el vendedor sí puede liberar).`)
  registrar(u.id, 'orden.apelada', o.id, { numero: o.numero, motivo })
  store.guardar()
  return o
}

export function retirarApelacion(u: Usuario, idOrden: string): Orden {
  const o = exigir(idOrden)
  exigirParte(o, u)
  if (o.estado !== 'apelacion' || !o.apelacion) throw conflicto('La orden no está en apelación', 'estado-invalido')
  if (o.apelacion.abiertaPor !== u.id) throw sinPermiso('Solo quien abrió la apelación puede retirarla', 'estado-invalido')
  o.apelacion.estado = 'retirada'
  o.apelacion.resueltaEn = new Date().toISOString()
  o.apelacionesPrevias.push(o.apelacion)
  o.apelacion = null
  const previo = o.estadoAntesApelacion ?? 'pagado'
  o.estadoAntesApelacion = null
  if (previo === 'cancelada') {
    // Vuelve a cancelada: la custodia que se retomó regresa al vendedor.
    if (o.enCustodia) {
      billetera.descongelar(o.vendedorId, o.activo, o.cantidadActivo, 'orden-descongelar', o.id, `Apelación retirada en la orden ${o.numero}`)
      o.enCustodia = false
    }
    o.estado = 'cancelada'
  } else {
    o.estado = previo
    // No se regala tiempo: si la ventana ya pasó mientras apelaba, la orden vence.
    expirarSiCorresponde(o)
  }
  sistema(o, `${u.apodo} retiró la apelación. La orden queda en «${o.estado}».`)
  registrar(u.id, 'orden.apelacion-retirada', o.id, { numero: o.numero })
  usuarios.recalcularReputacion(u.id)
  store.guardar()
  return o
}

/** Un operador resuelve la apelación: el activo va al comprador o vuelve al vendedor. */
export async function resolver(idOrden: string, resolucion: unknown, nota: unknown, actor: string): Promise<Orden> {
  const o = exigir(idOrden)
  if (o.estado !== 'apelacion' || !o.apelacion) throw conflicto('La orden no está en apelación', 'estado-invalido')
  const texto = String(nota || '').trim().slice(0, 1000)
  if (texto.length < 5) throw malaPeticion('Hace falta una nota con el fundamento de la decisión', 'nota')
  if (resolucion !== 'liberar' && resolucion !== 'devolver') throw malaPeticion('La resolución tiene que ser «liberar» o «devolver»')
  o.apelacion.estado = 'resuelta'
  o.apelacion.resolucion = resolucion
  o.apelacion.resueltaPor = actor
  o.apelacion.resueltaEn = new Date().toISOString()
  o.apelacion.nota = texto
  sistema(o, `Un operador resolvió la apelación: ${resolucion === 'liberar' ? 'el activo se libera al comprador' : 'el activo vuelve al vendedor'}. Nota: ${texto}`)
  registrar(actor, 'orden.apelacion-resuelta', o.id, { numero: o.numero, resolucion, nota: texto })
  const veniaDeCancelada = o.estadoAntesApelacion === 'cancelada'
  if (resolucion === 'liberar') {
    cerrarCompletada(o, actor)
    usuarios.perdioApelacion(o.vendedorId)
  } else if (veniaDeCancelada) {
    if (o.enCustodia) {
      billetera.descongelar(o.vendedorId, o.activo, o.cantidadActivo, 'orden-descongelar', o.id, `Apelación resuelta a favor del vendedor en la orden ${o.numero}`)
      o.enCustodia = false
    }
    o.estado = 'cancelada'
    usuarios.perdioApelacion(o.compradorId)
  } else {
    cerrarCancelada(o, 'operador', `apelación resuelta a favor del vendedor: ${texto}`)
    usuarios.perdioApelacion(o.compradorId)
  }
  o.apelacionesPrevias.push(o.apelacion)
  // La apelación resuelta se conserva a la vista en `apelacion` para el frontend.
  o.estadoAntesApelacion = null
  await store.guardarYa()
  return o
}

export function cancelarPorOperador(idOrden: string, nota: unknown, actor: string): Orden {
  const o = exigir(idOrden)
  if (o.estado !== 'pendiente-pago' && o.estado !== 'pagado') throw conflicto('Solo se cancelan órdenes pendientes o pagadas; una apelación se resuelve', 'estado-invalido')
  const texto = String(nota || '').trim().slice(0, 500)
  if (texto.length < 5) throw malaPeticion('Hace falta una nota con el motivo', 'nota')
  cerrarCancelada(o, 'operador', texto)
  store.guardar()
  return o
}

// ── Chat ─────────────────────────────────────────────────────────────────────

function chatAbierto(o: Orden): boolean {
  if (esAbierta(o)) return true
  const cierre = o.completadaEn ?? o.canceladaEn
  return Boolean(cierre && Date.now() - Date.parse(cierre) < HORAS_CHAT_TRAS_CIERRE * 3600000)
}

function validarMensaje(e: { texto?: unknown; imagen?: unknown }): { texto: string; imagen: string | null } {
  const texto = String(e.texto ?? '').trim().slice(0, MAX_TEXTO)
  let imagen: string | null = null
  if (e.imagen) {
    const img = String(e.imagen)
    if (img.length > MAX_IMAGEN) throw new Falla(413, 'La imagen pesa demasiado (máximo 1,5 MB)', 'imagen')
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(img)) throw malaPeticion('La imagen tiene que ser un data URL de PNG, JPEG, WebP o GIF', 'imagen')
    imagen = img
  }
  if (!texto && !imagen) throw malaPeticion('Escriba un mensaje o adjunte una imagen', 'mensaje')
  return { texto, imagen }
}

/** URL firmada de una imagen del chat: el navegador la pone en <img src> sin cabeceras. */
export function urlImagen(ordenId: string, imagenId: string): string {
  return `/api/ordenes/${ordenId}/imagenes/${imagenId}?f=${firmaCorta(`${ordenId}:${imagenId}`)}`
}

export const firmaImagenValida = (ordenId: string, imagenId: string, f: string): boolean =>
  Boolean(f) && f === firmaCorta(`${ordenId}:${imagenId}`)

function conUrl(o: Orden, m: Mensaje): Mensaje {
  return m.imagen ? { ...m, imagen: urlImagen(o.id, m.imagen) } : m
}

export async function enviarMensaje(u: Usuario, idOrden: string, e: { texto?: unknown; imagen?: unknown }): Promise<Mensaje> {
  const o = exigir(idOrden)
  exigirParte(o, u)
  if (!chatAbierto(o)) throw conflicto('El chat de esta orden ya está cerrado', 'estado-invalido')
  if (o.mensajes.length >= MAX_MENSAJES) throw conflicto('El chat de esta orden llegó a su límite', 'limite')
  const { texto, imagen } = validarMensaje(e)
  if (imagen && o.imagenesChat >= MAX_IMAGENES_POR_ORDEN) throw conflicto(`Solo se pueden adjuntar ${MAX_IMAGENES_POR_ORDEN} imágenes por orden`, 'limite')
  const idImagen = imagen ? await imagenes.guardar(imagen) : null
  const m: Mensaje = { id: id('msg'), de: u.id, texto, imagen: idImagen, en: new Date().toISOString() }
  o.mensajes.push(m)
  if (idImagen) o.imagenesChat += 1
  o.vistaPor[u.id] = m.en
  store.guardar()
  return conUrl(o, m)
}

export function mensajeOperador(idOrden: string, texto: unknown, operadorId: string): Mensaje {
  const o = exigir(idOrden)
  const t = String(texto || '').trim().slice(0, MAX_TEXTO)
  if (!t) throw malaPeticion('Escriba un mensaje', 'mensaje')
  const m: Mensaje = { id: id('msg'), de: `operador:${operadorId}`, texto: t, imagen: null, en: new Date().toISOString() }
  o.mensajes.push(m)
  registrar(operadorId, 'orden.mensaje-operador', o.id, { numero: o.numero })
  store.guardar()
  return m
}

export function mensajesDesde(u: Usuario, idOrden: string, desdeId: string | undefined): { mensajes: Mensaje[]; orden: Orden } {
  const o = exigir(idOrden)
  exigirParte(o, u)
  expirarSiCorresponde(o)
  const i = desdeId ? o.mensajes.findIndex((m) => m.id === desdeId) : -1
  const nuevos = i >= 0 ? o.mensajes.slice(i + 1) : o.mensajes
  o.vistaPor[u.id] = new Date().toISOString()
  return { mensajes: nuevos.map((m) => conUrl(o, m)), orden: o }
}

export async function imagenDe(idOrden: string, idImagen: string): Promise<string | null> {
  const o = porId(idOrden)
  if (!o || !o.mensajes.some((m) => m.imagen === idImagen)) return null
  return imagenes.leer(idImagen)
}

// ── Calificar ────────────────────────────────────────────────────────────────

export function calificar(u: Usuario, idOrden: string, tipo: unknown, comentario: unknown): Orden {
  const o = exigir(idOrden)
  const rol = exigirParte(o, u)
  if (o.estado !== 'completada') throw conflicto('Solo se califica una orden completada', 'estado-invalido')
  if (tipo !== 'positiva' && tipo !== 'negativa') throw malaPeticion('La calificación tiene que ser «positiva» o «negativa»', 'tipo')
  const clave = rol === 'comprador' ? 'delComprador' : 'delVendedor'
  if (o.calificaciones[clave]) throw conflicto('Ya calificó esta orden', 'estado-invalido')
  o.calificaciones[clave] = { tipo: tipo as Calificacion, comentario: comentario ? String(comentario).trim().slice(0, 300) : null, en: new Date().toISOString() }
  usuarios.calificar(rol === 'comprador' ? o.vendedorId : o.compradorId, tipo as Calificacion)
  registrar(u.id, 'orden.calificada', o.id, { numero: o.numero, tipo })
  store.guardar()
  return o
}

// ── Vistas ───────────────────────────────────────────────────────────────────

function noLeidosDe(o: Orden, usuarioId: string): number {
  const vista = o.vistaPor[usuarioId]
  return o.mensajes.filter((m) => m.de !== usuarioId && (!vista || m.en > vista)).length
}

/** Los datos bancarios solo mientras la orden está abierta, o para el vendedor (son suyos). */
function metodoParaVista(o: Orden, consultanteId: string | null): Omit<Orden['metodoPago'], 'id'> {
  const { id: _id, ...m } = o.metodoPago
  if (esAbierta(o) || o.vendedorId === consultanteId) return m
  return { ...m, campos: {} }
}

export function resumen(o: Orden, consultante: Usuario) {
  expirarSiCorresponde(o)
  const miRol = rolDe(o, consultante.id)!
  const contraparteId = miRol === 'comprador' ? o.vendedorId : o.compradorId
  const contraparte = usuarios.porId(contraparteId)
  const { mensajes: _m, vistaPor: _v, ...sinMensajes } = o
  return {
    ...sinMensajes,
    metodoPago: metodoParaVista(o, consultante.id),
    contraparte: contraparte ? usuarios.publico(contraparte) : null,
    miRol,
    noLeidos: noLeidosDe(o, consultante.id),
    segundosRestantes: o.estado === 'pendiente-pago' ? Math.max(0, Math.floor((Date.parse(o.venceEn) - Date.now()) / 1000)) : null,
    chatAbierto: chatAbierto(o),
  }
}

export function acciones(o: Orden, consultante: Usuario) {
  const miRol = rolDe(o, consultante.id)
  const congelado = consultante.congelado
  const yaApelo = o.apelacionesPrevias.some((a) => a.abiertaPor === consultante.id)
  const vencidaReciente = o.estado === 'cancelada' && o.canceladaPor === 'sistema' && miRol === 'comprador'
    && Boolean(o.canceladaEn && Date.now() - Date.parse(o.canceladaEn) < HORAS_APELAR_TRAS_VENCER * 3600000)
  return {
    pagar: !congelado && miRol === 'comprador' && o.estado === 'pendiente-pago',
    liberar: !congelado && miRol === 'vendedor' && (o.estado === 'pagado' || o.estado === 'pendiente-pago' || o.estado === 'apelacion'),
    cancelar: !congelado && miRol === 'comprador' && o.estado === 'pendiente-pago',
    apelar: !congelado && !yaApelo && ((o.estado === 'pagado') || (o.estado === 'pendiente-pago' && miRol === 'comprador') || vencidaReciente),
    retirarApelacion: o.estado === 'apelacion' && o.apelacion?.abiertaPor === consultante.id,
    calificar: o.estado === 'completada' && !o.calificaciones[miRol === 'comprador' ? 'delComprador' : 'delVendedor'],
    chatear: chatAbierto(o),
  }
}

/** La orden entera para su dueño: con mensajes y acciones. */
export function detalle(o: Orden, consultante: Usuario) {
  const r = resumen(o, consultante)
  return { ...r, mensajes: o.mensajes.map((m) => conUrl(o, m)), acciones: acciones(o, consultante) }
}

/** Lo mismo sin los mensajes: para el sondeo del chat, que ya trae los nuevos aparte. */
export function detalleLigero(o: Orden, consultante: Usuario) {
  const r = resumen(o, consultante)
  return { ...r, acciones: acciones(o, consultante), totalMensajes: o.mensajes.length }
}

export function ver(u: Usuario, idOrden: string) {
  const o = exigir(idOrden)
  exigirParte(o, u)
  const d = detalle(o, u)
  o.vistaPor[u.id] = new Date().toISOString()
  store.guardar()
  return d
}

export function listar(u: Usuario, f: { estado?: string; rol?: string; pagina?: string; porPagina?: string }) {
  revisarVencidas()
  const porPagina = Math.min(100, Math.max(1, Number(f.porPagina) || 20))
  const pagina = Math.max(1, Number(f.pagina) || 1)
  const estado = f.estado || ''
  const lista = store.todo().ordenes.filter((o) => {
    const rol = rolDe(o, u.id)
    if (!rol) return false
    if (f.rol && f.rol !== rol) return false
    if (estado === 'abiertas') return esAbierta(o)
    if (estado) return o.estado === estado
    return true
  }).reverse()
  const desde = (pagina - 1) * porPagina
  return {
    ordenes: lista.slice(desde, desde + porPagina).map((o) => resumen(exigir(o.id), u)),
    total: lista.length,
    abiertas: abiertasDe(u.id),
  }
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function resumenPanel(o: Orden) {
  const comprador = usuarios.porId(o.compradorId)
  const vendedor = usuarios.porId(o.vendedorId)
  const { mensajes: _m, ...sinMensajes } = o
  return {
    ...sinMensajes,
    comprador: { id: o.compradorId, apodo: comprador?.apodo ?? '?' },
    vendedor: { id: o.vendedorId, apodo: vendedor?.apodo ?? '?' },
    segundosRestantes: o.estado === 'pendiente-pago' ? Math.max(0, Math.floor((Date.parse(o.venceEn) - Date.now()) / 1000)) : null,
    mensajes: o.mensajes.length,
  }
}

export function buscarPanel(f: { estado?: string; q?: string; pagina?: string; porPagina?: string }) {
  revisarVencidas()
  const porPagina = Math.min(100, Math.max(1, Number(f.porPagina) || 30))
  const pagina = Math.max(1, Number(f.pagina) || 1)
  const q = String(f.q || '').toLowerCase().trim()
  const lista = store.todo().ordenes.filter((o) => {
    if (f.estado === 'abiertas' ? !esAbierta(o) : (f.estado && o.estado !== f.estado)) return false
    if (!q) return true
    const c = usuarios.porId(o.compradorId), v = usuarios.porId(o.vendedorId)
    return o.numero.toLowerCase().includes(q) || o.id === q || o.anuncioNumero.toLowerCase().includes(q)
      || [c?.apodo, c?.email, v?.apodo, v?.email].some((x) => (x || '').toLowerCase().includes(q))
  }).reverse()
  const desde = (pagina - 1) * porPagina
  return { ordenes: lista.slice(desde, desde + porPagina).map(resumenPanel), total: lista.length }
}

export const apelacionesAbiertas = () =>
  store.todo().ordenes.filter((o) => o.estado === 'apelacion').sort((a, b) => (a.apelacion!.abiertaEn < b.apelacion!.abiertaEn ? -1 : 1)).map(resumenPanel)

export function detallePanel(idOrden: string) {
  const o = exigir(idOrden)
  expirarSiCorresponde(o)
  const comprador = usuarios.porId(o.compradorId)
  const vendedor = usuarios.porId(o.vendedorId)
  return {
    orden: { ...o, mensajes: o.mensajes.map((m) => conUrl(o, m)) },
    comprador: comprador ? usuarios.publico(comprador) : null,
    vendedor: vendedor ? usuarios.publico(vendedor) : null,
  }
}

export function ordenesDe(usuarioId: string) {
  return store.todo().ordenes.filter((o) => o.compradorId === usuarioId || o.vendedorId === usuarioId).reverse().map(resumenPanel)
}

export type { UsuarioPublico, Apelacion }
