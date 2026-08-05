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
// Basta con definir GENESIS_BIOMETRIA_URL (y GENESIS_BIOMETRIA_KEY). El motor
// hace un POST con las dos imágenes y espera de vuelta:
//
//   { "parecido": 0.93, "vivacidad": 0.98, "ok": true }
//
// Sirve tanto para los proveedores comerciales del sector como para un servicio
// propio. Lo que no cambia es la política: el umbral y la decisión los aplica
// Genesis ID, no el proveedor.

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
}

/** A partir de aquí se acepta el cotejo. */
const UMBRAL_PARECIDO = Number(process.env.GENESIS_UMBRAL_PARECIDO || 0.88)
/** A partir de aquí se acepta la prueba de vida. */
const UMBRAL_VIVACIDAD = Number(process.env.GENESIS_UMBRAL_VIVACIDAD || 0.9)

const URL_PROVEEDOR = (process.env.GENESIS_BIOMETRIA_URL || '').trim()
const CLAVE_PROVEEDOR = (process.env.GENESIS_BIOMETRIA_KEY || '').trim()

export const biometriaConfigurada = () => Boolean(URL_PROVEEDOR)

const ahora = () => new Date().toISOString()

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
}

/**
 * Pide el cotejo al proveedor configurado.
 *
 * El umbral se aplica AQUI y no se delega: si mañana se cambia de proveedor, la
 * política de aceptación del ecosistema sigue siendo la misma. Un proveedor que
 * devuelva `ok: true` con un parecido de 0,70 no aprueba nada.
 */
export async function cotejar(entrada: EntradaBiometria): Promise<ResultadoBiometria> {
  if (!biometriaConfigurada()) return sinProveedor()

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
    const vivacidad = Number(cuerpo?.vivacidad ?? cuerpo?.liveness ?? NaN)

    if (!Number.isFinite(parecido)) {
      return {
        estado: 'fallida', parecido: null, vivacidad: null, proveedor: URL_PROVEEDOR,
        motivo: 'El proveedor no devolvió una puntuación de parecido', evaluadoEn: ahora(),
      }
    }

    const vivo = Number.isFinite(vivacidad) ? vivacidad : null
    let estado: EstadoBiometria
    let motivo: string | undefined

    if (vivo != null && vivo < UMBRAL_VIVACIDAD) {
      estado = 'fallida'
      motivo = `La prueba de vida no alcanza el umbral (${vivo.toFixed(2)} < ${UMBRAL_VIVACIDAD})`
    } else if (parecido >= UMBRAL_PARECIDO) {
      estado = 'ok'
    } else if (parecido >= UMBRAL_PARECIDO - 0.1) {
      estado = 'dudosa'
      motivo = `El parecido queda por debajo del umbral (${parecido.toFixed(2)} < ${UMBRAL_PARECIDO})`
    } else {
      estado = 'fallida'
      motivo = `El rostro no coincide con el del documento (${parecido.toFixed(2)})`
    }

    return { estado, parecido, vivacidad: vivo, proveedor: URL_PROVEEDOR, motivo, evaluadoEn: ahora() }
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
