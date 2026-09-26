// Tipos del puente con Genesis ID.
//
// El puente es JavaScript a propósito: es el MISMO archivo, byte a byte, que
// despliega el backend de Veta Wallet (infra/veta-wallet-backend/lib/
// genesisPuente.js), y una prueba de Veta falla si las dos copias difieren.
// Reescribirlo en TypeScript fue justamente lo que dejó a MyTokenPay con un
// puente distinto de los otros; sus tipos viven aparte, en este archivo.

import type { RequestHandler, Router } from 'express'

/** Parser JSON ancho, solo para las rutas que reciben fotografías. */
export declare const parserRostro: RequestHandler

/** ¿Hay GENESIS_API_KEY en este servidor? */
export declare function genesisConfigurado(): boolean

/** Los códigos con que se rechaza un vínculo sin dirección válida. */
export declare const CODIGOS_VINCULO: Readonly<{
  SIN_DIRECCION: 'VINCULO_SIN_DIRECCION'
  DIRECCION_INVALIDA: 'VINCULO_DIRECCION_INVALIDA'
}>

/** Los códigos propios del puente (Genesis ID no los conoce). */
export declare const CODIGOS_PUENTE: Readonly<{
  CUENTA_NO_ATADA: 'CUENTA_NO_ATADA'
  VINCULO_APAGADO: 'VINCULO_APAGADO'
  DIRECCION_NO_PROBADA: 'VINCULO_DIRECCION_NO_PROBADA'
}>

/** Apps cuyo vínculo trae una dirección custodiada por la app (no tecleada por el cliente). */
export declare const APPS_CUSTODIAS: readonly string[]

/** ¿Son el mismo GID? (sin distinguir mayúsculas ni espacios; vacío nunca coincide) */
export declare function mismoGid(a: unknown, b: unknown): boolean

/** Keccak-256 de un texto, en hexadecimal (sin 0x). */
export declare function keccak256Hex(texto: string): string

/** La dirección en minúsculas, o null si no es válida (formato o suma EIP-55). */
export declare function normalizarDireccion(valor: unknown): string | null

/**
 * El router `/genesis/*`. `exigirSesion` tiene que dejar en `req.usuario` al
 * menos `{ id, email }`, y `address` si la app conoce la billetera del usuario.
 *
 * `exigirGidDeSesion`: la sesión de la app no prueba el correo, así que una
 * identidad que ya tiene GID solo la toca una sesión con `req.usuario.gid`
 * igual a ese GID (probado con un pase de Genesis ID).
 *
 * `vinculoActivo`: si `/vincular` puede atar cuentas; se pregunta en cada
 * petición. Por omisión, sí.
 */
export declare function routerGenesis(opciones: {
  exigirSesion: RequestHandler
  exigirGidDeSesion?: boolean
  vinculoActivo?: () => boolean
}): Router
