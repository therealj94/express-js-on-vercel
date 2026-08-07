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
