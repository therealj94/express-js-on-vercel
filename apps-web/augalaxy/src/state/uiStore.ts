import { create } from 'zustand'
import type { Marea } from '../kernel/sim'

interface TearState {
  open: boolean
  x: number
  y: number
  id: string | null
}

interface UiState {
  tier: 0 | 1 | 2
  visor: boolean
  selectedId: string | null
  activeId: string | null
  marea: Marea
  eclipse: boolean
  pulsoOpen: boolean
  exposureBias: number
  volume: number
  tear: TearState
  toast: { key: number; text: string; urgent: boolean } | null
  setTier: (t: 0 | 1 | 2) => void
  setVisor: (v: boolean) => void
  select: (id: string | null) => void
  setActive: (id: string | null) => void
  setMarea: (m: Marea) => void
  cycleMarea: (dir: 1 | -1) => void
  setEclipse: (v: boolean) => void
  setPulso: (v: boolean) => void
  setExposureBias: (v: number) => void
  setVolume: (v: number) => void
  openTear: (x: number, y: number, id: string | null) => void
  closeTear: () => void
  showToast: (text: string, urgent?: boolean) => void
}

const MAREA_ORDER: Marea[] = ['alba', 'pleamar', 'bajamar']

export const useUiStore = create<UiState>()((set) => ({
  tier: 1,
  visor: false,
  selectedId: null,
  activeId: null,
  marea: 'alba',
  eclipse: false,
  pulsoOpen: false,
  exposureBias: 0,
  volume: 0.8,
  tear: { open: false, x: 0, y: 0, id: null },
  toast: null,
  setTier: (t) => set({ tier: t }),
  setVisor: (v: boolean) => set({ visor: v }),
  select: (id) => set({ selectedId: id }),
  setActive: (id) => set({ activeId: id }),
  setMarea: (m) => set({ marea: m }),
  cycleMarea: (dir) =>
    set((s) => {
      const i = MAREA_ORDER.indexOf(s.marea)
      const n = (i + dir + MAREA_ORDER.length) % MAREA_ORDER.length
      return { marea: MAREA_ORDER[n] }
    }),
  setEclipse: (v) => set({ eclipse: v }),
  setPulso: (v) => set({ pulsoOpen: v }),
  setExposureBias: (v) => set({ exposureBias: v }),
  setVolume: (v) => set({ volume: v }),
  openTear: (x, y, id) => set({ tear: { open: true, x, y, id }, selectedId: id }),
  closeTear: () => set((s) => ({ tear: { ...s.tear, open: false } })),
  showToast: (text, urgent = false) =>
    set({ toast: { key: Date.now() + Math.random(), text, urgent } }),
}))
