// La lectura del FRENTE del documento, hecha por el servidor.
//
// POR QUÉ EXISTE ESTE MÓDULO
//
// El documento entra a Genesis ID por dos caminos, y hasta hoy solo uno leía
// algo. Por el teléfono, la app lee la zona mecánica y el texto del anverso
// con ML Kit y aquí se cotejan. Por el NAVEGADOR no hay lector: llegaban dos
// fotografías y nadie —ni máquina ni nadie— leía el frente hasta que un
// operador abría el expediente días después. La regla de la casa es que el
// nombre se coteja SIEMPRE contra el frente, porque la zona mecánica corta los
// nombres largos; una vía entera que no lo hacía era la regla rota a la mitad.
//
// Ahora el servidor mira la fotografía del frente con dos ojos:
//
//   DetectText   — qué dice el impreso, para cotejar el nombre y la fecha
//                  declarados con la misma tolerancia a errores de OCR que ya
//                  usa la vía del teléfono (`cotejarAnverso`).
//   DetectFaces  — si se distingue la foto del titular. Un frente sin rostro
//                  es casi siempre una foto del reverso repetida, borrosa o
//                  recortada, y decírselo a la persona EN EL MOMENTO le ahorra
//                  el rechazo días después.
//
// Lo que este módulo NO hace: decidir. La lectura produce hallazgos y un
// resumen; aprobar sigue siendo de una persona, y la vía sigue siendo `fotos`
// —una lectura automática del impreso no equivale a los dígitos de control de
// la zona mecánica, que llevan aritmética dentro.

import { detectarTexto, contarRostros, rekognitionConfigurado } from './rekognition.js'
import { cotejarAnverso } from './documento.js'

/** Cuánto texto del frente se conserva para el operador. */
const TOPE_TEXTO = 1200

export interface LecturaAnverso {
  /** Las líneas leídas, unidas. Vacío si no se pudo leer nada. */
  texto: string
  /** Rostros que se distinguen en el frente. En una cédula real es 1. */
  rostros: number | null
  /** El nombre declarado, ¿aparece impreso? null = no había nombre que cotejar o no hubo texto. */
  nombre: boolean | null
  /** La fecha de nacimiento declarada, ¿aparece impresa? */
  fecha: boolean | null
  /** Nota humana del cotejo, para el hallazgo. */
  detalle: string
}

export const lecturaAnversoDisponible = () => rekognitionConfigurado()

type Lector = (imagen: string) => Promise<{ lineas: string[]; rostros: number | null }>

/* El lector de verdad llama a AWS; las pruebas inyectan uno de mentira porque
   un test que necesita credenciales de Rekognition no es un test, es un gasto
   intermitente. Solo se usa desde `_fijarLectorParaPruebas`. */
let lector: Lector | null = null

export function _fijarLectorParaPruebas(falso: Lector | null): void {
  lector = falso
}

async function leerConAws(imagen: string): Promise<{ lineas: string[]; rostros: number | null }> {
  // Las dos miradas van en paralelo y cada una cae por su lado: si el texto
  // llega pero el contador de rostros tropieza, la lectura del nombre vale
  // igual — y al revés también.
  const [lineas, rostros] = await Promise.all([
    detectarTexto(imagen, 'el frente del documento').catch(() => [] as string[]),
    contarRostros(imagen, 'el frente del documento').catch(() => null),
  ])
  return { lineas, rostros }
}

/**
 * Lee el frente y coteja lo declarado contra lo impreso.
 *
 * Nunca lanza: una verificación no se cae porque AWS tosa. Si no se pudo leer
 * nada, lo dice el resultado (`texto` vacío, `nombre` null) y el expediente
 * queda como estaba: esperando a un operador.
 */
export async function leerAnverso(
  imagen: string,
  declarado: { nombreCompleto?: string | null; fechaNacimiento?: string | null },
): Promise<LecturaAnverso | null> {
  if (!lector && !lecturaAnversoDisponible()) return null
  try {
    const { lineas, rostros } = await (lector || leerConAws)(imagen)
    const texto = lineas.join('\n').slice(0, TOPE_TEXTO)
    const cotejo = cotejarAnverso(texto, declarado)
    return { texto, rostros, ...cotejo }
  } catch (e: any) {
    console.error('[textoDocumento] no se pudo leer el frente:', e?.message)
    return null
  }
}
