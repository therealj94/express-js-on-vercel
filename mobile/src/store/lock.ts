// ─────────────────────────────────────────────────────────────────────────────
// El bloqueo biométrico.
//
// Si el usuario lo activa, la app pide su rostro o su huella al abrirse y al
// volver de segundo plano. Es lo mismo que hace un banco, y por el mismo motivo:
// un teléfono desbloqueado sobre una mesa no debería enseñar el dinero de nadie.
//
// Dos cosas importan del diseño:
//
//   · La preferencia se guarda, pero la biometría NUNCA se guarda. No hay una
//     huella ni un rostro almacenado en ningún lado — eso vive en el chip seguro
//     del teléfono y la app solo pregunta «¿es quien dice ser?».
//
//   · Si el teléfono no tiene biometría configurada, la opción no se puede
//     activar. Prometer una cerradura que no existe es peor que no tenerla.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as LocalAuthentication from 'expo-local-authentication'

const CLAVE = 'mytokenpay-bloqueo'

export type TipoBiometria = 'rostro' | 'huella' | 'ninguna'

interface LockState {
  /** El usuario activó el bloqueo. */
  activado: boolean
  /** La app está bloqueada ahora mismo, esperando la biometría. */
  bloqueada: boolean
  /** Qué ofrece este teléfono, para enseñar el ícono y el texto correctos. */
  disponible: TipoBiometria
  cargar: () => Promise<void>
  /** Devuelve por qué no se pudo, o null si quedó activado. */
  activar: () => Promise<string | null>
  desactivar: () => void
  bloquear: () => void
  /** Pide la biometría; true si pasó. */
  desbloquear: () => Promise<boolean>
}

async function tipoDisponible(): Promise<TipoBiometria> {
  const hay = await LocalAuthentication.hasHardwareAsync()
  const inscrito = await LocalAuthentication.isEnrolledAsync()
  if (!hay || !inscrito) return 'ninguna'
  const tipos = await LocalAuthentication.supportedAuthenticationTypesAsync()
  if (tipos.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'rostro'
  return 'huella'
}

export const useLockStore = create<LockState>((set, get) => ({
  activado: false,
  bloqueada: false,
  disponible: 'ninguna',

  cargar: async () => {
    const [guardado, disponible] = await Promise.all([AsyncStorage.getItem(CLAVE), tipoDisponible()])
    const activado = guardado === 'si' && disponible !== 'ninguna'
    // Si arranca activado, arranca bloqueada: el primer gesto es identificarse.
    set({ activado, disponible, bloqueada: activado })
  },

  activar: async () => {
    const disponible = await tipoDisponible()
    if (disponible === 'ninguna') {
      return 'Tu teléfono no tiene rostro ni huella configurados. Activalos en los ajustes del sistema primero.'
    }
    // Se confirma con una prueba real antes de dar por buena la opción: activar
    // una cerradura que el usuario no sabe abrir lo dejaría fuera de su cuenta.
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirmá tu identidad para activar el bloqueo',
      cancelLabel: 'Cancelar',
    })
    if (!r.success) return 'No se pudo confirmar. El bloqueo quedó desactivado.'
    await AsyncStorage.setItem(CLAVE, 'si')
    set({ activado: true, disponible, bloqueada: false })
    return null
  },

  desactivar: () => {
    AsyncStorage.setItem(CLAVE, 'no')
    set({ activado: false, bloqueada: false })
  },

  bloquear: () => {
    if (get().activado) set({ bloqueada: true })
  },

  desbloquear: async () => {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloqueá MyTokenPay',
      cancelLabel: 'Cancelar',
    })
    if (r.success) set({ bloqueada: false })
    return r.success
  },
}))
