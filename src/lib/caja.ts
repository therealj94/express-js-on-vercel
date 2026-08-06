// ─────────────────────────────────────────────────────────────────────────────
// El almacén de cobros, movimientos y retiros.
//
// Guarda a través de `coleccion()` (ver `almacen.ts`): MongoDB en producción,
// memoria en desarrollo y en las pruebas. Ninguna ruta sabe cuál de los dos hay
// detrás; solo llama a estas funciones.
//
// Sobre el saldo: no existe un campo `saldo`. Se suma la lista de movimientos
// cada vez que se pregunta. Es más lento y es a propósito — un saldo guardado
// que se desincroniza de sus movimientos es un error que nadie ve hasta que hay
// que devolverle dinero a alguien.
//
// Sobre el tiempo: los cobros caducan y las reservas se liberan al leerse, no
// con un temporizador de fondo. Como ahora el estado vive en la base, cuando
// una lectura cambia algo por el paso del tiempo, se persiste ese cambio antes
// de devolverlo.
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
import { coleccion } from './almacen.js'

const cobros = coleccion<Cobro>('cobros')
const movimientos = coleccion<Movimiento>('movimientos')
const retiros = coleccion<Retiro>('retiros')

/** Sellos ya usados, para que un doble toque no pague dos veces. */
interface Sello {
  id: string
  sello: string
  cobroId: string
}
const sellos = coleccion<Sello>('sellos')

const enMinutos = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const vencido = (iso: string | null) => (iso ? Date.parse(iso) < Date.now() : false)

/**
 * Pone el cobro al día por el paso del tiempo. Devuelve `true` si cambió algo,
 * para que quien lo lea sepa que hay que persistirlo.
 */
function alDia(cobro: Cobro): boolean {
  if (cobro.estado !== 'abierto') return false
  let cambio = false

  for (const p of cobro.partes) {
    if (p.estado === 'reservada' && vencido(p.reservadaHasta)) {
      p.estado = 'libre'
      p.pagadorId = null
      p.pagadorNombre = null
      p.reservadaHasta = null
      cambio = true
    }
  }

  const pagadas = cobro.partes.filter((p) => p.estado === 'pagada').length
  if (pagadas === cobro.partes.length) {
    cobro.estado = 'pagado'
    cobro.pagadoEn = new Date().toISOString()
    cambio = true
  } else if (vencido(cobro.venceEn)) {
    cobro.estado = 'vencido'
    cambio = true
  }
  return cambio
}

/** Carga un cobro, lo pone al día y persiste el cambio si lo hubo. */
async function cargar(id: string): Promise<Cobro | undefined> {
  const cobro = await cobros.uno({ id })
  if (!cobro) return undefined
  if (alDia(cobro)) await cobros.guardar(cobro)
  return cobro
}

