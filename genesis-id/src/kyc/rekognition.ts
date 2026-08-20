// Cliente mínimo de AWS Rekognition: firma SigV4 y dos operaciones.
//
// POR QUE NO SE USA EL SDK DE AWS
//
// El SDK oficial arrastra decenas de paquetes para hacer, aquí, dos llamadas
// HTTP. Genesis ID se sostiene sobre cuatro dependencias y esa contención es
// parte de lo que lo hace auditable: cada línea que decide si una persona es
// quien dice ser tiene que poder leerse. La firma SigV4 son sesenta líneas de
// `node:crypto` y están abajo, enteras.
//
// Se hablan tres operaciones del servicio:
//
//   CompareFaces  — cuánto se parece el rostro del selfie al de la foto del
//                   documento. Devuelve una similitud de 0 a 100.
//   DetectFaces   — atributos del rostro de un fotograma: ojos abiertos, boca
//                   abierta, sonrisa, orientación de la cabeza y calidad. Es lo
//                   que permite comprobar que la persona hizo lo que se le pidió.
//   DetectText    — el texto impreso en una imagen. Es lo que permite LEER el
//                   frente del documento en el servidor cuando entra como
//                   fotografía, en vez de fiarse del texto que reconozca (o
//                   diga haber reconocido) el aparato de quien se verifica.
//
// AWS cobra por imagen analizada (del orden de 0,001 USD), así que una
// verificación completa —selfie + documento + cuatro fotogramas de vivacidad—
// cuesta menos de un centavo.

import { createHash, createHmac } from 'node:crypto'

const REGION = (process.env.GENESIS_AWS_REGION || process.env.AWS_REGION || 'us-east-1').trim()
const CLAVE = (process.env.GENESIS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim()
const SECRETA = (process.env.GENESIS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim()
const SESION = (process.env.GENESIS_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN || '').trim()

const SERVICIO = 'rekognition'

export const rekognitionConfigurado = () => Boolean(CLAVE && SECRETA)
export const regionRekognition = () => REGION

// ─────────────────────────────────────────────────────────────────────────────
// Firma SigV4
// ─────────────────────────────────────────────────────────────────────────────

const sha256 = (dato: string | Buffer) => createHash('sha256').update(dato).digest('hex')
const hmac = (clave: Buffer | string, dato: string) => createHmac('sha256', clave).update(dato).digest()

/**
 * Clave de firma: HMAC encadenado sobre fecha, región y servicio.
 *
 * Se expone aparte para poder comprobarla contra el ejemplo publicado por AWS.
 * Si esta derivación está mal, todas las llamadas fallan con un 403 que no dice
 * por qué, y es el tipo de error que solo aparece en producción.
 */
export function derivarClaveFirma(
  secreta: string, dia: string, region: string, servicio: string,
): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secreta}`, dia), region), servicio), 'aws4_request')
}

/**
 * Devuelve las cabeceras firmadas para un POST al servicio.
 *
 * El procedimiento es el de la documentación de AWS, en el mismo orden: se
 * arma una petición canónica, se resume, se firma con una clave derivada de
 * fecha/región/servicio, y el resultado va en `Authorization`.
 */
function firmar(objetivo: string, cuerpo: string, fecha: Date): Record<string, string> {
  const anfitrion = `${SERVICIO}.${REGION}.amazonaws.com`
  const marca = fecha.toISOString().replace(/[-:]|\.\d{3}/g, '') // 20260805T101500Z
  const dia = marca.slice(0, 8)

  const cabeceras: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.1',
    host: anfitrion,
    'x-amz-date': marca,
    'x-amz-target': objetivo,
  }
  if (SESION) cabeceras['x-amz-security-token'] = SESION

  const nombres = Object.keys(cabeceras).sort()
  const canonicas = nombres.map((n) => `${n}:${cabeceras[n]}\n`).join('')
  const firmadas = nombres.join(';')

  const peticionCanonica = ['POST', '/', '', canonicas, firmadas, sha256(cuerpo)].join('\n')
  const alcance = `${dia}/${REGION}/${SERVICIO}/aws4_request`
  const porFirmar = ['AWS4-HMAC-SHA256', marca, alcance, sha256(peticionCanonica)].join('\n')

  const kFirma = derivarClaveFirma(SECRETA, dia, REGION, SERVICIO)
  const firma = createHmac('sha256', kFirma).update(porFirmar).digest('hex')

  return {
    ...cabeceras,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${CLAVE}/${alcance}, ` +
      `SignedHeaders=${firmadas}, Signature=${firma}`,
  }
}

