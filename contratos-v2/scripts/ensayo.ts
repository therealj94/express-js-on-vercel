// Ensayo general de la acuñación: despliega un token v2 por cada archivo de acuñación, abre la ronda,
// acredita por lotes y concilia: cada dirección con su monto exacto y el supply igual al total.
//
//   ENSAYO_DIR=carpeta-con-archivos npx hardhat run scripts/ensayo.ts            (red local)
//   ENSAYO_DIR=… ADMIN=0x… MULTIFIRMA=0x… npx hardhat run scripts/ensayo.ts --network ensayo   (red 5534)
//
// Cada archivo es el acunacion.json que entrega la plataforma (/api/panel/fotos/:id/acunacion.json).
// No corre en la red 5550: ahí la acuñación la firma la firma múltiple con los lotes de lotes-safe.ts.
import { ethers, network } from 'hardhat'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

async function main() {
  if (network.name === 'orden') throw new Error('El ensayo no corre en la red 5550')
  const dir = process.env.ENSAYO_DIR
  if (!dir) throw new Error('Falta ENSAYO_DIR')
  const lote = Number(process.env.LOTE || 40)
  const [quien] = await ethers.getSigners()
  let fallos = 0
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.endsWith('.safe.json')).sort()) {
    const a = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const m = process.env.MULTIFIRMA || quien.address
    const token = await ethers.deployContract('TokenSFSP', [a.activo, a.activo, `ENSAYO-${a.activo}`, 'ensayo', process.env.ADMIN || m, m, [], 0])
    await token.waitForDeployment()
    await (await token.abrirMigracion(a.raiz, a.totalAcunar, ethers.encodeBytes32String('ensayo'))).wait()
    let gas = 0n
    for (let i = 0; i < a.tenedores.length; i += lote) {
      const p = a.tenedores.slice(i, i + lote)
      const r = await (await token.acreditarLote(a.raiz, p.map((t: any) => t.direccion), p.map((t: any) => t.acunar), p.map((t: any) => t.prueba))).wait()
      gas += r!.gasUsed
    }
    const saldos = await Promise.all(a.tenedores.map((t: any) => token.balanceOf(t.direccion)))
    const diferencias = a.tenedores.filter((t: any, i: number) => saldos[i] !== BigInt(t.acunar)).length
    const supply = await token.totalSupply()
    const cuadra = diferencias === 0 && supply === BigInt(a.totalAcunar) && (await token.restante(a.raiz)) === 0n
    if (!cuadra) fallos++
    console.log(`${a.activo.padEnd(8)} ${String(a.tenedores.length).padStart(4)} tenedores · supply ${ethers.formatUnits(supply, 18).padStart(22)} · gas ${gas} · ${cuadra ? 'CUADRA' : `NO CUADRA (${diferencias} diferencias)`}`)
  }
  if (fallos) { console.error(`${fallos} monedas no cuadran`); process.exit(1) }
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
