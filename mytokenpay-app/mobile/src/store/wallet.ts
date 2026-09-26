import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type WalletKind = 'address' | 'uid'

export interface VetaWallet {
  kind: WalletKind
  value: string
  connectedAt: string
}

// El precio de ORIGEN ya no vive aquí: hubo un ORIGEN_USD = 2,35 fijo. Ahora
// sale del oro en vivo (src/store/precio.ts) y, sin dato fresco, es null.

export interface PaymentTx {
  id: string
  merchant: string
  merchantId: string | null
  amountOrigen: number
  /** Equivalente en USD al precio del momento; null si no había precio. */
  amountUsd: number | null
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
    /** Precio de 1 ORIGEN en USD ahora mismo, si lo hay (sólo para el recibo). */
    origenUsd?: number | null
  }) => PaymentTx | { error: string }
}

const INITIAL_ORIGEN = 21.28 // ≈ $50 en ORIGEN para compras (mismo saldo que Veta Wallet)

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      wallet: null,
      origenBalance: INITIAL_ORIGEN,
      payments: [],

      connect: (kind, value) =>
        set({ wallet: { kind, value: value.trim(), connectedAt: new Date().toISOString() } }),

      disconnect: () => set({ wallet: null }),

      pay: ({ merchant, merchantId = null, amountOrigen, method, note = null, origenUsd = null }) => {
        const balance = get().origenBalance
        if (amountOrigen <= 0) return { error: 'Ingresa un monto válido.' }
        if (amountOrigen > balance) return { error: 'Saldo ORIGEN insuficiente en tu Veta Wallet.' }
        const tx: PaymentTx = {
          id: `PAY-${Date.now().toString(36).toUpperCase()}`,
          merchant,
          merchantId,
          amountOrigen: Math.round(amountOrigen * 10000) / 10000,
          // El pago va en ORIGEN y no depende del precio; el equivalente en
          // USD es sólo informativo y, sin precio fresco, queda en null («—»).
          amountUsd: origenUsd != null && origenUsd > 0 ? Math.round(amountOrigen * origenUsd * 100) / 100 : null,
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
      name: 'mytokenpay-veta-wallet-v2', // v2: saldo inicial ≈ $50 en ORIGEN
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)

export function isPayError(r: PaymentTx | { error: string }): r is { error: string } {
  return (r as { error: string }).error !== undefined
}
