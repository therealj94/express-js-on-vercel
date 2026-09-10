/* La firma de AWS (SigV4), hecha a mano.
 *
 * POR QUE NO EL SDK
 *
 * Genesis ID corre con cuatro dependencias y en una instancia de 512 MB —la
 * misma que nos costó trabajo hacer entrar—. El SDK de AWS pesa decenas de
 * megabytes con su árbol de dependencias, y lo único que necesitamos de él es
 * firmar una petición POST. Setenta líneas de `node:crypto` hacen exactamente
 * eso, se pueden leer enteras, y no arrastran nada.
 *
 * El algoritmo es el documentado por AWS y no tiene margen de interpretación:
 * se arma una petición canónica, se resume, se firma con una clave derivada en
 * cuatro pasos, y el resultado va en la cabecera `Authorization`. Está probado
 * contra el ejemplo oficial de AWS en `pruebas/firma-aws.test.ts`: si alguien
 * toca una línea de aquí, esa prueba se cae.
 */

import { createHash, createHmac } from 'node:crypto'

const sha256 = (d: string | Buffer) => createHash('sha256').update(d).digest('hex')
const hmac = (clave: string | Buffer, d: string) => createHmac('sha256', clave).update(d).digest()

export interface Credenciales {
  llave: string
  secreto: string
  /** Solo con credenciales temporales (roles). */
  token?: string
}

export interface PeticionFirmada {
  url: string
  cabeceras: Record<string, string>
  cuerpo: string
}

/**
 * Deriva la clave de firma en los cuatro pasos encadenados de AWS. Cada paso
 * acota su alcance (día, región, servicio), de modo que una firma filtrada no
 * sirve para otra región ni para otro día.
 *
 * Va aparte para poder probarla contra el vector que AWS publica en su
 * documentación: es el núcleo criptográfico y no puede quedar sin verificar.
 */
export function derivarClaveFirma(
  secreto: string, dia: string, region: string, servicio: string,
): Buffer {
  const kFecha = hmac(`AWS4${secreto}`, dia)
  const kRegion = hmac(kFecha, region)
  const kServicio = hmac(kRegion, servicio)
  return hmac(kServicio, 'aws4_request')
}

/**
 * Firma un POST con cuerpo JSON.
 *
 * @param fecha  se inyecta para poder probar con una fecha fija. En producción
 *               se omite y se usa la de ahora.
 */
export function firmarPost(
  opciones: {
    servicio: string
    region: string
    host: string
    ruta: string
    cuerpo: string
    credenciales: Credenciales
  },
  fecha: Date = new Date(),
): PeticionFirmada {
  const { servicio, region, host, ruta, cuerpo, credenciales } = opciones

  // 20260819T143012Z y 20260819
  const marca = fecha.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dia = marca.slice(0, 8)
  const ambito = `${dia}/${region}/${servicio}/aws4_request`

  // Las cabeceras firmadas van en minúscula y ORDENADAS: el orden es parte de
  // la firma, no una preferencia de estilo.
  const cabeceras: Record<string, string> = {
    'content-type': 'application/json',
    host,
    'x-amz-date': marca,
  }
  if (credenciales.token) cabeceras['x-amz-security-token'] = credenciales.token

  const nombres = Object.keys(cabeceras).sort()
  const firmadas = nombres.join(';')
  const canonicas = nombres.map((n) => `${n}:${cabeceras[n].trim()}\n`).join('')

  const peticionCanonica = [
    'POST', ruta, '', canonicas, firmadas, sha256(cuerpo),
  ].join('\n')

  const aFirmar = [
    'AWS4-HMAC-SHA256', marca, ambito, sha256(peticionCanonica),
  ].join('\n')

  const kFirma = derivarClaveFirma(credenciales.secreto, dia, region, servicio)
  const firma = createHmac('sha256', kFirma).update(aFirmar).digest('hex')

  return {
    url: `https://${host}${ruta}`,
    cabeceras: {
      ...cabeceras,
      Authorization: `AWS4-HMAC-SHA256 Credential=${credenciales.llave}/${ambito}, ` +
        `SignedHeaders=${firmadas}, Signature=${firma}`,
    },
    cuerpo,
  }
}
