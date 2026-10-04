// Arma las transacciones de una ronda de acreditación a partir del archivo de acuñación de la plataforma.
// La usan scripts/lotes-safe.ts y las pruebas.
import type { ethers as Ethers } from 'ethers'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

export interface Archivo { activo?: string; bloque?: number; raiz: string; totalAcunar: string; tenedores: { direccion: string; acunar: string; prueba: string[] }[] }
export interface Transaccion { to: string; value: string; data: string }

export async function prepararLotes(
  e: typeof Ethers, a: Archivo, token: string, proveedor: Ethers.Provider, contrato: Ethers.Contract,
  opciones: { lote?: number; referencia?: string } = {},
): Promise<{ transacciones: Transaccion[]; pendientes: Archivo['tenedores']; total: bigint; desplegado: boolean }> {
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
  const transacciones: Transaccion[] = [{ to: token, value: '0', data: iface.encodeFunctionData('abrirMigracion', [a.raiz, total, referencia]) }]
  for (let i = 0; i < pendientes.length; i += lote) {
    const parte = pendientes.slice(i, i + lote)
    transacciones.push({ to: token, value: '0', data: iface.encodeFunctionData('acreditarLote', [a.raiz, parte.map((t) => t.direccion), parte.map((t) => t.acunar), parte.map((t) => t.prueba)]) })
  }
  return { transacciones, pendientes, total, desplegado }
}
