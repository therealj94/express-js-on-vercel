// La foto de saldos de un activo en un bloque, y su conciliación con la v2.
//
// La regla que la gobierna: NO FALTA NADIE. La foto suma los saldos de todas
// las direcciones encontradas y los compara con el supply del contrato. Si la
// suma no llega al supply, la foto queda con «sin ubicar» y no se puede
// publicar: quiere decir que hay tenedores que todavía no conocemos, y acuñar
// la v2 así dejaría a alguien fuera.
//
// Todos los tenedores pasan a la v2, sean usuarios de Veta Wallet, tesorería,
// sistema o direcciones externas. La clase sirve para informar, no para
// decidir quién pasa.

import type { Activo } from './catalogo.js'
import { SUPPLY_ORIGEN } from './catalogo.js'
import { Cadena, CERO } from './cadena.js'
import { construir } from './merkle.js'
import type { Clase, Datos, Foto, Conciliacion, Tenedor } from './almacen.js'

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

export async function tomarFoto(cadena: Cadena, a: Activo, bloque: number, direcciones: string[], listas: Datos['listas']):
  Promise<Pick<Foto, 'supply' | 'raiz' | 'tenedores' | 'sumas' | 'sinUbicar'>> {
  const supply = a.heredado ? await cadena.supply(a.heredado, bloque) : SUPPLY_ORIGEN
  const saldos = await cadena.saldos(a.heredado, direcciones, bloque)
  const clase = clasificador(listas)
  const tenedores: Tenedor[] = []
  const sumas: Record<Clase, bigint> = { usuario: 0n, tesoreria: 0n, sistema: 0n, externa: 0n }
  direcciones.forEach((d, i) => {
    if (saldos[i] > 0n) {
      const c = clase(d)
      tenedores.push({ direccion: d, saldo: saldos[i].toString(), clase: c })
      sumas[c] += saldos[i]
    }
  })
  tenedores.sort((x, y) => (BigInt(y.saldo) > BigInt(x.saldo) ? 1 : -1))
  const ubicado = Object.values(sumas).reduce((s, v) => s + v, 0n)
  const arbol = construir(tenedores.map((t) => ({ direccion: t.direccion, saldo: BigInt(t.saldo) })))
  return {
    supply: supply.toString(),
    raiz: arbol.raiz,
    tenedores,
    sumas: Object.fromEntries(Object.entries(sumas).map(([k, v]) => [k, v.toString()])) as Record<Clase, string>,
    sinUbicar: (supply - ubicado).toString(),
  }
}

/** Una foto se puede publicar solo si no falta nadie. */
export function puedePublicar(f: Foto): string | null {
  if (f.estado !== 'lista') return `la foto está ${f.estado}`
  if (f.activo === 'ORIGEN') return 'ORIGEN no se migra: su foto es informativa'
  if (BigInt(f.sinUbicar || '0') !== 0n) return `faltan tenedores: ${f.sinUbicar} unidades sin ubicar`
  return null
}

/** Compara la v2 con la foto publicada: cada tenedor con su saldo exacto, y el total. */
export async function conciliar(cadena: Cadena, f: Foto, contratoV2: string): Promise<Omit<Conciliacion, 'fecha'>> {
  const bloque = await cadena.ultimoBloque()
  const tenedores = f.tenedores || []
  const enV2 = await cadena.saldos(contratoV2, tenedores.map((t) => t.direccion), bloque)
  const supplyV2 = await cadena.supply(contratoV2, bloque)
  const diferencias = tenedores
    .map((t, i) => ({ direccion: t.direccion, foto: t.saldo, v2: enV2[i].toString() }))
    .filter((x) => x.foto !== x.v2)
  const esperado = tenedores.reduce((s, t) => s + BigInt(t.saldo), 0n)
  return {
    activo: f.activo, fotoId: f.id, contratoV2, bloque,
    supplyV2: supplyV2.toString(), esperado: esperado.toString(), diferencias,
    cuadra: diferencias.length === 0 && supplyV2 === esperado,
  }
}
