import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ThemeName } from '../lib/themes'

interface ThemeState {
  themeName: ThemeName
  setTheme: (name: ThemeName) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeName: 'nocturno',
      setTheme: (themeName) => set({ themeName }),
    }),
    {
      name: 'mytokenpay-theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
