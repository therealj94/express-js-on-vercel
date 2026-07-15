import type { Category, Company, Country, PublicUser } from '../types'

const TOKEN_KEY = 'mtp_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, { ...options, headers })
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
