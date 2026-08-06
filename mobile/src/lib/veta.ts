// ─────────────────────────────────────────────────────────────────────────────
// El puente a Veta Wallet.
//
// MyTokenPay no guarda llaves privadas y no firma nada. Cuando hay que mover
// ORIGEN, manda al usuario a Veta Wallet con los datos del pago y espera a que
// vuelva. Esa separación es deliberada: una app de directorio de comercios no
// tiene por qué poder gastar el dinero de nadie.
//
// El viaje de ida y vuelta:
//
//   MyTokenPay  ──vetawallet://pay?…&volver=mytokenpay://…──▶  Veta Wallet
//                                                                    │ firma
//   MyTokenPay  ◀──mytokenpay://pagar/CODIGO?tx=0x…&sello=…──────────┘
//
// Si Veta Wallet no está instalada se ofrece instalarla, y queda la vía de
// pegar el hash a mano — porque en un comedor con mala señal, dejar al cliente
// sin salida no es una opción.
// ─────────────────────────────────────────────────────────────────────────────

import { Linking, Platform } from 'react-native'

/** Esquema declarado por Veta Wallet en su app.json. */
const ESQUEMA_VETA = 'vetawallet'
const ESQUEMA_PROPIO = 'mytokenpay'

const TIENDA = Platform.select({
  android: 'https://play.google.com/store/apps/details?id=com.ordenglobal.vetawallet',
  ios: 'https://apps.apple.com/app/veta-wallet/id0000000000',
  default: 'https://www.vetawallet.com',
})!

export interface OrdenDePago {
  /** Dirección del comercio en la cadena 8532. */
  destino: string
  montoOrigen: number
  /** Código del cobro, para que el usuario reconozca qué está pagando. */
  referencia: string
  concepto: string
  /** Sello del intento. Viaja ida y vuelta para reconocer el reintento. */
  sello: string
}

/**
 * El enlace que abre Veta Wallet con el pago listo para firmar.
 *
 * Va por `pay` y con los nombres `to` / `amount` / `sym`, que es lo que Veta
 * Wallet entiende desde hace tiempo. Probando en un teléfono real, mandarlo
 * por `pagar` abría la app pero no la pantalla de enviar: ese formato solo lo
 * entienden las versiones nuevas, y una app instalada tarda en actualizarse.
 * Hablarle a la wallet en el idioma que ya habla hoy es más importante que
 * usar el nombre más bonito.
 *
 * `volver` viaja igual y Veta lo pasa entero a su pantalla de enviar, así que
 * en cuanto la wallet reciba su actualización, el regreso con el hash funciona
 * sin tocar nada de este lado.
 */
export function enlaceDePago(orden: OrdenDePago): string {
  const volver = `${ESQUEMA_PROPIO}://pagar/${encodeURIComponent(orden.referencia)}?sello=${encodeURIComponent(orden.sello)}`
  const p = new URLSearchParams({
    to: orden.destino,
    amount: String(orden.montoOrigen),
    sym: 'ORIGEN',
    ref: orden.referencia,
    memo: orden.concepto || `Pago MyTokenPay ${orden.referencia}`,
    sello: orden.sello,
    volver,
  })
  return `${ESQUEMA_VETA}://pay?${p.toString()}`
}

export async function vetaInstalada(): Promise<boolean> {
  try {
    return await Linking.canOpenURL(`${ESQUEMA_VETA}://`)
  } catch {
    return false
  }
}

/**
 * Abre Veta Wallet para firmar.
 *
 * Devuelve `false` si no se pudo abrir, para que la pantalla ofrezca instalarla
 * en vez de quedarse callada — un botón que no hace nada al tocarlo es la peor
 * forma de fallar.
 */
export async function abrirVeta(orden: OrdenDePago): Promise<boolean> {
  const enlace = enlaceDePago(orden)
  try {
    await Linking.openURL(enlace)
    return true
  } catch {
    return false
  }
}

export async function abrirTienda(): Promise<void> {
  await Linking.openURL(TIENDA).catch(() => {})
}

/** Un hash de transacción de la cadena: 0x y 64 hexadecimales. */
export function hashValido(v: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(v.trim())
}
