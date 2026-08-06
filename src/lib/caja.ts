// ─────────────────────────────────────────────────────────────────────────────
// El almacén de cobros, movimientos y retiros.
//
// Vive en memoria, igual que el resto de este backend. Está escrito para que
// cambiarlo por una base de datos real sea sustituir este archivo y nada más:
// ninguna ruta sabe cómo se guardan las cosas, solo llama a estas funciones.
//
// Sobre el saldo: no existe un campo `saldo`. Se suma la lista de movimientos
// cada vez que se pregunta. Es más lento y es a propósito — un saldo guardado
// que se desincroniza de sus movimientos es un error que nadie ve hasta que hay
// que devolverle dinero a alguien.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'crypto'
import {
  type Cobro,
  type CuentaBanco,
  type Movimiento,
  type ParteCobro,
  type Retiro,
  MINUTOS_RESERVA,
  MINUTOS_VIGENCIA_COBRO,
  generarCodigo,
  repartir,
} from '../types-cobro.js'

const cobros = new Map<string, Cobro>()
const cobrosPorCodigo = new Map<string, string>()
const movimientos: Movimiento[] = []
const retiros = new Map<string, Retiro>()

/** Sellos ya usados, para que un doble toque no pague dos veces. */
const sellosVistos = new Map<string, string>()

const enMinutos = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const vencido = (iso: string | null) => (iso ? Date.parse(iso) < Date.now() : false)

/**
 * Devuelve al estado que corresponde por el paso del tiempo.
 *
 * Se llama al leer en vez de con un temporizador de fondo: un proceso que
 * caduca cosas cada minuto es una pieza más que puede morirse en silencio y
 * dejar cuentas bloqueadas sin que nadie se entere.
 */
function alDia(cobro: Cobro): Cobro {
  if (cobro.estado === 'abierto') {
    for (const p of cobro.partes) {
      if (p.estado === 'reservada' && vencido(p.reservadaHasta)) {
        p.estado = 'libre'
        p.pagadorId = null
        p.pagadorNombre = null
        p.reservadaHasta = null
      }
    }
    const pagadas = cobro.partes.filter((p) => p.estado === 'pagada').length
    if (pagadas === cobro.partes.length) {
      cobro.estado = 'pagado'
      cobro.pagadoEn = new Date().toISOString()
    } else if (vencido(cobro.venceEn)) {
      cobro.estado = 'vencido'
    }
  }
  return cobro
}

