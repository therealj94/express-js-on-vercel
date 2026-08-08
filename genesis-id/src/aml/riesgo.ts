// Puntuación de riesgo y recomendación.
//
// Junta todo lo que se sabe de una identidad —documento, tamizado, país,
// biometría— y produce dos cosas: un nivel de riesgo, y una recomendación.
//
// RECOMENDACION, no decisión. La diferencia importa:
//
//   - El motor puede decir "rechazar" y "revisión", pero NUNCA aprueba solo.
//   - Toda aprobación la firma un operador identificado, y queda en bitácora.
//
// Esto no es prudencia excesiva. Un sistema que aprueba solo es un sistema que,
// el día que alguien encuentre cómo engañar una de estas comprobaciones, emite
// identidades verificadas en masa sin que nadie mire. Con revisión humana, el
// mismo fallo produce una cola de casos raros que alguien nota.

import type { Hallazgo, RevisionDocumento } from '../kyc/documento.js'
import type { ResultadoTamiz } from './tamiz.js'
import { nivelPais, motivoPais, listasVencidas, fechaListasGafi } from './paises.js'
import type { ResultadoBiometria } from '../kyc/biometria.js'

export type NivelRiesgo = 'bajo' | 'medio' | 'alto' | 'inaceptable'
export type Recomendacion = 'aprobar' | 'revision' | 'rechazar'

export interface FactorRiesgo {
  clave: string
  puntos: number
  detalle: string
}

export interface EvaluacionRiesgo {
  puntuacion: number
  nivel: NivelRiesgo
  recomendacion: Recomendacion
  factores: FactorRiesgo[]
  /** Motivos que IMPIDEN aprobar, pase lo que pase con la puntuación. */
  bloqueos: string[]
  evaluadoEn: string
}

export interface EntradaRiesgo {
  documento?: RevisionDocumento | null
  tamiz?: ResultadoTamiz | null
  biometria?: ResultadoBiometria | null
  pais?: string | null
  /** Marcada a mano por el equipo de cumplimiento. */
  pep?: boolean
  /** Actividad declarada del negocio, si aplica. */
  actividadRiesgo?: 'alta' | 'media' | 'baja' | null
  /** Qué falta del perfil de cumplimiento de una persona. */
  faltanDatos?: string[]
  /** Cuánto declaró que espera mover al año, en USD. Decide el nivel de diligencia. */
  volumenEsperadoUsd?: number | null
}

/**
 * Umbral que separa la diligencia simplificada de la completa. Es el mismo
 * umbral de reporte del monitoreo (GENESIS_UMBRAL_USD): por debajo de él, un
 * perfil de cumplimiento incompleto no bloquea la verificación; por encima
 * —o sin declarar— sí.
 */
export const UMBRAL_DILIGENCIA_USD = Number(process.env.GENESIS_UMBRAL_USD || 10000)

/** Actividades que la normativa considera de mayor riesgo. */
export const ACTIVIDADES_ALTO_RIESGO = [
  'casas de cambio', 'casinos y juegos de azar', 'metales y piedras preciosas',
  'armas', 'inmobiliaria', 'criptoactivos', 'remesas', 'ONG y fundaciones',
  'transporte de valores', 'tabaco y alcohol al por mayor',
]

