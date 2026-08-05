// Monitoreo de transacciones.
//
// El KYC mira a la persona una vez, cuando entra. El monitoreo mira lo que hace
// después, que es donde se ve de verdad el lavado: nadie declara "vengo a mover
// fondos de origen ilícito", pero el patrón de movimientos lo delata.
//
// Cada regla de aquí explica QUE vio y POR QUE importa, porque una alerta que
// no se entiende es una alerta que se cierra sin mirar.
//
// Las reglas son deliberadamente conservadoras en una cosa: prefieren avisar de
// más. Un falso positivo cuesta unos minutos de revisión; un falso negativo
// cuesta la licencia.

import { tamizarDireccion } from './tamiz.js'
import { nivelPais, nombrePais } from './paises.js'

export interface Movimiento {
  id: string
  /** Identidad dueña de la cuenta que se está monitoreando. */
  gid: string
  direccion: 'entrada' | 'salida'
  /** Contraparte: dirección on-chain o identificador externo. */
  contraparte: string
  /** Importe en la moneda del movimiento. */
  monto: number
  activo: string
  /** Equivalente en dólares al momento del movimiento — es lo que comparan los umbrales. */
  montoUsd: number
  /** ISO 8601. */
  fecha: string
  /** Aplicación del ecosistema desde la que se originó. */
  app?: string
  paisContraparte?: string | null
  hash?: string | null
}

export type GravedadAlerta = 'informativa' | 'media' | 'alta' | 'critica'

