// ─────────────────────────────────────────────────────────────────────────────
// Actividad: lo que cada quien puede mirar de su propio dinero.
//
// Dos vistas de los mismos hechos, contadas desde lados opuestos del mostrador:
//
//   · El cliente ve LO QUE PAGÓ: en qué comercio, qué se llevó, cuándo, cuánto
//     en lempiras y en ORIGEN, y si la cadena respalda ese pago.
//   · El comercio ve LO QUE VENDIÓ, agregado: por día, por mes, qué platos se
//     mueven y a qué hora entra la plata.
//
// Cada respuesta se arma para quien la pide. En «mis pagos» no viaja el id
// interno del cobro ni el del comercio; en las estadísticas del comercio no
// viaja el nombre de ningún cliente. Un historial de compras dice dónde estuvo
// una persona y a qué hora — es de las cosas más delicadas que guarda este
// sistema, y solo la ve su dueño.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { h } from '../lib/ruta.js'
import { db } from '../lib/db.js'
import { caja } from '../lib/caja.js'
import type { ArticuloVendido } from '../types-cobro.js'

export const actividadRouter = Router()

const r2 = (n: number) => Math.round(n * 100) / 100
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * El desglose de una orden.
 *
 * Los cobros nuevos lo traen estructurado. Los viejos solo tienen el concepto
 * («2× Chow mein, 1× Té»), así que se lee de ahí lo que se pueda — mejor un
 * historial imperfecto de lo ya vendido que una tabla vacía hasta que pase un
 * mes.
 */