export function evaluarRiesgo(e: EntradaRiesgo): EvaluacionRiesgo {
  const factores: FactorRiesgo[] = []
  const bloqueos: string[] = []
  const sumar = (clave: string, puntos: number, detalle: string) =>
    factores.push({ clave, puntos, detalle })

  // ── Documento ──────────────────────────────────────────────────────────────
  if (!e.documento) {
    bloqueos.push('No se ha revisado ningún documento de identidad')
  } else {
    const graves = e.documento.hallazgos.filter((h: Hallazgo) => h.gravedad === 'grave')
    const avisos = e.documento.hallazgos.filter((h: Hallazgo) => h.gravedad === 'aviso')
    for (const g of graves) bloqueos.push(g.detalle)
    if (avisos.length) sumar('documento.avisos', avisos.length * 5, `${avisos.length} aviso(s) en el documento`)
    if (!graves.length) sumar('documento.ok', 0, 'El documento pasa todas las comprobaciones')
  }

  // ── Tamizado de sanciones ─────────────────────────────────────────────────
  if (!e.tamiz) {
    bloqueos.push('No se ha tamizado contra listas de sanciones')
  } else if (!e.tamiz.tamizado) {
    // Esto es lo que evita el falso verde: sin listas no hay "limpio".
    bloqueos.push(
      'No hay listas de sanciones cargadas: la identidad NO ha sido tamizada. ' +
      'Cargue las listas (GENESIS_LISTAS_DIR) antes de aprobar a nadie.',
    )
  } else {
    if (e.tamiz.fuertes > 0) {
      bloqueos.push(
        `${e.tamiz.fuertes} coincidencia(s) fuerte(s) en listas de sanciones — requiere resolución documentada`,
      )
      sumar('sanciones.fuerte', 60, `Coincidencia fuerte: ${e.tamiz.coincidencias[0]?.registro.nombre}`)
    }
    if (e.tamiz.posibles > 0) {
      sumar('sanciones.posible', e.tamiz.posibles * 15, `${e.tamiz.posibles} coincidencia(s) posible(s)`)
    }
    if (!e.tamiz.fuertes && !e.tamiz.posibles) {
      sumar('sanciones.limpio', 0, `Sin coincidencias (${e.tamiz.estadoListas.registros} registros consultados)`)
    }
    if (e.tamiz.estadoListas.vencidas) {
      sumar('sanciones.desactualizadas', 10,
        `Las listas se descargaron hace ${e.tamiz.estadoListas.diasDesdeDescarga} días`)
    }
  }

  // ── Perfil de cumplimiento ────────────────────────────────────────────────
  //
  // De qué vive alguien y cuánto espera mover no es papeleo: es lo único
  // contra lo que se puede comparar un movimiento cuando salte una alerta.
  // Sin eso, «recibió 40 000 dólares» no significa nada — parece normal o
  // parece grave según quién lo mire, y ninguna de las dos es una decisión.
  //
  // PERO LA DILIGENCIA ES PROPORCIONAL AL RIESGO, y el volumen ES el riesgo.
  // Exigirle ocupación y origen de fondos a quien declara mover 300 dólares
  // al año es el enfoque que la normativa misma descarta (debida diligencia
  // simplificada). Por debajo del umbral de reporte, el perfil incompleto
  // cuenta como factor, no como bloqueo. La trampa obvia —declarar poco y
  // mover mucho— la cubre el monitoreo: cualquier movimiento real que cruce
  // el umbral abre un caso que exige documentar el origen de los fondos.
  const ESENCIALES = ['ocupacion', 'origenFondos']
  const faltanEsenciales = (e.faltanDatos ?? []).filter((d) => ESENCIALES.includes(d))
  const volumen = e.volumenEsperadoUsd
  const bajoUmbral = typeof volumen === 'number' && Number.isFinite(volumen) &&
    volumen >= 0 && volumen < UMBRAL_DILIGENCIA_USD
  if (faltanEsenciales.length) {
    if (bajoUmbral) {
      sumar('perfil.simplificado', 8,
        `Diligencia simplificada: declara mover ${Math.round(volumen!)} USD al año ` +
        `(bajo el umbral de ${UMBRAL_DILIGENCIA_USD}) y no aportó ${faltanEsenciales.join(', ')}. ` +
        'Si sus movimientos reales cruzan el umbral, el monitoreo abre caso y se exige el perfil completo.')
    } else {
      bloqueos.push(
        `Faltan datos del perfil de cumplimiento: ${faltanEsenciales.join(', ')}. ` +
        (typeof volumen === 'number' && Number.isFinite(volumen)
          ? `Declara mover ${Math.round(volumen)} USD al año, sobre el umbral de ${UMBRAL_DILIGENCIA_USD}: `
          : 'No declaró cuánto espera mover: ') +
        'sin ocupación ni origen de fondos no hay con qué contrastar los movimientos.')
    }
  }
  const otrosFaltan = (e.faltanDatos ?? []).filter((d) => !ESENCIALES.includes(d))
  if (otrosFaltan.length) sumar('perfil.incompleto', 5, `Sin ${otrosFaltan.join(', ')} en el expediente`)

  // ── Biometría ─────────────────────────────────────────────────────────────
  if (!e.biometria || e.biometria.estado === 'no-configurada') {
    bloqueos.push(
      'Sin proveedor de biometría configurado: no se ha comprobado que la persona sea la del documento. ' +
      'La aprobación exige revisión manual del cotejo.',
    )
  } else if (e.biometria.estado === 'fallida') {
    bloqueos.push(`La biometría falló: ${e.biometria.motivo ?? 'sin detalle'}`)
  } else if (e.biometria.estado === 'dudosa') {
    sumar('biometria.dudosa', 30, `Cotejo dudoso (${(e.biometria.parecido ?? 0).toFixed(2)})`)
  } else if (e.biometria.estado === 'ok') {
    sumar('biometria.ok', 0, `Cotejo y prueba de vida correctos (${(e.biometria.parecido ?? 0).toFixed(2)})`)
  }

  // ── País ──────────────────────────────────────────────────────────────────
  const pais = e.pais || e.documento?.datos?.nacionalidad || null
  if (pais) {
    const nivel = nivelPais(pais)
    const motivo = motivoPais(pais)
    if (nivel === 'prohibido') {
      bloqueos.push(motivo || `${pais} es una jurisdicción prohibida`)
      sumar('pais.prohibido', 100, motivo || pais)
    } else if (nivel === 'alto') {
      sumar('pais.alto', 25, motivo || `${pais} es jurisdicción de alto riesgo`)
    } else if (nivel === 'medio') {
      sumar('pais.desconocido', 10, motivo || `País no reconocido: ${pais}`)
    }
    if (listasVencidas()) {
      sumar('pais.listasViejas', 5,
        `Las listas del GAFI son de la plenaria del ${fechaListasGafi()}`)
    }
  }

  // ── PEP ───────────────────────────────────────────────────────────────────
  if (e.pep) {
    sumar('pep', 35, 'Persona expuesta políticamente: exige diligencia reforzada y aprobación de nivel superior')
  }

  // ── Actividad ─────────────────────────────────────────────────────────────
  if (e.actividadRiesgo === 'alta') sumar('actividad.alta', 20, 'Actividad económica de alto riesgo')
  else if (e.actividadRiesgo === 'media') sumar('actividad.media', 8, 'Actividad económica de riesgo medio')

  // ── Total ─────────────────────────────────────────────────────────────────
  const puntuacion = Math.min(100, factores.reduce((s, f) => s + f.puntos, 0))
  const nivel: NivelRiesgo =
    bloqueos.some((b) => /prohibida|sanciones integrales|llamamiento a la acción/i.test(b)) ? 'inaceptable'
      : puntuacion >= 60 ? 'alto'
      : puntuacion >= 25 ? 'medio'
      : 'bajo'

  // La recomendación nunca es "aprobar" si hay bloqueos. Y "aprobar" es solo
  // una sugerencia: la ruta de aprobación exige igualmente un operador.
  const recomendacion: Recomendacion =
    nivel === 'inaceptable' ? 'rechazar'
      : bloqueos.length ? 'revision'
      : nivel === 'alto' ? 'revision'
      : 'aprobar'

  return {
    puntuacion,
    nivel,
    recomendacion,
    factores,
    bloqueos,
    evaluadoEn: new Date().toISOString(),
  }
}
