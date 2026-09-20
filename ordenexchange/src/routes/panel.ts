// El panel de operadores.

import { Router } from 'express'
import { seguro, noEncontrado, malaPeticion } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { exigirPanel } from '../lib/sesion.js'
import { store, motor } from '../store.js'
import { Dec } from '../lib/decimal.js'
import * as operadores from '../motor/operadores.js'
import * as ordenes from '../motor/ordenes.js'
import * as usuarios from '../motor/usuarios.js'
import * as billetera from '../motor/billetera.js'
import * as agentes from '../motor/agentes.js'
import * as anuncios from '../motor/anuncios.js'
import * as metodosPago from '../motor/metodosPago.js'
import * as bitacora from '../motor/bitacora.js'
import { precios, actualizarPrecios, aUsd } from '../motor/precios.js'
import { tamizDireccion, genesisConfigurado } from '../motor/genesis.js'
import { MONEDAS } from '../data/monedas.js'
import { PAISES } from '../data/latam.js'
import { SIMBOLOS } from '../data/activos.js'
import type { Configuracion } from '../types.js'

export const panelRouter = Router()

// ── Sesión ───────────────────────────────────────────────────────────────────

panelRouter.post('/sesion/entrar', limite(10), seguro((req, res) => {
  const b = req.body ?? {}
  res.json(operadores.entrar(b.email, b.contrasena, req.ip || ''))
}))

panelRouter.get('/sesion/yo', exigirPanel(), (req, res) => {
  res.json({ operador: operadores.sinHash(req.operador!) })
})

panelRouter.post('/sesion/salir', exigirPanel(), (req, res) => {
  operadores.salir(req.tokenPanel!)
  res.status(204).end()
})

panelRouter.post('/sesion/contrasena', exigirPanel(), seguro((req, res) => {
  const b = req.body ?? {}
  operadores.cambiarContrasena(req.operador!, b.actual, b.nueva, req.tokenPanel || '')
  res.json({ ok: true })
}))

// ── Resumen ──────────────────────────────────────────────────────────────────

panelRouter.get('/resumen', exigirPanel(), (_req, res) => {
  ordenes.revisarVencidas()
  const d = store.todo()
  const ahora = Date.now()
  const h24 = ahora - 86400000, d30 = ahora - 30 * 86400000
  const completadas = d.ordenes.filter((o) => o.estado === 'completada')
  let volumenUsd30d = 0
  for (const o of completadas) {
    if (Date.parse(o.completadaEn!) < d30) continue
    volumenUsd30d += aUsd(o.montoFiat, o.moneda) ?? 0
  }
  res.json({
    usuarios: {
      total: d.usuarios.length,
      verificados: d.usuarios.filter((u) => u.gidEstado === 'verificada').length,
      agentes: d.usuarios.filter((u) => u.agente === 'aprobado').length,
      congelados: d.usuarios.filter((u) => u.congelado).length,
    },
    ordenes: {
      abiertas: d.ordenes.filter(ordenes.esAbierta).length,
      pendientesPago: d.ordenes.filter((o) => o.estado === 'pendiente-pago').length,
      pagadas: d.ordenes.filter((o) => o.estado === 'pagado').length,
      apelaciones: d.ordenes.filter((o) => o.estado === 'apelacion').length,
      completadas24h: completadas.filter((o) => Date.parse(o.completadaEn!) >= h24).length,
      completadas30d: completadas.filter((o) => Date.parse(o.completadaEn!) >= d30).length,
      volumenUsd30d: Math.round(volumenUsd30d * 100) / 100,
    },
    anunciosActivos: d.anuncios.filter((a) => a.estado === 'activo').length,
    retirosPendientes: billetera.retirosPendientes().length,
    solicitudesAgente: agentes.solicitudes('pendiente').length,
    depositos24h: d.depositos.filter((x) => Date.parse(x.en) >= h24).length,
    custodia: billetera.custodiaTotal(),
    tesoreria: Object.fromEntries(SIMBOLOS.map((a) => [a, billetera.saldo(billetera.TESORERIA_ID, a).disponible])),
    precios: precios(),
    almacen: { motor, efimero: motor === 'archivo' },
    genesisConfigurado: genesisConfigurado(),
  })
})

// ── Órdenes y apelaciones ────────────────────────────────────────────────────

panelRouter.get('/ordenes', exigirPanel(), (req, res) => {
  res.json(ordenes.buscarPanel(req.query as Record<string, string>))
})

panelRouter.get('/apelaciones', exigirPanel(), (_req, res) => {
  ordenes.revisarVencidas()
  res.json({ ordenes: ordenes.apelacionesAbiertas() })
})

panelRouter.get('/ordenes/:id', exigirPanel(), seguro((req, res) => {
  res.json(ordenes.detallePanel(req.params.id))
}))

panelRouter.post('/ordenes/:id/resolver', exigirPanel('ordenes.resolver'), seguro(async (req, res) => {
  const o = await ordenes.resolver(req.params.id, req.body?.resolucion, req.body?.nota, req.operador!.email)
  res.json({ orden: o })
}))

