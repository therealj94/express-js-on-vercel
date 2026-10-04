// Firma una operación de la firma múltiple fuera del navegador, para el custodio que no usa
// MetaMask: lee lo que hay que firmar (el «tipado» que muestra el panel de la plataforma) y
// devuelve la firma para pegarla en el panel.
//
//   TIPADO=operacion.json LLAVE_FIRMANTE=0x… npx hardhat run scripts/firmar.ts
//
// La llave solo se usa aquí, en la computadora del custodio; no sale de ella ni se guarda.
// Antes de firmar muestra qué se firma: la Safe, la red, el destino, el monto y el nonce.
import { readFileSync } from 'fs'
import { Wallet, formatEther, getAddress } from 'ethers'

async function main() {
  const ruta = process.env.TIPADO; const llave = process.env.LLAVE_FIRMANTE
  if (!ruta || !llave) throw new Error('Faltan TIPADO (el archivo que da el panel) y LLAVE_FIRMANTE')
  const j = JSON.parse(readFileSync(ruta, 'utf8'))
  const t = j.tipado || j
  if (t?.primaryType !== 'SafeTx' || !t.domain?.verifyingContract) throw new Error('El archivo no es una operación de la firma múltiple')
  const w = new Wallet(llave)
  const m = t.message
  console.log(`Safe ${getAddress(t.domain.verifyingContract)} · red ${t.domain.chainId} · nonce ${m.nonce}`)
  console.log(`${m.operation === 1 || m.operation === '1' ? 'Lote (MultiSendCallOnly)' : 'Llamada'} a ${getAddress(m.to)} · ${formatEther(m.value)} ORIGEN · datos ${(m.data.length - 2) / 2} bytes`)
  if (j.titulo) console.log(`Operación: ${j.titulo}`)
  console.log(`Firmante: ${w.address}`)
  const firma = await w.signTypedData(t.domain, t.types, m)
  console.log(`\nFirma (pégala en el panel):\n${firma}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
