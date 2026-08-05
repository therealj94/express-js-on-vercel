// Tamizado contra listas de sanciones y PEP.
//
// La regla de oro de esta parte: el tamizado NUNCA aprueba ni rechaza a nadie.
// Solo produce coincidencias con su puntuación y su explicación. Quien decide
// es una persona con nombre y apellido, y esa decisión queda en la bitácora.
//
// Un tamizado automático que rechaza solo es un problema legal —se le niega el
// servicio a alguien por parecerse de nombre a un sancionado— y uno que aprueba
// solo es un problema regulatorio. Por eso aquí solo se informa.

import {
  candidatos,
  porDireccionCripto,
  hayListas,
  estadoListas,
  type RegistroSancion,
} from './listas.js'
import { parecidoNombres } from '../lib/texto.js'

export type FuerzaCoincidencia = 'fuerte' | 'posible' | 'debil'

export interface Coincidencia {
  registro: RegistroSancion
  puntuacion: number
  fuerza: FuerzaCoincidencia
  /** Por qué se considera coincidencia, en lenguaje llano. */
  razones: string[]
  /** Qué nombre de la ficha fue el que coincidió (puede ser un alias). */
  nombreCoincidente: string
}

export interface ResultadoTamiz {
  /** `false` cuando no hay listas cargadas: no es lo mismo que "limpio". */
  tamizado: boolean
  coincidencias: Coincidencia[]
  fuertes: number
  posibles: number
  estadoListas: ReturnType<typeof estadoListas>
}

/** A partir de aquí se considera coincidencia fuerte y hay que revisar sí o sí. */
const UMBRAL_FUERTE = 0.92
/** Por debajo de esto ni se muestra: sería ruido. */
const UMBRAL_MINIMO = 0.84

function fuerzaDe(p: number): FuerzaCoincidencia {
  if (p >= UMBRAL_FUERTE) return 'fuerte'
  if (p >= 0.88) return 'posible'
  return 'debil'
}

/** Compara solo el año: las listas suelen traer la fecha incompleta. */
function mismoAnio(a?: string | null, b?: string | null): boolean | null {
  if (!a || !b) return null
  return a.slice(0, 4) === b.slice(0, 4)
}

/**
 * Tamiza a una persona contra las listas cargadas.
 *
 * La fecha de nacimiento y la nacionalidad no se usan para encontrar
 * candidatos, sino para AJUSTAR la puntuación de los que ya salieron por
 * nombre. Es la diferencia entre un sistema usable y uno que ahoga al equipo:
 * "Juan García" nacido en 1990 no es el "Juan García" sancionado nacido en
 * 1965, y poder decirlo con datos baja los falsos positivos sin perder
 * cobertura.
 */
export function tamizarPersona(
  nombre: string,
  datos: { fechaNacimiento?: string | null; nacionalidades?: string[] } = {},
): ResultadoTamiz {
  const estado = estadoListas()
  if (!hayListas()) {
    return { tamizado: false, coincidencias: [], fuertes: 0, posibles: 0, estadoListas: estado }
  }

  const encontradas: Coincidencia[] = []

  for (const registro of candidatos(nombre)) {
    // Se prueba contra el nombre principal y contra cada alias; vale el mejor.
    let mejor = 0
    let cual = registro.nombre
    for (const candidato of [registro.nombre, ...(registro.alias || [])]) {
      const p = parecidoNombres(nombre, candidato)
      if (p > mejor) {
        mejor = p
        cual = candidato
      }
    }
    if (mejor < UMBRAL_MINIMO) continue

    const razones: string[] = [
      cual === registro.nombre
        ? `El nombre coincide al ${(mejor * 100).toFixed(0)} %`
        : `Coincide con el alias "${cual}" al ${(mejor * 100).toFixed(0)} %`,
    ]
    let puntuacion = mejor

    // Fecha de nacimiento: confirma o descarta con mucha fuerza.
    const anio = mismoAnio(datos.fechaNacimiento, registro.fechaNacimiento)
    if (anio === true) {
      puntuacion = Math.min(1, puntuacion + 0.08)
      razones.push(`Coincide también el año de nacimiento (${registro.fechaNacimiento?.slice(0, 4)})`)
    } else if (anio === false) {
      // Baja la puntuación, pero NO hasta hacerla desaparecer si el nombre
      // coincidía de lleno. Usar una fecha de nacimiento falsa es precisamente
      // una de las formas de esquivar el tamizado, así que una coincidencia
      // exacta de nombre tiene que seguir llegándole al analista aunque la
      // fecha no cuadre. Queda visible pero sin contar como fuerte, para que
      // se vea y a la vez no bloquee de forma automática.
      const conPenalizacion = puntuacion - 0.25
      puntuacion = mejor >= UMBRAL_FUERTE
        ? Math.max(UMBRAL_MINIMO, conPenalizacion)
        : Math.max(0, conPenalizacion)
      razones.push(
        `El año de nacimiento NO coincide (persona ${datos.fechaNacimiento?.slice(0, 4)}, ficha ${registro.fechaNacimiento?.slice(0, 4)}). ` +
        'Se mantiene a la vista porque el nombre coincide y una fecha falsa es una forma habitual de esquivar el tamizado.',
      )
    }

    // Nacionalidad: ayuda, pero pesa menos — la gente tiene varias y las listas
    // no siempre las registran bien.
    if (datos.nacionalidades?.length && registro.nacionalidades?.length) {
      const comun = datos.nacionalidades.some((n) => registro.nacionalidades!.includes(n))
      if (comun) {
        puntuacion = Math.min(1, puntuacion + 0.03)
        razones.push('Comparte nacionalidad con la ficha')
      }
    }

    if (puntuacion < UMBRAL_MINIMO) continue

    encontradas.push({
      registro,
      puntuacion: Number(puntuacion.toFixed(4)),
      fuerza: fuerzaDe(puntuacion),
      razones,
      nombreCoincidente: cual,
    })
  }

  encontradas.sort((a, b) => b.puntuacion - a.puntuacion)

  return {
    tamizado: true,
    coincidencias: encontradas,
    fuertes: encontradas.filter((c) => c.fuerza === 'fuerte').length,
    posibles: encontradas.filter((c) => c.fuerza === 'posible').length,
    estadoListas: estado,
  }
}

/** Igual que el de personas, pero para razones sociales. */
export function tamizarEntidad(razonSocial: string): ResultadoTamiz {
  return tamizarPersona(razonSocial)
}

/**
 * Comprueba una dirección de criptomoneda contra las direcciones sancionadas.
 *
 * Aquí no hay parecido que valga: o es exactamente la dirección o no lo es.
 * Este es el control más directo que tiene el ecosistema, porque se puede
 * aplicar a cada transacción de Veta Wallet antes de firmarla.
 */
export function tamizarDireccion(direccion: string): {
  tamizado: boolean
  sancionada: boolean
  registro: RegistroSancion | null
} {
  if (!hayListas()) return { tamizado: false, sancionada: false, registro: null }
  const registro = porDireccionCripto(direccion)
  return { tamizado: true, sancionada: Boolean(registro), registro }
}
