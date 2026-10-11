// Las operaciones de la firma múltiple: lo que la Safe tiene que ejecutar, con sus firmas.
//
// Cada operación es UNA transacción de la Safe con su nonce: una liberación de ORIGEN, una tanda
// del regalo de 1 ORIGEN (un lote de envíos) o llamadas a los contratos v2 (abrir una migración,
// fijar el registro, dar o quitar un rol). El ciclo:
//
//   1. un operador la crea: la plataforma arma la transacción exacta y calcula su hash;
//   2. cada custodio la firma con su billetera (EIP-712); la plataforma comprueba que la firma es de
//      un custodio de la Safe y que nadie firma dos veces, ni quien la propuso;
//   3. con las firmas del umbral queda «lista»: cualquiera con gas manda execTransaction;
//   4. se registra la transacción y la plataforma comprueba en la cadena que la Safe ejecutó
//      exactamente lo firmado (evento ExecutionSuccess con ese hash).
//
// Los nonces se dan en orden. Anular una operación que ya tiene alguna firma no basta con borrarla
// de aquí: con las firmas suficientes alguien podría ejecutarla igual. Por eso se reemplaza por una
// operación vacía con el mismo nonce (la forma de rechazar de Safe): ejecutarla consume el nonce.

import type { Almacen, Liberacion, Operacion } from './almacen.js'
import { nuevoId, registrar } from './almacen.js'
import type { Cadena } from './cadena.js'
import { ErrorFirma, armarSafeTx, comprobarEjecucion, datosEjecucion, estadoSafe, firmanteDe, hashSafeTx, llamada, normalizarFirma, tipado, type Llamada } from './multifirma.js'

/**
 * Las dos firmas múltiples de SFSP §5.3: `safe`, la operativa (dos de tres: tesorería, emitir, abrir la
 * migración, suspender, ratificar pausas), y `constitucional`, la de los tres custodios (roles y
 * registro de los contratos). Sin la de tres, solo se arman operaciones de la operativa.
 */
export interface ConfigSafe { safe: string; constitucional?: string; multisend?: string; anterior?: string }
export type CualSafe = 'operativa' | 'constitucional'

const dir = (v: unknown) => { const d = String(v || '').trim(); return /^0x[0-9a-fA-F]{40}$/.test(d) ? d.toLowerCase() : undefined }

export function configSafe(entorno: NodeJS.ProcessEnv): ConfigSafe | null {
  const safe = dir(entorno.SAFE_DIRECCION)
  if (!safe) return null
  const constitucional = dir(entorno.SAFE_CONSTITUCIONAL)
  // SAFE_ANTERIOR: una Safe reemplazada que todavía guarda fondos. Desde ella solo se puede armar la
  // recuperación hacia la operativa vigente (crearRecuperacion), nunca otra cosa.
  const anterior = dir(entorno.SAFE_ANTERIOR)
  return { safe, constitucional, multisend: dir(entorno.SAFE_MULTISEND), ...(anterior && anterior !== safe && anterior !== constitucional ? { anterior } : {}) }
}

export function direccionSafe(cfg: ConfigSafe, cual: CualSafe = 'operativa'): string {
  if (cual === 'operativa') return cfg.safe
  if (!cfg.constitucional) throw new ErrorFirma('Falta SAFE_CONSTITUCIONAL: la firma múltiple de los tres custodios no está configurada')
  return cfg.constitucional
}

/** Un envío del regalo es una llamada; 120 por tanda caben holgados en un bloque de la 5550 (10 M de gas). */
export const POR_TANDA = 120

const PENDIENTE = new Set<Operacion['estado']>(['en-firma', 'lista'])

const llamar = (cadena: Cadena) => (m: string, p: unknown[]) => cadena.llamar(m, p)

export function estado(cadena: Cadena, cfg: ConfigSafe | string) {
  return estadoSafe(llamar(cadena), typeof cfg === 'string' ? cfg : cfg.safe)
}

function buscar(a: Almacen, id: string): Operacion {
  const o = a.datos.operaciones.find((x) => x.id === id)
  if (!o) throw new ErrorFirma('no existe esa operación')
  return o
}

/**
 * Las que ya no se pueden ejecutar porque su nonce ya se usó en la Safe quedan «caducada»: o las
 * ejecutó otra transacción (su anulación, algo fuera de la plataforma), o se ejecutaron ellas mismas
 * y falta registrarlo; en ese caso, registrar la transacción las deja ejecutadas.
 */
export async function refrescar(a: Almacen, cadena: Cadena, cfg: ConfigSafe): Promise<number> {
  const pendientes = a.datos.operaciones.filter((o) => PENDIENTE.has(o.estado))
  if (!pendientes.length) return 0
  // Cada Safe lleva sus propios nonces.
  const nonces = new Map<string, number>()
  for (const s of new Set(pendientes.map((o) => o.safe))) nonces.set(s, (await estado(cadena, s)).nonce)
  let n = 0
  for (const o of pendientes) {
    if (o.safeTx.nonce < nonces.get(o.safe)!) {
      o.estado = 'caducada'
      n++
      registrar(a, 'plataforma', 'operacion.caducada', { id: o.id, nonce: o.safeTx.nonce })
    }
  }
  return n
}

