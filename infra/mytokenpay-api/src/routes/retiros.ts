// ─────────────────────────────────────────────────────────────────────────────
// Retiros: el comercio convierte su saldo en ORIGEN a lempiras en su cuenta.
//
// Cómo funciona de verdad, sin adornos: el comercio pide un retiro, un
// administrador de Orden Global hace la transferencia bancaria a mano, y marca
// el retiro como pagado. No hay integración bancaria automática — y decirlo
// claro importa, porque el comercio necesita saber que hay una persona detrás y
// que eso lleva su tiempo.
//
// El saldo se descuenta SOLO cuando el administrador confirma que pagó. Entre
// medias el monto queda «retenido»: ni disponible para pedir otra vez, ni
// descontado de un dinero que todavía no salió.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { h } from '../lib/ruta.js'
import { db } from '../lib/db.js'
import { caja } from '../lib/caja.js'
import { cotizacion, aHnl } from '../lib/tasas.js'
import type { CuentaBanco } from '../types-cobro.js'

export const retirosRouter = Router()

/** Debajo de esto no compensa el trabajo de hacer una transferencia a mano. */
const MINIMO_ORIGEN = 1

const BANCOS = [
  'Banco Atlántida',
  'Banco de Occidente',
  'Banco Ficohsa',
  'BAC Credomatic',
  'Banpaís',
  'Davivienda',
  'Banco Promerica',
  'Banrural',
]

function validarBanco(entrada: unknown): { ok: true; banco: CuentaBanco } | { ok: false; error: string } {
  const b = entrada as Partial<CuentaBanco> | undefined
  if (!b) return { ok: false, error: 'Faltan los datos de la cuenta' }

  const banco = String(b.banco || '').trim()
  const numeroCuenta = String(b.numeroCuenta || '').replace(/\s+/g, '')
  const titular = String(b.titular || '').trim()
  const identidad = String(b.identidad || '').replace(/\s+/g, '')
  const tipoCuenta = b.tipoCuenta === 'cheques' ? 'cheques' : 'ahorro'

  if (!banco) return { ok: false, error: 'Elegí el banco' }
  if (!/^\d{6,20}$/.test(numeroCuenta)) return { ok: false, error: 'El número de cuenta no parece válido' }
  if (titular.length < 4) return { ok: false, error: 'Escribí el nombre del titular como aparece en el banco' }
  if (!/^\d{13}$/.test(identidad)) return { ok: false, error: 'La identidad del titular son 13 dígitos' }

  return { ok: true, banco: { banco, tipoCuenta, numeroCuenta, titular, identidad } }
}

/** El número de cuenta nunca vuelve entero: solo lo suficiente para reconocerla. */
function taparCuenta(b: CuentaBanco): CuentaBanco {
  return { ...b, numeroCuenta: `····${b.numeroCuenta.slice(-4)}`, identidad: `····${b.identidad.slice(-4)}` }
}

retirosRouter.get('/bancos', (_req, res) => {
  res.json({ bancos: BANCOS })
})

// ── Saldo y movimientos del comercio ─────────────────────────────────────────

retirosRouter.get('/saldo', requireAuth, h(async (req, res) => {
  const negocio = await db.findCompanyByOwner(req.userId!)
  if (!negocio) {
    res.status(403).json({ error: 'No tenés un negocio registrado' })
    return
  }

  const saldo = await caja.saldo(negocio.id)
  let tasa = null
  try {
    tasa = await cotizacion()
  } catch {
    // Se puede mirar el saldo en ORIGEN aunque el precio no responda; lo que no
    // se puede es enseñar unos lempiras inventados.
  }

  res.json({
    saldo,
    enLempiras: tasa
      ? {
          total: aHnl(saldo.total, tasa.hnlPorOrigen),
          confirmado: aHnl(saldo.confirmado, tasa.hnlPorOrigen),
          porConfirmar: aHnl(saldo.porConfirmar, tasa.hnlPorOrigen),
          disponible: aHnl(saldo.disponible, tasa.hnlPorOrigen),
          tasaHnlPorOrigen: tasa.hnlPorOrigen,
          fuente: tasa.fuente,
        }
      : null,
    movimientos: await caja.movimientos(negocio.id, 60),
  })
}))

// ── Pedir un retiro ──────────────────────────────────────────────────────────

retirosRouter.post('/', requireAuth, h(async (req, res) => {
  const negocio = await db.findCompanyByOwner(req.userId!)
  if (!negocio) {
    res.status(403).json({ error: 'No tenés un negocio registrado' })
    return
  }

  const { montoOrigen, banco } = req.body as { montoOrigen?: number; banco?: unknown }
  const monto = Number(montoOrigen)

  if (!Number.isFinite(monto) || monto <= 0) {
    res.status(400).json({ error: 'Escribí cuánto querés retirar' })
    return
  }
  if (monto < MINIMO_ORIGEN) {
    res.status(400).json({ error: `El retiro mínimo es de ${MINIMO_ORIGEN} ORIGEN` })
    return
  }

  const s = await caja.saldo(negocio.id)
  if (monto > s.disponible) {
    const detalle = s.porConfirmar > 0
      ? `Disponible: ${s.disponible} ORIGEN. Tenés ${s.porConfirmar} ORIGEN por confirmar: son pagos que la cadena todavía no respalda, y no se pueden retirar hasta que el depósito aparezca en tu billetera. Usá «Verificar pago» en el cobro.`
      : `Disponible: ${s.disponible} ORIGEN. Si pediste otro retiro hace poco, ese monto queda reservado hasta que se resuelva.`
    res.status(400).json({ error: 'No tenés saldo suficiente', detalle })
    return
  }

  const v = validarBanco(banco)
  if (!v.ok) {
    res.status(400).json({ error: v.error })
    return
  }

  let tasa
  try {
    tasa = await cotizacion()
  } catch {
    res.status(503).json({ error: 'No se pudo consultar el precio de ORIGEN. Intentá en unos segundos.' })
    return
  }

  const retiro = await caja.crearRetiro({
    companyId: negocio.id,
    solicitadoPor: req.userId!,
    montoOrigen: monto,
    tasaHnlPorOrigen: tasa.hnlPorOrigen,
    montoHnl: aHnl(monto, tasa.hnlPorOrigen),
    banco: v.banco,
  })

  res.status(201).json({ retiro: { ...retiro, banco: taparCuenta(retiro.banco) } })
}))

retirosRouter.get('/mios', requireAuth, h(async (req, res) => {
  const negocio = await db.findCompanyByOwner(req.userId!)
  if (!negocio) {
    res.status(403).json({ error: 'No tenés un negocio registrado' })
    return
  }
  const retiros = await caja.listarRetiros({ companyId: negocio.id })
  res.json({
    retiros: retiros.map((r) => ({ ...r, banco: taparCuenta(r.banco) })),
  })
}))
