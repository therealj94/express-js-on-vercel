// La foto de saldos de un activo en un bloque, la política de qué pasa a la v2,
// los reclamos de lo no ubicado y la conciliación con la v2.
//
// La foto suma los saldos de todas las direcciones encontradas y los compara
// con el supply del contrato: así se sabe exactamente qué falta ubicar. A cada
// saldo se le aplica la política de la moneda (catalogo.ts): lo que supera el
// umbral es tesorería y desaparece, un tope deja a una dirección con un máximo,
// y todo lo demás pasa completo. Cada exclusión queda con su motivo.
//
// Lo que no se ubicó no se acuña a ciegas: se abre un plazo para que su dueño
// lo reclame firmando con esa billetera. Pasado el plazo, desaparece.

import { verifyMessage } from 'ethers'
import type { Activo } from './catalogo.js'
import { aplicarPolitica } from './catalogo.js'
import { Cadena, CERO } from './cadena.js'
import { construir } from './merkle.js'
import type { Clase, Datos, Foto, Conciliacion, Tenedor, Reclamo } from './almacen.js'

export function clasificador(listas: Datos['listas']): (d: string) => Clase {
  const usuarios = new Set(listas.usuarios.direcciones)
  const tesoreria = new Set(listas.tesoreria.direcciones)
  const sistema = new Set(listas.sistema.direcciones)
  return (d) => (tesoreria.has(d) ? 'tesoreria' : sistema.has(d) ? 'sistema' : usuarios.has(d) ? 'usuario' : 'externa')
}

/** Todo lo que se ha movido en la 5550 hasta el bloque. Es lo lento: se reutiliza entre fotos del mismo bloque. */
export async function barrido(cadena: Cadena, bloque: number, barrerNativas = true): Promise<string[]> {
  const vistas = await cadena.direccionesDeTransfer(bloque)
  if (barrerNativas) (await cadena.direccionesNativas(bloque)).forEach((d) => vistas.add(d))
  return [...vistas]
}

/** Candidatas: el barrido más las listas cargadas, siempre las vigentes (una lista nueva cuenta en la foto siguiente). */
export function candidatas(barridas: string[], listas: Datos['listas']): string[] {
  const todas = new Set(barridas)
  for (const l of Object.values(listas)) l.direcciones.forEach((d) => todas.add(d))
  todas.delete(CERO)
  return [...todas].sort()
}

/** Lo que se acuña, en el formato de las hojas del árbol. */
export const entradasAcunacion = (tenedores: { direccion: string; acunar: string }[]) =>
  tenedores.filter((t) => BigInt(t.acunar) > 0n).map((t) => ({ direccion: t.direccion, saldo: BigInt(t.acunar) }))

export async function tomarFoto(cadena: Cadena, a: Activo, bloque: number, direcciones: string[], listas: Datos['listas']):
  Promise<Pick<Foto, 'supply' | 'raiz' | 'tenedores' | 'sumas' | 'acunar' | 'excluido' | 'sinUbicar'>> {
  // ORIGEN no tiene supply propio: es lo que tiene la gente (se calcula abajo, con los usuarios).
  let supply = a.heredado ? await cadena.supply(a.heredado, bloque) : 0n
  const saldos = await cadena.saldos(a.heredado, direcciones, bloque)
  const clase = clasificador(listas)
  const tenedores: Tenedor[] = []
  const sumas: Record<Clase, bigint> = { usuario: 0n, tesoreria: 0n, sistema: 0n, externa: 0n }
  let acunar = 0n
  direcciones.forEach((d, i) => {
    if (saldos[i] > 0n) {
      const c = clase(d)
      // ORIGEN no se migra: su foto es informativa y no pasa por la política.
      const p = a.heredado ? aplicarPolitica(a, d, saldos[i], c === 'usuario') : { acunar: 0n }
      tenedores.push({ direccion: d, saldo: saldos[i].toString(), clase: c, acunar: p.acunar.toString(), ...(p.motivo ? { motivo: p.motivo } : {}) })
      sumas[c] += saldos[i]
      acunar += p.acunar
    }
  })
  tenedores.sort((x, y) => (BigInt(y.saldo) > BigInt(x.saldo) ? 1 : -1))
  const ubicado = Object.values(sumas).reduce((s, v) => s + v, 0n)
  if (!a.heredado) supply = sumas.usuario
  return {
    supply: supply.toString(),
    raiz: construir(entradasAcunacion(tenedores)).raiz,
    tenedores,
    sumas: Object.fromEntries(Object.entries(sumas).map(([k, v]) => [k, v.toString()])) as Record<Clase, string>,
    acunar: acunar.toString(),
    excluido: (ubicado - acunar).toString(),
    // En ORIGEN no falta nadie por ubicar: lo que no tiene la gente no es supply.
    sinUbicar: (a.heredado ? supply - ubicado : 0n).toString(),
  }
}

/**
 * Una foto se publica si no falta nadie o, si falta, con un plazo de reclamos
 * abierto para que su dueño lo pida.
 */
