import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Genesis ID — verificación de identidad unificada de Orden Global.
// El progreso se persiste para que, si el usuario sale a mitad del flujo
// (por ejemplo después de dejar su correo), al volver continúe exactamente
// donde quedó en lugar de empezar de cero.

export type GenesisStep =
  | 'email'      // capturar correo
  | 'doc-front'  // escanear frente del documento (30 s)
  | 'doc-back'   // escanear reverso del documento (30 s)
  | 'face'       // verificación facial (30 s)
  | 'processing' // validando con Genesis
  | 'review24'   // no completó a tiempo → revisión manual hasta 24 h
  | 'done'       // identidad verificada

export const SCAN_SECONDS = 30

interface GenesisState {
  step: GenesisStep
  email: string
  startedAt: string | null
  verifiedAt: string | null
  review24At: string | null
  genesisUid: string | null
  setEmail: (email: string) => void
  advance: (next: GenesisStep) => void
  markReview24: () => void
  markVerified: () => void
  reset: () => void
}

function makeUid(): string {
  const n = () => Math.floor(1000 + Math.random() * 9000)
  return `GEN-${n()}-${n()}`
}

export const useGenesisStore = create<GenesisState>()(
  persist(
    (set) => ({
      step: 'email',
      email: '',
      startedAt: null,
      verifiedAt: null,
      review24At: null,
      genesisUid: null,

      setEmail: (email) =>
        set({ email: email.trim(), step: 'doc-front', startedAt: new Date().toISOString() }),

      advance: (next) => set({ step: next }),

      markReview24: () => set({ step: 'review24', review24At: new Date().toISOString() }),

      markVerified: () =>
        set({ step: 'done', verifiedAt: new Date().toISOString(), genesisUid: makeUid() }),

      reset: () =>
        set({ step: 'email', email: '', startedAt: null, verifiedAt: null, review24At: null, genesisUid: null }),
    }),
    {
      name: 'genesis-id-flow',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
