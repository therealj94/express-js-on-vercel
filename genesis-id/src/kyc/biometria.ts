// Biometría: cotejo del rostro contra la foto del documento, y prueba de vida.
//
// POR QUE ESTO ES UNA INTERFAZ Y NO UNA IMPLEMENTACION
//
// Cotejar rostros y detectar si hay una persona viva delante —y no una foto en
// una pantalla, una máscara o un vídeo generado— no es algo que se resuelva con
// unas líneas de código. Requiere modelos entrenados, y sobre todo requiere que
// alguien responda por su tasa de error, porque de eso depende que se le
// atribuya o no una identidad a una persona.
//
// Escribir aquí un cotejo casero sería peor que no tener nada: daría un número
// con pinta de científico que en realidad no distingue a nadie, y el equipo
// aprobaría identidades creyendo que hubo una comprobación.
//
// Así que esto define el hueco, y el motor se comporta con honestidad ante él:
//
//   SIN PROVEEDOR CONFIGURADO, NINGUNA IDENTIDAD SE APRUEBA SOLA.
//
// El estado queda en `no-configurada`, el motor de riesgo lo marca como bloqueo,
// y la identidad va a la cola de revisión manual para que una persona compare
// el selfie con la foto del documento y lo deje firmado en la bitácora.
//
// COMO SE ENCHUFA UN PROVEEDOR
//
// Hay dos vías, y el umbral y la decisión los aplica Genesis ID en las dos.
//
//   1. AWS Rekognition, incorporado. Con GENESIS_AWS_ACCESS_KEY_ID y su secreta
//      basta: el cotejo lo hace `CompareFaces` y la prueba de vida el reto de
//      `kyc/vivacidad.ts`. Es la vía por defecto del ecosistema porque la
//      infraestructura ya está en esa cuenta.
//
//   2. Un servicio externo, definiendo GENESIS_BIOMETRIA_URL (y su KEY). El
//      motor hace un POST con las dos imágenes y espera de vuelta:
//
//        { "parecido": 0.93, "vivacidad": 0.98, "ok": true }
//
//      Sirve para los proveedores comerciales del sector y para uno propio. Si
//      está definida, manda sobre Rekognition: es una decisión explícita.
//
// Un proveedor que devuelva `ok: true` con un parecido de 0,70 no aprueba nada:
// la política es de Genesis ID, no del proveedor.

import {
  compararRostros, contarRostros, rekognitionConfigurado, regionRekognition, ErrorRekognition,
} from './rekognition.js'
import type { PasoVivacidad } from './vivacidad.js'

export type EstadoBiometria = 'ok' | 'dudosa' | 'fallida' | 'no-configurada' | 'pendiente'

export interface ResultadoBiometria {
  estado: EstadoBiometria
  /** 0-1: cuánto se parece el selfie a la foto del documento. */
  parecido: number | null
  /** 0-1: cuánta confianza hay en que sea una persona viva. */
  vivacidad: number | null
  proveedor: string
  motivo?: string
  evaluadoEn: string
  /** Gesto a gesto, cuando la vivacidad se resolvió por reto. */
  pasosVivacidad?: PasoVivacidad[]
  /** Lo que no invalida el cotejo pero el operador debería leer. */
  avisos?: string[]
}

/** A partir de aquí se acepta el cotejo. */
const UMBRAL_PARECIDO = Number(process.env.GENESIS_UMBRAL_PARECIDO || 0.88)
/** A partir de aquí se acepta la prueba de vida. */
const UMBRAL_VIVACIDAD = Number(process.env.GENESIS_UMBRAL_VIVACIDAD || 0.9)

const URL_PROVEEDOR = (process.env.GENESIS_BIOMETRIA_URL || '').trim()
const CLAVE_PROVEEDOR = (process.env.GENESIS_BIOMETRIA_KEY || '').trim()

export const biometriaConfigurada = () => Boolean(URL_PROVEEDOR) || rekognitionConfigurado()

/** Qué está resolviendo el cotejo, para el panel y el diagnóstico. */
export function proveedorBiometria(): string {
  if (URL_PROVEEDOR) return URL_PROVEEDOR
  if (rekognitionConfigurado()) return `aws-rekognition:${regionRekognition()}`
  return 'ninguno'
}

const ahora = () => new Date().toISOString()

/**
 * La política de aceptación, en un solo sitio.
 *
 * Da igual quién haya producido los números: la banda de aceptación, la de duda
 * y el rechazo se deciden aquí. Que la prueba de vida se evalúe ANTES que el
 * parecido es a propósito — un rostro que coincide al 99 % no significa nada si
 * lo que había delante de la cámara era una foto de esa persona.
 */
