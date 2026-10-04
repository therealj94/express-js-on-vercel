// Despliega el token conforme de una moneda (y el registro de elegibilidad, si todavía no hay uno).
//
//   NOMBRE="Gold Kapital" SIMBOLO=AUKA PASAPORTE=COM-OG-0001 SERIE=SFSP-300 \
//   ADMIN=0x… MULTIFIRMA=0x… PAUSADORES=0xA…,0xB…,0xC… [DEMORA_EMISION_DIAS=7] [REGISTRO=0x…] \
//   npx hardhat run scripts/desplegar.ts --network ensayo
//
// Los roles se reparten como la tabla de SFSP §5.3 (los dos Safes salen de desplegar-multifirma.ts):
//   - ADMIN: la firma múltiple de los tres custodios (roles y registro de elegibilidad);
//   - MULTIFIRMA: la de dos de tres (abrir la migración, emitir, quemar, suspender, ratificar pausas);
//   - PAUSADORES: cada custodio, que puede pausar solo en emergencia (vence a las 72 horas sin ratificar).
// La demora de emisión es de siete días en un security (serie 200) y cero en las demás, salvo que se
// fije DEMORA_EMISION_DIAS. Quien despliega no se queda con ningún rol.
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
  const ADMIN = process.env.ADMIN || falta('ADMIN')
  const PAUSADORES = String(process.env.PAUSADORES || '').split(',').map((x) => x.trim()).filter(Boolean)
  for (const [k, v] of [['MULTIFIRMA', MULTIFIRMA], ['ADMIN', ADMIN], ...PAUSADORES.map((d) => ['PAUSADORES', d])]) {
    if (!ethers.isAddress(v)) throw new Error(`${k}: ${v} no es una dirección`)
  }
  if (!PAUSADORES.length) throw new Error('Falta PAUSADORES: los custodios que pueden pausar en emergencia')
  const dias = process.env.DEMORA_EMISION_DIAS != null ? Number(process.env.DEMORA_EMISION_DIAS) : SERIE.includes('200') ? 7 : 0
  if (!Number.isInteger(dias) || dias < 0) throw new Error('DEMORA_EMISION_DIAS inválida')
  if (network.name === 'orden' && process.env.CONFIRMO_PRODUCCION !== 'si') {
    throw new Error('Esto despliega en la red 5550 de producción. Requiere firma múltiple activa, auditoría y acta: CONFIRMO_PRODUCCION=si')
  }

  const [quien] = await ethers.getSigners()
  console.log(`Red ${network.name} · despliega ${quien.address} · admin ${ADMIN} · operativa ${MULTIFIRMA} · ${PAUSADORES.length} pausadores · demora de emisión ${dias} días`)

  let registro = process.env.REGISTRO || ''
  if (!registro) {
    const r = await ethers.deployContract('RegistroElegibilidad', [ADMIN])
    await r.waitForDeployment()
    registro = await r.getAddress()
    console.log(`RegistroElegibilidad: ${registro}`)
  }

  const token = await ethers.deployContract('TokenSFSP', [NOMBRE, SIMBOLO, PASAPORTE, SERIE, ADMIN, MULTIFIRMA, PAUSADORES, dias * 86400])
  await token.waitForDeployment()
  const direccion = await token.getAddress()
  console.log(`TokenSFSP ${SIMBOLO}: ${direccion}`)
  // El registro no se conecta aquí: fijarlo es una acción de la firma múltiple de tres (fijarRegistro),
  // cuando Genesis ID ya refleja las direcciones habilitadas.

  mkdirSync('despliegues', { recursive: true })
  const salida = { red: network.name, chainId: Number((await ethers.provider.getNetwork()).chainId), simbolo: SIMBOLO, token: direccion, registro, admin: ADMIN, multifirma: MULTIFIRMA, pausadores: PAUSADORES, demoraEmisionDias: dias, fecha: new Date().toISOString() }
  writeFileSync(`despliegues/${network.name}-${SIMBOLO}${network.name === 'hardhat' ? '.local' : ''}.json`, JSON.stringify(salida, null, 2))
  console.log(`En la plataforma: V2_${SIMBOLO.toUpperCase()}=${direccion}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
