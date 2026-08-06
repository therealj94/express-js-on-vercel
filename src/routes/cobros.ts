// ─────────────────────────────────────────────────────────────────────────────
// Cobros: el comercio pide dinero, el cliente lo paga, la cuenta se puede
// dividir entre varios.
//
// Quién puede hacer qué, que es de donde salen la mitad de los agujeros en este
// tipo de sistema:
//
//   · Crear, listar y anular cobros  → solo el dueño del comercio
//   · Consultar un cobro por código  → cualquiera con sesión, porque el cliente
//                                      que va a pagar no es del comercio
//   · Reservar y pagar una parte     → cualquiera con sesión, pero solo puede
//                                      tocar la parte que él mismo reservó
//
// Un cobro se consulta por su CÓDIGO, nunca por su id interno: el código es lo
// que va en el QR y lo que se dicta en voz alta, y no revela cuántos cobros
// lleva hechos el negocio.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { db } from '../lib/db.js'
import { caja } from '../lib/caja.js'
import { cotizacion, aOrigen } from '../lib/tasas.js'
import type { Cobro } from '../types-cobro.js'

export const cobrosRouter = Router()

const MAX_PARTES = 20
const MAX_HNL = 500_000

/**
 * Lo que ve el cliente que va a pagar.
 *
 * Deliberadamente NO incluye el id interno del cobro ni el del comercio: con el
 * código y los ids de las partes tiene todo lo que necesita, y nada más.
 */
function paraPagador(cobro: Cobro) {
  const negocio = db.findCompanyById(cobro.companyId)
  return {
    codigo: cobro.codigo,
    concepto: cobro.concepto,
    montoHnl: cobro.montoHnl,
    montoOrigen: cobro.montoOrigen,
    tasaHnlPorOrigen: cobro.tasaHnlPorOrigen,
    estado: cobro.estado,
    venceEn: cobro.venceEn,
    negocio: negocio
      ? {
          nombre: negocio.tradeName,
          logo: negocio.logoDataUrl,
          verificado: negocio.verified,
          direccion: negocio.walletAddress,
        }
      : null,
    partes: cobro.partes.map((p) => ({
      id: p.id,
      indice: p.indice,
      montoOrigen: p.montoOrigen,
      montoHnl: Math.round(p.montoOrigen * cobro.tasaHnlPorOrigen * 100) / 100,
      estado: p.estado,
      pagadorNombre: p.pagadorNombre,
    })),
  }
}

/** Comprueba que quien pide algo es el dueño del comercio del cobro. */
function comercioDe(userId: string) {
  return db.findCompanyByOwner(userId)
}

// ── El comercio crea un cobro ────────────────────────────────────────────────

cobrosRouter.post('/', requireAuth, async (req, res) => {
  const negocio = comercioDe(req.userId!)
  if (!negocio) {
    res.status(403).json({ error: 'Necesitas un negocio registrado para cobrar' })
    return
  }
  if (negocio.kyc.status !== 'verified') {
    res.status(403).json({
      error: 'Tu negocio todavía no está verificado',
      detalle: 'Solo un negocio verificado puede recibir pagos.',
    })
    return
  }

  if (!negocio.walletAddress) {
    res.status(400).json({
      error: 'Falta la dirección donde vas a recibir los pagos',
      detalle: 'Configurala en «Mi empresa» antes de cobrar. Sin ella el ORIGEN no tiene a dónde llegar.',
    })
    return
  }

  const { montoHnl, concepto, partes } = req.body as {
    montoHnl?: number
    concepto?: string
    partes?: number
  }

  const monto = Number(montoHnl)
  if (!Number.isFinite(monto) || monto <= 0) {
    res.status(400).json({ error: 'El monto tiene que ser mayor que cero' })
    return
  }
  if (monto > MAX_HNL) {
    res.status(400).json({ error: `El monto máximo por cobro es L ${MAX_HNL.toLocaleString('es-HN')}` })
    return
  }

  const nPartes = Math.trunc(Number(partes) || 1)
  if (nPartes < 1 || nPartes > MAX_PARTES) {
    res.status(400).json({ error: `La cuenta se puede dividir entre 1 y ${MAX_PARTES} partes` })
    return
  }

  let tasa
  try {
    tasa = await cotizacion()
  } catch {
    // Sin cotización no se crea el cobro. Ver el comentario de lib/tasas.ts:
    // un cobro con una tasa inventada se descubre cuando ya es tarde.
    res.status(503).json({
      error: 'No se pudo consultar el precio de ORIGEN',
      detalle: 'Intentá de nuevo en unos segundos.',
    })
    return
  }

  const cobro = caja.crearCobro({
    companyId: negocio.id,
    creadoPor: req.userId!,
    concepto: String(concepto || '').trim().slice(0, 120),
    montoHnl: Math.round(monto * 100) / 100,
    montoOrigen: aOrigen(monto, tasa.hnlPorOrigen),
    tasaHnlPorOrigen: tasa.hnlPorOrigen,
    partes: nPartes,
  })

  res.status(201).json({ cobro, tasa })
})

// ── El comercio mira su caja ─────────────────────────────────────────────────

cobrosRouter.get('/mios', requireAuth, (req, res) => {
  const negocio = comercioDe(req.userId!)
  if (!negocio) {
    res.status(403).json({ error: 'No tenés un negocio registrado' })
    return
  }
  const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined
  res.json({ cobros: caja.listarCobros(negocio.id, desde) })
})

