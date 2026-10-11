// Arma las transacciones de una ronda de acreditación a partir del archivo de acuñación de la plataforma.
// La usan scripts/lotes-safe.ts y las pruebas.
import type { ethers as Ethers } from 'ethers'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

export interface Archivo { activo?: string; bloque?: number; raiz: string; totalAcunar: string; tenedores: { direccion: string; acunar: string; prueba: string[] }[] }
export interface Transaccion { to: string; value: string; data: string }

export async function prepararLotes(
  e: typeof Ethers, a: Archivo, token: string, proveedor: Ethers.Provider, contrato: Ethers.Contract,
  opciones: { lote?: number; referencia?: string; soloApertura?: boolean } = {},
): Promise<{ transacciones: Transaccion[]; pendientes: Archivo['tenedores']; total: bigint; desplegado: boolean; anuncio?: { ejecutableDesde: number } }> {
  const lote = opciones.lote ?? 40
  if (!Number.isInteger(lote) || lote < 1 || lote > 200) throw new Error('LOTE tiene que ser un entero entre 1 y 200')

  let suma = 0n
  for (const t of a.tenedores) {
    if (!StandardMerkleTree.verify(a.raiz, ['address', 'uint256'], [t.direccion, t.acunar], t.prueba)) {
      throw new Error(`La prueba de ${t.direccion} no verifica contra la raíz: el archivo no se firma`)
    }
    suma += BigInt(t.acunar)
  }
  if (suma !== BigInt(a.totalAcunar)) throw new Error(`La suma (${suma}) no coincide con el total (${a.totalAcunar})`)

  // Lo ya acreditado en rondas anteriores no se vuelve a mandar. Sin contrato en la red (todavía no
  // desplegado), no hay nada acreditado; con contrato, se le pregunta hoja por hoja.
  const desplegado = (await proveedor.getCode(token)) !== '0x'
  const hoja = (t: { direccion: string; acunar: string }) =>
    e.keccak256(e.keccak256(e.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [t.direccion, t.acunar])))
  const pendientes: Archivo['tenedores'] = []
  for (const t of a.tenedores) if (!desplegado || !(await contrato.acreditada(hoja(t)))) pendientes.push(t)
  const total = pendientes.reduce((s, t) => s + BigInt(t.acunar), 0n)
  if (!pendientes.length) return { transacciones: [], pendientes, total, desplegado }
  if (desplegado && (await contrato.restante(a.raiz)) !== 0n) throw new Error('Esa raíz ya tiene una ronda abierta con saldo: acreditar lo pendiente sin abrir otra')

  const iface = contrato.interface
  const referencia = e.encodeBytes32String((opciones.referencia || `${a.activo ?? ''} ${a.bloque ?? ''}`).trim().slice(0, 31))
  // Con demora de emisión (un security), la ronda se anuncia primero y se abre pasada la demora, con
  // exactamente la misma raíz, total y referencia.
  if (desplegado && (await contrato.demoraEmision()) > 0n) {
    const desde = Number(await contrato.emisionAnunciada(await contrato.idMigracion(a.raiz, total, referencia)))
    if (desde === 0) {
      const demora = Number(await contrato.demoraEmision())
      const ahora = (await proveedor.getBlock('latest'))!.timestamp
      return { transacciones: [{ to: token, value: '0', data: iface.encodeFunctionData('anunciarMigracion', [a.raiz, total, referencia]) }], pendientes, total, desplegado, anuncio: { ejecutableDesde: ahora + demora } }
    }
    const ahora = (await proveedor.getBlock('latest'))!.timestamp
    if (ahora < desde) throw new Error(`La ronda está anunciada y en demora hasta ${new Date(desde * 1000).toISOString()}`)
  }
  const transacciones: Transaccion[] = [{ to: token, value: '0', data: iface.encodeFunctionData('abrirMigracion', [a.raiz, total, referencia]) }]
  // soloApertura: la Safe solo abre la ronda; la acreditación la manda después cualquiera con gas
  // (acreditarPendientes), por lotes que siempre caben en un bloque. Es lo que se usa en la 5550.
  if (opciones.soloApertura) return { transacciones, pendientes, total, desplegado }
  for (let i = 0; i < pendientes.length; i += lote) {
    const parte = pendientes.slice(i, i + lote)
    transacciones.push({ to: token, value: '0', data: iface.encodeFunctionData('acreditarLote', [a.raiz, parte.map((t) => t.direccion), parte.map((t) => t.acunar), parte.map((t) => t.prueba)]) })
  }
  return { transacciones, pendientes, total, desplegado }
}

/**
 * Acredita lo pendiente de una ronda YA ABIERTA por la Safe, por lotes, desde cualquier cuenta con gas:
 * acreditar no da ningún poder (cada hoja se valida contra la raíz y no se acredita dos veces), así que
 * no hace falta la firma múltiple. Antes de mandar nada comprueba las pruebas, la suma y que lo abierto
 * alcance exactamente para lo pendiente.
 */
export async function acreditarPendientes(
  e: typeof Ethers, a: Archivo, contrato: Ethers.Contract, opciones: { lote?: number; alEnviar?: (i: number, de: number, hash: string, gas: bigint) => void } = {},
): Promise<{ lotes: number; acreditadas: number; gas: bigint }> {
  const lote = opciones.lote ?? 40
  if (!Number.isInteger(lote) || lote < 1 || lote > 200) throw new Error('LOTE tiene que ser un entero entre 1 y 200')
  let suma = 0n
  for (const t of a.tenedores) {
    if (!StandardMerkleTree.verify(a.raiz, ['address', 'uint256'], [t.direccion, t.acunar], t.prueba)) throw new Error(`La prueba de ${t.direccion} no verifica contra la raíz`)
    suma += BigInt(t.acunar)
  }
  if (suma !== BigInt(a.totalAcunar)) throw new Error(`La suma (${suma}) no coincide con el total (${a.totalAcunar})`)
  const hoja = (t: { direccion: string; acunar: string }) => e.keccak256(e.keccak256(e.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [t.direccion, t.acunar])))
  const pendientes: Archivo['tenedores'] = []
  for (const t of a.tenedores) if (!(await contrato.acreditada(hoja(t)))) pendientes.push(t)
  if (!pendientes.length) return { lotes: 0, acreditadas: 0, gas: 0n }
  const abierto: bigint = await contrato.restante(a.raiz)
  const falta = pendientes.reduce((s, t) => s + BigInt(t.acunar), 0n)
  if (abierto === 0n) throw new Error('La ronda no está abierta: primero la Safe tiene que ejecutar abrirMigracion con esta raíz')
  if (abierto !== falta) throw new Error(`Lo abierto (${abierto}) no coincide con lo pendiente (${falta}): revisar antes de acreditar`)
  let gas = 0n
  const lotes = Math.ceil(pendientes.length / lote)
  for (let i = 0; i < pendientes.length; i += lote) {
    const parte = pendientes.slice(i, i + lote)
    const tx = await contrato.acreditarLote(a.raiz, parte.map((t) => t.direccion), parte.map((t) => t.acunar), parte.map((t) => t.prueba))
    const r = await tx.wait()
    gas += r.gasUsed
    opciones.alEnviar?.(i / lote + 1, lotes, r.hash, r.gasUsed)
  }
  if ((await contrato.restante(a.raiz)) !== 0n) throw new Error('Quedó saldo abierto sin acreditar: revisar')
  return { lotes, acreditadas: pendientes.length, gas }
}
