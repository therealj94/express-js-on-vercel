// Reglas de aceptación de un documento de identidad.
//
// La MRZ ya dijo si el documento está bien formado. Aquí se decide si además
// es ACEPTABLE: que no esté vencido, que la persona tenga la edad mínima, que
// el país exista, y que el nombre que declaró el usuario sea el mismo que
// aparece en el documento.
//
// Cada comprobación devuelve un hallazgo con su gravedad. Ninguna decide sola:
// el conjunto va al motor de riesgo, y la decisión final la firma una persona.

import { leerMrz, type DatosMrz } from './mrz.js'
import { parecidoNombres } from '../lib/texto.js'
import { ISO3, nombrePais } from '../aml/paises.js'

export type Gravedad = 'ok' | 'aviso' | 'grave'

export interface Hallazgo {
  clave: string
  gravedad: Gravedad
  detalle: string
}

export interface RevisionDocumento {
  /** `false` si hay algún hallazgo grave: el documento no sirve. */
  aceptable: boolean
  datos: DatosMrz | null
  hallazgos: Hallazgo[]
  edad: number | null
}

/** Edad mínima. Se puede subir por país si la regulación lo pide. */
export const EDAD_MINIMA = Number(process.env.GENESIS_EDAD_MINIMA || 18)

/** Cuántos meses de vigencia se exigen por delante. */
const MESES_VIGENCIA_MINIMA = Number(process.env.GENESIS_MESES_VIGENCIA || 0)

/** Parecido mínimo entre el nombre declarado y el del documento. */
const PARECIDO_MINIMO = 0.85

export function edadEn(fechaNacimiento: string, referencia = new Date()): number {
  const n = new Date(fechaNacimiento + 'T00:00:00Z')
  let edad = referencia.getUTCFullYear() - n.getUTCFullYear()
  const mes = referencia.getUTCMonth() - n.getUTCMonth()
  if (mes < 0 || (mes === 0 && referencia.getUTCDate() < n.getUTCDate())) edad--
  return edad
}

/**
 * Revisa un documento a partir de su MRZ.
 *
 * @param textoMrz   las líneas de la MRZ tal como se leyeron del documento
 * @param declarado  lo que el usuario dijo de sí mismo, para contrastarlo
 */
