// Acredita a cada tenedor lo que le toca de una ronda que la Safe ya abrió (abrirMigracion), por lotes.
//
//   ACUNACION=acunacion.json TOKEN=0x… [LOTE=40] LLAVE_DESPLIEGUE=<llave de la billetera de comisión> \
//   npx hardhat run scripts/acreditar.ts --network orden
//
// Acreditar no da ningún poder: cada hoja se valida contra la raíz publicada y no se acredita dos veces,
// así que la manda cualquier cuenta con gas (en la 5550, la billetera de comisión). Antes de mandar nada
// comprueba las pruebas, la suma y que lo abierto coincida exactamente con lo pendiente. Si se corta a
// medias, se vuelve a correr: solo manda lo que falta. En la 5550 exige CONFIRMO_PRODUCCION=si.
import { ethers, network } from 'hardhat'
import { readFileSync } from 'fs'
import { acreditarPendientes, type Archivo } from './lotes'

async function main() {
  const ruta = process.env.ACUNACION; const token = process.env.TOKEN
  if (!ruta || !token || !ethers.isAddress(token)) throw new Error('Faltan ACUNACION y TOKEN')
  if (network.name === 'orden' && process.env.CONFIRMO_PRODUCCION !== 'si') throw new Error('Esto acuña en la red 5550: CONFIRMO_PRODUCCION=si')
  const a: Archivo = JSON.parse(readFileSync(ruta, 'utf8'))
  const contrato = await ethers.getContractAt('TokenSFSP', token)
  console.log(`${await contrato.symbol()} · raíz ${a.raiz} · ${a.tenedores.length} tenedores · total ${a.totalAcunar}`)
  const r = await acreditarPendientes(ethers, a, contrato as any, {
    lote: Number(process.env.LOTE || 40),
    alEnviar: (i, de, hash, gas) => console.log(`lote ${i} de ${de}: ${hash} (gas ${gas})`),
  })
  console.log(r.acreditadas ? `Acreditadas ${r.acreditadas} hojas en ${r.lotes} lotes, gas ${r.gas}. Supply v2: ${await contrato.totalSupply()}` : 'Nada pendiente: todo el archivo ya está acreditado')
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
