// ORIGEN: circulación, liberaciones de tesorería y regalo de gas.
//
// ORIGEN es la moneda nativa y no se acuña: su «mint» es liberar unidades de la
// tesorería. Su supply es solo lo que tiene la gente (los usuarios de Veta
// Wallet); no hay un supply fijo del que se reste nada. Una liberación solo
// procede contra algo que la asegure, con su referencia documental, y con las
// firmas del umbral.
//
// Esta plataforma no tiene llaves y no envía nada. Registra la propuesta y las
// aprobaciones, y cuando la firma múltiple ejecuta la transferencia, comprueba
// en la cadena que lo ejecutado es exactamente lo aprobado.
//
// El regalo de gas deja a cada usuario de Veta Wallet con al menos 1 ORIGEN,
// una sola vez: a quien tiene menos, se le completa lo que le falta. Así puede
// pagar el gas fee al operar sus activos v2.

import { Cadena } from './cadena.js'
import type { Almacen, Liberacion } from './almacen.js'
import { nuevoId, registrar } from './almacen.js'

export const UN_ORIGEN = 10n ** 18n

/**
 * El supply de ORIGEN es lo que tiene la gente: la suma de los saldos de los usuarios de Veta Wallet,
 * y nada más. No hay un supply fijo del que se reste nada: lo que no está en manos de un usuario no
 * cuenta. `excluir` saca a quien esté en la lista de usuarios pero no sea gente (tesorería, sistema,
 * la Safe). Sin la lista de usuarios cargada no hay supply que mostrar.
 */
export async function circulacion(cadena: Cadena, usuarios: string[], excluir: string[] = []) {
  const fuera = new Set(excluir.map((d) => d.toLowerCase()))
  const gente = [...new Set(usuarios.map((d) => d.toLowerCase()))].filter((d) => !fuera.has(d))
  const bloque = await cadena.ultimoBloque()
  const saldos = gente.length ? await cadena.saldos(null, gente, bloque) : []
  return {
    bloque,
    circulante: saldos.reduce((s, v) => s + v, 0n).toString(),
    usuarios: gente.length,
    conSaldo: saldos.filter((v) => v > 0n).length,
    completa: gente.length > 0,
  }
}

export class ErrorRegla extends Error {}

export function proponer(a: Almacen, autor: string, p: { monto: string; destino: string; motivo: string; respaldo: string; tipo?: Liberacion['tipo'] }): Liberacion {
  let monto: bigint
  try { monto = BigInt(p.monto) } catch { throw new ErrorRegla('monto inválido (en wei, entero)') }
  if (monto <= 0n) throw new ErrorRegla('el monto tiene que ser mayor que cero')
  if (!p.motivo?.trim()) throw new ErrorRegla('falta el motivo')
  if (!p.respaldo?.trim()) throw new ErrorRegla('falta el respaldo: una liberación solo procede contra lo asegurado')
  const destino = (p.destino || '').toLowerCase()
  if (p.tipo !== 'regalo-gas' && !/^0x[0-9a-f]{40}$/.test(destino)) throw new ErrorRegla('destino inválido')
  const l: Liberacion = {
    id: nuevoId('lib'), tipo: p.tipo || 'liberacion', monto: monto.toString(), destino,
    motivo: p.motivo.trim(), respaldo: p.respaldo.trim(), autor, creada: new Date().toISOString(),
    estado: 'propuesta', aprobaciones: [],
  }
  a.datos.liberaciones.push(l)
  registrar(a, autor, 'liberacion.propuesta', { id: l.id, monto: l.monto, destino: l.destino, tipo: l.tipo })
  return l
}

export function aprobar(a: Almacen, id: string, firmante: string, umbral: number): Liberacion {
  const l = buscar(a, id)
  if (l.estado !== 'propuesta') throw new ErrorRegla(`la liberación está ${l.estado}`)
  // Quien propone no aprueba: separar las dos funciones es lo que da sentido a la firma múltiple.
  if (l.autor === firmante) throw new ErrorRegla('quien propone no puede aprobar su propia liberación')
  if (l.aprobaciones.some((x) => x.firmante === firmante)) throw new ErrorRegla('ya aprobaste esta liberación')
  l.aprobaciones.push({ firmante, fecha: new Date().toISOString() })
  if (l.aprobaciones.length >= umbral) l.estado = 'aprobada'
  registrar(a, firmante, 'liberacion.aprobada', { id, firmas: l.aprobaciones.length, umbral })
  return l
}

export function rechazar(a: Almacen, id: string, firmante: string, motivo: string): Liberacion {
  const l = buscar(a, id)
  if (l.estado === 'ejecutada') throw new ErrorRegla('una liberación ejecutada no se rechaza')
  l.estado = 'rechazada'
  l.rechazo = { firmante, fecha: new Date().toISOString(), motivo: motivo || '' }
  registrar(a, firmante, 'liberacion.rechazada', { id, motivo })
  return l
}

/** Comprueba en la cadena una transferencia nativa: de tesorería, al destino, por el monto, y confirmada. */
export async function comprobarEnvio(cadena: Cadena, hash: string, esperado: { destino: string; monto: bigint; tesoreria: string[] }): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return 'hash inválido'
  const [tx, recibo] = await Promise.all([cadena.transaccion(hash), cadena.recibo(hash)])
  if (!tx || !recibo) return 'la transacción no está en la cadena'
  if (recibo.status !== '0x1') return 'la transacción falló en la cadena'
  if (!esperado.tesoreria.includes(String(tx.from).toLowerCase())) return 'no salió de una dirección de tesorería'
  if (String(tx.to || '').toLowerCase() !== esperado.destino) return 'el destino no coincide'
  if (BigInt(tx.value) !== esperado.monto) return `el monto no coincide (${BigInt(tx.value)} frente a ${esperado.monto})`
  return null
}