export const caja = {
  // ── Cobros ────────────────────────────────────────────────────────────────

  async crearCobro(input: {
    companyId: string
    creadoPor: string
    concepto: string
    montoHnl: number
    montoOrigen: number
    tasaHnlPorOrigen: number
    partes: number
  }): Promise<Cobro> {
    const ahora = new Date().toISOString()
    const trozos = repartir(input.montoOrigen, input.partes)

    let codigo = generarCodigo()
    while (await cobros.uno({ codigo })) codigo = generarCodigo()

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

    await cobros.guardar(cobro)
    return cobro
  },

  async buscarCobro(id: string): Promise<Cobro | undefined> {
    return cargar(id)
  },

  async buscarCobroPorCodigo(codigo: string): Promise<Cobro | undefined> {
    const c = await cobros.uno({ codigo: codigo.toUpperCase().trim() })
    return c ? cargar(c.id) : undefined
  },

  async listarCobros(companyId: string, desde?: string): Promise<Cobro[]> {
    const lista = await cobros.varios({ companyId })
    for (const c of lista) {
      if (alDia(c)) await cobros.guardar(c)
    }
    return lista
      .filter((c) => (desde ? c.creadoEn >= desde : true))
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  },

  async anularCobro(id: string): Promise<Cobro | undefined> {
    const c = await cargar(id)
    if (!c || c.estado !== 'abierto') return undefined
    // Si alguien ya puso su parte, anular le quitaría dinero sin devolvérselo.
    if (c.partes.some((p) => p.estado === 'pagada')) return undefined
    c.estado = 'anulado'
    await cobros.guardar(c)
    return c
  },

  /** Toma una parte libre y la bloquea unos minutos a nombre de quien va a pagar. */
  async reservarParte(
    cobroId: string,
    parteId: string,
    pagadorId: string,
    pagadorNombre: string,
  ): Promise<{ ok: true; parte: ParteCobro } | { ok: false; motivo: string }> {
    const cobro = await cargar(cobroId)
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
    await cobros.guardar(cobro)
    return { ok: true, parte }
  },

  async liberarParte(cobroId: string, parteId: string, pagadorId: string): Promise<boolean> {
    const cobro = await cargar(cobroId)
    const parte = cobro?.partes.find((p) => p.id === parteId)
    if (!cobro || !parte || parte.estado !== 'reservada' || parte.pagadorId !== pagadorId) return false
    parte.estado = 'libre'
    parte.pagadorId = null
    parte.pagadorNombre = null
    parte.reservadaHasta = null
    await cobros.guardar(cobro)
    return true
  },

  /**
   * Da una parte por pagada y abona el ORIGEN al comercio.
   *
   * El `sello` es la protección contra el doble cobro: si la app reintenta
   * porque se cortó la red, el segundo intento devuelve el mismo resultado en
   * vez de pagar otra vez. Es la misma regla que rige los envíos de Veta Wallet
   * y por el mismo motivo — entre comprobar y escribir caben dos peticiones. En
   * Mongo, además, un índice único sobre el sello es el último cortafuegos.
   */
  async pagarParte(input: {
    cobroId: string
    parteId: string
    pagadorId: string
    pagadorNombre: string
    txHash: string
    sello: string
  }): Promise<{ ok: true; cobro: Cobro; repetido: boolean } | { ok: false; motivo: string }> {
    const yaVisto = await sellos.uno({ sello: input.sello })
    if (yaVisto) {
      const cobro = await cargar(yaVisto.cobroId)
      if (cobro) return { ok: true, cobro, repetido: true }
    }

    const cobro = await cargar(input.cobroId)
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

    // El sello se registra antes de abonar: si otro intento idéntico corre a la
    // vez, el índice único lo detiene aquí en vez de dejar pasar un doble abono.
    await sellos.guardar({ id: input.sello, sello: input.sello, cobroId: cobro.id })

    await caja.anotar({
      companyId: cobro.companyId,
      tipo: 'cobro',
      montoOrigen: parte.montoOrigen,
      concepto: cobro.concepto || `Cobro ${cobro.codigo}`,
      referencia: cobro.id,
      parteId: parte.id,
      // Nace sin confirmar: la mesa se cierra al instante, pero este ORIGEN no
      // es retirable hasta que la cadena diga que el depósito existe.
      confirmado: false,
    })

    alDia(cobro)
    await cobros.guardar(cobro)
    return { ok: true, cobro, repetido: false }
  },

  /**
   * Total en lempiras que un usuario ha pagado en cobros, sumando sus partes
   * pagadas. Es la base de los puntos de bonos: consumo real, no sembrado.
   */
  async pagadoPor(userId: string): Promise<number> {
    const todos = await cobros.varios()
    let total = 0
    for (const c of todos) {
      for (const p of c.partes) {
        if (p.estado === 'pagada' && p.pagadorId === userId) {
          total += p.montoOrigen * c.tasaHnlPorOrigen
        }
      }
    }
    return Math.round(total * 100) / 100
  },

  /**
   * Anota lo que dijo la cadena sobre el comprobante de una parte, y mueve ese
   * dinero entre «por confirmar» y «confirmado».
   *
   * Es el único punto donde un abono pasa a ser retirable. Si el veredicto deja
   * de ser 'confirmada' (una reorganización de la cadena, un hash que resultó
   * no existir), el dinero vuelve a «por confirmar»: el saldo dice la verdad en
   * las dos direcciones, no solo en la buena.
   */
  async marcarVerificacion(cobroId: string, parteId: string, veredicto: string): Promise<void> {
    const cobro = await cobros.uno({ id: cobroId })
    const parte = cobro?.partes.find((p) => p.id === parteId)
    if (!cobro || !parte) return
    parte.verificacionCadena = veredicto
    await cobros.guardar(cobro)

    const mov = await movimientos.uno({ referencia: cobroId, parteId } as any)
    if (mov) {
      mov.confirmado = veredicto === 'confirmada'
      await movimientos.guardar(mov)
    }
  },

  /**
   * Los hashes que YA respaldan una parte de este comercio.
   *
   * Un mismo depósito no puede confirmar dos cobros: si se pudiera, una sola
   * transferencia pagaría media carta. Por eso quien reconcilia tiene que
   * saber qué entradas ya están gastadas.
   */
  async hashesUsados(companyId: string): Promise<Set<string>> {
    const lista = await cobros.varios({ companyId })
    const usados = new Set<string>()
    for (const c of lista) {
      for (const p of c.partes) {
        if (p.verificacionCadena === 'confirmada' && p.txHash) usados.add(p.txHash.toLowerCase())
      }
    }
    return usados
  },

  /** Cambia el comprobante de una parte por el que de verdad la respalda. */
  async fijarHash(cobroId: string, parteId: string, txHash: string): Promise<void> {
    const cobro = await cobros.uno({ id: cobroId })
    const parte = cobro?.partes.find((p) => p.id === parteId)
    if (!cobro || !parte) return
    parte.txHash = txHash
    await cobros.guardar(cobro)
  },

  // ── Saldo ─────────────────────────────────────────────────────────────────

  async anotar(input: Omit<Movimiento, 'id' | 'creadoEn'>): Promise<Movimiento> {
    const m: Movimiento = { ...input, id: randomUUID(), creadoEn: new Date().toISOString() }
    await movimientos.guardar(m)
    return m
  },

  async movimientos(companyId: string, limite = 100): Promise<Movimiento[]> {
    const lista = await movimientos.varios({ companyId })
    return lista.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).slice(0, limite)
  },

  /**
   * Saldo del comercio, en ORIGEN, en dos niveles.
   *
   * `confirmado` es el dinero que la cadena 8532 respalda: está de verdad en la
   * billetera del comercio. `porConfirmar` es lo que la app dio por pagado y la
   * cadena todavía no avala — sirve para que el mesero vea que la mesa cerró,
   * pero no es dinero que se pueda retirar.
   *
   * `disponible` sale SOLO de lo confirmado, menos lo comprometido en retiros
   * sin resolver. Un administrador que paga lempiras contra un abono que la
   * cadena nunca respaldó está regalando dinero, y esa puerta queda cerrada
   * aquí: es la única definición de «disponible» que existe en el sistema.
   */
  async saldo(companyId: string): Promise<{
    total: number
    confirmado: number
    porConfirmar: number
    retenido: number
    disponible: number
  }> {
    const movs = await movimientos.varios({ companyId })
    const total = movs.reduce((s, m) => s + m.montoOrigen, 0)

    // Un movimiento sin el campo (los de antes de esta versión) cuenta como no
    // confirmado: ante la duda, no es retirable. Los retiros (negativos) sí
    // pesan siempre, porque ese dinero ya salió.
    const confirmado = movs.reduce(
      (s, m) => s + (m.montoOrigen < 0 || m.confirmado === true ? m.montoOrigen : 0),
      0,
    )
    const porConfirmar = total - confirmado

    const rets = await retiros.varios({ companyId })
    const retenido = rets
      .filter((r) => r.estado === 'solicitado' || r.estado === 'en_proceso')
      .reduce((s, r) => s + r.montoOrigen, 0)

    const r6 = (n: number) => Math.round(n * 1e6) / 1e6
    return {
      total: r6(total),
      confirmado: r6(confirmado),
      porConfirmar: r6(porConfirmar),
      retenido: r6(retenido),
      disponible: r6(Math.max(0, confirmado - retenido)),
    }
  },

  // ── Retiros ───────────────────────────────────────────────────────────────

  async crearRetiro(input: {
    companyId: string
    solicitadoPor: string
    montoOrigen: number
    tasaHnlPorOrigen: number
    montoHnl: number
    banco: CuentaBanco
  }): Promise<Retiro> {
    const r: Retiro = {
      ...input,
      id: randomUUID(),
      estado: 'solicitado',
      nota: null,
      solicitadoEn: new Date().toISOString(),
      resueltoEn: null,
      resueltoPor: null,
    }
    await retiros.guardar(r)
    return r
  },

  async buscarRetiro(id: string): Promise<Retiro | undefined> {
    return retiros.uno({ id })
  },

  async listarRetiros(
    filtro: { companyId?: string; estado?: Retiro['estado'] } = {},
  ): Promise<Retiro[]> {
    const base = filtro.companyId ? { companyId: filtro.companyId } : undefined
    const lista = await retiros.varios(base)
    return lista
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
  async resolverRetiro(
    id: string,
    estado: Retiro['estado'],
    resueltoPor: string,
    nota?: string,
  ): Promise<Retiro | undefined> {
    const r = await retiros.uno({ id })
    if (!r) return undefined
    if (r.estado === 'pagado' || r.estado === 'rechazado') return r

    r.estado = estado
    r.nota = nota ?? r.nota
    if (estado === 'pagado' || estado === 'rechazado') {
      r.resueltoEn = new Date().toISOString()
      r.resueltoPor = resueltoPor
    }
    await retiros.guardar(r)

    if (estado === 'pagado') {
      await caja.anotar({
        companyId: r.companyId,
        tipo: 'retiro',
        montoOrigen: -r.montoOrigen,
        concepto: `Retiro a ${r.banco.banco} ····${r.banco.numeroCuenta.slice(-4)}`,
        referencia: r.id,
        // Una salida siempre pesa: la pagó una persona con lempiras de verdad.
        confirmado: true,
      })
    }
    return r
  },
}