export interface Alerta {
  regla: string
  gravedad: GravedadAlerta
  titulo: string
  detalle: string
  /** Movimientos que la dispararon. */
  movimientos: string[]
  montoUsd: number
  /** Si la normativa obliga a reportarla al organismo supervisor. */
  reportable: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Parámetros
// ─────────────────────────────────────────────────────────────────────────────

/** Umbral de reporte por operación única. */
const UMBRAL_UNICO = Number(process.env.GENESIS_UMBRAL_USD || 10000)
/** Umbral acumulado dentro de la ventana. */
const UMBRAL_ACUMULADO = Number(process.env.GENESIS_UMBRAL_ACUM_USD || 10000)
/** Ventana de acumulación, en días. */
const VENTANA_DIAS = Number(process.env.GENESIS_VENTANA_DIAS || 30)
/** Franja bajo el umbral donde se busca fraccionamiento. */
const FRANJA_ESTRUCTURACION = 0.75
/** Cuántas operaciones en esa franja hacen sospechar. */
const MIN_ESTRUCTURACION = 3
/** Ventana corta para velocidad, en horas. */
const VENTANA_VELOCIDAD_H = 24
/** Operaciones en esa ventana que se consideran anómalas. */
const MAX_VELOCIDAD = Number(process.env.GENESIS_MAX_OPS_DIA || 15)

const horas = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3600000
const dias = (a: string, b: string) => horas(a, b) / 24
const usd = (n: number) => `USD ${n.toLocaleString('es', { maximumFractionDigits: 2 })}`

/**
 * Evalúa un conjunto de movimientos de una misma identidad.
 *
 * @param movimientos  historial, en cualquier orden
 * @param referencia   momento desde el que se miran las ventanas (por defecto, ahora)
 */
export function evaluarMovimientos(movimientos: Movimiento[], referencia = new Date()): Alerta[] {
  const alertas: Alerta[] = []
  if (!movimientos.length) return alertas

  const orden = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ref = referencia.toISOString()
  const enVentana = orden.filter((m) => dias(m.fecha, ref) <= VENTANA_DIAS)

  // ── 1. Operación única sobre el umbral ────────────────────────────────────
  for (const m of orden) {
    if (m.montoUsd >= UMBRAL_UNICO) {
      alertas.push({
        regla: 'umbral.unico',
        gravedad: 'alta',
        titulo: `Operación única de ${usd(m.montoUsd)}`,
        detalle:
          `Una sola operación de ${usd(m.montoUsd)} (${m.monto} ${m.activo}) supera el umbral de ` +
          `reporte de ${usd(UMBRAL_UNICO)}. Debe documentarse el origen de los fondos.`,
        movimientos: [m.id],
        montoUsd: m.montoUsd,
        reportable: true,
      })
    }
  }

  // ── 2. Acumulado en la ventana ────────────────────────────────────────────
  for (const sentido of ['entrada', 'salida'] as const) {
    const grupo = enVentana.filter((m) => m.direccion === sentido)
    const total = grupo.reduce((s, m) => s + m.montoUsd, 0)
    if (total >= UMBRAL_ACUMULADO && grupo.length > 1) {
      alertas.push({
        regla: 'umbral.acumulado',
        gravedad: 'media',
        titulo: `${usd(total)} acumulados de ${sentido} en ${VENTANA_DIAS} días`,
        detalle:
          `${grupo.length} operaciones de ${sentido} suman ${usd(total)} en la ventana de ` +
          `${VENTANA_DIAS} días, por encima del umbral acumulado de ${usd(UMBRAL_ACUMULADO)}.`,
        movimientos: grupo.map((m) => m.id),
        montoUsd: total,
        reportable: true,
      })
    }
  }

  // ── 3. Estructuración ─────────────────────────────────────────────────────
  // Varias operaciones justo por debajo del umbral es el patrón clásico de
  // fraccionamiento para no disparar el reporte. Que sean pocas y espaciadas es
  // normal; que sean varias y seguidas, no.
  const franja = enVentana.filter(
    (m) => m.montoUsd >= UMBRAL_UNICO * FRANJA_ESTRUCTURACION && m.montoUsd < UMBRAL_UNICO,
  )
  if (franja.length >= MIN_ESTRUCTURACION) {
    const total = franja.reduce((s, m) => s + m.montoUsd, 0)
    alertas.push({
      regla: 'estructuracion',
      gravedad: 'critica',
      titulo: `Posible fraccionamiento: ${franja.length} operaciones justo bajo el umbral`,
      detalle:
        `${franja.length} operaciones entre ${usd(UMBRAL_UNICO * FRANJA_ESTRUCTURACION)} y ` +
        `${usd(UMBRAL_UNICO)} suman ${usd(total)}. Quedarse sistemáticamente por debajo del ` +
        `umbral de reporte es el patrón habitual del fraccionamiento deliberado.`,
      movimientos: franja.map((m) => m.id),
      montoUsd: total,
      reportable: true,
    })
  }

  // ── 4. Velocidad ──────────────────────────────────────────────────────────
  const recientes = orden.filter((m) => horas(m.fecha, ref) <= VENTANA_VELOCIDAD_H)
  if (recientes.length > MAX_VELOCIDAD) {
    alertas.push({
      regla: 'velocidad',
      gravedad: 'media',
      titulo: `${recientes.length} operaciones en ${VENTANA_VELOCIDAD_H} horas`,
      detalle:
        `Se registraron ${recientes.length} operaciones en ${VENTANA_VELOCIDAD_H} horas, por encima ` +
        `de las ${MAX_VELOCIDAD} esperadas. Puede indicar automatización o uso de la cuenta por terceros.`,
      movimientos: recientes.map((m) => m.id),
      montoUsd: recientes.reduce((s, m) => s + m.montoUsd, 0),
      reportable: false,
    })
  }

  // ── 5. Contraparte sancionada ─────────────────────────────────────────────
  for (const m of orden) {
    const t = tamizarDireccion(m.contraparte)
    if (t.sancionada && t.registro) {
      alertas.push({
        regla: 'contraparte.sancionada',
        gravedad: 'critica',
        titulo: `Contraparte en lista de sanciones: ${t.registro.nombre}`,
        detalle:
          `La dirección ${m.contraparte} figura en ${t.registro.lista} ` +
          `(programa ${t.registro.programa}). Debe congelarse la operación y reportarse de inmediato.`,
        movimientos: [m.id],
        montoUsd: m.montoUsd,
        reportable: true,
      })
    }
  }

  // ── 6. Jurisdicción de riesgo ─────────────────────────────────────────────
  const porPais = new Map<string, Movimiento[]>()
  for (const m of orden) {
    if (!m.paisContraparte) continue
    const nivel = nivelPais(m.paisContraparte)
    if (nivel === 'prohibido' || nivel === 'alto') {
      const lista = porPais.get(m.paisContraparte) || []
      lista.push(m)
      porPais.set(m.paisContraparte, lista)
    }
  }
  for (const [pais, grupo] of porPais) {
    const total = grupo.reduce((s, m) => s + m.montoUsd, 0)
    alertas.push({
      regla: 'jurisdiccion',
      gravedad: nivelPais(pais) === 'prohibido' ? 'critica' : 'alta',
      titulo: `Operaciones con ${nombrePais(pais)}`,
      detalle:
        `${grupo.length} operación(es) por ${usd(total)} con contraparte en ${nombrePais(pais)}, ` +
        `jurisdicción de riesgo ${nivelPais(pais)}.`,
      movimientos: grupo.map((m) => m.id),
      montoUsd: total,
      reportable: nivelPais(pais) === 'prohibido',
    })
  }

  // ── 7. Cuenta de paso ─────────────────────────────────────────────────────
  // Dinero que entra y sale casi entero en pocas horas. Una cuenta que solo
  // sirve de tránsito es el uso más común de las "mulas".
  for (const entrada of orden.filter((m) => m.direccion === 'entrada')) {
    const salidas = orden.filter(
      (m) => m.direccion === 'salida' &&
        m.fecha > entrada.fecha &&
        horas(m.fecha, entrada.fecha) <= 48,
    )
    const sacado = salidas.reduce((s, m) => s + m.montoUsd, 0)
    if (entrada.montoUsd >= 1000 && sacado >= entrada.montoUsd * 0.9) {
      alertas.push({
        regla: 'cuenta.paso',
        gravedad: 'alta',
        titulo: `Entrada de ${usd(entrada.montoUsd)} retirada casi entera en 48 h`,
        detalle:
          `Entraron ${usd(entrada.montoUsd)} y salieron ${usd(sacado)} en las 48 horas siguientes ` +
          `(${(sacado / entrada.montoUsd * 100).toFixed(0)} %). Es el patrón de una cuenta usada solo de tránsito.`,
        movimientos: [entrada.id, ...salidas.map((m) => m.id)],
        montoUsd: entrada.montoUsd,
        reportable: true,
      })
    }
  }

  // ── 8. Cuenta nueva con volumen alto ──────────────────────────────────────
  const primera = orden[0]
  if (primera && dias(primera.fecha, ref) <= 7) {
    const total = orden.reduce((s, m) => s + m.montoUsd, 0)
    if (total >= UMBRAL_UNICO / 2) {
      alertas.push({
        regla: 'cuenta.nueva',
        gravedad: 'media',
        titulo: `Cuenta de menos de 7 días con ${usd(total)} movidos`,
        detalle:
          `La primera operación fue hace ${dias(primera.fecha, ref).toFixed(1)} días y ya acumula ` +
          `${usd(total)}. Conviene confirmar el origen de los fondos y el motivo de la actividad.`,
        movimientos: orden.map((m) => m.id),
        montoUsd: total,
        reportable: false,
      })
    }
  }

  return alertas
}

/** Deduplica: si una regla ya alertó por los mismos movimientos, no se repite. */
export function consolidar(alertas: Alerta[]): Alerta[] {
  const vistas = new Set<string>()
  const salida: Alerta[] = []
  for (const a of alertas) {
    const clave = `${a.regla}|${[...a.movimientos].sort().join(',')}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    salida.push(a)
  }
  const orden: Record<GravedadAlerta, number> = { critica: 0, alta: 1, media: 2, informativa: 3 }
  return salida.sort((a, b) => orden[a.gravedad] - orden[b.gravedad] || b.montoUsd - a.montoUsd)
}