panelRouter.post('/ordenes/:id/cancelar', exigirPanel('ordenes.cancelar'), seguro((req, res) => {
  res.json({ orden: ordenes.cancelarPorOperador(req.params.id, req.body?.nota, req.operador!.email) })
}))

panelRouter.post('/ordenes/:id/mensajes', exigirPanel('ordenes.chatear'), seguro((req, res) => {
  res.status(201).json({ mensaje: ordenes.mensajeOperador(req.params.id, req.body?.texto, req.operador!.id) })
}))

// ── Agentes ──────────────────────────────────────────────────────────────────

panelRouter.get('/agentes', exigirPanel(), (req, res) => {
  const estado = req.query.estado ? String(req.query.estado) : undefined
  const lista = agentes.solicitudes(estado).map((s) => {
    const u = usuarios.porId(s.usuarioId)
    return { ...s, usuario: u ? usuarios.publico(u) : null, email: u?.email ?? null }
  })
  res.json({ solicitudes: lista, agentes: store.todo().usuarios.filter((u) => u.agente === 'aprobado' || u.agente === 'suspendido').map(usuarioPanel) })
})

panelRouter.post('/agentes/:id/decidir', exigirPanel('agentes.decidir'), seguro((req, res) => {
  res.json({ solicitud: agentes.decidir(req.params.id, req.body?.decision, req.body?.nota, req.operador!.email) })
}))

panelRouter.post('/usuarios/:id/agente', exigirPanel('agentes.decidir'), seguro((req, res) => {
  const u = usuarios.exigir(req.params.id)
  res.json({ usuario: usuarioPanel(agentes.fijarEstado(u, req.body?.estado, req.body?.nota, req.operador!.email)) })
}))

// ── Retiros y depósitos ──────────────────────────────────────────────────────

panelRouter.get('/retiros', exigirPanel(), seguro(async (req, res) => {
  const estado = req.query.estado ? String(req.query.estado) : 'pendiente'
  const lista = store.todo().retiros.filter((r) => estado === 'todos' || r.estado === estado).slice().reverse().slice(0, 200)
  const salida = []
  for (const r of lista) {
    const u = usuarios.porId(r.usuarioId)
    let direccionSancionada: boolean | null = null
    if (r.estado === 'pendiente' && genesisConfigurado()) {
      const t = await tamizDireccion(r.direccion)
      direccionSancionada = t.ok && t.cuerpo?.tamizado ? Boolean(t.cuerpo.sancionada) : null
    }
    salida.push({ ...r, usuario: u ? usuarios.publico(u) : null, email: u?.email ?? null, direccionSancionada })
  }
  res.json({ retiros: salida })
}))

panelRouter.post('/retiros/:id/decidir', exigirPanel('retiros.decidir'), seguro(async (req, res) => {
  const b = req.body ?? {}
  res.json({ retiro: await billetera.decidirRetiro(req.params.id, b.decision, { txHash: b.txHash, motivo: b.motivo }, req.operador!.email) })
}))

panelRouter.get('/depositos', exigirPanel(), (req, res) => {
  const pagina = Math.max(1, Number(req.query.pagina) || 1)
  const todos = store.todo().depositos.slice().reverse()
  const lista = todos.slice((pagina - 1) * 50, pagina * 50).map((d) => ({ ...d, apodo: usuarios.porId(d.usuarioId)?.apodo ?? null }))
  res.json({ depositos: lista, total: todos.length })
})

// ── Usuarios ─────────────────────────────────────────────────────────────────

function usuarioPanel(u: ReturnType<typeof usuarios.exigir>) {
  const { puedeOperar: _p, motivoNoOpera: _m, ...resto } = usuarios.propio(u)
  return { ...resto, ultimoAcceso: u.ultimoAcceso, saldos: billetera.saldos(u.id) }
}

panelRouter.get('/usuarios', exigirPanel(), (req, res) => {
  const r = usuarios.buscar(String(req.query.q || ''), Number(req.query.pagina) || 1)
  res.json({ usuarios: r.usuarios.map(usuarioPanel), total: r.total })
})

panelRouter.get('/usuarios/:id', exigirPanel(), seguro((req, res) => {
  const u = usuarios.exigir(req.params.id)
  res.json({
    usuario: usuarioPanel(u),
    saldos: billetera.saldos(u.id),
    movimientos: billetera.movimientos(u.id, { porPagina: 100 }).movimientos,
    anuncios: anuncios.misAnuncios(u.id).map(anuncios.propio),
    ordenes: ordenes.ordenesDe(u.id).slice(0, 100),
    metodosPago: metodosPago.listar(u.id),
    retiros: billetera.retirosDe(u.id),
    depositos: billetera.depositosDe(u.id),
    solicitudAgente: agentes.solicitudDe(u.id),
  })
}))

