import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Lado del comercio: cobros recibidos en ORIGEN y retiros (cash out) a moneda
// local. El saldo del negocio vive en su Veta Wallet — ambos siempre reflejan
// el mismo monto en ORIGEN; el retiro descuenta de ese único saldo.

export interface SaleItem {
  name: string
  qty: number
  priceOrigen: number
}

export interface Sale {
  id: string
  companyId: string
  invoiceId: string
  payer: string
  method: 'wallet' | 'qr' | 'split'
  items: SaleItem[]
  tipOrigen: number
  totalOrigen: number
  createdAt: string
}

export interface Cashout {
  id: string
  companyId: string
  amountOrigen: number
  amountLocal: number
  currency: string
  bank: string
  accountMasked: string
  createdAt: string
}

interface BusinessState {
  sales: Sale[]
  cashouts: Cashout[]
  recordSale: (sale: Omit<Sale, 'id' | 'createdAt'>) => Sale
  requestCashout: (input: {
    companyId: string
    amountOrigen: number
    amountLocal: number
    currency: string
    bank: string
    account: string
  }) => Cashout | { error: string }
  balanceOf: (companyId: string) => number
  salesOf: (companyId: string) => Sale[]
  cashoutsOf: (companyId: string) => Cashout[]
}

function mask(account: string): string {
  const digits = account.replace(/\D/g, '')
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : account
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString()
}

// Ventas históricas de arranque para que los dashboards demo tengan vida.
const SEED_SALES: Sale[] = [
  {
    id: 'S-CAFE-001', companyId: 'mtp-demo-cafe', invoiceId: 'INV-88120', payer: 'María G.', method: 'qr',
    items: [{ name: 'Cappuccino Veta', qty: 2, priceOrigen: 1.66 }, { name: 'Cheesecake de café', qty: 1, priceOrigen: 2.55 }],
    tipOrigen: 0.3, totalOrigen: 6.17, createdAt: hoursAgo(3),
  },
  {
    id: 'S-CAFE-002', companyId: 'mtp-demo-cafe', invoiceId: 'INV-88119', payer: 'Carlos L.', method: 'wallet',
    items: [{ name: 'Bolsa de grano 340 g', qty: 1, priceOrigen: 6.17 }],
    tipOrigen: 0, totalOrigen: 6.17, createdAt: hoursAgo(26),
  },
  {
    id: 'S-HOTEL-001', companyId: 'mtp-demo-hotel', invoiceId: 'INV-77210', payer: 'Ana R.', method: 'split',
    items: [{ name: 'Suite vista al mar (noche)', qty: 2, priceOrigen: 61.7 }, { name: 'Tour de snorkel', qty: 2, priceOrigen: 16.6 }],
    tipOrigen: 8, totalOrigen: 164.6, createdAt: hoursAgo(20),
  },
  {
    id: 'S-GYM-001', companyId: 'mtp-demo-gym', invoiceId: 'INV-66120', payer: 'Luis P.', method: 'wallet',
    items: [{ name: 'Membresía mensual', qty: 1, priceOrigen: 17.87 }],
    tipOrigen: 0, totalOrigen: 17.87, createdAt: hoursAgo(7),
  },
  {
    id: 'S-TECH-001', companyId: 'mtp-demo-tech', invoiceId: 'INV-55310', payer: 'José E.', method: 'qr',
    items: [{ name: 'Audífonos inalámbricos', qty: 1, priceOrigen: 25.11 }, { name: 'Funda + vidrio templado', qty: 1, priceOrigen: 6.38 }],
    tipOrigen: 0, totalOrigen: 31.49, createdAt: hoursAgo(50),
  },
]

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      sales: SEED_SALES,
      cashouts: [],

      recordSale: (sale) => {
        const full: Sale = {
          ...sale,
          id: `S-${Date.now().toString(36).toUpperCase()}`,
          createdAt: new Date().toISOString(),
        }
        set({ sales: [full, ...get().sales] })
        return full
      },

      requestCashout: ({ companyId, amountOrigen, amountLocal, currency, bank, account }) => {
        const balance = get().balanceOf(companyId)
        if (amountOrigen <= 0) return { error: 'Ingresa un monto válido.' }
        if (amountOrigen > balance) return { error: 'El monto supera el saldo ORIGEN disponible del negocio.' }
        if (!bank) return { error: 'Selecciona el banco de destino.' }
        if (account.replace(/\D/g, '').length < 6) return { error: 'Ingresa un número de cuenta válido.' }
        const co: Cashout = {
          id: `CO-${Date.now().toString(36).toUpperCase()}`,
          companyId,
          amountOrigen: Math.round(amountOrigen * 100) / 100,
          amountLocal,
          currency,
          bank,
          accountMasked: mask(account),
          createdAt: new Date().toISOString(),
        }
        set({ cashouts: [co, ...get().cashouts] })
        return co
      },

      balanceOf: (companyId) => {
        const inflow = get().sales.filter((s) => s.companyId === companyId).reduce((a, s) => a + s.totalOrigen, 0)
        const out = get().cashouts.filter((c) => c.companyId === companyId).reduce((a, c) => a + c.amountOrigen, 0)
        return Math.max(0, Math.round((inflow - out) * 100) / 100)
      },

      salesOf: (companyId) => get().sales.filter((s) => s.companyId === companyId),
      cashoutsOf: (companyId) => get().cashouts.filter((c) => c.companyId === companyId),
    }),
    {
      name: 'mytokenpay-business',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)

export function isCashoutError(r: Cashout | { error: string }): r is { error: string } {
  return (r as { error: string }).error !== undefined
}
