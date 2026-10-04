// Despliega la firma múltiple de la red: Safe 1.4.1 con los custodios y el umbral que fije la Junta.
//
//   CUSTODIOS=0xA…,0xB…,0xC… [UMBRAL=2] [SAL=0] \
//   [SAFE_L2=0x… SAFE_FABRICA=0x… SAFE_RESPALDO=0x… SAFE_MULTISEND=0x…] \
//   npx hardhat run scripts/desplegar-multifirma.ts --network ensayo
//
// Primero las cuatro piezas de Safe (las que se pasen por variable se reutilizan), después se
// comprueba que su código es el canónico de Safe 1.4.1, y al final se crea la Safe. Quien despliega
// no queda con ningún poder: la Safe solo responde a sus custodios.
// En la red 5550 exige CONFIRMO_PRODUCCION=si.
import { ethers, network } from 'hardhat'
import { mkdirSync, writeFileSync } from 'fs'
import { comprobarCodigo, crearSafe, desplegarInfraestructura } from './safe'

async function main() {
  const custodios = String(process.env.CUSTODIOS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (custodios.length < 2 || !custodios.every((d) => ethers.isAddress(d))) throw new Error('CUSTODIOS: al menos dos direcciones separadas por comas')
  const umbral = Number(process.env.UMBRAL || 2)
  if (!Number.isInteger(umbral) || umbral < 2 || umbral > custodios.length) throw new Error(`UMBRAL tiene que estar entre 2 y ${custodios.length}`)
  if (network.name === 'orden' && process.env.CONFIRMO_PRODUCCION !== 'si') {
    throw new Error('Esto despliega la firma múltiple en la red 5550 de producción, con los custodios de la Junta: CONFIRMO_PRODUCCION=si')
  }

  const [quien] = await ethers.getSigners()
  console.log(`Red ${network.name} · despliega ${quien.address} · ${umbral} de ${custodios.length}`)
  const infra = await desplegarInfraestructura(quien, {
    SafeL2: process.env.SAFE_L2, SafeProxyFactory: process.env.SAFE_FABRICA,
    CompatibilityFallbackHandler: process.env.SAFE_RESPALDO, MultiSendCallOnly: process.env.SAFE_MULTISEND,
  })
  const malas = await comprobarCodigo(ethers.provider, infra)
  if (malas.length) throw new Error(`código distinto al canónico de Safe 1.4.1: ${malas.join(', ')}`)
  const safe = await crearSafe(quien, infra, custodios, umbral, BigInt(process.env.SAL || 0))
  console.log('Safe:', safe)
  for (const [k, v] of Object.entries(infra)) console.log(`${k}: ${v}`)

  mkdirSync('despliegues', { recursive: true })
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  writeFileSync(`despliegues/${network.name}-multifirma${network.name === 'hardhat' ? '.local' : ''}.json`, JSON.stringify({ red: network.name, chainId, safe, umbral, custodios, ...infra, fecha: new Date().toISOString() }, null, 2))
  console.log(`\nEn la plataforma: SAFE_DIRECCION=${safe} SAFE_MULTISEND=${infra.MultiSendCallOnly}`)
  console.log(`En cada token v2: MULTIFIRMA=${safe}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
