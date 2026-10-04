// Convierte el archivo de acuñación de la plataforma en las transacciones que firma la firma múltiple.
//
//   ACUNACION=acunacion.json TOKEN=0x… CHAIN_ID=5550 [LOTE=40] [REFERENCIA="AUKA bloque 338935"] \
//   npx hardhat run scripts/lotes-safe.ts
//
// Sale un archivo para el Transaction Builder de Safe (o cualquier firma múltiple que acepte
// destino + datos): primero abrirMigracion con la raíz y el total, después acreditarLote por lotes.
// No firma ni envía nada. Antes de escribir, comprueba que cada prueba verifica contra la raíz y que
// la suma coincide con el total, para que la firma múltiple no apruebe un archivo roto.
import { ethers } from 'hardhat'
import { readFileSync, writeFileSync } from 'fs'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

interface Archivo { activo?: string; bloque?: number; raiz: string; totalAcunar: string; tenedores: { direccion: string; acunar: string; prueba: string[] }[] }

async function main() {
  const ruta = process.env.ACUNACION; const token = process.env.TOKEN
  if (!ruta || !token || !ethers.isAddress(token)) throw new Error('Faltan ACUNACION y TOKEN')
  const chainId = process.env.CHAIN_ID || '5550'
  const lote = Number(process.env.LOTE || 40)
  const a: Archivo = JSON.parse(readFileSync(ruta, 'utf8'))

  let suma = 0n
  for (const t of a.tenedores) {
    if (!StandardMerkleTree.verify(a.raiz, ['address', 'uint256'], [t.direccion, t.acunar], t.prueba)) {
      throw new Error(`La prueba de ${t.direccion} no verifica contra la raíz: el archivo no se firma`)
    }
    suma += BigInt(t.acunar)
  }
  if (suma !== BigInt(a.totalAcunar)) throw new Error(`La suma (${suma}) no coincide con el total (${a.totalAcunar})`)

  const iface = (await ethers.getContractFactory('TokenSFSP')).interface
  const referencia = ethers.encodeBytes32String((process.env.REFERENCIA || `${a.activo ?? ''} ${a.bloque ?? ''}`).trim().slice(0, 31))
  const transacciones = [{ to: token, value: '0', data: iface.encodeFunctionData('abrirMigracion', [a.raiz, a.totalAcunar, referencia]) }]
  for (let i = 0; i < a.tenedores.length; i += lote) {
    const parte = a.tenedores.slice(i, i + lote)
    transacciones.push({ to: token, value: '0', data: iface.encodeFunctionData('acreditarLote', [a.raiz, parte.map((t) => t.direccion), parte.map((t) => t.acunar), parte.map((t) => t.prueba)]) })
  }

  const salida = ruta.replace(/\.json$/, '') + '.safe.json'
  writeFileSync(salida, JSON.stringify({
    version: '1.0', chainId, createdAt: Date.now(),
    meta: { name: `Migración v2 ${a.activo ?? ''}`.trim(), description: `Raíz ${a.raiz} · ${a.tenedores.length} tenedores · total ${a.totalAcunar}` },
    transactions: transacciones,
  }, null, 2))
  console.log(`${transacciones.length} transacciones (1 apertura + ${transacciones.length - 1} lotes) en ${salida}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