export async function crear(a: Almacen, cadena: Cadena, cfg: ConfigSafe, autor: string, p: { tipo: Operacion['tipo']; titulo: string; llamadas: Llamada[]; liberacion?: string; nonce?: number; enSafe?: string }): Promise<Operacion> {
  if (!p.titulo?.trim()) throw new ErrorFirma('falta el título de la operación')
  const llamadas = p.llamadas.map((l) => llamada(l))
  const safe = p.enSafe ?? cfg.safe
  const e = await estado(cadena, safe)
  // El siguiente nonce libre de esa Safe: ni uno ya usado en ella ni uno de otra operación pendiente suya.
  const ocupados = a.datos.operaciones.filter((o) => PENDIENTE.has(o.estado) && o.safe === safe).map((o) => o.safeTx.nonce)
  const nonce = p.nonce ?? Math.max(e.nonce, ...ocupados.map((x) => x + 1))
  const safeTx = armarSafeTx(llamadas, nonce, cfg.multisend)
  const o: Operacion = {
    id: nuevoId('op'), tipo: p.tipo, titulo: p.titulo.trim(), llamadas, safeTx,
    hash: hashSafeTx(safe, e.chainId, safeTx), chainId: e.chainId, safe,
    firmas: [], umbral: e.umbral, estado: 'en-firma', autor, creada: new Date().toISOString(),
    ...(p.liberacion ? { liberacion: p.liberacion } : {}),
  }
  a.datos.operaciones.push(o)
  registrar(a, autor, 'operacion.creada', { id: o.id, tipo: o.tipo, nonce, hash: o.hash, llamadas: llamadas.length })
  return o
}

/** Lo que firma el custodio y, si ya tiene las firmas, la llamada para ejecutarla. */
export function detalle(o: Operacion) {
  return {
    ...o,
    tipado: tipado(o.safe, o.chainId, o.safeTx),
    ejecutar: o.estado === 'lista' ? { to: o.safe, data: datosEjecucion(o.safeTx, o.firmas), chainId: o.chainId } : null,
  }
}

export async function firmar(a: Almacen, cadena: Cadena, cfg: ConfigSafe, id: string, operador: string, firma: string): Promise<Operacion> {
  const o = buscar(a, id)
  if (!PENDIENTE.has(o.estado)) throw new ErrorFirma(`la operación está ${o.estado}`)
  if (o.autor === operador) throw new ErrorFirma('quien propone no puede firmar su propia operación')
  if (o.firmas.some((f) => f.operador === operador)) throw new ErrorFirma('ya firmaste esta operación')
  const limpia = normalizarFirma(firma)
  const firmante = firmanteDe(o.hash, limpia).toLowerCase()
  const e = await estado(cadena, o.safe)
  if (o.safeTx.nonce < e.nonce) {
    o.estado = 'caducada'
    throw new ErrorFirma('el nonce de esta operación ya se usó en la Safe: quedó caducada')
  }
  if (!e.duenos.some((d) => d.toLowerCase() === firmante)) throw new ErrorFirma(`${firmante} no es custodio de la Safe`)
  if (o.firmas.some((f) => f.firmante === firmante)) throw new ErrorFirma('esa billetera ya firmó esta operación')
  o.firmas.push({ firmante, operador, firma: limpia, fecha: new Date().toISOString() })
  o.umbral = e.umbral
  if (o.firmas.length >= e.umbral) o.estado = 'lista'
  registrar(a, operador, 'operacion.firmada', { id, firmante, firmas: o.firmas.length, umbral: e.umbral })
  const l = liberacionDe(a, o)
  if (l) {
    l.aprobaciones.push({ firmante: `${operador} (${firmante})`, fecha: new Date().toISOString() })
    if (o.estado === 'lista') l.estado = 'aprobada'
  }
  return o
}

/** Registra la transacción que ejecutó la operación, después de comprobarla en la cadena. */
export async function ejecutada(a: Almacen, cadena: Cadena, cfg: ConfigSafe, id: string, tx: string, actor: string): Promise<Operacion> {
  const o = buscar(a, id)
  if (o.estado === 'ejecutada') throw new ErrorFirma('la operación ya está ejecutada')
  // «caducada» también: si se ejecutó antes de registrarla, su nonce ya está usado y la plataforma la
  // marcó caducada al refrescar. El evento de la Safe con su hash dice si fue ella.
  if (o.estado !== 'lista' && o.estado !== 'caducada') throw new ErrorFirma(`solo se registra una operación con todas sus firmas (está ${o.estado})`)
  const h = String(tx || '').toLowerCase()
  if (a.datos.operaciones.some((x) => x.tx === h)) throw new ErrorFirma('esa transacción ya se usó')
  const falla = await comprobarEjecucion(llamar(cadena), h, o.safe, o.hash)
  if (falla) throw new ErrorFirma(falla)
  o.estado = 'ejecutada'
  o.tx = h
  o.ejecutada = new Date().toISOString()
  registrar(a, actor, 'operacion.ejecutada', { id, tx: h })
  const l = liberacionDe(a, o)
  if (l) {
    if (l.tipo === 'regalo-gas') {
      for (const r of a.datos.regalos.filter((x) => x.liberacion === l.id)) Object.assign(r, { estado: 'enviado', tx: h, fecha: o.ejecutada })
    }
    Object.assign(l, { estado: 'ejecutada', tx: h, ejecutada: o.ejecutada })
  }
  return o
}

