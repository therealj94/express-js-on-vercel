// Los cobros: lo que un comercio le pide a un cliente, y cómo queda pagado.
//
// EL MODELO, EN UNA FRASE
//
// MyTokenPay no custodia fondos. El ORIGEN vive en la billetera y se mueve en
// la cadena; aquí se lleva el LIBRO: quién cobró, a quién, cuánto, y con qué
// transacción quedó saldado. Por eso no hay ningún endpoint que sume o reste un
// saldo — no existe saldo que mover.
//
// EL CICLO
//
//   1. El comercio crea un cobro           POST /api/cobros
//   2. Sale un QR con su referencia        (lo pinta la app)
//   3. Quien paga lo lee                   GET  /api/cobros/:id
//   4. Y lo paga                           POST /api/cobros/:id/pagar
//   5. Los dos lados van al monitoreo      (automático, sin bloquear)
//
// LO QUE NO PUEDE FALLAR: UN COBRO NO SE PAGA DOS VECES. La condición va dentro
// de la actualización de la base (`db.pagarCobro`), no en un `if` de aquí. Es
// la misma lección que el doble pago de la billetera: dos peticiones que llegan
// a la vez leen las dos «pendiente» y las dos cobran.

import { Router } from 'express'
import { envolver } from '../lib/asincrono.js'
import { randomUUID } from 'crypto'
import { db } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { equivalencias, precioOrigenUsd, redondearOrigen } from '../lib/precio.js'
import { identidadPorCorreo, reportarPago, contar } from '../lib/genesis.js'
import type { Cobro, CobroPublico, MedioPago } from '../types.js'

export const cobrosRouter = Router()

/** Cuánto vive un cobro sin pagar. Media hora es una fila de supermercado. */
const MINUTOS_VIGENCIA = Number(process.env.MTP_MINUTOS_COBRO || 30)

/** Tope por cobro, en ORIGEN. Un cero de más en el mostrador es un desastre. */
const TOPE_ORIGEN = Number(process.env.MTP_TOPE_ORIGEN || 100000)

const MEDIOS: MedioPago[] = ['cadena', 'wallet', 'efectivo', 'otro']

/**
 * La referencia que va dentro del QR.
 *
 * Corta y en mayúsculas para que se pueda dictar por teléfono cuando el lector
 * no funciona, que en un mostrador pasa todos los días.
 */
function nuevaReferencia(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin I, O, 0, 1: se confunden
  let r = ''
  const bytes = randomUUID().replace(/-/g, '')
  for (let i = 0; i < 8; i++) r += alfabeto[parseInt(bytes.slice(i * 2, i * 2 + 2), 16) % alfabeto.length]
  return r
}

async function aPublico(c: Cobro): Promise<CobroPublico> {
  const comercio = await db.findCompanyById(c.companyId)
  return {
    id: c.id,
    referencia: c.referencia,
    estado: c.estado,
    montoOrigen: c.montoOrigen,
    montoUsd: c.montoUsd,
    montoHnl: c.montoHnl,
    concepto: c.concepto,
    comercio: comercio
      ? { id: comercio.id, nombre: comercio.tradeName, logoDataUrl: comercio.logoDataUrl }
      : null,
    creadoEn: c.creadoEn,
    pagadoEn: c.pago?.pagadoEn ?? null,
  }
}

// ── Crear un cobro ───────────────────────────────────────────────────────────

cobrosRouter.post('/', requireAuth, envolver(async (req, res) => {
  const { montoOrigen, concepto } = req.body ?? {}

  const comercio = await db.findCompanyByOwner(req.userId!)
  if (!comercio) {
    return res.status(403).json({ error: 'Todavía no tenés un comercio registrado para cobrar' })
  }
  /* Un comercio sin KYB aprobado NO puede cobrar. Es la línea que separa un
     directorio de comercios de una pasarela de pagos: en el momento en que
     alguien cobra dinero de otra persona, el ecosistema tiene que poder decir
     quién es. Dejarlo pasar «mientras se revisa» es exactamente cómo se cuela
     el fraude. */
  if (comercio.kyc.status !== 'verified') {
    return res.status(403).json({
      error: 'Tu comercio todavía no está verificado. Enviá los documentos y esperá la aprobación para poder cobrar.',
    })
  }

  const monto = redondearOrigen(Number(montoOrigen))
  if (!Number.isFinite(monto) || monto <= 0) {
    return res.status(400).json({ error: 'Ingresá un monto válido en ORIGEN' })
  }
  if (monto > TOPE_ORIGEN) {
    return res.status(400).json({ error: `El monto no puede pasar de ${TOPE_ORIGEN.toLocaleString('es')} ORIGEN` })
  }

  const texto = String(concepto ?? '').trim().slice(0, 140)
  const { usd, hnl, precioUsado } = equivalencias(monto)
  if (!precioUsado) {
    // Antes que emitir una factura con un importe inventado, se dice que no se
    // puede. Un cobro con el equivalente en cero es un cobro mal hecho.
    return res.status(503).json({
      error: 'No hay precio del ORIGEN configurado en el servidor. Avisá a soporte antes de cobrar.',
    })
  }

  const ahora = new Date()
  const cobro: Cobro = {
    id: randomUUID(),
    companyId: comercio.id,
    emisorId: req.userId!,
    montoOrigen: monto,
    montoUsd: usd,
    montoHnl: hnl,
    concepto: texto,
    estado: 'pendiente',
    referencia: nuevaReferencia(),
    creadoEn: ahora.toISOString(),
    caducaEn: new Date(ahora.getTime() + MINUTOS_VIGENCIA * 60_000),
    pago: null,
  }
  await db.crearCobro(cobro)
  contar('accion', 'cobro.emitido', { valor: usd, moneda: 'USD' })

  res.status(201).json({
    cobro: await aPublico(cobro),
    // El formato del QR es el que ya lee la app: `mtp:cobro?c=…&inv=…&a=…`.
    // Se arma AQUI para que el día que cambie no haya que actualizar el
    // teléfono de cada comercio.
    qr: `mtp:cobro?c=${cobro.companyId}&inv=${cobro.referencia}&a=${cobro.montoOrigen}`,
    caducaEn: cobro.caducaEn.toISOString(),
  })
}))

