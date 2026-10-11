// Convierte el archivo de acuñación de la plataforma en las transacciones que firma la firma múltiple.
//
//   ACUNACION=acunacion.json TOKEN=0x… [LOTE=40] [REFERENCIA="AUKA bloque 338935"] [SOLO_APERTURA=si] \
//   npx hardhat run scripts/lotes-safe.ts --network orden
//
// Sale un archivo para el Transaction Builder de Safe (o cualquier firma múltiple que acepte
// destino + datos): primero abrirMigracion con la raíz y el total, después acreditarLote por lotes.
// Con SOLO_APERTURA=si la Safe solo abre la ronda y la acreditación va después con scripts/acreditar.ts
// (lo que se usa en la 5550: una sola transacción de la Safe con todos los lotes puede no caber en un bloque).
//
// Rondas siguientes (reclamos aprobados): el archivo de la plataforma trae todo lo que hay que
// acuñar, también lo ya acuñado. El script pregunta al contrato qué hojas ya están acreditadas y las
// deja fuera del lote y del total: la ronda nueva abre y acredita solo lo nuevo. Que la raíz incluya
// hojas viejas no es un riesgo: el contrato nunca acredita dos veces la misma hoja.
// No firma ni envía nada. Antes de escribir, comprueba que cada prueba verifica contra la raíz y que
// la suma coincide con el total, para que la firma múltiple no apruebe un archivo roto.
import { ethers } from 'hardhat'
import { readFileSync, writeFileSync } from 'fs'
import { prepararLotes, type Archivo } from './lotes'

async function main() {
  const ruta = process.env.ACUNACION; const token = process.env.TOKEN
  if (!ruta || !token || !ethers.isAddress(token)) throw new Error('Faltan ACUNACION y TOKEN')
  const a: Archivo = JSON.parse(readFileSync(ruta, 'utf8'))
  const chainId = String((await ethers.provider.getNetwork()).chainId)
  const contrato = await ethers.getContractAt('TokenSFSP', token)
  const r = await prepararLotes(ethers, a, token, ethers.provider, contrato as any, { lote: Number(process.env.LOTE || 40), referencia: process.env.REFERENCIA, soloApertura: process.env.SOLO_APERTURA === 'si' })
  if (!r.desplegado) console.warn(`Aviso: ${token} no tiene contrato en la red ${chainId}; se asume que no hay nada acreditado`)
  if (!r.transacciones.length) { console.log('Todo el archivo ya está acreditado: no hay nada que firmar'); return }
  if (r.anuncio) console.log(`Es un security con demora: este archivo solo ANUNCIA la ronda. Desde ${new Date(r.anuncio.ejecutableDesde * 1000).toISOString()} (aproximado), vuelve a generarlo con la misma REFERENCIA para abrirla y acreditar.`)
  const salida = ruta.replace(/\.json$/, '') + '.safe.json'
  writeFileSync(salida, JSON.stringify({
    version: '1.0', chainId, createdAt: Date.now(),
    meta: { name: `Migración v2 ${a.activo ?? ''}`.trim(), description: `Raíz ${a.raiz} · ${r.pendientes.length} por acreditar (${a.tenedores.length - r.pendientes.length} ya acreditadas) · total ${r.total}` },
    transactions: r.transacciones,
  }, null, 2))
  const que = r.anuncio ? '1 anuncio' : process.env.SOLO_APERTURA === 'si' ? '1 apertura (la acreditación va después con scripts/acreditar.ts)' : `1 apertura + ${r.transacciones.length - 1} lotes`
  console.log(`${que} para ${r.pendientes.length} hojas, total ${r.total}, en ${salida}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
