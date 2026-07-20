import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type WalletKind = 'address' | 'uid'

export interface VetaWallet {
  kind: WalletKind
  value: string
  connectedAt: string
}

interface WalletState {
  wallet: VetaWallet | null
  connect: (kind: WalletKind, value: string) => void
  disconnect: () => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      wallet: null,
      connect: (kind, value) => set({ wallet: { kind, value: value.trim(), connectedAt: new Date().toISOString() } }),
      disconnect: () => set({ wallet: null }),
    }),
    {
      name: 'mytokenpay-veta-wallet',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