// ── Leerlo, para pagarlo ─────────────────────────────────────────────────────

/**
 * Cualquiera con el identificador puede leerlo: es lo que hay dentro del QR y
 * quien lo escanea todavía no ha iniciado sesión necesariamente. Va la vista
 * PUBLICA — sin el emisor, sin quién pagó — porque un QR pegado en un mostrador
 * lo escanea cualquiera que pase.
 */
cobrosRouter.get('/:id', envolver(async (req, res) => {
  const c = await db.cobroPorId(req.params.id)
  if (!c) return res.status(404).json({ error: 'Ese cobro no existe o ya caducó' })
  res.json({ cobro: await aPublico(c) })
}))

// ── Pagarlo ──────────────────────────────────────────────────────────────────

cobrosRouter.post('/:id/pagar', requireAuth, envolver(async (req, res) => {
  const { medio, hash } = req.body ?? {}
  const cobro = await db.cobroPorId(req.params.id)
  if (!cobro) return res.status(404).json({ error: 'Ese cobro no existe o ya caducó' })

  if (cobro.estado === 'pagado') {
    // No es un error del que paga: es que ya está. Se contesta el cobro tal
    // cual para que la app enseñe el comprobante en vez de un error rojo.
    return res.status(409).json({ error: 'Ese cobro ya fue pagado', cobro: await aPublico(cobro) })
  }
  if (cobro.estado !== 'pendiente') {
    return res.status(409).json({ error: 'Ese cobro ya no está disponible' })
  }
  if (new Date(cobro.caducaEn).getTime() < Date.now()) {
    return res.status(409).json({ error: 'Ese cobro caducó. Pedile al comercio que lo genere de nuevo.' })
  }

  const elMedio: MedioPago = MEDIOS.includes(medio) ? medio : 'wallet'
  const elHash = typeof hash === 'string' && hash.trim() ? hash.trim().slice(0, 120) : null
  /* Si dice que pagó en la cadena, que enseñe el hash. Es la única prueba que
     se puede comprobar después contra el explorador; sin él, «pagado en cadena»
     es una afirmación sin respaldo dentro del libro del comercio. */
  if (elMedio === 'cadena' && !elHash) {
    return res.status(400).json({ error: 'Un pago en la cadena tiene que traer el hash de la transacción' })
  }

  const pagador = await db.findUserById(req.userId!)

  const pagado = await db.pagarCobro(cobro.id, {
    pagadorId: req.userId!,
    pagadorGid: pagador?.gid ?? null,
    medio: elMedio,
    hash: elHash,
    pagadoEn: new Date().toISOString(),
  })

  /* La base dijo que no: otro ganó la carrera entre la lectura de arriba y
     esta escritura. Pasa de verdad —el cliente toca dos veces, la red
     reintenta— y es exactamente el caso en el que un `if` habría cobrado dos
     veces. Se contesta lo mismo que si ya estuviera pagado. */
  if (!pagado) {
    const ahora = await db.cobroPorId(cobro.id)
    return res.status(409).json({
      error: 'Ese cobro ya fue pagado',
      cobro: ahora ? await aPublico(ahora) : null,
    })
  }

  // ── Al monitoreo, los DOS lados ────────────────────────────────────────────
  ;(async () => {
    try {
      const comercio = await db.findCompanyById(pagado.companyId)
      const dueno = comercio ? await db.findUserById(comercio.ownerId) : null
      const fecha = pagado.pago!.pagadoEn

      if (pagado.pago?.pagadorGid) {
        reportarPago({
          gid: pagado.pago.pagadorGid, direccion: 'salida', idCobro: pagado.id,
          contraparte: comercio?.tradeName || pagado.companyId,
          montoOrigen: pagado.montoOrigen, montoUsd: pagado.montoUsd, hash: pagado.pago.hash, fecha,
        })
      }
      if (dueno?.gid) {
        reportarPago({
          gid: dueno.gid, direccion: 'entrada', idCobro: pagado.id,
          contraparte: pagador?.fullName || 'cliente',
          montoOrigen: pagado.montoOrigen, montoUsd: pagado.montoUsd, hash: pagado.pago!.hash, fecha,
        })
      }
    } catch (e: any) {
      console.error('[cobros] no se pudo reportar el pago al monitoreo:', e?.message)
    }
  })()

  contar('transaccion', `pago.${elMedio}`, { valor: pagado.montoUsd, moneda: 'USD' })

  res.json({ cobro: await aPublico(pagado) })
}))