function decidir(
  parecido: number, vivo: number | null, proveedor: string,
  extra: { pasos?: PasoVivacidad[]; avisos?: string[]; notaVivacidad?: string } = {},
): ResultadoBiometria {
  let estado: EstadoBiometria
  let motivo: string | undefined

  if (vivo != null && vivo < UMBRAL_VIVACIDAD) {
    estado = 'fallida'
    motivo = extra.notaVivacidad
      ? `Prueba de vida insuficiente (${vivo.toFixed(2)} < ${UMBRAL_VIVACIDAD}): ${extra.notaVivacidad}`
      : `La prueba de vida no alcanza el umbral (${vivo.toFixed(2)} < ${UMBRAL_VIVACIDAD})`
  } else if (parecido >= UMBRAL_PARECIDO) {
    estado = 'ok'
  } else if (parecido >= UMBRAL_PARECIDO - 0.1) {
    estado = 'dudosa'
    motivo = `El parecido queda por debajo del umbral (${parecido.toFixed(2)} < ${UMBRAL_PARECIDO})`
  } else {
    estado = 'fallida'
    motivo = `El rostro no coincide con el del documento (${parecido.toFixed(2)})`
  }

  return {
    estado, parecido, vivacidad: vivo, proveedor, motivo, evaluadoEn: ahora(),
    ...(extra.pasos?.length ? { pasosVivacidad: extra.pasos } : {}),
    ...(extra.avisos?.length ? { avisos: extra.avisos } : {}),
  }
}

export function sinProveedor(): ResultadoBiometria {
  return {
    estado: 'no-configurada',
    parecido: null,
    vivacidad: null,
    proveedor: 'ninguno',
    motivo:
      'No hay proveedor de biometría configurado. El cotejo entre el selfie y la foto ' +
      'del documento debe hacerlo una persona antes de aprobar.',
    evaluadoEn: ahora(),
  }
}

export interface EntradaBiometria {
  /** Selfie en base64 o URL. */
  selfie: string
  /** Foto del documento en base64 o URL. */
  fotoDocumento: string
  /** 0-1, si ya se resolvió un reto de vivacidad para este selfie. */
  vivacidad?: number | null
  pasosVivacidad?: PasoVivacidad[]
  avisosVivacidad?: string[]
  notaVivacidad?: string
}

/**
 * Cotejo con AWS Rekognition.
 *
 * La prueba de vida NO la hace Rekognition aquí: llega ya resuelta desde el
 * reto de `kyc/vivacidad.ts`, que es quien vio a la persona moverse. Si no llega
 * ninguna, el resultado no dice "no hay vivacidad, adelante": dice que falta, y
 * la identidad se queda en revisión. Confundir "no comprobado" con "correcto"
 * es exactamente el fallo que hace inútil una verificación de identidad.
 */
async function cotejarConRekognition(entrada: EntradaBiometria): Promise<ResultadoBiometria> {
  const proveedor = `aws-rekognition:${regionRekognition()}`
  const avisos = [...(entrada.avisosVivacidad || [])]

  // SIN FOTO DEL DOCUMENTO NO HAY COTEJO, Y ESO NO ES UN FALLO.
  //
  // Comparar un rostro exige dos rostros. Si no llegó el del documento no es
  // que no coincida: es que no se pudo mirar. Devolver «fallida» ahí acusaba a
  // la persona de algo que no hizo —pasó de verdad, con la prueba de vida al
  // 100 %— y la mandaba a una cola de revisión sin decir qué faltaba.
  if (!String(entrada.fotoDocumento || '').trim()) {
    return {
      estado: 'dudosa',
      parecido: null,
      vivacidad: entrada.vivacidad ?? null,
      proveedor,
      motivo: 'No llegó la foto del documento, así que el rostro no se pudo cotejar. ' +
        'Hace falta que un operador lo compare a mano.',
      evaluadoEn: ahora(),
      ...(entrada.pasosVivacidad?.length ? { pasosVivacidad: entrada.pasosVivacidad } : {}),
      ...(avisos.length ? { avisos } : {}),
    }
  }

  try {
    // Un selfie con dos caras es motivo de revisión: la segunda podría ser la
    // persona que sostiene el teléfono ante alguien que no está participando.
    const cuantos = await contarRostros(entrada.selfie, 'el selfie')
    if (cuantos === 0) {
      return {
        estado: 'fallida', parecido: null, vivacidad: entrada.vivacidad ?? null, proveedor,
        motivo: 'No se detecta ningún rostro en el selfie', evaluadoEn: ahora(),
      }
    }
    if (cuantos > 1) avisos.push(`Hay ${cuantos} rostros en el selfie; debería salir una sola persona`)

    const r = await compararRostros(entrada.selfie, entrada.fotoDocumento)
    if (r.sinCoincidir > 0 && r.similitud === 0) {
      return {
        estado: 'fallida', parecido: 0, vivacidad: entrada.vivacidad ?? null, proveedor,
        motivo: 'El rostro del selfie no es el del documento', evaluadoEn: ahora(),
        ...(avisos.length ? { avisos } : {}),
      }
    }

    const resultado = decidir(r.similitud, entrada.vivacidad ?? null, proveedor, {
      pasos: entrada.pasosVivacidad, avisos, notaVivacidad: entrada.notaVivacidad,
    })

    // Sin reto resuelto no hay forma de saber si había una persona: el cotejo
    // vale, pero no alcanza para aprobar solo.
    if (entrada.vivacidad == null && resultado.estado === 'ok') {
      return {
        ...resultado, estado: 'dudosa',
        motivo: 'El rostro coincide, pero no se hizo la prueba de vida; hace falta revisión',
      }
    }
    return resultado
  } catch (e: any) {
    const tipo = e instanceof ErrorRekognition ? e.tipo : 'Error'
    // Que la foto del documento no tenga cara legible es un dato del expediente,
    // no una avería del servicio: se distingue para que el operador sepa a quién
    // pedirle otra foto.
    const deLaImagen = ['InvalidParameterException', 'ImageTooLargeException',
      'InvalidImageFormatException', 'ImagenInvalida', 'ImagenGrande', 'ImagenPorUrl', 'ImagenVacia']
    return {
      estado: 'fallida', parecido: null, vivacidad: entrada.vivacidad ?? null, proveedor,
      motivo: deLaImagen.includes(tipo)
        ? `Las imágenes no sirven para cotejar (${tipo}): ${e?.message}`
        : `No se pudo cotejar con Rekognition (${tipo}): ${e?.message}`,
      evaluadoEn: ahora(),
      ...(avisos.length ? { avisos } : {}),
    }
  }
}

