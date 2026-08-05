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
import { parecidoNombres, normalizar, fichas } from '../lib/texto.js'
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
  /** Qué se pudo confirmar con el anverso, si se aportó. */
  anverso: { aportado: boolean; nombreConfirmado: boolean | null; fechaConfirmada: boolean | null }
}

/**
 * Comprueba el nombre y la fecha declarados contra el TEXTO DEL ANVERSO.
 *
 * POR QUE HACE FALTA EL ANVERSO
 *
 * La zona de lectura mecánica tiene ancho fijo y CORTA los nombres largos: en
 * una cédula hondureña real, «JOSE» sale impreso «JOS». Con solo el reverso no
 * hay forma de saber si el nombre está cortado o si de verdad no coincide, y
 * cualquiera de las dos respuestas es mala: bloquear a quien no debe, o dejar
 * pasar una discrepancia real.
 *
 * El anverso lleva el nombre entero, sin recortes. Cotejarlo contra él es lo
 * que hace el resto del sector y lo que pide la mayoría de los reguladores:
 * identificar con documentos de una fuente fiable e independiente, no con un
 * campo truncado por una limitación de formato.
 *
 * Se compara sobre el TEXTO reconocido, no sobre una foto: la imagen se
 * procesa en el teléfono y aquí solo llegan las palabras.
 */
function cotejarAnverso(
  texto: string,
  declarado: { nombreCompleto?: string | null; fechaNacimiento?: string | null },
): { nombre: boolean | null; fecha: boolean | null; detalle: string } {
  const plano = normalizar(texto)
  if (!plano) return { nombre: null, fecha: null, detalle: 'El anverso no traía texto legible' }

  let nombre: boolean | null = null
  let halladas = 0
  let partes: string[] = []
  if (declarado.nombreCompleto) {
    // Se piden tres letras o más para no contar partículas ni iniciales.
    partes = fichas(declarado.nombreCompleto).filter((f) => f.length >= 3)
    // Se acepta que una palabra aparezca cortada o con una letra mal leída: el
    // anverso está impreso sobre una filigrana de colores y el reconocimiento
    // se equivoca a menudo. Basta con que el principio coincida.
    halladas = partes.filter((f) => plano.includes(f) || plano.includes(f.slice(0, Math.max(4, f.length - 2)))).length
    // Confirmado si aparecen TODAS. Con la mayoría no se afirma nada: ni que
    // coincide ni que no, porque una lectura incompleta no dice nada de nadie.
    nombre = partes.length > 0 && halladas === partes.length
  }

  let fecha: boolean | null = null
  if (declarado.fechaNacimiento) {
    const [a, m, d] = declarado.fechaNacimiento.split('-')
    // Las cédulas escriben la fecha de muchas formas; se busca cualquiera de
    // las habituales, con y sin ceros delante.
    const formas = [
      `${d}${m}${a}`, `${d} ${m} ${a}`, `${a}${m}${d}`,
      `${Number(d)} ${Number(m)} ${a}`, `${d}${m}${a.slice(2)}`,
    ]
    const sinSeparadores = plano.replace(/ /g, '')
    fecha = formas.some((f) => plano.includes(f) || sinSeparadores.includes(f.replace(/ /g, '')))
  }

  const notas: string[] = []
  notas.push(nombre === null ? 'sin nombre declarado que cotejar'
    : nombre ? 'el nombre declarado aparece impreso en el anverso'
    : `solo se reconocieron ${halladas} de ${partes.length} palabras del nombre en el anverso`)
  if (fecha !== null) {
    notas.push(fecha ? 'la fecha de nacimiento también' : 'la fecha de nacimiento no se encontró')
  }
  return { nombre, fecha, detalle: notas.join('; ') }
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
  textoAnverso?: string | null,
): RevisionDocumento {
  const hallazgos: Hallazgo[] = []
  const lectura = leerMrz(textoMrz)

  if (!lectura.datos) {
    hallazgos.push({
      clave: 'mrz.ilegible',
      gravedad: 'grave',
      detalle: lectura.motivo || 'No se pudo leer la MRZ',
    })
    return {
      aceptable: false, datos: null, hallazgos, edad: null,
      anverso: { aportado: Boolean(textoAnverso), nombreConfirmado: null, fechaConfirmada: null },
    }
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

  // 7. El anverso, si se aportó.
  //
  // Es lo que resuelve el nombre cortado por el ancho de la MRZ: cuando el
  // reverso trae «JOS» y el anverso dice «JOSE», la persona no tiene ninguna
  // discrepancia y esto lo demuestra. También lo contrario: si el nombre
  // declarado NO está impreso en el documento, eso es grave y hasta ahora no
  // se podía ver.
  let anverso = { aportado: false, nombreConfirmado: null as boolean | null, fechaConfirmada: null as boolean | null }
  if (textoAnverso && textoAnverso.trim()) {
    const c = cotejarAnverso(textoAnverso, declarado)
    anverso = { aportado: true, nombreConfirmado: c.nombre, fechaConfirmada: c.fecha }

    if (c.nombre === false) {
      // AVISO, NO BLOQUEO. Y es una corrección de un error propio.
      //
      // El anverso de una cédula está impreso sobre una filigrana de colores,
      // con reflejos y a menudo fotografiado de lado. Que el reconocimiento no
      // encuentre una palabra NO es prueba de que no esté: es una lectura
      // fallida, y no dice absolutamente nada sobre la persona.
      //
      // Tratarlo como grave bloqueaba verificaciones legítimas —pasó con una
      // cédula hondureña cuyo anverso decía el nombre entero, bien claro— y
      // encima con un mensaje que sonaba a acusación. El cotejo que sí puede
      // afirmar algo es el de la MRZ, que lleva dígitos de control.
      hallazgos.push({
        clave: 'anverso.nombreNoLegible',
        gravedad: 'aviso',
        detalle: `En el anverso ${c.detalle}. No se pudo confirmar por ahí; ` +
          'el cotejo válido es el de la MRZ del reverso.',
      })
    } else if (c.nombre === true) {
      hallazgos.push({ clave: 'anverso.nombre', gravedad: 'ok', detalle: c.detalle })
      // El anverso manda sobre el recorte de la MRZ: si el nombre entero está
      // impreso ahí, la diferencia del reverso era el ancho del campo y no una
      // discrepancia. Se retira el hallazgo grave que lo bloqueaba.
      const i = hallazgos.findIndex((h) => h.clave === 'documento.nombreNoCoincide')
      if (i >= 0) {
        hallazgos[i] = {
          clave: 'documento.nombreCortado',
          gravedad: 'aviso',
          detalle: `El nombre del reverso viene cortado por el ancho de la MRZ ("${d.nombreCompleto}"), ` +
            'pero el anverso confirma el nombre declarado',
        }
      }
    }
    if (c.fecha === false) {
      hallazgos.push({
        clave: 'anverso.fecha',
        gravedad: 'aviso',
        detalle: 'La fecha de nacimiento declarada no se encontró en el anverso',
      })
    }
  } else {
    hallazgos.push({
      clave: 'anverso.falta',
      gravedad: 'aviso',
      detalle: 'No se aportó el anverso del documento: solo se pudo cotejar contra la MRZ',
    })
  }

  return {
    aceptable: !hallazgos.some((h) => h.gravedad === 'grave'),
    datos: d,
    hallazgos,
    edad,
    anverso,
  }
}
