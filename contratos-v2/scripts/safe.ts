// La firma múltiple: Safe 1.4.1, desplegada desde sus artefactos publicados y auditados.
//
// En la red 5550 no hay ninguna Safe ni el desplegador determinista con el que se instalan en las
// direcciones canónicas (comprobado el 4 de octubre de 2026). Se despliegan aquí, con
// transacciones normales, los cuatro contratos que hacen falta:
//   - SafeL2 (el código de la Safe; la variante L2 emite eventos de cada ejecución)
//   - SafeProxyFactory (crea la Safe como proxy de SafeL2)
//   - CompatibilityFallbackHandler (firmas de contratos, EIP-1271)
//   - MultiSendCallOnly (lotes de varias llamadas en una sola transacción de la Safe)
//
// Los artefactos (carpeta safe/) son los del paquete @safe-global/safe-contracts@1.4.1 sin cambios
// (safe/ORIGEN.md dice cómo se comprobaron). Después de desplegar, `comprobarCodigo` compara el
// código que quedó en la cadena con el hash del código canónico que publica Safe en
// @safe-global/safe-deployments: si no coincide, no se usa.
import type { Signer } from 'ethers'
import { ContractFactory, Contract, Interface, ZeroAddress, getAddress, keccak256 } from 'ethers'
import SafeL2 from '../safe/SafeL2.json'
import SafeProxyFactory from '../safe/SafeProxyFactory.json'
import CompatibilityFallbackHandler from '../safe/CompatibilityFallbackHandler.json'
import MultiSendCallOnly from '../safe/MultiSendCallOnly.json'

/** Hash del código desplegado de cada contrato, según safe-deployments 1.37.63 (v1.4.1, «canonical»). */
export const CODIGO_CANONICO: Record<string, string> = {
  SafeL2: '0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff',
  SafeProxyFactory: '0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317',
  CompatibilityFallbackHandler: '0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9',
  MultiSendCallOnly: '0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939',
}

const ARTEFACTOS = { SafeL2, SafeProxyFactory, CompatibilityFallbackHandler, MultiSendCallOnly }
export type Pieza = keyof typeof ARTEFACTOS

export interface Infraestructura { SafeL2: string; SafeProxyFactory: string; CompatibilityFallbackHandler: string; MultiSendCallOnly: string }

export async function desplegarPieza(nombre: Pieza, quien: Signer): Promise<string> {
  const a = ARTEFACTOS[nombre]
  const c = await new ContractFactory(a.abi, a.bytecode, quien).deploy()
  await c.waitForDeployment()
  return c.getAddress()
}

/** Compara el código de cada pieza en la cadena con el canónico de Safe. Devuelve las que no coinciden. */
export async function comprobarCodigo(proveedor: { getCode(d: string): Promise<string> }, infra: Infraestructura): Promise<string[]> {
  const malas: string[] = []
  for (const [nombre, dir] of Object.entries(infra)) {
    const codigo = await proveedor.getCode(dir)
    if (codigo === '0x' || keccak256(codigo) !== CODIGO_CANONICO[nombre]) malas.push(`${nombre} (${dir})`)
  }
  return malas
}

/** Despliega las cuatro piezas que falten (las que ya están, por dirección, se reutilizan). */
export async function desplegarInfraestructura(quien: Signer, ya: Partial<Infraestructura> = {}): Promise<Infraestructura> {
  const infra = {} as Infraestructura
  for (const nombre of Object.keys(ARTEFACTOS) as Pieza[]) infra[nombre] = ya[nombre] ? getAddress(ya[nombre]!) : await desplegarPieza(nombre, quien)
  return infra
}

/**
 * Crea la Safe: los custodios, el umbral y el manejador de respaldo, en una sola transacción de la
 * fábrica. `sal` distingue dos Safes con los mismos custodios.
 */
export async function crearSafe(quien: Signer, infra: Infraestructura, custodios: string[], umbral: number, sal = 0n): Promise<string> {
  const duenos = custodios.map((d) => getAddress(d))
  if (new Set(duenos.map((d) => d.toLowerCase())).size !== duenos.length) throw new Error('hay custodios repetidos')
  if (umbral < 1 || umbral > duenos.length) throw new Error(`umbral ${umbral} imposible con ${duenos.length} custodios`)
  const safe = new Interface(SafeL2.abi)
  const inicial = safe.encodeFunctionData('setup', [duenos, umbral, ZeroAddress, '0x', infra.CompatibilityFallbackHandler, ZeroAddress, 0, ZeroAddress])
  const fabrica = new Contract(infra.SafeProxyFactory, SafeProxyFactory.abi, quien)
  const tx = await fabrica.createProxyWithNonce(infra.SafeL2, inicial, sal)
  const recibo = await tx.wait()
  const ev = recibo!.logs.map((l: any) => { try { return fabrica.interface.parseLog(l) } catch { return null } }).find((e: any) => e?.name === 'ProxyCreation')
  if (!ev) throw new Error('la fábrica no creó la Safe')
  return getAddress(ev.args.proxy)
}

export function abiSafe() { return SafeL2.abi }