function articulosDe(cobro: { articulos?: ArticuloVendido[]; concepto: string; montoHnl: number }): ArticuloVendido[] {
  if (cobro.articulos?.length) return cobro.articulos
  const partes = String(cobro.concepto || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const leidos: ArticuloVendido[] = []
  for (const t of partes) {
    const m = t.match(/^(\d+)\s*[×x]\s*(.+)$/)
    if (!m) continue
    leidos.push({ nombre: m[2].trim(), cantidad: Number(m[1]), precioUnitarioHnl: 0 })
  }
  return leidos
}

// ─────────────────────────────────────────────────────────────────────────────
// El cliente: lo que he pagado
// ─────────────────────────────────────────────────────────────────────────────

actividadRouter.get('/mis-pagos', requireAuth, h(async (req, res) => {
  const todos = await caja.pagosDe(req.userId!)

  const pagos = await Promise.all(
    todos.map(async ({ cobro, parte }) => {
      const negocio = await db.findCompanyById(cobro.companyId)
      const montoHnl = r2(parte.montoOrigen * cobro.tasaHnlPorOrigen)
      return {
        // El código, no el id: es lo que la persona reconoce de su recibo.
        codigo: cobro.codigo,
        concepto: cobro.concepto,
        articulos: articulosDe(cobro),
        negocio: negocio
          ? {
              id: negocio.id,
              nombre: negocio.tradeName,
              logo: negocio.logoDataUrl,
              categoria: negocio.categorySlug,
              ciudad: negocio.citySlug,
              direccion: negocio.address,
            }
          : null,
        montoHnl,
        montoOrigen: r6(parte.montoOrigen),
        tasaHnlPorOrigen: cobro.tasaHnlPorOrigen,
        // Si la cuenta se dividió, cuánto era el total y cuánto puso esta persona.
        dividida: cobro.partes.length > 1,
        partesTotales: cobro.partes.length,
        totalCuentaHnl: cobro.montoHnl,
        pagadaEn: parte.pagadaEn,
        txHash: parte.txHash,
        verificacionCadena: parte.verificacionCadena ?? null,
        estadoCobro: cobro.estado,
      }
    }),
  )

  pagos.sort((a, b) => String(b.pagadaEn ?? '').localeCompare(String(a.pagadaEn ?? '')))

  const total = pagos.reduce((s, p) => s + p.montoHnl, 0)
  const comercios = new Set(pagos.map((p) => p.negocio?.id).filter(Boolean)).size

  res.json({
    pagos,
    resumen: {
      pagos: pagos.length,
      totalHnl: r2(total),
      totalOrigen: r6(pagos.reduce((s, p) => s + p.montoOrigen, 0)),
      comercios,
      ticketPromedioHnl: pagos.length ? r2(total / pagos.length) : 0,
    },
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// El comercio: lo que he vendido
// ─────────────────────────────────────────────────────────────────────────────

const diaDe = (iso: string) => iso.slice(0, 10)
const mesDe = (iso: string) => iso.slice(0, 7)

actividadRouter.get('/estadisticas', requireAuth, h(async (req, res) => {
  const negocio = await db.findCompanyByOwner(req.userId!)
  if (!negocio) {
    res.status(403).json({ error: 'No tenés un negocio registrado' })
    return
  }

  const cobros = await caja.listarCobros(negocio.id)

  // Solo cuenta lo que se pagó de verdad, parte por parte: una cuenta a medias
  // vendió lo que le pagaron, no lo que pedía.
  interface Venta {
    cuando: string
    hnl: number
    origen: number
    respaldada: boolean
    cobro: (typeof cobros)[number]
  }
  const ventas: Venta[] = []
  for (const c of cobros) {
    for (const p of c.partes) {
      if (p.estado !== 'pagada' || !p.pagadaEn) continue
      ventas.push({
        cuando: p.pagadaEn,
        hnl: p.montoOrigen * c.tasaHnlPorOrigen,
        origen: p.montoOrigen,
        respaldada: p.verificacionCadena === 'confirmada',
        cobro: c,
      })
    }
  }

  const ahora = new Date()
  const hoy = ahora.toISOString().slice(0, 10)
  const mes = ahora.toISOString().slice(0, 7)
  const hace30 = new Date(ahora.getTime() - 29 * 86_400_000).toISOString().slice(0, 10)

  const suma = (lista: Venta[]) => ({
    ventas: lista.length,
    hnl: r2(lista.reduce((s, v) => s + v.hnl, 0)),
    origen: r6(lista.reduce((s, v) => s + v.origen, 0)),
  })

  const deHoy = ventas.filter((v) => diaDe(v.cuando) === hoy)
  const delMes = ventas.filter((v) => mesDe(v.cuando) === mes)

  // ── Serie diaria de los últimos 30 días, sin huecos ──
  const porDia = new Map<string, { hnl: number; ventas: number }>()
  for (let i = 0; i < 30; i++) {
    const d = new Date(ahora.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    porDia.set(d, { hnl: 0, ventas: 0 })
  }
  for (const v of ventas) {
    const d = diaDe(v.cuando)
    if (d < hace30) continue
    const acc = porDia.get(d)
    if (acc) {
      acc.hnl += v.hnl
      acc.ventas += 1
    }
  }
  const diario = [...porDia.entries()]
    .map(([dia, x]) => ({ dia, hnl: r2(x.hnl), ventas: x.ventas }))
    .sort((a, b) => a.dia.localeCompare(b.dia))

  // ── Serie mensual, los últimos 12 ──
  const porMes = new Map<string, { hnl: number; ventas: number }>()
  for (const v of ventas) {
    const m = mesDe(v.cuando)
    const acc = porMes.get(m) ?? { hnl: 0, ventas: 0 }
    acc.hnl += v.hnl
    acc.ventas += 1
    porMes.set(m, acc)
  }
  const mensual = [...porMes.entries()]
    .map(([m, x]) => ({ mes: m, hnl: r2(x.hnl), ventas: x.ventas }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-12)

  // ── Productos más vendidos ──
  //
  // Se cuenta por cobro pagado (entero o a medias): lo que se comió se comió,
  // aunque la cuenta se haya dividido entre cuatro. Contar por parte
  // multiplicaría los platos por el número de comensales.
  const cobrosConVenta = new Map<string, (typeof cobros)[number]>()
  for (const v of ventas) cobrosConVenta.set(v.cobro.id, v.cobro)

  const porProducto = new Map<string, { cantidad: number; hnl: number; ordenes: number }>()
  for (const c of cobrosConVenta.values()) {
    for (const a of articulosDe(c)) {
      const acc = porProducto.get(a.nombre) ?? { cantidad: 0, hnl: 0, ordenes: 0 }
      acc.cantidad += a.cantidad
      acc.hnl += a.cantidad * (a.precioUnitarioHnl || 0)
      acc.ordenes += 1
      porProducto.set(a.nombre, acc)
    }
  }
  const productos = [...porProducto.entries()]
    .map(([nombre, x]) => ({ nombre, cantidad: x.cantidad, hnl: r2(x.hnl), ordenes: x.ordenes }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 15)

  // ── Horas con más movimiento ──
  const porHora = new Array(24).fill(0).map((_, hora) => ({ hora, ventas: 0, hnl: 0 }))
  for (const v of ventas) {
    const hora = new Date(v.cuando).getHours()
    porHora[hora].ventas += 1
    porHora[hora].hnl += v.hnl
  }
  const horas = porHora.map((x) => ({ ...x, hnl: r2(x.hnl) }))

  const totales = suma(ventas)
  const sinRespaldo = ventas.filter((v) => !v.respaldada)

  res.json({
    hoy: suma(deHoy),
    mes: suma(delMes),
    total: totales,
    ticketPromedioHnl: ventas.length ? r2(totales.hnl / ventas.length) : 0,
    porConfirmar: {
      ventas: sinRespaldo.length,
      hnl: r2(sinRespaldo.reduce((s, v) => s + v.hnl, 0)),
    },
    diario,
    mensual,
    productos,
    horas,
    // El día que más se vendió, para que el comercio sepa dónde mirar.
    mejorDia: diario.reduce(
      (mejor, d) => (d.hnl > mejor.hnl ? d : mejor),
      { dia: '', hnl: 0, ventas: 0 },
    ),
  })
}))