cobrosRouter.get('/mios/:id', requireAuth, (req, res) => {
  const negocio = comercioDe(req.userId!)
  const cobro = caja.buscarCobro(req.params.id)
  if (!negocio || !cobro || cobro.companyId !== negocio.id) {
    res.status(404).json({ error: 'Cobro no encontrado' })
    return
  }
  res.json({ cobro })
})

cobrosRouter.post('/mios/:id/anular', requireAuth, (req, res) => {
  const negocio = comercioDe(req.userId!)
  const cobro = caja.buscarCobro(req.params.id)
  if (!negocio || !cobro || cobro.companyId !== negocio.id) {
    res.status(404).json({ error: 'Cobro no encontrado' })
    return
  }
  const anulado = caja.anularCobro(cobro.id)
  if (!anulado) {
    res.status(409).json({
      error: 'Este cobro ya no se puede anular',
      detalle: 'Está cerrado o alguien ya pagó su parte.',
    })
    return
  }
  res.json({ cobro: anulado })
})

// ── El cliente consulta y paga ───────────────────────────────────────────────

cobrosRouter.get('/codigo/:codigo', requireAuth, (req, res) => {
  const cobro = caja.buscarCobroPorCodigo(req.params.codigo)
  if (!cobro) {
    res.status(404).json({ error: 'No encontramos ese cobro' })
    return
  }
  res.json({ cobro: paraPagador(cobro) })
})

cobrosRouter.post('/codigo/:codigo/reservar', requireAuth, (req, res) => {
  const cobro = caja.buscarCobroPorCodigo(req.params.codigo)
  if (!cobro) {
    res.status(404).json({ error: 'No encontramos ese cobro' })
    return
  }
  const usuario = db.findUserById(req.userId!)
  const { parteIds } = req.body as { parteIds?: string[] }
  if (!Array.isArray(parteIds) || parteIds.length === 0) {
    res.status(400).json({ error: 'Decinos qué partes vas a pagar' })
    return
  }

  const tomadas: string[] = []
  for (const parteId of parteIds) {
    const r = caja.reservarParte(cobro.id, parteId, req.userId!, usuario?.fullName ?? 'Alguien')
    if (!r.ok) {
      // Se sueltan las que sí se tomaron: dejar media reserva colgada bloquea
      // partes que nadie va a pagar hasta que caduquen.
      for (const t of tomadas) caja.liberarParte(cobro.id, t, req.userId!)
      res.status(409).json({ error: r.motivo })
      return
    }
    tomadas.push(parteId)
  }

  res.json({ cobro: paraPagador(caja.buscarCobro(cobro.id)!) })
})

cobrosRouter.post('/codigo/:codigo/liberar', requireAuth, (req, res) => {
  const cobro = caja.buscarCobroPorCodigo(req.params.codigo)
  if (!cobro) {
    res.status(404).json({ error: 'No encontramos ese cobro' })
    return
  }
  const { parteIds } = req.body as { parteIds?: string[] }
  for (const parteId of parteIds ?? []) caja.liberarParte(cobro.id, parteId, req.userId!)
  res.json({ cobro: paraPagador(caja.buscarCobro(cobro.id)!) })
})

/**
 * Confirma el pago de una o varias partes.
 *
 * El `sello` lo genera la app antes de mandar al usuario a firmar, y viaja igual
 * en el reintento. Sin él, un cliente con mala señal que toca dos veces paga dos
 * veces — y recuperar ese dinero después es una conversación que nadie quiere
 * tener.
 */
cobrosRouter.post('/codigo/:codigo/pagar', requireAuth, (req, res) => {
  const cobro = caja.buscarCobroPorCodigo(req.params.codigo)
  if (!cobro) {
    res.status(404).json({ error: 'No encontramos ese cobro' })
    return
  }

  const { parteIds, txHash, sello } = req.body as {
    parteIds?: string[]
    txHash?: string
    sello?: string
  }

  if (!Array.isArray(parteIds) || parteIds.length === 0) {
    res.status(400).json({ error: 'Decinos qué partes pagaste' })
    return
  }
  if (!txHash || typeof txHash !== 'string') {
    res.status(400).json({ error: 'Falta el comprobante de la transferencia' })
    return
  }
  if (!sello || typeof sello !== 'string') {
    res.status(400).json({ error: 'Falta el sello del pago' })
    return
  }

  const usuario = db.findUserById(req.userId!)
  const resultados = parteIds.map((parteId) =>
    caja.pagarParte({
      cobroId: cobro.id,
      parteId,
      pagadorId: req.userId!,
      pagadorNombre: usuario?.fullName ?? 'Alguien',
      txHash: String(txHash),
      // Un sello por parte: si alguien paga tres porciones de una vez, cada una
      // necesita su propia marca o la segunda se tomaría por un duplicado.
      sello: `${sello}:${parteId}`,
    }),
  )

  const fallo = resultados.find((r) => !r.ok)
  if (fallo && !fallo.ok) {
    res.status(409).json({ error: fallo.motivo })
    return
  }

  const actualizado = caja.buscarCobro(cobro.id)!
  res.json({
    cobro: paraPagador(actualizado),
    cerrado: actualizado.estado === 'pagado',
    repetido: resultados.every((r) => r.ok && r.repetido),
  })
})