export const caja = {
  // ── Cobros ────────────────────────────────────────────────────────────────

  crearCobro(input: {
    companyId: string
    creadoPor: string
    concepto: string
    montoHnl: number
    montoOrigen: number
    tasaHnlPorOrigen: number
    partes: number
  }): Cobro {
    const ahora = new Date().toISOString()
    const trozos = repartir(input.montoOrigen, input.partes)

    let codigo = generarCodigo()
    while (cobrosPorCodigo.has(codigo)) codigo = generarCodigo()

    const cobro: Cobro = {
      id: randomUUID(),
      companyId: input.companyId,
      creadoPor: input.creadoPor,
      concepto: input.concepto,
      montoHnl: input.montoHnl,
      montoOrigen: input.montoOrigen,
      tasaHnlPorOrigen: input.tasaHnlPorOrigen,
      partes: trozos.map<ParteCobro>((montoOrigen, indice) => ({
        id: randomUUID(),
        indice,
        montoOrigen,
        estado: 'libre',
        pagadorId: null,
        pagadorNombre: null,
        reservadaHasta: null,
        pagadaEn: null,
        txHash: null,
      })),
      codigo,
      estado: 'abierto',
      creadoEn: ahora,
      venceEn: enMinutos(MINUTOS_VIGENCIA_COBRO),
      pagadoEn: null,
    }

    cobros.set(cobro.id, cobro)
    cobrosPorCodigo.set(codigo, cobro.id)
    return cobro
  },

  buscarCobro(id: string): Cobro | undefined {
    const c = cobros.get(id)
    return c ? alDia(c) : undefined
  },

  buscarCobroPorCodigo(codigo: string): Cobro | undefined {
    const id = cobrosPorCodigo.get(codigo.toUpperCase().trim())
    return id ? caja.buscarCobro(id) : undefined
  },

  listarCobros(companyId: string, desde?: string): Cobro[] {
    return [...cobros.values()]
      .filter((c) => c.companyId === companyId)
      .filter((c) => (desde ? c.creadoEn >= desde : true))
      .map(alDia)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  },

  anularCobro(id: string): Cobro | undefined {
    const c = caja.buscarCobro(id)
    if (!c || c.estado !== 'abierto') return undefined
    // Si alguien ya puso su parte, anular le quitaría dinero sin devolvérselo.
    if (c.partes.some((p) => p.estado === 'pagada')) return undefined
    c.estado = 'anulado'
    return c
  },

  /** Toma una parte libre y la bloquea unos minutos a nombre de quien va a pagar. */
  reservarParte(
    cobroId: string,
    parteId: string,
    pagadorId: string,
    pagadorNombre: string,
  ): { ok: true; parte: ParteCobro } | { ok: false; motivo: string } {
    const cobro = caja.buscarCobro(cobroId)
    if (!cobro) return { ok: false, motivo: 'El cobro no existe' }
    if (cobro.estado !== 'abierto') return { ok: false, motivo: `El cobro está ${cobro.estado}` }

    const parte = cobro.partes.find((p) => p.id === parteId)
    if (!parte) return { ok: false, motivo: 'Esa parte no existe' }
    if (parte.estado === 'pagada') return { ok: false, motivo: 'Esa parte ya está pagada' }
    if (parte.estado === 'reservada' && parte.pagadorId !== pagadorId) {
      return { ok: false, motivo: 'Otra persona la está pagando ahora mismo' }
    }

    parte.estado = 'reservada'
    parte.pagadorId = pagadorId
    parte.pagadorNombre = pagadorNombre
    parte.reservadaHasta = enMinutos(MINUTOS_RESERVA)
    return { ok: true, parte }
  },

  liberarParte(cobroId: string, parteId: string, pagadorId: string): boolean {
    const cobro = caja.buscarCobro(cobroId)
    const parte = cobro?.partes.find((p) => p.id === parteId)
    if (!parte || parte.estado !== 'reservada' || parte.pagadorId !== pagadorId) return false
    parte.estado = 'libre'
    parte.pagadorId = null
    parte.pagadorNombre = null
    parte.reservadaHasta = null
    return true
  },

  /**
   * Da una parte por pagada y abona el ORIGEN al comercio.
   *
   * El `sello` es la protección contra el doble cobro: si la app reintenta
   * porque se cortó la red, el segundo intento devuelve el mismo resultado en
   * vez de pagar otra vez. Es la misma regla que rige los envíos de Veta Wallet
   * y por el mismo motivo — entre comprobar y escribir caben dos peticiones.
   */
  pagarParte(input: {
    cobroId: string
    parteId: string
    pagadorId: string
    pagadorNombre: string
    txHash: string
    sello: string
  }):
    | { ok: true; cobro: Cobro; repetido: boolean }
    | { ok: false; motivo: string } {
    const yaVisto = sellosVistos.get(input.sello)
    if (yaVisto) {
      const cobro = caja.buscarCobro(yaVisto)
      if (cobro) return { ok: true, cobro, repetido: true }
    }

    const cobro = caja.buscarCobro(input.cobroId)
    if (!cobro) return { ok: false, motivo: 'El cobro no existe' }
    if (cobro.estado === 'anulado') return { ok: false, motivo: 'El cobro fue anulado' }
    if (cobro.estado === 'vencido') return { ok: false, motivo: 'El cobro venció' }

    const parte = cobro.partes.find((p) => p.id === input.parteId)
    if (!parte) return { ok: false, motivo: 'Esa parte no existe' }
    if (parte.estado === 'pagada') return { ok: false, motivo: 'Esa parte ya estaba pagada' }
    if (parte.estado === 'reservada' && parte.pagadorId !== input.pagadorId) {
      return { ok: false, motivo: 'Otra persona la está pagando ahora mismo' }
    }

    parte.estado = 'pagada'
    parte.pagadorId = input.pagadorId
    parte.pagadorNombre = input.pagadorNombre
    parte.pagadaEn = new Date().toISOString()
    parte.txHash = input.txHash
    parte.reservadaHasta = null

    caja.anotar({
      companyId: cobro.companyId,
      tipo: 'cobro',
      montoOrigen: parte.montoOrigen,
      concepto: cobro.concepto || `Cobro ${cobro.codigo}`,
      referencia: cobro.id,
    })

    sellosVistos.set(input.sello, cobro.id)
    return { ok: true, cobro: alDia(cobro), repetido: false }
  },

  // ── Saldo ─────────────────────────────────────────────────────────────────

  anotar(input: Omit<Movimiento, 'id' | 'creadoEn'>): Movimiento {
    const m: Movimiento = { ...input, id: randomUUID(), creadoEn: new Date().toISOString() }
    movimientos.push(m)
    return m
  },

  movimientos(companyId: string, limite = 100): Movimiento[] {
    return movimientos
      .filter((m) => m.companyId === companyId)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      .slice(0, limite)
  },

  /**
   * Saldo del comercio, en ORIGEN.
   *
   * `disponible` descuenta lo que ya está comprometido en retiros que el
   * administrador todavía no ha resuelto. Sin ese descuento un comercio podría
   * pedir tres veces el mismo dinero y las tres solicitudes parecerían válidas.
   */
  saldo(companyId: string): { total: number; retenido: number; disponible: number } {
    const total = movimientos
      .filter((m) => m.companyId === companyId)
      .reduce((s, m) => s + m.montoOrigen, 0)

    const retenido = [...retiros.values()]
      .filter((r) => r.companyId === companyId)
      .filter((r) => r.estado === 'solicitado' || r.estado === 'en_proceso')
      .reduce((s, r) => s + r.montoOrigen, 0)

    const r6 = (n: number) => Math.round(n * 1e6) / 1e6
    return { total: r6(total), retenido: r6(retenido), disponible: r6(total - retenido) }
  },

  // ── Retiros ───────────────────────────────────────────────────────────────

  crearRetiro(input: {
    companyId: string
    solicitadoPor: string
    montoOrigen: number
    tasaHnlPorOrigen: number
    montoHnl: number
    banco: CuentaBanco
  }): Retiro {
    const r: Retiro = {
      ...input,
      id: randomUUID(),
      estado: 'solicitado',
      nota: null,
      solicitadoEn: new Date().toISOString(),
      resueltoEn: null,
      resueltoPor: null,
    }
    retiros.set(r.id, r)
    return r
  },

  buscarRetiro(id: string): Retiro | undefined {
    return retiros.get(id)
  },

  listarRetiros(filtro: { companyId?: string; estado?: Retiro['estado'] } = {}): Retiro[] {
    return [...retiros.values()]
      .filter((r) => (filtro.companyId ? r.companyId === filtro.companyId : true))
      .filter((r) => (filtro.estado ? r.estado === filtro.estado : true))
      .sort((a, b) => b.solicitadoEn.localeCompare(a.solicitadoEn))
  },

  /**
   * Resuelve un retiro.
   *
   * Solo cuando queda `pagado` se descuenta el ORIGEN del saldo, porque hasta
   * ese momento el comercio no ha recibido sus lempiras. Y si se rechaza no se
   * anota nada: el dinero nunca salió, así que no hay nada que devolver.
   */
  resolverRetiro(
    id: string,
    estado: Retiro['estado'],
    resueltoPor: string,
    nota?: string,
  ): Retiro | undefined {
    const r = retiros.get(id)
    if (!r) return undefined
    if (r.estado === 'pagado' || r.estado === 'rechazado') return r

    r.estado = estado
    r.nota = nota ?? r.nota
    if (estado === 'pagado' || estado === 'rechazado') {
      r.resueltoEn = new Date().toISOString()
      r.resueltoPor = resueltoPor
    }

    if (estado === 'pagado') {
      caja.anotar({
        companyId: r.companyId,
        tipo: 'retiro',
        montoOrigen: -r.montoOrigen,
        concepto: `Retiro a ${r.banco.banco} ····${r.banco.numeroCuenta.slice(-4)}`,
        referencia: r.id,
      })
    }
    return r
  },
}
