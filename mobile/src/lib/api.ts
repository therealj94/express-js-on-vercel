import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import type { Category, Company, Country, PublicUser } from './types'

const TOKEN_KEY = 'mtp_token'

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

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token)
  else await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

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

export const api = {
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
}