export async function ejecutar(a: Almacen, cadena: Cadena, id: string, hash: string, actor: string): Promise<Liberacion> {
  const l = buscar(a, id)
  if (l.tipo === 'regalo-gas') throw new ErrorRegla('el regalo de gas se registra envío por envío')
  if (l.estado !== 'aprobada') throw new ErrorRegla(`solo se ejecuta una liberación aprobada (está ${l.estado})`)
  if (a.datos.liberaciones.some((x) => x.tx === hash.toLowerCase())) throw new ErrorRegla('esa transacción ya se usó')
  const fallo = await comprobarEnvio(cadena, hash, { destino: l.destino, monto: BigInt(l.monto), tesoreria: a.datos.listas.tesoreria.direcciones })
  if (fallo) throw new ErrorRegla(fallo)
  l.estado = 'ejecutada'
  l.tx = hash.toLowerCase()
  l.ejecutada = new Date().toISOString()
  registrar(a, actor, 'liberacion.ejecutada', { id, tx: l.tx })
  return l
}

/**
 * Prepara el regalo: a cada usuario de Veta Wallet (sin tesorería ni sistema)
 * que tenga menos de 1 ORIGEN y no lo haya recibido ya, lo que le falta para
 * llegar a 1. Crea una liberación por el total, que hay que aprobar antes de enviar.
 */
export async function prepararRegalo(a: Almacen, cadena: Cadena, autor: string, o: { excluir?: string[]; porTanda?: number } = {}): Promise<{ liberacion: Liberacion | null; liberaciones: Liberacion[]; nuevos: number }> {
  const excluidas = new Set([...a.datos.listas.tesoreria.direcciones, ...a.datos.listas.sistema.direcciones, ...(o.excluir || []).map((d) => d.toLowerCase())])
  // Quien quedó en una tanda rechazada (anulada) vuelve a entrar en el siguiente «Preparar».
  const rechazadas = new Set(a.datos.liberaciones.filter((l) => l.estado === 'rechazada').map((l) => l.id))
  a.datos.regalos = a.datos.regalos.filter((r) => !(rechazadas.has(r.liberacion) && r.estado === 'pendiente'))
  const ya = new Set(a.datos.regalos.map((r) => r.direccion))
  const destinos = a.datos.listas.usuarios.direcciones.filter((d) => !excluidas.has(d) && !ya.has(d)).sort()
  const saldos = destinos.length ? await cadena.saldos(null, destinos, await cadena.ultimoBloque()) : []
  const faltan = destinos.map((d, i) => ({ direccion: d, monto: UN_ORIGEN - saldos[i] })).filter((x) => x.monto > 0n)
  if (!faltan.length) return { liberacion: null, liberaciones: [], nuevos: 0 }
  // Con la firma múltiple, cada tanda es una transacción de la Safe (un lote de envíos que cabe en un
  // bloque): las tandas salen parejas. Sin ella, una sola liberación por todo.
  const tandas = o.porTanda ? Math.ceil(faltan.length / o.porTanda) : 1
  const tamano = Math.ceil(faltan.length / tandas)
  const liberaciones: Liberacion[] = []
  for (let t = 0; t < tandas; t++) {
    const grupo = faltan.slice(t * tamano, (t + 1) * tamano)
    const total = grupo.reduce((s, x) => s + x.monto, 0n)
    const l = proponer(a, autor, {
      tipo: 'regalo-gas', monto: total.toString(), destino: '',
      motivo: `Regalo de gas: completar hasta 1 ORIGEN a ${grupo.length} usuarios de Veta Wallet${tandas > 1 ? ` (tanda ${t + 1} de ${tandas})` : ''}`,
      respaldo: 'Programa de regalo de gas de la migración v2',
    })
    grupo.forEach((x) => a.datos.regalos.push({ direccion: x.direccion, monto: x.monto.toString(), estado: 'pendiente', liberacion: l.id }))
    liberaciones.push(l)
  }
  return { liberacion: liberaciones[0], liberaciones, nuevos: faltan.length }
}

export async function registrarEnvioRegalo(a: Almacen, cadena: Cadena, direccion: string, hash: string, actor: string) {
  const r = a.datos.regalos.find((x) => x.direccion === direccion.toLowerCase())
  if (!r) throw new ErrorRegla('esa dirección no está en el regalo')
  if (r.estado === 'enviado') throw new ErrorRegla('esa dirección ya recibió su ORIGEN')
  const l = buscar(a, r.liberacion)
  if (l.estado !== 'aprobada') throw new ErrorRegla(`el regalo todavía no está aprobado (está ${l.estado})`)
  if (a.datos.regalos.some((x) => x.tx === hash.toLowerCase())) throw new ErrorRegla('esa transacción ya se usó')
  const fallo = await comprobarEnvio(cadena, hash, { destino: r.direccion, monto: BigInt(r.monto), tesoreria: a.datos.listas.tesoreria.direcciones })
  if (fallo) throw new ErrorRegla(fallo)
  r.estado = 'enviado'
  r.tx = hash.toLowerCase()
  r.fecha = new Date().toISOString()
  registrar(a, actor, 'regalo.enviado', { direccion: r.direccion, tx: r.tx })
  // Cuando ya salieron todos los de esa liberación, queda ejecutada.
  if (a.datos.regalos.filter((x) => x.liberacion === l.id).every((x) => x.estado === 'enviado')) {
    l.estado = 'ejecutada'
    l.ejecutada = new Date().toISOString()
  }
  return r
}

function buscar(a: Almacen, id: string): Liberacion {
  const l = a.datos.liberaciones.find((x) => x.id === id)
  if (!l) throw new ErrorRegla('no existe esa liberación')
  return l
}