export class ErrorRekognition extends Error {
  constructor(public tipo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorRekognition'
  }
}

async function llamar(operacion: string, entrada: unknown, msEspera = 20000): Promise<any> {
  if (!rekognitionConfigurado()) {
    throw new ErrorRekognition('SinCredenciales', 'Rekognition no tiene credenciales configuradas')
  }
  const cuerpo = JSON.stringify(entrada)
  const cabeceras = firmar(`RekognitionService.${operacion}`, cuerpo, new Date())

  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), msEspera)
  try {
    const r = await fetch(`https://${SERVICIO}.${REGION}.amazonaws.com/`, {
      method: 'POST', body: cuerpo, headers: cabeceras, signal: control.signal,
    })
    const texto = await r.text()
    let json: any = null
    try { json = texto ? JSON.parse(texto) : null } catch { /* respuesta no JSON */ }

    if (!r.ok) {
      // AWS manda el tipo en `__type` (o en la cabecera) con el prefijo del
      // espacio de nombres; interesa solo la última parte.
      const bruto = String(json?.__type || r.headers.get('x-amzn-errortype') || `HTTP ${r.status}`)
      const tipo = bruto.split('#').pop()!.split(':')[0]
      throw new ErrorRekognition(tipo, json?.message || json?.Message || texto.slice(0, 200) || tipo)
    }
    return json
  } catch (e: any) {
    if (e instanceof ErrorRekognition) throw e
    if (e?.name === 'AbortError') throw new ErrorRekognition('TiempoAgotado', 'Rekognition no respondió a tiempo')
    throw new ErrorRekognition('Red', e?.message || 'No se pudo consultar Rekognition')
  } finally {
    clearTimeout(temporizador)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Imágenes
// ─────────────────────────────────────────────────────────────────────────────

/** Límite duro de la API para imágenes enviadas en el cuerpo. */
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Normaliza lo que manden las apps a base64 sin envoltura.
 *
 * Los clientes suelen mandar `data:image/jpeg;base64,...`; se acepta y se
 * limpia. Lo que NO se acepta es una URL: bajar una imagen de una dirección que
 * elige quien se está verificando convertiría al servidor en un cliente HTTP a
 * su servicio, y eso es un agujero de red interna (SSRF).
 */
export function normalizarImagen(valor: string, etiqueta: string): string {
  const bruto = String(valor || '').trim()
  if (!bruto) throw new ErrorRekognition('ImagenVacia', `Falta ${etiqueta}`)
  if (/^https?:/i.test(bruto)) {
    throw new ErrorRekognition('ImagenPorUrl', `${etiqueta} debe venir en base64, no como URL`)
  }
  const limpio = bruto.replace(/^data:image\/[a-z+]+;base64,/i, '').replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) {
    throw new ErrorRekognition('ImagenInvalida', `${etiqueta} no es base64 válido`)
  }
  const bytes = Math.floor((limpio.length * 3) / 4)
  if (bytes > MAX_BYTES) {
    throw new ErrorRekognition('ImagenGrande', `${etiqueta} supera los 5 MB (${(bytes / 1048576).toFixed(1)} MB)`)
  }
  return limpio
}

// ─────────────────────────────────────────────────────────────────────────────
// Operaciones
// ─────────────────────────────────────────────────────────────────────────────

export interface Parecido {
  /** 0-1. */
  similitud: number
  /** Rostros detectados en la imagen de destino que NO son el de origen. */
  sinCoincidir: number
  /** Confianza del rostro localizado en la imagen de origen, 0-1. */
  confianzaOrigen: number
}

/**
 * Compara el rostro del selfie con el de la foto del documento.
 *
 * `SimilarityThreshold: 0` es deliberado: se quiere el número aunque sea bajo,
 * porque el umbral lo aplica Genesis ID y un "no coincide" con 0,31 es
 * información útil para el operador que revisa. Si AWS filtrase por su cuenta,
 * un rostro distinto volvería como una lista vacía, indistinguible de un fallo.
 */
