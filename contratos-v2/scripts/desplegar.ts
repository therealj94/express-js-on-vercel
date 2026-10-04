// Despliega el token conforme de una moneda (y el registro de elegibilidad, si todavía no hay uno).
//
//   NOMBRE="Gold Kapital" SIMBOLO=AUKA PASAPORTE=COM-OG-0001 SERIE=SFSP-300 \
//   MULTIFIRMA=0x… [REGISTRO=0x…] npx hardhat run scripts/desplegar.ts --network ensayo
//
// Todos los roles nacen en la firma múltiple: quien despliega no se queda con ninguno.
// En la red 5550 se niega a correr sin CONFIRMO_PRODUCCION=si, porque desplegar ahí exige
// firma múltiple activa, auditoría externa y acta de la Junta (plan de migración, fase 3).
import { ethers, network } from 'hardhat'
import { mkdirSync, writeFileSync } from 'fs'

async function main() {
  const falta = (k: string) => { throw new Error(`Falta ${k}`) }
  const NOMBRE = process.env.NOMBRE || falta('NOMBRE')
  const SIMBOLO = process.env.SIMBOLO || falta('SIMBOLO')
  const PASAPORTE = process.env.PASAPORTE || falta('PASAPORTE')
  const SERIE = process.env.SERIE || falta('SERIE')
  const MULTIFIRMA = process.env.MULTIFIRMA || falta('MULTIFIRMA')
  if (!ethers.isAddress(MULTIFIRMA)) throw new Error('MULTIFIRMA no es una dirección')
  if (network.name === 'orden' && process.env.CONFIRMO_PRODUCCION !== 'si') {
    throw new Error('Esto despliega en la red 5550 de producción. Requiere firma múltiple activa, auditoría y acta: CONFIRMO_PRODUCCION=si')
  }

  const [quien] = await ethers.getSigners()
  console.log(`Red ${network.name} · despliega ${quien.address} · roles para ${MULTIFIRMA}`)

  let registro = process.env.REGISTRO || ''
  if (!registro) {
    const r = await ethers.deployContract('RegistroElegibilidad', [MULTIFIRMA])
    await r.waitForDeployment()
    registro = await r.getAddress()
    console.log(`RegistroElegibilidad: ${registro}`)
  }

  const token = await ethers.deployContract('TokenSFSP', [NOMBRE, SIMBOLO, PASAPORTE, SERIE, MULTIFIRMA])
  await token.waitForDeployment()
  const direccion = await token.getAddress()
  console.log(`TokenSFSP ${SIMBOLO}: ${direccion}`)
  // El registro no se conecta aquí: fijarlo es una acción de la firma múltiple (fijarRegistro),
  // cuando Genesis ID ya refleja las direcciones habilitadas.

  mkdirSync('despliegues', { recursive: true })
  const salida = { red: network.name, chainId: Number((await ethers.provider.getNetwork()).chainId), simbolo: SIMBOLO, token: direccion, registro, multifirma: MULTIFIRMA, fecha: new Date().toISOString() }
  writeFileSync(`despliegues/${network.name}-${SIMBOLO}${network.name === 'hardhat' ? '.local' : ''}.json`, JSON.stringify(salida, null, 2))
  console.log(`En la plataforma: V2_${SIMBOLO.toUpperCase()}=${direccion}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
