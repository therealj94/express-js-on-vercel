// ─────────────────────────────────────────────────────────────────────────────
// Bonos y regalos, sobre consumo de verdad.
//
// Los puntos no se regalan ni se siembran: salen de los pagos reales que el
// usuario ha hecho en comercios del directorio. Un lempira pagado = un punto.
// Se calculan sumando las partes de cobros que esta persona pagó — la misma
// fuente de verdad que el saldo del comercio — menos lo que ya canjeó.
//
// El catálogo es fijo por ahora (los socios se negocian a mano); lo que es
// dinámico y real es el saldo de puntos y el historial de canjes.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { requireAuth } from '../middleware/auth.js'
import { h } from '../lib/ruta.js'
import { caja } from '../lib/caja.js'
import { coleccion } from '../lib/almacen.js'
import { PREMIOS } from '../data/premios.js'

interface Canje {
  id: string
  userId: string
  rewardId: string
  puntos: number
  redeemedAt: string
}

const canjes = coleccion<Canje>('canjes')

export const premiosRouter = Router()

async function puntosDe(userId: string): Promise<{ ganados: number; gastados: number; saldo: number }> {
  const ganados = Math.floor(await caja.pagadoPor(userId))
  const mios = await canjes.varios({ userId })
  const gastados = mios.reduce((s, c) => s + c.puntos, 0)
  return { ganados, gastados, saldo: Math.max(0, ganados - gastados) }
}

premiosRouter.get('/rewards', (_req, res) => {
  res.json({ rewards: PREMIOS })
})

premiosRouter.get('/rewards/mine', requireAuth, h(async (req, res) => {
  const { saldo } = await puntosDe(req.userId!)
  const mios = await canjes.varios({ userId: req.userId! })
  res.json({
    pointsBalance: saldo,
    redemptions: mios
      .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
      .map((c) => ({ id: c.id, rewardId: c.rewardId, redeemedAt: c.redeemedAt })),
  })
}))

premiosRouter.post('/rewards/:id/redeem', requireAuth, h(async (req, res) => {
  const premio = PREMIOS.find((p) => p.id === req.params.id)
  if (!premio) {
    res.status(404).json({ error: 'Ese bono no existe' })
    return
  }
  const { saldo } = await puntosDe(req.userId!)
  if (saldo < premio.pointsCost) {
    res.status(400).json({
      error: 'No te alcanzan los puntos todavía',
      detalle: `Tenés ${saldo} y este bono cuesta ${premio.pointsCost}. Los puntos salen de tus pagos: un lempira pagado es un punto.`,
    })
    return
  }
  const canje: Canje = {
    id: randomUUID(),
    userId: req.userId!,
    rewardId: premio.id,
    puntos: premio.pointsCost,
    redeemedAt: new Date().toISOString(),
  }
  await canjes.guardar(canje)
  const nuevo = await puntosDe(req.userId!)
  res.json({
    pointsBalance: nuevo.saldo,
    redemption: { id: canje.id, rewardId: canje.rewardId, redeemedAt: canje.redeemedAt },
  })
}))
