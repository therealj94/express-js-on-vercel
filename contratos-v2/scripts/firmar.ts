// Firma una operación de la firma múltiple fuera del navegador, para el custodio que no usa
// MetaMask. Dos pasos:
//
//   TIPADO=operacion-nonce-4.json MULTISEND=0x… npx hardhat run scripts/firmar.ts
//     → muestra lo que de verdad hace la transacción, sacado de los datos que se firman: cada
//       destino, cada monto y la función que se llama. No pide la llave.
//
//   … FIRMAR=si LLAVE_FIRMANTE=0x… npx hardhat run scripts/firmar.ts
//     → firma, solo si todo lo anterior cuadra.
//
// Se detiene sin firmar si: el lote es un DELEGATECALL a algo que no es el MultiSendCallOnly que el
// custodio conoce (MULTISEND); las llamadas que trae el archivo no son las de los datos firmados; o el
// hash no es el que muestra el panel. La llave solo se usa aquí, en la computadora del custodio.
import { readFileSync } from 'fs'
import { Interface, Wallet, formatEther, getAddress } from 'ethers'
import { hashDe, llamadasDe } from './decodificar'

// Para nombrar las funciones conocidas de los contratos v2 y de la Safe.
const CONOCIDAS = new Interface([
  'function abrirMigracion(bytes32 raiz, uint256 total, bytes32 referencia)',
  'function acreditarLote(bytes32 raiz, address[] cuentas, uint256[] montos, bytes32[][] pruebas)',
  'function emitir(address cuenta, uint256 monto, bytes32 motivo)',
  'function quemar(address cuenta, uint256 monto, bytes32 motivo)',
  'function suspender(address cuenta, bool valor, bytes32 motivo)',
  'function pausar()', 'function reanudar()', 'function fijarRegistro(address nuevo)',
  'function grantRole(bytes32 rol, address cuenta)', 'function revokeRole(bytes32 rol, address cuenta)',
  'function fijar(address cuenta, uint8 estado)',
  'function addOwnerWithThreshold(address owner, uint256 threshold)', 'function removeOwner(address prev, address owner, uint256 threshold)',
  'function swapOwner(address prev, address oldOwner, address newOwner)', 'function changeThreshold(uint256 threshold)',
  'function enableModule(address module)', 'function setGuard(address guard)', 'function setFallbackHandler(address handler)',
])

function describir(data: string): string {
  if (data === '0x') return 'envío de ORIGEN'
  try {
    const f = CONOCIDAS.parseTransaction({ data })!
    return `${f.signature}(${f.args.map((x: any) => (Array.isArray(x) ? `[${x.length}]` : String(x))).join(', ')})`
  } catch {
    return `función desconocida ${data.slice(0, 10)} (${(data.length - 2) / 2} bytes): revisar antes de firmar`
  }
}

async function main() {
  const ruta = process.env.TIPADO
  if (!ruta) throw new Error('Falta TIPADO (el archivo de «Descargar para firmar» del panel)')
  const j = JSON.parse(readFileSync(ruta, 'utf8'))
  const t = j.tipado || j
  if (t?.primaryType !== 'SafeTx' || !t.domain?.verifyingContract) throw new Error('El archivo no es una operación de la firma múltiple')
  const m = t.message
  if (m.gasPrice !== '0' || m.baseGas !== '0' || m.safeTxGas !== '0' || BigInt(m.gasToken) !== 0n || BigInt(m.refundReceiver) !== 0n) {
    throw new Error('La transacción paga gas o reembolsos desde la Safe: la plataforma nunca arma eso. NO FIRMAR')
  }

  const llamadas = llamadasDe(m, process.env.MULTISEND)
  const hash = hashDe(t)
  console.log(`Safe ${getAddress(t.domain.verifyingContract)} · red ${t.domain.chainId} · nonce ${m.nonce}`)
  if (j.titulo) console.log(`Título (lo escribió quien la propuso; no es prueba de nada): ${j.titulo}`)
  console.log(`Hash: ${hash}`)
  let total = 0n
  llamadas.forEach((l, i) => {
    total += l.value
    console.log(`  ${String(i + 1).padStart(3)}. ${l.to} · ${formatEther(l.value)} ORIGEN · ${describir(l.data)}`)
  })
  console.log(`${llamadas.length} llamada(s) · total ${formatEther(total)} ORIGEN`)

  if (j.hash && j.hash.toLowerCase() !== hash.toLowerCase()) throw new Error(`El hash no es el que muestra el panel (${j.hash}). NO FIRMAR`)
  if (Array.isArray(j.llamadas)) {
    const iguales = j.llamadas.length === llamadas.length && j.llamadas.every((x: any, i: number) =>
      getAddress(x.to) === llamadas[i].to && BigInt(x.value) === llamadas[i].value && String(x.data).toLowerCase() === llamadas[i].data)
    if (!iguales) throw new Error('Las llamadas del archivo no son las que hacen los datos firmados. NO FIRMAR')
    console.log('Las llamadas del archivo coinciden con los datos firmados.')
  }

  if (process.env.FIRMAR !== 'si') {
    console.log('\nRevisa cada destino y monto. Si está bien, vuelve a correrlo con FIRMAR=si y LLAVE_FIRMANTE.')
    return
  }
  const llave = process.env.LLAVE_FIRMANTE
  if (!llave) throw new Error('Falta LLAVE_FIRMANTE')
  const w = new Wallet(llave)
  const firma = await w.signTypedData(t.domain, t.types, m)
  console.log(`\nFirmante: ${w.address}\nFirma (pégala en el panel):\n${firma}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
