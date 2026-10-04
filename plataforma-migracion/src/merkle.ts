// Árbol de Merkle de una foto de saldos.
//
// Cada hoja es keccak256(keccak256(abi.encode(address, uint256))), el formato
// de hojas de OpenZeppelin (doble hash, para que una hoja no pueda hacerse
// pasar por un nodo interno). Los nodos se combinan ordenando el par, de modo
// que una prueba de aquí se verifica tal cual con MerkleProof.verify de
// OpenZeppelin en el contrato v2.
//
// Con la raíz publicada, cada tenedor puede comprobar por sí mismo que su
// saldo está en la foto (SFSP §14.3).

import { AbiCoder, keccak256, concat } from 'ethers'

const abi = AbiCoder.defaultAbiCoder()

export function hoja(direccion: string, saldo: bigint): string {
  return keccak256(keccak256(abi.encode(['address', 'uint256'], [direccion, saldo])))
}

function par(a: string, b: string): string {
  return BigInt(a) <= BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]))
}

export interface Arbol {
  raiz: string
  /** Niveles desde las hojas (ordenadas) hasta la raíz. */
  niveles: string[][]
}

export function construir(entradas: { direccion: string; saldo: bigint }[]): Arbol {
  if (!entradas.length) return { raiz: '0x' + '0'.repeat(64), niveles: [[]] }
  let nivel = entradas.map((e) => hoja(e.direccion, e.saldo)).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))
  const niveles = [nivel]
  while (nivel.length > 1) {
    const sig: string[] = []
    for (let i = 0; i < nivel.length; i += 2) {
      // Un nodo sin pareja sube tal cual: la verificación de OpenZeppelin no lo necesita duplicado.
      sig.push(i + 1 < nivel.length ? par(nivel[i], nivel[i + 1]) : nivel[i])
    }
    niveles.push(sig)
    nivel = sig
  }
  return { raiz: nivel[0], niveles }
}

export function prueba(arbol: Arbol, direccion: string, saldo: bigint): string[] | null {
  const h = hoja(direccion, saldo)
  let i = arbol.niveles[0].indexOf(h)
  if (i < 0) return null
  const camino: string[] = []
  for (let n = 0; n < arbol.niveles.length - 1; n++) {
    const nivel = arbol.niveles[n]
    const hermano = i % 2 === 0 ? i + 1 : i - 1
    if (hermano < nivel.length) camino.push(nivel[hermano])
    i = Math.floor(i / 2)
  }
  return camino
}

/** Lo mismo que hace MerkleProof.verify de OpenZeppelin. */
export function verificar(raiz: string, direccion: string, saldo: bigint, camino: string[]): boolean {
  let h = hoja(direccion, saldo)
  for (const p of camino) h = par(h, p)
  return h.toLowerCase() === raiz.toLowerCase()
}

