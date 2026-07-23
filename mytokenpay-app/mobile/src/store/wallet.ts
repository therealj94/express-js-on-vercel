import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type WalletKind = 'address' | 'uid'

export interface VetaWallet {
  kind: WalletKind
  value: string
  connectedAt: string
}

// Precio simulado: 1 ORIGEN = 1/55 de gramo de oro ($129.26/g jul 2026)
export const ORIGEN_USD = 2.35

export interface PaymentTx {
  id: string
  merchant: string
  merchantId: string | null
  amountOrigen: number
  amountUsd: number
  method: 'qr' | 'transfer'
  note: string | null
  createdAt: string
}

interface WalletState {
  wallet: VetaWallet | null
  /** Saldo ORIGEN reflejado desde la Veta Wallet conectada (simulado sin backend). */
  origenBalance: number
  payments: PaymentTx[]
  connect: (kind: WalletKind, value: string) => void
  disconnect: () => void
  /** Paga a un comercio descontando ORIGEN de la Veta Wallet. */
  pay: (input: {
    merchant: string
    merchantId?: string | null
    amountOrigen: number
    method: 'qr' | 'transfer'
    note?: string | null
  }) => PaymentTx | { error: string }
}

const INITIAL_ORIGEN = 250 // mismo saldo demo que la app Veta Wallet

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      wallet: null,
      origenBalance: INITIAL_ORIGEN,
      payments: [],

      connect: (kind, value) =>
        set({ wallet: { kind, value: value.trim(), connectedAt: new Date().toISOString() } }),

      disconnect: () => set({ wallet: null }),

      pay: ({ merchant, merchantId = null, amountOrigen, method, note = null }) => {
        const balance = get().origenBalance
        if (amountOrigen <= 0) return { error: 'Ingresa un monto válido.' }
        if (amountOrigen > balance) return { error: 'Saldo ORIGEN insuficiente en tu Veta Wallet.' }
        const tx: PaymentTx = {
          id: `PAY-${Date.now().toString(36).toUpperCase()}`,
          merchant,
          merchantId,
          amountOrigen: Math.round(amountOrigen * 10000) / 10000,
          amountUsd: Math.round(amountOrigen * ORIGEN_USD * 100) / 100,
          method,
          note,
          createdAt: new Date().toISOString(),
        }
        set({
          origenBalance: Math.round((balance - amountOrigen) * 10000) / 10000,
          payments: [tx, ...get().payments],
        })
        return tx
      },
    }),
    {
      name: 'mytokenpay-veta-wallet',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)

export function isPayError(r: PaymentTx | { error: string }): r is { error: string } {
  return (r as { error: string }).error !== undefined
}
