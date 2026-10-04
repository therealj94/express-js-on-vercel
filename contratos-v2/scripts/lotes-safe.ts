// Convierte el archivo de acuñación de la plataforma en las transacciones que firma la firma múltiple.
//
//   ACUNACION=acunacion.json TOKEN=0x… [LOTE=40] [REFERENCIA="AUKA bloque 338935"] \
//   npx hardhat run scripts/lotes-safe.ts --network orden
//
// Sale un archivo para el Transaction Builder de Safe (o cualquier firma múltiple que acepte
// destino + datos): primero abrirMigracion con la raíz y el total, después acreditarLote por lotes.
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
  const r = await prepararLotes(ethers, a, token, ethers.provider, contrato as any, { lote: Number(process.env.LOTE || 40), referencia: process.env.REFERENCIA })
  if (!r.desplegado) console.warn(`Aviso: ${token} no tiene contrato en la red ${chainId}; se asume que no hay nada acreditado`)
  if (!r.transacciones.length) { console.log('Todo el archivo ya está acreditado: no hay nada que firmar'); return }
  const salida = ruta.replace(/\.json$/, '') + '.safe.json'
  writeFileSync(salida, JSON.stringify({
    version: '1.0', chainId, createdAt: Date.now(),
    meta: { name: `Migración v2 ${a.activo ?? ''}`.trim(), description: `Raíz ${a.raiz} · ${r.pendientes.length} por acreditar (${a.tenedores.length - r.pendientes.length} ya acreditadas) · total ${r.total}` },
    transactions: r.transacciones,
  }, null, 2))
  console.log(`${r.transacciones.length} transacciones (1 apertura + ${r.transacciones.length - 1} lotes) para ${r.pendientes.length} hojas, total ${r.total}, en ${salida}`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