export function puedePublicar(f: Foto, plazoReclamos?: string): string | null {
  if (f.estado !== 'lista') return `la foto está ${f.estado}`
  if (f.activo === 'ORIGEN') return 'ORIGEN no se migra: su foto es informativa'
  if (BigInt(f.sinUbicar || '0') !== 0n) {
    if (!plazoReclamos || Number.isNaN(Date.parse(plazoReclamos))) {
      return `quedan ${f.sinUbicar} unidades sin ubicar: hace falta fijar el plazo de reclamos`
    }
    if (Date.parse(plazoReclamos) <= Date.now()) return 'el plazo de reclamos tiene que ser una fecha futura'
  }
  return null
}

/** El mensaje que el tenedor firma con su billetera para reclamar. Fijo y legible. */
export const mensajeReclamo = (activo: string, direccion: string, bloque: number) =>
  `Reclamo de la migración v2 de Orden Global\nMoneda: ${activo}\nDirección: ${direccion.toLowerCase()}\nFoto del bloque: ${bloque}`

export class ErrorReclamo extends Error {}

/**
 * Prepara un reclamo: comprueba la firma, que la dirección no esté ya en la
 * foto ni reclamada, y lee su saldo en el bloque de la foto. Lo que puede
 * reclamarse nunca supera lo que la foto dejó sin ubicar.
 */
export async function prepararReclamo(cadena: Cadena, a: Activo, f: Foto, reclamos: Reclamo[], direccion: string, firma: string, listas: Datos['listas']): Promise<Omit<Reclamo, 'id' | 'creado' | 'estado'>> {
  const dir = direccion.toLowerCase()
  // Solo reclaman los usuarios de Veta Wallet: lo de cualquier otra dirección desaparece (política del 7 de octubre).
  if (clasificador(listas)(dir) !== 'usuario') throw new ErrorReclamo('solo los usuarios de Veta Wallet pasan a la v2: esa dirección no es de un usuario')
  if (!f.plazoReclamos || Date.parse(f.plazoReclamos) <= Date.now()) throw new ErrorReclamo('el plazo de reclamos de esta moneda está cerrado')
  let firmante = ''
  try { firmante = verifyMessage(mensajeReclamo(a.clave, dir, f.bloque), firma).toLowerCase() } catch { throw new ErrorReclamo('la firma no es válida') }
  if (firmante !== dir) throw new ErrorReclamo('la firma no es de esa dirección')
  if (f.tenedores?.some((t) => t.direccion === dir)) throw new ErrorReclamo('esa dirección ya está en la foto: no hace falta reclamar')
  if (reclamos.some((r) => r.fotoId === f.id && r.direccion === dir && r.estado !== 'rechazado')) throw new ErrorReclamo('esa dirección ya tiene un reclamo')
  const [saldo] = await cadena.saldos(a.heredado, [dir], f.bloque)
  if (saldo === 0n) throw new ErrorReclamo('esa dirección no tenía saldo en el bloque de la foto')
  const yaReclamado = reclamos.filter((r) => r.fotoId === f.id && r.estado !== 'rechazado').reduce((s, r) => s + BigInt(r.saldo), 0n)
  if (yaReclamado + saldo > BigInt(f.sinUbicar || '0')) throw new ErrorReclamo('el saldo reclamado supera lo que quedó sin ubicar')
  const p = aplicarPolitica(a, dir, saldo, true)
  return { fotoId: f.id, activo: a.clave, direccion: dir, saldo: saldo.toString(), acunar: p.acunar.toString(), ...(p.motivo ? { motivo: p.motivo } : {}), firma }
}

/** Lo que hay que acuñar de una foto publicada: los tenedores y los reclamos aprobados. */
export function aAcunar(f: Foto, reclamos: Reclamo[]): { direccion: string; acunar: string }[] {
  const aprobados = reclamos.filter((r) => r.fotoId === f.id && r.estado === 'aprobado')
  return [...(f.tenedores || []), ...aprobados].filter((x) => BigInt(x.acunar) > 0n)
}

/** Compara la v2 con lo que había que acuñar: cada dirección con su monto exacto, y el total. */
export async function conciliar(cadena: Cadena, f: Foto, reclamos: Reclamo[], contratoV2: string): Promise<Omit<Conciliacion, 'fecha'>> {
  const bloque = await cadena.ultimoBloque()
  const lista = aAcunar(f, reclamos)
  const enV2 = await cadena.saldos(contratoV2, lista.map((t) => t.direccion), bloque)
  const supplyV2 = await cadena.supply(contratoV2, bloque)
  const diferencias = lista
    .map((t, i) => ({ direccion: t.direccion, foto: t.acunar, v2: enV2[i].toString() }))
    .filter((x) => x.foto !== x.v2)
  const esperado = lista.reduce((s, t) => s + BigInt(t.acunar), 0n)
  return {
    activo: f.activo, fotoId: f.id, contratoV2, bloque,
    supplyV2: supplyV2.toString(), esperado: esperado.toString(), diferencias,
    cuadra: diferencias.length === 0 && supplyV2 === esperado,
  }
}
