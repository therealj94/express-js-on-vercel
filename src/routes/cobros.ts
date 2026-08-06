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
import { h } from '../lib/ruta.js'
import { db } from '../lib/db.js'
import { caja } from '../lib/caja.js'
import { cotizacion, aOrigen } from '../lib/tasas.js'
import { verificarTransferencia, entradasA } from '../lib/cadena.js'
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
async function paraPagador(cobro: Cobro) {
  const negocio = await db.findCompanyById(cobro.companyId)
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

cobrosRouter.post('/', requireAuth, h(async (req, res) => {
  const negocio = await comercioDe(req.userId!)
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

  const cobro = await caja.crearCobro({
    companyId: negocio.id,
    creadoPor: req.userId!,
    concepto: String(concepto || '').trim().slice(0, 120),
    montoHnl: Math.round(monto * 100) / 100,
    montoOrigen: aOrigen(monto, tasa.hnlPorOrigen),
    tasaHnlPorOrigen: tasa.hnlPorOrigen,
    partes: nPartes,
  })

  res.status(201).json({ cobro, tasa })
}))

// ── El comercio mira su caja ─────────────────────────────────────────────────

cobrosRouter.get('/mios', requireAuth, h(async (req, res) => {
  const negocio = await comercioDe(req.userId!)
  if (!negocio) {
    res.status(403).json({ error: 'No tenés un negocio registrado' })
    return
  }
  const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined
  res.json({ cobros: await caja.listarCobros(negocio.id, desde) })
}))

cobrosRouter.get('/mios/:id', requireAuth, h(async (req, res) => {
  const negocio = await comercioDe(req.userId!)
  const cobro = await caja.buscarCobro(req.params.id)
  if (!negocio || !cobro || cobro.companyId !== negocio.id) {
    res.status(404).json({ error: 'Cobro no encontrado' })
    return
  }
  res.json({ cobro })
}))

cobrosRouter.post('/mios/:id/anular', requireAuth, h(async (req, res) => {
  const negocio = await comercioDe(req.userId!)
  const cobro = await caja.buscarCobro(req.params.id)
  if (!negocio || !cobro || cobro.companyId !== negocio.id) {
    res.status(404).json({ error: 'Cobro no encontrado' })
    return
  }
  const anulado = await caja.anularCobro(cobro.id)
  if (!anulado) {
    res.status(409).json({
      error: 'Este cobro ya no se puede anular',
      detalle: 'Está cerrado o alguien ya pagó su parte.',
    })
    return
  }
  res.json({ cobro: anulado })
}))

/**
 * «Verificar pago»: el comercio pregunta a la cadena 8532, aquí y ahora, si
 * cada comprobante de este cobro es un depósito real en su billetera.
 *
 * Devuelve el cobro con `verificacionCadena` por parte: 'confirmada' es
 * dinero en la casa; 'no-encontrada' o 'destino-ajeno' es para no entregar
 * la mercadería todavía.
 */
cobrosRouter.post('/mios/:id/verificar', requireAuth, h(async (req, res) => {
  const negocio = await comercioDe(req.userId!)
  const cobro = await caja.buscarCobro(req.params.id)
  if (!negocio || !cobro || cobro.companyId !== negocio.id) {
    res.status(404).json({ error: 'Cobro no encontrado' })
    return
  }
  if (!negocio.walletAddress) {
    res.status(400).json({ error: 'El negocio no tiene dirección de cobro configurada' })
    return
  }

  // 1) Lo primero, el comprobante que trajo quien pagó.
  for (const parte of cobro.partes) {
    if (parte.estado !== 'pagada' || !parte.txHash) continue
    const r = await verificarTransferencia(parte.txHash, negocio.walletAddress, parte.montoOrigen)
    parte.verificacionCadena = r.veredicto
    await caja.marcarVerificacion(cobro.id, parte.id, r.veredicto)
  }

  // 2) Y si alguna sigue sin respaldo, se busca al revés: qué entró a la
  //    dirección del comercio que cuadre con lo que le deben.
  //
  //    Esto existe porque el viaje de vuelta falla en la vida real — la
  //    pantalla se cae, el teléfono se apaga, la persona cierra la app y se
  //    va. Pasó de verdad: el ORIGEN llegó a la billetera del comercio y
  //    MyTokenPay se quedó esperando un comprobante que nunca volvió. El
  //    dinero no puede depender de que el cliente termine el trámite.
  const sinRespaldo = cobro.partes.filter(
    (p) => p.estado === 'pagada' && p.verificacionCadena !== 'confirmada',
  )
  if (sinRespaldo.length > 0) {
    const entradas = await entradasA(negocio.walletAddress)
    const usados = await caja.hashesUsados(negocio.id)
    for (const parte of sinRespaldo) {
      // Un depósito solo puede respaldar UNA parte: si no, una transferencia
      // sola pagaría media carta.
      const calce = entradas.find(
        (e) => !usados.has(e.hash.toLowerCase()) && e.origenRecibido + 1e-6 >= parte.montoOrigen,
      )
      if (!calce) continue
      usados.add(calce.hash.toLowerCase())
      await caja.fijarHash(cobro.id, parte.id, calce.hash)
      await caja.marcarVerificacion(cobro.id, parte.id, 'confirmada')
      parte.txHash = calce.hash
      parte.verificacionCadena = 'confirmada'
    }
  }

  const pagadas = cobro.partes.filter((p) => p.estado === 'pagada')
  const confirmadas = pagadas.filter((p) => p.verificacionCadena === 'confirmada')
  res.json({
    cobro,
    resumen: {
      pagadas: pagadas.length,
      depositadasEnCadena: confirmadas.length,
      todoDepositado: pagadas.length > 0 && confirmadas.length === pagadas.length,
    },
  })
}))

// ── El cliente consulta y paga ───────────────────────────────────────────────

cobrosRouter.get('/codigo/:codigo', requireAuth, h(async (req, res) => {
  const cobro = await caja.buscarCobroPorCodigo(req.params.codigo)
  if (!cobro) {
    res.status(404).json({ error: 'No encontramos ese cobro' })
    return
  }
  res.json({ cobro: await paraPagador(cobro) })
}))

cobrosRouter.post('/codigo/:codigo/reservar', requireAuth, h(async (req, res) => {
  const cobro = await caja.buscarCobroPorCodigo(req.params.codigo)
  if (!cobro) {
    res.status(404).json({ error: 'No encontramos ese cobro' })
    return
  }
  const usuario = await db.findUserById(req.userId!)
  const { parteIds } = req.body as { parteIds?: string[] }
  if (!Array.isArray(parteIds) || parteIds.length === 0) {
    res.status(400).json({ error: 'Decinos qué partes vas a pagar' })
    return
  }

  const tomadas: string[] = []
  for (const parteId of parteIds) {
    const r = await caja.reservarParte(cobro.id, parteId, req.userId!, usuario?.fullName ?? 'Alguien')
    if (!r.ok) {
      // Se sueltan las que sí se tomaron: dejar media reserva colgada bloquea
      // partes que nadie va a pagar hasta que caduquen.
      for (const t of tomadas) await caja.liberarParte(cobro.id, t, req.userId!)
      res.status(409).json({ error: r.motivo })
      return
    }
    tomadas.push(parteId)
  }

  res.json({ cobro: await paraPagador((await caja.buscarCobro(cobro.id))!) })
}))

cobrosRouter.post('/codigo/:codigo/liberar', requireAuth, h(async (req, res) => {
  const cobro = await caja.buscarCobroPorCodigo(req.params.codigo)
  if (!cobro) {
    res.status(404).json({ error: 'No encontramos ese cobro' })
    return
  }
  const { parteIds } = req.body as { parteIds?: string[] }
  for (const parteId of parteIds ?? []) await caja.liberarParte(cobro.id, parteId, req.userId!)
  res.json({ cobro: await paraPagador((await caja.buscarCobro(cobro.id))!) })
}))

/**
 * Confirma el pago de una o varias partes.
 *
 * El `sello` lo genera la app antes de mandar al usuario a firmar, y viaja igual
 * en el reintento. Sin él, un cliente con mala señal que toca dos veces paga dos
 * veces — y recuperar ese dinero después es una conversación que nadie quiere
 * tener.
 */
cobrosRouter.post('/codigo/:codigo/pagar', requireAuth, h(async (req, res) => {
  const cobro = await caja.buscarCobroPorCodigo(req.params.codigo)
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

  const usuario = await db.findUserById(req.userId!)
  const resultados = []
  for (const parteId of parteIds) {
    resultados.push(
      await caja.pagarParte({
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
  }

  const fallo = resultados.find((r) => !r.ok)
  if (fallo && !fallo.ok) {
    res.status(409).json({ error: fallo.motivo })
    return
  }

  const actualizado = (await caja.buscarCobro(cobro.id))!

  // La cadena se consulta en segundo plano: la mesa no espera a la RPC para
  // ver su celebración, pero el comercio sí sabrá después si el depósito es
  // real («Verificar pago» en su pantalla del cobro).
  void (async () => {
    try {
      const negocio = await db.findCompanyById(actualizado.companyId)
      if (!negocio?.walletAddress) return
      for (const parteId of parteIds) {
        const parte = actualizado.partes.find((p) => p.id === parteId)
        if (!parte || parte.estado !== 'pagada' || !parte.txHash) continue
        const r = await verificarTransferencia(parte.txHash, negocio.walletAddress, parte.montoOrigen)
        await caja.marcarVerificacion(actualizado.id, parteId, r.veredicto)
      }
    } catch {
      // mejor sin veredicto que un veredicto inventado
    }
  })()

  res.json({
    cobro: await paraPagador(actualizado),
    cerrado: actualizado.estado === 'pagado',
    repetido: resultados.every((r) => r.ok && r.repetido),
  })
}))
