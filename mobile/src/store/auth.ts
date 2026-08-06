import { create } from 'zustand'
import type { PublicUser } from '../lib/types'
import { api, ApiError, setToken } from '../lib/api'

interface AuthState {
  user: PublicUser | null
  status: 'idle' | 'loading' | 'ready'
  error: string | null
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  /** Entrar con un pase de sesión única de Genesis ID (viene de Veta Wallet). */
  loginConGenesis: (token: string, email: string) => Promise<{ gid: string; nombre: string | null }>
  signup: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => void
  deleteAccount: () => Promise<void>
  refreshMe: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  error: null,

  init: async () => {
    try {
      const { user } = await api.me()
      set({ user, status: 'ready' })
    } catch {
      await setToken(null)
      set({ user: null, status: 'ready' })
    }
  },

  login: async (email, password) => {
    set({ error: null })
    try {
      const { token, user } = await api.login({ email, password })
      await setToken(token)
      set({ user })
    } catch (err) {
      set({ error: err instanceof ApiError ? err.message : 'No se pudo iniciar sesión' })
      throw err
    }
  },

  loginConGenesis: async (token, email) => {
    set({ error: null })
    try {
      const r = await api.sso({ token, email })
      await setToken(r.token)
      set({ user: r.user })
      return { gid: r.genesis.gid, nombre: r.genesis.nombre }
    } catch (err) {
      set({ error: err instanceof ApiError ? err.message : 'No se pudo entrar con Genesis ID' })
      throw err
    }
  },

  signup: async (email, password, fullName) => {
    set({ error: null })
    try {
      const { token, user } = await api.signup({ email, password, fullName })
      await setToken(token)
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

  deleteAccount: async () => {
    await api.deleteAccount()
    await setToken(null)
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
