import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface OnboardingState {
  done: boolean
  hydrated: boolean
  setDone: () => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      done: false,
      hydrated: false,
      setDone: () => set({ done: true }),
    }),
    {
      name: 'mytokenpay-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ done: s.done }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    },
  ),
)