/**
 * Anula una operación pendiente: se crea en su lugar la operación vacía con el mismo nonce, que hay
 * que firmar y ejecutar. Marcarla aquí no basta: alguien pudo firmarla fuera de la plataforma (con el
 * archivo descargado), y con las firmas del umbral se podría ejecutar mientras su nonce siga libre.
 * Una anulación no se anula: es una transacción vacía, y anularla dejaría libre el nonce otra vez.
 */
export async function anular(a: Almacen, cadena: Cadena, cfg: ConfigSafe, id: string, actor: string, motivo: string): Promise<{ anulada: Operacion; reemplazo: Operacion }> {
  const o = buscar(a, id)
  if (!PENDIENTE.has(o.estado)) throw new ErrorFirma(`la operación está ${o.estado}`)
  if (o.tipo === 'anulacion') throw new ErrorFirma('una anulación no se anula: es una transacción vacía que deja sin efecto a la anulada')
  if (!motivo?.trim()) throw new ErrorFirma('falta el motivo')
  // Primero el reemplazo: si la cadena no responde, nada cambia.
  const reemplazo = await crear(a, cadena, cfg, actor, {
    tipo: 'anulacion', titulo: `Anula «${o.titulo}» (nonce ${o.safeTx.nonce})`, nonce: o.safeTx.nonce, enSafe: o.safe,
    llamadas: [{ to: o.safe, value: '0', data: '0x' }],
  })
  reemplazo.anula = o.id
  o.estado = 'anulada'
  o.anulacion = { actor, motivo: motivo.trim(), fecha: new Date().toISOString() }
  registrar(a, actor, 'operacion.anulada', { id, motivo: motivo.trim(), reemplazo: reemplazo.id })
  const l = liberacionDe(a, o)
  if (l && l.estado !== 'ejecutada') {
    l.estado = 'rechazada'
    l.rechazo = { firmante: actor, fecha: new Date().toISOString(), motivo: motivo.trim() }
  }
  return { anulada: o, reemplazo }
}

function liberacionDe(a: Almacen, o: Operacion): Liberacion | undefined {
  return o.liberacion ? a.datos.liberaciones.find((l) => l.id === o.liberacion) : undefined
}

/** La operación de una liberación de ORIGEN: un envío nativo de la Safe al destino. */
export function crearDeLiberacion(a: Almacen, cadena: Cadena, cfg: ConfigSafe, l: Liberacion) {
  return crear(a, cadena, cfg, l.autor, {
    tipo: 'liberacion', liberacion: l.id, titulo: `Liberación de ORIGEN: ${l.motivo}`,
    llamadas: [{ to: l.destino, value: l.monto, data: '0x' }],
  })
}

/** La operación de una tanda del regalo: un envío por cada usuario de la tanda, en un solo lote. */
export function crearDeRegalo(a: Almacen, cadena: Cadena, cfg: ConfigSafe, l: Liberacion) {
  const envios = a.datos.regalos.filter((r) => r.liberacion === l.id)
  return crear(a, cadena, cfg, l.autor, {
    tipo: 'regalo-gas', liberacion: l.id, titulo: l.motivo,
    llamadas: envios.map((r) => ({ to: r.direccion, value: r.monto, data: '0x' })),
  })
}

/**
 * Recupera todo el ORIGEN de la Safe anterior (SAFE_ANTERIOR) hacia la operativa vigente. El destino es
 * fijo: la plataforma no arma desde la Safe anterior ninguna otra transacción. La firman los custodios
 * de la Safe anterior, con su umbral; el monto es su saldo al crearla (si después llega más, se arma otra).
 */
export async function crearRecuperacion(a: Almacen, cadena: Cadena, cfg: ConfigSafe, autor: string): Promise<Operacion> {
  if (!cfg.anterior) throw new ErrorFirma('Falta SAFE_ANTERIOR: no hay una Safe anterior de la que recuperar fondos')
  if (a.datos.operaciones.some((o) => o.tipo === 'recuperacion' && PENDIENTE.has(o.estado))) throw new ErrorFirma('ya hay una recuperación pendiente: fírmala, ejecútala o anúlala primero')
  const saldo = BigInt(await cadena.llamar('eth_getBalance', [cfg.anterior, 'latest']) as string)
  if (saldo === 0n) throw new ErrorFirma('la Safe anterior no tiene ORIGEN')
  return crear(a, cadena, cfg, autor, {
    tipo: 'recuperacion', enSafe: cfg.anterior,
    titulo: `Recuperación: todo el ORIGEN de la Safe anterior pasa a la operativa vigente ${cfg.safe}`,
    llamadas: [{ to: cfg.safe, value: saldo.toString(), data: '0x' }],
  })
}