// ── Cancelarlo ───────────────────────────────────────────────────────────────

cobrosRouter.post('/:id/cancelar', requireAuth, envolver(async (req, res) => {
  const c = await db.cancelarCobro(req.params.id, req.userId!)
  if (!c) {
    return res.status(409).json({ error: 'No se pudo cancelar: o no es tuyo, o ya fue pagado' })
  }
  res.json({ cobro: await aPublico(c) })
}))

// ── Lo que lleva cobrado el comercio ─────────────────────────────────────────

cobrosRouter.get('/', requireAuth, envolver(async (req, res) => {
  const comercio = await db.findCompanyByOwner(req.userId!)
  if (!comercio) return res.json({ cobros: [], resumen: null })
  const estado = ['pendiente', 'pagado', 'cancelado'].includes(String(req.query.estado))
    ? (req.query.estado as any) : undefined
  const [cobros, resumen] = await Promise.all([
    db.cobrosDeComercio(comercio.id, Math.min(200, Number(req.query.limite) || 50), estado),
    db.resumenComercio(comercio.id),
  ])
  res.json({
    cobros: await Promise.all(cobros.map(aPublico)),
    resumen: { ...resumen, precioOrigenUsd: precioOrigenUsd() },
  })
}))

export const pagosRouter = Router()

/** Lo que pagó la persona de la sesión. */
pagosRouter.get('/', requireAuth, envolver(async (req, res) => {
  const lista = await db.pagosDe(req.userId!, Math.min(200, Number(req.query.limite) || 50))
  res.json({ pagos: await Promise.all(lista.map(aPublico)) })
}))

// ── El vínculo con Genesis ID ────────────────────────────────────────────────

export const identidadRouter = Router()

/**
 * Ata esta cuenta a la identidad verificada de la persona.
 *
 * El correo NO viene en el cuerpo: se toma de la sesión. Si lo aceptara del
 * cliente, cualquiera podría atar su cuenta de MyTokenPay a la identidad de
 * otro y sus pagos quedarían registrados a nombre ajeno.
 */
identidadRouter.post('/vincular', requireAuth, envolver(async (req, res) => {
  const usuario = await db.findUserById(req.userId!)
  if (!usuario) return res.status(404).json({ error: 'Cuenta no encontrada' })

  const identidad = await identidadPorCorreo(usuario.email)
  if (!identidad) {
    return res.status(404).json({
      error: 'Todavía no hay una identidad de Genesis ID con tu correo. Verificate desde tu billetera primero.',
    })
  }
  if (!identidad.gid) {
    return res.status(409).json({
      error: 'Tu verificación está en curso. Cuando el equipo la apruebe vas a poder atar tu cuenta.',
    })
  }

  const direccion = typeof req.body?.direccionWallet === 'string'
    ? req.body.direccionWallet.trim().slice(0, 80) : null

  await db.vincularGid(usuario.id, identidad.gid, direccion)
  // El vínculo del otro lado: que Genesis sepa que esta cuenta es de ese GID.
  await import('../lib/genesis.js').then((g) =>
    g.vincularCuenta(identidad.id, usuario.id, usuario.email, direccion))

  res.json({
    gid: identidad.gid,
    nombreLegal: identidad.nombreLegal,
    estado: identidad.estado,
    direccionWallet: direccion,
  })
}))

/** En qué anda la identidad de quien pregunta. */
identidadRouter.get('/', requireAuth, envolver(async (req, res) => {
  const usuario = await db.findUserById(req.userId!)
  if (!usuario) return res.status(404).json({ error: 'Cuenta no encontrada' })
  if (usuario.gid) {
    return res.json({ vinculada: true, gid: usuario.gid, direccionWallet: usuario.direccionWallet ?? null })
  }
  const identidad = await identidadPorCorreo(usuario.email)
  res.json({
    vinculada: false,
    gid: null,
    // Se dice en qué anda su verificación para que la app sepa si mandarla a
    // verificarse o solo a atar la cuenta.
    identidad: identidad ? { estado: identidad.estado, tieneGid: Boolean(identidad.gid) } : null,
  })
}))