panelRouter.post('/usuarios/:id/congelar', exigirPanel('usuarios.congelar'), seguro((req, res) => {
  const u = usuarios.exigir(req.params.id)
  const congelado = Boolean(req.body?.congelado)
  const motivo = String(req.body?.motivo || '').trim().slice(0, 300)
  if (congelado && motivo.length < 5) throw malaPeticion('Hace falta un motivo para bloquear', 'motivo')
  usuarios.congelar(u, congelado, motivo, req.operador!.email)
  if (congelado) anuncios.pausarTodos(u.id, 'cuenta bloqueada por un operador')
  res.json({ usuario: usuarioPanel(u) })
}))

panelRouter.post('/usuarios/:id/ajuste', exigirPanel('saldos.ajustar'), seguro((req, res) => {
  const u = usuarios.exigir(req.params.id)
  res.json({ saldos: billetera.ajustar(u.id, req.body ?? {}, req.operador!.email) })
}))

// ── Precios y configuración ──────────────────────────────────────────────────

panelRouter.get('/precios', exigirPanel(), (_req, res) => {
  res.json({
    precios: precios(),
    monedas: MONEDAS.map((m) => ({ codigo: m.codigo, nombre: m.nombre, paises: PAISES.filter((p) => p.moneda.codigo === m.codigo).map((p) => p.iso2) })),
  })
})

panelRouter.put('/precios', exigirPanel('precios.editar'), seguro((req, res) => {
  res.json({ precios: actualizarPrecios(req.body ?? {}, req.operador!.email) })
}))

panelRouter.get('/configuracion', exigirPanel(), (_req, res) => {
  res.json({ configuracion: store.todo().configuracion })
})

panelRouter.put('/configuracion', exigirPanel('configuracion.editar'), seguro((req, res) => {
  const b = req.body ?? {}
  const cfg = store.todo().configuracion
  const cambios: Partial<Configuracion> = {}
  const num = (v: unknown, nombre: string, min: number, max: number) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max) throw malaPeticion(`${nombre} tiene que estar entre ${min} y ${max}`)
    return n
  }
  if (b.comisionPct !== undefined) cambios.comisionPct = num(b.comisionPct, 'comisionPct', 0, 5)
  if (b.garantiaAgente !== undefined) cambios.garantiaAgente = billetera.cantidadValida(b.garantiaAgente, 'ORIGEN', true)
  if (b.maxOrdenesAbiertas !== undefined) cambios.maxOrdenesAbiertas = Math.round(num(b.maxOrdenesAbiertas, 'maxOrdenesAbiertas', 1, 50))
  if (b.minOrdenUsd !== undefined) cambios.minOrdenUsd = num(b.minOrdenUsd, 'minOrdenUsd', 0, 10000)
  if (b.maxOrdenUsdSinAgente !== undefined) cambios.maxOrdenUsdSinAgente = num(b.maxOrdenUsdSinAgente, 'maxOrdenUsdSinAgente', 10, 10_000_000)
  if (b.confirmacionesDeposito !== undefined) cambios.confirmacionesDeposito = Math.round(num(b.confirmacionesDeposito, 'confirmacionesDeposito', 1, 100))
  if (b.tesoreria !== undefined) {
    if (b.tesoreria !== null && !/^0x[0-9a-fA-F]{40}$/.test(String(b.tesoreria))) throw malaPeticion('La tesorería tiene que ser una dirección 0x de 40 caracteres')
    cambios.tesoreria = b.tesoreria ? String(b.tesoreria) : null
  }
  if (!Object.keys(cambios).length) throw malaPeticion('No hay nada que cambiar')
  Object.assign(cfg, cambios)
  bitacora.registrar(req.operador!.email, 'configuracion.actualizada', 'configuracion', cambios as Record<string, unknown>)
  store.guardar()
  res.json({ configuracion: cfg })
}))

// ── Bitácora y operadores ────────────────────────────────────────────────────

panelRouter.get('/bitacora', exigirPanel(), (req, res) => {
  const r = bitacora.listar(Number(req.query.pagina) || 1, 50, String(req.query.q || ''))
  res.json({ ...r, integra: bitacora.verificarCadena().integra })
})

panelRouter.get('/operadores', exigirPanel(), (_req, res) => {
  res.json({ operadores: operadores.listar() })
})

panelRouter.post('/operadores', exigirPanel('operadores.gestionar'), seguro((req, res) => {
  res.status(201).json(operadores.crear(req.operador!, req.body ?? {}))
}))

panelRouter.post('/operadores/:id/estado', exigirPanel('operadores.gestionar'), seguro((req, res) => {
  res.json({ operador: operadores.fijarEstado(req.operador!, req.params.id, Boolean(req.body?.activo)) })
}))

panelRouter.post('/operadores/:id/restablecer', exigirPanel('operadores.gestionar'), seguro((req, res) => {
  res.json({ contrasenaTemporal: operadores.restablecer(req.operador!, req.params.id) })
}))

export { noEncontrado, Dec }
