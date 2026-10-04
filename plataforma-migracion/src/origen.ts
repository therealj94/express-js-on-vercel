// ORIGEN: circulación, liberaciones de tesorería y regalo de gas.
//
// ORIGEN es la moneda nativa y no se acuña: su «mint» es liberar unidades de la
// tesorería. El supply que se muestra es lo que circula, es decir, todo lo que
// no está en tesorería (SFSP §4.3). Una liberación solo procede contra algo que
// la asegure, con su referencia documental, y con las firmas del umbral.
//
// Esta plataforma no tiene llaves y no envía nada. Registra la propuesta y las
// aprobaciones, y cuando la firma múltiple ejecuta la transferencia, comprueba
// en la cadena que lo ejecutado es exactamente lo aprobado.
//
// El regalo de gas da 1 ORIGEN a cada tenedor que no es tesorería ni sistema,
// una sola vez, para que pueda pagar el gas fee al operar sus activos v2.

import { Cadena } from './cadena.js'
import { SUPPLY_ORIGEN } from './catalogo.js'
import type { Almacen, Liberacion } from './almacen.js'
import { nuevoId, registrar } from './almacen.js'

export const UN_ORIGEN = 10n ** 18n

export async function circulacion(cadena: Cadena, tesoreria: string[]) {
  const bloque = await cadena.ultimoBloque()
  const saldos = tesoreria.length ? await cadena.saldos(null, tesoreria, bloque) : []
  const enTesoreria = saldos.reduce((s, v) => s + v, 0n)
  return {
    bloque,
    supplyFijo: SUPPLY_ORIGEN.toString(),
    enTesoreria: enTesoreria.toString(),
    circulante: (SUPPLY_ORIGEN - enTesoreria).toString(),
    tesoreria: tesoreria.map((d, i) => ({ direccion: d, saldo: saldos[i].toString() })),
    /** Sin direcciones de tesorería cargadas, todo cuenta como circulante: se avisa. */
    completa: tesoreria.length > 0,
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
 * Prepara el regalo: una entrada por tenedor (de cualquier foto publicada o de
 * la lista de usuarios) que no sea tesorería ni sistema y que no lo haya
 * recibido ya, y una liberación por el total que hay que aprobar antes de enviar.
 */
export function prepararRegalo(a: Almacen, autor: string): { liberacion: Liberacion | null; nuevos: number } {
  const excluidas = new Set([...a.datos.listas.tesoreria.direcciones, ...a.datos.listas.sistema.direcciones])
  const ya = new Set(a.datos.regalos.map((r) => r.direccion))
  const destinos = new Set<string>(a.datos.listas.usuarios.direcciones)
  for (const f of a.datos.fotos) if (f.estado === 'publicada') f.tenedores?.forEach((t) => destinos.add(t.direccion))
  const nuevos = [...destinos].filter((d) => !excluidas.has(d) && !ya.has(d)).sort()
  if (!nuevos.length) return { liberacion: null, nuevos: 0 }
  const l = proponer(a, autor, {
    tipo: 'regalo-gas', monto: (UN_ORIGEN * BigInt(nuevos.length)).toString(), destino: '',
    motivo: `Regalo de gas: 1 ORIGEN a ${nuevos.length} tenedores`, respaldo: 'Programa de regalo de gas de la migración v2',
  })
  nuevos.forEach((d) => a.datos.regalos.push({ direccion: d, estado: 'pendiente', liberacion: l.id }))
  return { liberacion: l, nuevos: nuevos.length }
}

export async function registrarEnvioRegalo(a: Almacen, cadena: Cadena, direccion: string, hash: string, actor: string) {
  const r = a.datos.regalos.find((x) => x.direccion === direccion.toLowerCase())
  if (!r) throw new ErrorRegla('esa dirección no está en el regalo')
  if (r.estado === 'enviado') throw new ErrorRegla('esa dirección ya recibió su ORIGEN')
  const l = buscar(a, r.liberacion)
  if (l.estado !== 'aprobada') throw new ErrorRegla(`el regalo todavía no está aprobado (está ${l.estado})`)
  if (a.datos.regalos.some((x) => x.tx === hash.toLowerCase())) throw new ErrorRegla('esa transacción ya se usó')
  const fallo = await comprobarEnvio(cadena, hash, { destino: r.direccion, monto: UN_ORIGEN, tesoreria: a.datos.listas.tesoreria.direcciones })
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
