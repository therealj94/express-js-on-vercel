import { create } from 'zustand'
import type { CatalogItem } from '../lib/commerce'

// Carrito efímero por comercio (no persiste): la pantalla del negocio agrega
// ítems y la pantalla de cobro (factura) lo consume.

export interface CartLine {
  item: CatalogItem
  qty: number
}

interface CartState {
  companyId: string | null
  companyName: string
  countrySlug: string
  lines: CartLine[]
  setCompany: (id: string, name: string, countrySlug: string) => void
  add: (item: CatalogItem) => void
  remove: (itemId: string) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  companyId: null,
  companyName: '',
  countrySlug: '',
  lines: [],

  setCompany: (id, name, countrySlug) => {
    if (get().companyId !== id) set({ companyId: id, companyName: name, countrySlug, lines: [] })
  },

  add: (item) =>
    set((s) => {
      const i = s.lines.findIndex((l) => l.item.id === item.id)
      if (i >= 0) {
        const lines = [...s.lines]
        lines[i] = { ...lines[i], qty: lines[i].qty + 1 }
        return { lines }
      }
      return { lines: [...s.lines, { item, qty: 1 }] }
    }),

  remove: (itemId) =>
    set((s) => {
      const i = s.lines.findIndex((l) => l.item.id === itemId)
      if (i < 0) return s
      const lines = [...s.lines]
      if (lines[i].qty > 1) lines[i] = { ...lines[i], qty: lines[i].qty - 1 }
      else lines.splice(i, 1)
      return { lines }
    }),

  clear: () => set({ lines: [] }),
}))

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((a, l) => a + l.qty, 0)
}

export function cartTotalUsd(lines: CartLine[]): number {
  return lines.reduce((a, l) => a + l.item.priceUsd * l.qty, 0)
}
