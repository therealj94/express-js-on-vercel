// Firma directa de los custodios, sin cuenta en el panel.
//
// La firma EIP-712 de la transacción de la Safe ES la credencial: el servidor recupera quién firmó y solo
// la acepta si es custodio de esa Safe, una vez por billetera. Así un custodio firma desde un enlace
// (/firmar/<id>) con su MetaMask, sin correo ni contraseña. La Safe sigue exigiendo su umbral en la
// cadena; esta ruta no da ningún poder que la firma no dé ya.
//
// Registrar la ejecución también es público: la plataforma solo la acepta si en la cadena la Safe
// ejecutó exactamente lo firmado (evento ExecutionSuccess con ese hash).

import { Router } from 'express'
import { Interface, formatEther } from 'ethers'
import type { Contexto } from '../app.js'
import * as OP from '../operaciones.js'
import { ErrorFirma, firmanteDe, normalizarFirma } from '../multifirma.js'

/** Lo que una persona tiene que poder leer antes de firmar: qué función de qué contrato, con qué datos. */
const CONOCIDAS = new Interface([
  'function abrirMigracion(bytes32 raiz, uint256 total, bytes32 referencia)',
  'function anunciarMigracion(bytes32 raiz, uint256 total, bytes32 referencia)',
  'function anunciarEmision(address destino, uint256 monto, bytes32 referencia)',
  'function emitir(address destino, uint256 monto, bytes32 referencia)',
  'function fijarRegistro(address registro)',
  'function grantRole(bytes32 rol, address cuenta)',
  'function revokeRole(bytes32 rol, address cuenta)',
  'function pausar()',
  'function ratificarPausa()',
  'function levantarPausa()',
  'function suspender(address cuenta)',
  'function acreditarLote(bytes32 raiz, address[] cuentas, uint256[] montos, bytes32[][] pruebas)',
  'function transfer(address to, uint256 amount)',
])

export function describirLlamada(l: { to: string; value: string; data: string }) {
  const origen = BigInt(l.value || '0')
  if (!l.data || l.data === '0x') return { destino: l.to, origen: formatEther(origen), accion: origen > 0n ? 'envio' : 'vacia' }
  try {
    const f = CONOCIDAS.parseTransaction({ data: l.data, value: origen })!
    const args = f.fragment.inputs.map((p, i) => {
      const v = f.args[i]
      return { nombre: p.name, valor: p.type === 'bytes32[][]' ? `${(v as unknown[]).length} pruebas` : p.type.endsWith('[]') ? `${(v as unknown[]).length} elementos` : String(v) }
    })
    return { destino: l.to, origen: formatEther(origen), accion: f.name, args }
  } catch {
    return { destino: l.to, origen: formatEther(origen), accion: `Llamada no reconocida ${l.data.slice(0, 10)}`, desconocida: true }
  }
}

export function rutasFirmar(ctx: Contexto) {
  const r = Router()
  const a = ctx.almacen

  // SAFE_NOMBRES="0xabc…=José Medardo Ordóñez · Presidente;0xdef…=…": quién es cada custodio, para la página.
  const nombres: Record<string, string> = Object.fromEntries(String(ctx.entorno.SAFE_NOMBRES || '').split(';').map((p) => p.split('=')).filter((p) => p.length === 2).map(([d, n]) => [d.trim().toLowerCase(), n.trim()]))
  const nombreSafe = (s: string) => {
    const cfg = ctx.safe
    if (!cfg) return s
    return s === cfg.safe ? 'Operativa (tesorería y emisión)' : s === cfg.constitucional ? 'Administración (roles y registro)' : s === cfg.anterior ? 'Safe anterior (reemplazada)' : s
  }

  r.get('/:id', async (req, res) => {
    const o = a.datos.operaciones.find((x) => x.id === req.params.id)
    if (!o) return res.status(404).json({ error: 'No existe esa operación' })
    try {
      const e = await OP.estado(ctx.cadena, o.safe)
      const d = OP.detalle(o)
      res.json({
        id: o.id, titulo: o.titulo, tipo: o.tipo, estado: o.estado, creada: o.creada,
        safe: o.safe, nombreSafe: nombreSafe(o.safe), chainId: o.chainId, nonce: o.safeTx.nonce, hash: o.hash,
        umbral: e.umbral, custodios: e.duenos.map((d) => ({ direccion: d, nombre: nombres[d.toLowerCase()] ?? null })), nonceSafe: e.nonce,
        firmas: o.firmas.map((f) => ({ firmante: f.firmante, fecha: f.fecha })),
        destinos: Object.fromEntries(o.llamadas.map((l) => l.to.toLowerCase()).filter((d) => d === ctx.safe?.safe || d === ctx.safe?.constitucional).map((d) => [d, nombreSafe(d)])),
        llamadas: o.llamadas.length > 12 ? [...o.llamadas.slice(0, 12).map(describirLlamada), { resumen: `y ${o.llamadas.length - 12} más`, total: formatEther(o.llamadas.reduce((s, l) => s + BigInt(l.value || '0'), 0n)) }] : o.llamadas.map(describirLlamada),
        totalLlamadas: o.llamadas.length,
        tipado: d.tipado, ejecutar: d.ejecutar, tx: o.tx ?? null,
      })
    } catch (e: any) { res.status(502).json({ error: String(e?.message || e) }) }
  })

  r.post('/:id/firma', async (req, res) => {
    if (!ctx.safe) return res.status(409).json({ error: 'La firma múltiple no está configurada' })
    const o = a.datos.operaciones.find((x) => x.id === req.params.id)
    if (!o) return res.status(404).json({ error: 'No existe esa operación' })
    try {
      const firmante = firmanteDe(o.hash, normalizarFirma(String(req.body?.firma || ''))).toLowerCase()
      const hecha = await OP.firmar(a, ctx.cadena, ctx.safe, o.id, `billetera:${firmante}`, String(req.body?.firma || ''))
      await a.guardar()
      res.json({ estado: hecha.estado, firmas: hecha.firmas.length, umbral: hecha.umbral, firmante })
    } catch (e: any) {
      await a.guardar()
      res.status(e instanceof ErrorFirma ? 400 : 502).json({ error: String(e?.message || e) })
    }
  })

  r.post('/:id/ejecutada', async (req, res) => {
    if (!ctx.safe) return res.status(409).json({ error: 'La firma múltiple no está configurada' })
    try {
      const o = await OP.ejecutada(a, ctx.cadena, ctx.safe, req.params.id, String(req.body?.tx || ''), 'publico')
      await a.guardar()
      res.json({ estado: o.estado, tx: o.tx })
    } catch (e: any) { res.status(e instanceof ErrorFirma ? 400 : 502).json({ error: String(e?.message || e) }) }
  })

  return r
}