/**
 * Pide el cotejo al proveedor configurado.
 *
 * El umbral se aplica AQUI y no se delega: si mañana se cambia de proveedor, la
 * política de aceptación del ecosistema sigue siendo la misma. Un proveedor que
 * devuelva `ok: true` con un parecido de 0,70 no aprueba nada.
 */
export async function cotejar(entrada: EntradaBiometria): Promise<ResultadoBiometria> {
  if (!URL_PROVEEDOR) {
    return rekognitionConfigurado() ? cotejarConRekognition(entrada) : sinProveedor()
  }

  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 30000)
  try {
    const respuesta = await fetch(URL_PROVEEDOR, {
      method: 'POST',
      signal: control.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(CLAVE_PROVEEDOR ? { Authorization: `Bearer ${CLAVE_PROVEEDOR}` } : {}),
      },
      body: JSON.stringify({ selfie: entrada.selfie, documento: entrada.fotoDocumento }),
    })

    if (!respuesta.ok) {
      return {
        estado: 'fallida', parecido: null, vivacidad: null, proveedor: URL_PROVEEDOR,
        motivo: `El proveedor respondió ${respuesta.status}`, evaluadoEn: ahora(),
      }
    }

    const cuerpo: any = await respuesta.json()
    const parecido = Number(cuerpo?.parecido ?? cuerpo?.similarity ?? NaN)
    const suya = Number(cuerpo?.vivacidad ?? cuerpo?.liveness ?? NaN)

    if (!Number.isFinite(parecido)) {
      return {
        estado: 'fallida', parecido: null, vivacidad: null, proveedor: URL_PROVEEDOR,
        motivo: 'El proveedor no devolvió una puntuación de parecido', evaluadoEn: ahora(),
      }
    }

    // Si el reto de vivacidad ya se resolvió aquí, esa medida manda: la hizo
    // este servidor con un reto que sorteó él mismo.
    const vivo = entrada.vivacidad ?? (Number.isFinite(suya) ? suya : null)
    return decidir(parecido, vivo, URL_PROVEEDOR, {
      pasos: entrada.pasosVivacidad,
      avisos: entrada.avisosVivacidad,
      notaVivacidad: entrada.notaVivacidad,
    })
  } catch (e: any) {
    return {
      estado: 'fallida', parecido: null, vivacidad: null, proveedor: URL_PROVEEDOR,
      motivo: e?.name === 'AbortError' ? 'El proveedor no respondió a tiempo' : `Error al consultar: ${e?.message}`,
      evaluadoEn: ahora(),
    }
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Cotejo resuelto por una persona. Es la vía que se usa mientras no haya
 * proveedor, y queda registrado quién lo hizo.
 */
export function cotejoManual(operador: string, coincide: boolean, nota?: string): ResultadoBiometria {
  return {
    estado: coincide ? 'ok' : 'fallida',
    parecido: null,
    vivacidad: null,
    proveedor: `manual:${operador}`,
    motivo: nota || (coincide ? 'Cotejo verificado a mano' : 'El operador determinó que no coincide'),
    evaluadoEn: ahora(),
  }
}
