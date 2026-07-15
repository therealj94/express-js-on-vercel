import { create } from 'zustand'
import type { PublicUser } from '../types'
import { api, ApiError, getToken, setToken } from '../lib/api'

interface AuthState {
  user: PublicUser | null
  status: 'idle' | 'loading' | 'ready'
  error: string | null
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  error: null,

  init: async () => {
    const token = getToken()
    if (!token) {
      set({ status: 'ready' })
      return
    }
    try {
      const { user } = await api.me()
      set({ user, status: 'ready' })
    } catch {
      setToken(null)
      set({ user: null, status: 'ready' })
    }
  },

  login: async (email, password) => {
    set({ error: null })
    try {
      const { token, user } = await api.login({ email, password })
      setToken(token)
      set({ user })
    } catch (err) {
      set({ error: err instanceof ApiError ? err.message : 'No se pudo iniciar sesión' })
      throw err
    }
  },

  signup: async (email, password, fullName) => {
    set({ error: null })
    try {
      const { token, user } = await api.signup({ email, password, fullName })
      setToken(token)
      set({ user })
    } catch (err) {
      set({ error: err instanceof ApiError ? err.message : 'No se pudo crear la cuenta' })
      throw err
    }
  },

  logout: () => {
    setToken(null)
    set({ user: null })
  },

  refreshMe: async () => {
    try {
      const { user } = await api.me()
      set({ user })
    } catch {
      // ignore — keep stale user until next explicit action
    }
  },

  clearError: () => set({ error: null }),
}))