export async function compararRostros(selfie: string, documento: string): Promise<Parecido> {
  const r = await llamar('CompareFaces', {
    SourceImage: { Bytes: normalizarImagen(documento, 'la foto del documento') },
    TargetImage: { Bytes: normalizarImagen(selfie, 'el selfie') },
    SimilarityThreshold: 0,
    QualityFilter: 'AUTO',
  })
  const coincidencias: any[] = Array.isArray(r?.FaceMatches) ? r.FaceMatches : []
  const mejor = coincidencias.reduce((a, c) => Math.max(a, Number(c?.Similarity) || 0), 0)
  return {
    similitud: mejor / 100,
    sinCoincidir: Array.isArray(r?.UnmatchedFaces) ? r.UnmatchedFaces.length : 0,
    confianzaOrigen: (Number(r?.SourceImageFace?.Confidence) || 0) / 100,
  }
}

export interface RostroDetectado {
  confianza: number
  sonrisa: { valor: boolean; confianza: number }
  ojosAbiertos: { valor: boolean; confianza: number }
  bocaAbierta: { valor: boolean; confianza: number }
  gafas: boolean
  postura: { guinada: number; cabeceo: number; alabeo: number }
  calidad: { brillo: number; nitidez: number }
  /** Fracción del ancho de la imagen que ocupa el rostro, 0-1. */
  tamano: number
}

const bool = (a: any) => ({ valor: Boolean(a?.Value), confianza: (Number(a?.Confidence) || 0) / 100 })

/** Atributos del rostro más grande de la imagen. `null` si no hay ninguno. */
export async function detectarRostro(imagen: string, etiqueta = 'el fotograma'): Promise<RostroDetectado | null> {
  const r = await llamar('DetectFaces', {
    Image: { Bytes: normalizarImagen(imagen, etiqueta) },
    Attributes: ['ALL'],
  })
  const rostros: any[] = Array.isArray(r?.FaceDetails) ? r.FaceDetails : []
  if (!rostros.length) return null
  // El rostro que importa es el de quien se verifica: el que ocupa más cuadro.
  const d = rostros.reduce((a, c) =>
    (Number(c?.BoundingBox?.Width) || 0) > (Number(a?.BoundingBox?.Width) || 0) ? c : a)

  return {
    confianza: (Number(d?.Confidence) || 0) / 100,
    sonrisa: bool(d?.Smile),
    ojosAbiertos: bool(d?.EyesOpen),
    bocaAbierta: bool(d?.MouthOpen),
    gafas: Boolean(d?.Sunglasses?.Value),
    postura: {
      guinada: Number(d?.Pose?.Yaw) || 0,
      cabeceo: Number(d?.Pose?.Pitch) || 0,
      alabeo: Number(d?.Pose?.Roll) || 0,
    },
    calidad: {
      brillo: Number(d?.Quality?.Brightness) || 0,
      nitidez: Number(d?.Quality?.Sharpness) || 0,
    },
    tamano: Number(d?.BoundingBox?.Width) || 0,
  }
}

/** Cuántos rostros hay en la imagen. Sirve para rechazar fotos con acompañante. */
export async function contarRostros(imagen: string, etiqueta = 'la imagen'): Promise<number> {
  const r = await llamar('DetectFaces', {
    Image: { Bytes: normalizarImagen(imagen, etiqueta) },
    Attributes: ['DEFAULT'],
  })
  return Array.isArray(r?.FaceDetails) ? r.FaceDetails.length : 0
}

/**
 * Las líneas de texto impresas en una imagen, en el orden en que aparecen.
 *
 * Se devuelven las LÍNEAS y no las palabras: la palabra ya viene dentro de su
 * línea, y quien coteja un nombre necesita el contexto («NOMBRES / JOSE
 * MANUEL»), no un saco de fichas sueltas.
 *
 * El umbral de confianza es bajo (55) a propósito: una cédula tiene filigrana,
 * reflejos y tipografías raras, y el cotejo de nombres de `documento.ts` ya
 * tolera letras comidas y cifras por letras. Filtrar fuerte aquí solo
 * conseguiría perder la línea del nombre justo en las fotos difíciles, que son
 * las que más necesitan la lectura.
 */
export async function detectarTexto(imagen: string, etiqueta = 'la imagen'): Promise<string[]> {
  const r = await llamar('DetectText', {
    Image: { Bytes: normalizarImagen(imagen, etiqueta) },
  })
  const detecciones: any[] = Array.isArray(r?.TextDetections) ? r.TextDetections : []
  return detecciones
    .filter((d) => d?.Type === 'LINE' && (Number(d?.Confidence) || 0) >= 55)
    .map((d) => String(d?.DetectedText || '').trim())
    .filter(Boolean)
}
