import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface FavoritesState {
  ids: string[]
  toggle: (id: string) => void
  isFavorite: (id: string) => boolean
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [id, ...s.ids] })),
      isFavorite: (id) => get().ids.includes(id),
    }),
    {
      name: 'mytokenpay-favorites',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ ids: s.ids }),
    },
  ),
)
