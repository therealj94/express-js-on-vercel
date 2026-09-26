// Tipos del puente con Genesis ID.
//
// El puente es JavaScript a propósito: es el MISMO archivo, byte a byte, que
// despliega el backend de Veta Wallet (infra/veta-wallet-backend/lib/
// genesisPuente.js), y una prueba de Veta falla si las dos copias difieren.
// Reescribirlo en TypeScript fue justamente lo que dejó a MyTokenPay con un
// puente distinto de los otros; sus tipos viven aparte, en este archivo.

import type { Request, RequestHandler, Router } from 'express'

/** Parser JSON ancho, solo para las rutas que reciben fotografías. */
export declare const parserRostro: RequestHandler

/** ¿Hay GENESIS_API_KEY en este servidor? */
export declare function genesisConfigurado(): boolean

/** Los códigos con que se rechaza un vínculo sin dirección válida. */
export declare const CODIGOS_VINCULO: Readonly<{
  SIN_DIRECCION: 'VINCULO_SIN_DIRECCION'
  DIRECCION_INVALIDA: 'VINCULO_DIRECCION_INVALIDA'
  DIRECCION_SIN_PRUEBA: 'VINCULO_DIRECCION_SIN_PRUEBA'
}>

/** Los códigos con que el puente se niega a actuar sobre un correo sin comprobar. */
export declare const CODIGOS_CORREO: Readonly<{
  NO_VERIFICADO: 'CORREO_NO_VERIFICADO'
  GID_AJENO: 'SESION_GID_AJENO'
}>

/** Keccak-256 de un texto, en hexadecimal (sin 0x). */
export declare function keccak256Hex(texto: string): string

/** La dirección en minúsculas, o null si no es válida (formato o suma EIP-55). */
export declare function normalizarDireccion(valor: unknown): string | null

/**
 * El router `/genesis/*`. `exigirSesion` tiene que dejar en `req.usuario` al
 * menos `{ id, email }`, `address` si la app conoce la billetera del usuario y
 * `gid` si sabe a qué GID está atada la cuenta.
 *
 * `correoVerificado(req)` dice si la app comprobó que el correo de ESA sesión es
 * de quien la usa. Sin ella se da por no comprobado: no hay `/vincular` ni
 * `/sso/token`, ni escrituras sobre una identidad que ya respondió por alguien.
 */
export declare function routerGenesis(opciones: {
  exigirSesion: RequestHandler
  correoVerificado?: (req: Request) => boolean | Promise<boolean>
}): Router
