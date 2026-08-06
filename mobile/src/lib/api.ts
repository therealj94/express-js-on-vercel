import Constants from 'expo-constants'
import type { Category, Company, Country, PublicUser, Redemption, Reward } from './types'
import { getToken, setToken } from './token'
import { ApiError } from './apiError'
import { mockApi } from './mockApi'

export { getToken, setToken } from './token'
export { ApiError } from './apiError'

// La app habla con el backend real. El simulador (mockApi) queda solo como
// herramienta de desarrollo sin servidor: encenderlo rompe el POS a propósito,
// porque un token simulado no paga cobros de verdad.
export const USE_MOCK_API = false

function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  if (envUrl) return envUrl.replace(/\/$/, '')

  // When running through Expo Go, hostUri points at the dev machine's LAN IP
  // (the same one serving the Metro bundler) — reuse it for the API by
  // default so things "just work" without manual configuration.
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost
  if (hostUri) {
    const host = hostUri.split(':')[0]
    return `http://${host}:3001`
  }
  return 'http://localhost:3001'
}

export const API_URL = resolveApiUrl()

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...options, headers })
  } catch {
    throw new ApiError(
      `No se pudo conectar con la API en ${API_URL}. Verifica que el servidor esté corriendo y que el celular esté en la misma red Wi-Fi.`,
      0,
    )
  }

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await res.json() : null

  if (!res.ok) {
    throw new ApiError(body?.error ?? 'Ocurrió un error inesperado', res.status)
  }
  return body as T
}

async function requestRaiz<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new ApiError(`No se pudo conectar con la API en ${API_URL}.`, 0)
  }
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await res.json() : null
  if (!res.ok) throw new ApiError(body?.error ?? 'Ocurrió un error inesperado', res.status)
  return body as T
}

/**
 * El puente a Genesis ID, el registro de identidad del ecosistema. La clave de
 * API vive en el servidor; el teléfono solo presenta su propia sesión.
 */
export const genesis = {
  estado: () => requestRaiz<{ identidad: IdentidadGenesis }>('/genesis/estado'),
  datos: (d: { nombreCompleto: string; fechaNacimiento: string; paisResidencia: string; telefono?: string }) =>
    requestRaiz<{ identidad: IdentidadGenesis }>('/genesis/datos', { method: 'POST', body: JSON.stringify(d) }),
  documento: (mrz: string) =>
    requestRaiz<{ identidad: IdentidadGenesis; documento?: { aceptable: boolean; problemas: string[] } }>(
      '/genesis/documento',
      { method: 'POST', body: JSON.stringify({ mrz }) },
    ),
  biometria: (selfie: string) =>
    requestRaiz<{ identidad: IdentidadGenesis; biometria?: { estado: string; motivo?: string } }>(
      '/genesis/biometria',
      { method: 'POST', body: JSON.stringify({ selfie }) },
    ),
  vincular: () => requestRaiz<{ ok: boolean }>('/genesis/vincular', { method: 'POST', body: '{}' }),
  ssoToken: () =>
    requestRaiz<{ token: string; expiraEnSegundos: number }>('/genesis/sso/token', { method: 'POST', body: '{}' }),
}

export interface IdentidadGenesis {
  id: string
  email: string
  estado: 'iniciada' | 'datos' | 'documento' | 'biometria' | 'en-revision' | 'verificada' | 'rechazada' | 'suspendida'
  gid: string | null
  nombreLegal: string | null
  documentoAceptable: boolean | null
  faltan: number
  siguientePaso: string
  actualizadaEn: string
}

const realApi = {
  /** Entrar con un pase de sesión única emitido desde Veta Wallet. */
  sso: (data: { token: string; email: string }) =>
    request<{ token: string; user: PublicUser; genesis: { gid: string; nombre: string | null } }>('/auth/sso', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  signup: (data: { email: string; password: string; fullName: string }) =>
    request<{ token: string; user: PublicUser }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: PublicUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => request<{ user: PublicUser }>('/auth/me'),

  deleteAccount: () => request<void>('/auth/me', { method: 'DELETE' }),

  forgotPassword: (email: string) =>
    request<{ message: string; demoResetToken?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),

  categories: () => request<{ categories: Category[] }>('/categories'),

  countries: () => request<{ countries: Country[] }>('/countries'),

  listCompanies: (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value)
    }
    const qs = search.toString()
    return request<{ companies: Company[] }>(`/companies${qs ? `?${qs}` : ''}`)
  },

  getCompany: (id: string) => request<{ company: Company }>(`/companies/${id}`),

  myCompany: () => request<{ company: Company | null }>('/companies/mine'),

  createCompany: (data: Partial<Company>) =>
    request<{ company: Company }>('/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCompany: (id: string, data: Partial<Company>) =>
    request<{ company: Company }>(`/companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  submitKyc: (id: string, documents: { label: string; dataUrl: string }[]) =>
    request<{ company: Company }>(`/companies/${id}/kyc`, {
      method: 'POST',
      body: JSON.stringify({ documents }),
    }),

  listRewards: () => request<{ rewards: Reward[] }>('/rewards'),

  myRewardsState: () => request<{ pointsBalance: number; redemptions: Redemption[] }>('/rewards/mine'),

  redeemReward: (rewardId: string) =>
    request<{ pointsBalance: number; redemption: Redemption }>(`/rewards/${rewardId}/redeem`, {
      method: 'POST',
    }),
}

// El simulador no conoce las rutas nuevas (sso, genesis); si un día se
// enciende para desarrollo, que truene en la pantalla que las use — por eso
// el molde es el de la API real.
export const api: typeof realApi = USE_MOCK_API ? (mockApi as unknown as typeof realApi) : realApi
