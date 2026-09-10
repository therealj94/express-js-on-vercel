// Telemetría de Veta Wallet.
//
// Configura el cliente de Genesis ID y expone las llamadas que usa la app.
// Todo lo que se manda de aquí es anónimo: el identificador del usuario se
// convierte en huella irreversible del lado del servidor, y la dirección IP
// nunca se guarda.
//
// La clave que va aquí es la PÚBLICA de ingesta (`gidp_…`), no la secreta.
// Solo abre la ruta de telemetría, solo escribe y no lee nada — por eso puede
// vivir dentro del APK. La secreta, la que también abre identidades, se queda
// en el backend y no se acerca a este archivo.

import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { telemetria as motor } from './telemetriaCliente'

const extra = Constants?.expoConfig?.extra ?? {}

/** Se puede apagar del todo sin quitar ni una llamada de la app. */
const ACTIVA = extra.telemetriaActiva !== false

export function arrancarTelemetria() {
  if (!ACTIVA) return
  motor.iniciar({
    url: extra.genesisUrl || 'https://genesis-id.onrender.com',
    clavePublica: extra.telemetriaClave || '',
    app: 'veta-wallet',
    version: Constants?.expoConfig?.version || '0',
    plataforma: Platform.OS,
  })
  motor.sesionAbierta()
}

/** Al entrar y al salir. El id que se pasa nunca viaja en claro. */
export const identificar = (id) => motor.identificar(id)
export const olvidar = () => motor.olvidar()

/** Atajos con nombre, para que las llamadas en la app se lean solas. */
export const verPantalla = (nombre) => motor.pantalla(nombre)
export const registrarAlta = () => motor.registro()
export const hizo = (accion, extra) => motor.accion(accion, extra)
export const envio = (monto, moneda) => motor.transaccion('envio', monto, moneda)
export const fallo = (e, extra) => motor.error(e, extra)
export const tardo = (nombre, ms) => motor.rendimiento(nombre, ms)

export default motor

/**
 * Da de alta a esta persona en el padrón de Genesis ID con su propia sesión.
 *
 * No se manda el padrón de nadie: se manda el JWT que firmó el backend de Veta
 * Wallet, y Genesis ID le pregunta a ESE backend si lo reconoce. Si dice que
 * no, no se escribe nada. Por eso puede ir con la clave pública sin abrir
 * ninguna puerta — lo que autoriza no es la clave, es tener sesión de verdad.
 *
 * Sin esto el panel ve la conexión pero no sabe de quién es: sale «fuera del
 * padrón», sin nombre y sin billetera.
 */
export async function confirmarEnPadron(token, datos = {}) {
  try {
    if (!ACTIVA || !token || !extra.telemetriaClave) return
    await fetch(
      (extra.genesisUrl || 'https://genesis-id.onrender.com') + '/api/v1/directorio/confirmar',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telemetria-Key': extra.telemetriaClave,
        },
        body: JSON.stringify({
          token,
          // Solo se usan si el token no los trae, y quedan marcados como no
          // confirmados. El token siempre manda.
          email: datos.email, nombre: datos.nombre,
          direccionWallet: datos.direccionWallet,
        }),
      },
    )
  } catch (e) { /* se reintenta en el próximo ingreso */ }
}

/**
 * El identificador de la persona, sacado del token.
 *
 * TIENE que coincidir con el que Genesis ID saca de ese mismo token al dar el
 * alta, o la huella de telemetría no cuadra con la fila del padrón y todo sale
 * como «fuera del padrón» sin un solo error visible. Por eso se calcula sobre
 * el token y no sobre el objeto de cuenta local, que podría no llevar el mismo
 * campo.
 */
export function idDelToken(token) {
  try {
    const p = String(token || '').split('.')[1]
    if (!p) return null
    const json = decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/'))))
    const c = JSON.parse(json)
    const bruto = c.idExterno ?? c._id ?? c.id ?? c.sub ?? c.userId ?? c.uid ?? c.email
    return bruto ? String(bruto) : null
  } catch (e) { return null }
}