export function revisarDocumento(
  textoMrz: string,
  declarado: { nombreCompleto?: string | null; fechaNacimiento?: string | null } = {},
): RevisionDocumento {
  const hallazgos: Hallazgo[] = []
  const lectura = leerMrz(textoMrz)

  if (!lectura.datos) {
    hallazgos.push({
      clave: 'mrz.ilegible',
      gravedad: 'grave',
      detalle: lectura.motivo || 'No se pudo leer la MRZ',
    })
    return { aceptable: false, datos: null, hallazgos, edad: null }
  }

  const d = lectura.datos

  // 1. Integridad aritmética de la propia MRZ.
  if (!lectura.ok) {
    hallazgos.push({
      clave: 'mrz.digitos',
      gravedad: 'grave',
      detalle: `No cuadran los dígitos de control (${lectura.fallos.join(', ')}). El documento está alterado o mal transcrito.`,
    })
  } else {
    hallazgos.push({ clave: 'mrz.digitos', gravedad: 'ok', detalle: 'Todos los dígitos de control cuadran' })
  }

  // 2. Vigencia.
  if (!d.fechaVencimiento) {
    hallazgos.push({ clave: 'documento.vencimiento', gravedad: 'grave', detalle: 'Fecha de vencimiento ilegible' })
  } else {
    const vence = new Date(d.fechaVencimiento + 'T23:59:59Z')
    const ahora = new Date()
    if (vence < ahora) {
      hallazgos.push({
        clave: 'documento.vencido',
        gravedad: 'grave',
        detalle: `El documento venció el ${d.fechaVencimiento}`,
      })
    } else {
      const minimo = new Date(ahora)
      minimo.setUTCMonth(minimo.getUTCMonth() + MESES_VIGENCIA_MINIMA)
      if (MESES_VIGENCIA_MINIMA > 0 && vence < minimo) {
        hallazgos.push({
          clave: 'documento.porVencer',
          gravedad: 'aviso',
          detalle: `Vence el ${d.fechaVencimiento}, antes de los ${MESES_VIGENCIA_MINIMA} meses exigidos`,
        })
      } else {
        hallazgos.push({ clave: 'documento.vencimiento', gravedad: 'ok', detalle: `Vigente hasta ${d.fechaVencimiento}` })
      }
    }
  }

  // 3. Edad.
  let edad: number | null = null
  if (!d.fechaNacimiento) {
    hallazgos.push({ clave: 'documento.nacimiento', gravedad: 'grave', detalle: 'Fecha de nacimiento ilegible' })
  } else {
    edad = edadEn(d.fechaNacimiento)
    if (edad < EDAD_MINIMA) {
      hallazgos.push({
        clave: 'documento.menorDeEdad',
        gravedad: 'grave',
        detalle: `La persona tiene ${edad} años y el mínimo son ${EDAD_MINIMA}`,
      })
    } else if (edad > 120) {
      hallazgos.push({
        clave: 'documento.edadImposible',
        gravedad: 'grave',
        detalle: `La fecha de nacimiento da ${edad} años`,
      })
    } else {
      hallazgos.push({ clave: 'documento.edad', gravedad: 'ok', detalle: `${edad} años` })
    }
  }

  // 4. País emisor y nacionalidad.
  for (const [clave, codigo] of [['emisor', d.paisEmisor], ['nacionalidad', d.nacionalidad]] as const) {
    if (!codigo) {
      hallazgos.push({ clave: `documento.${clave}`, gravedad: 'aviso', detalle: `Sin código de ${clave}` })
    } else if (!ISO3.has(codigo)) {
      // `UTO` (Utopía) es el país de ejemplo del estándar; sale en toda la
      // documentación y conviene nombrarlo para que nadie lo tome por real.
      const nota = codigo === 'UTO' ? ' (es el país ficticio de los ejemplos del estándar ICAO)' : ''
      hallazgos.push({
        clave: `documento.${clave}Desconocido`,
        gravedad: 'aviso',
        detalle: `Código de ${clave} no reconocido: ${codigo}${nota}`,
      })
    } else {
      hallazgos.push({ clave: `documento.${clave}`, gravedad: 'ok', detalle: nombrePais(codigo) })
    }
  }

  // 5. El nombre declarado contra el del documento.
  if (declarado.nombreCompleto) {
    const parecido = parecidoNombres(declarado.nombreCompleto, d.nombreCompleto)
    if (parecido < PARECIDO_MINIMO) {
      hallazgos.push({
        clave: 'documento.nombreNoCoincide',
        gravedad: 'grave',
        detalle: `El nombre declarado ("${declarado.nombreCompleto}") no coincide con el del documento ("${d.nombreCompleto}") — parecido ${(parecido * 100).toFixed(0)} %`,
      })
    } else if (parecido < 0.97) {
      hallazgos.push({
        clave: 'documento.nombreParecido',
        gravedad: 'aviso',
        detalle: `El nombre coincide con diferencias menores (${(parecido * 100).toFixed(0)} %)`,
      })
    } else {
      hallazgos.push({ clave: 'documento.nombre', gravedad: 'ok', detalle: 'El nombre coincide con el documento' })
    }
  }

  // 6. La fecha de nacimiento declarada contra la del documento.
  if (declarado.fechaNacimiento && d.fechaNacimiento && declarado.fechaNacimiento !== d.fechaNacimiento) {
    hallazgos.push({
      clave: 'documento.nacimientoNoCoincide',
      gravedad: 'grave',
      detalle: `Fecha de nacimiento declarada ${declarado.fechaNacimiento}, la del documento ${d.fechaNacimiento}`,
    })
  }

  return {
    aceptable: !hallazgos.some((h) => h.gravedad === 'grave'),
    datos: d,
    hallazgos,
    edad,
  }
}
