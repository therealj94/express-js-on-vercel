// Simulated backend: lets the app run fully offline (no server, no Wi-Fi
// pairing) using in-memory data seeded from mockData.ts. Swap back to the
// real backend at any time by flipping USE_MOCK_API in api.ts — nothing
// else in the app needs to change, since this file matches the real `api`
// object's shape exactly.
import { getToken, setToken } from './token'
import { ApiError } from './apiError'
import type { Category, Company, Country, PublicUser, Redemption, Reward } from './types'
import { MOCK_CATEGORIES, MOCK_COUNTRIES, MOCK_REWARDS, createMockCompanies } from './mockData'

interface MockUser extends PublicUser {
  password: string
  pointsBalance: number
  redemptions: Redemption[]
}

const STARTING_POINTS = 480

const users: MockUser[] = []
let companies: Company[] = createMockCompanies()
const resetTokens = new Map<string, string>() // resetToken -> userId

function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function toPublic(user: MockUser): PublicUser {
  const { password: _password, pointsBalance: _pointsBalance, redemptions: _redemptions, ...rest } = user
  return rest
}

async function currentUser(): Promise<MockUser> {
  const token = await getToken()
  const userId = token?.startsWith('mock.') ? token.slice(5) : null
  const user = userId ? users.find((u) => u.id === userId) : undefined
  if (!user) throw new ApiError('Tu sesión expiró, inicia sesión de nuevo', 401)
  return user
}

export const mockApi = {
  signup: async (data: { email: string; password: string; fullName: string }) => {
    await delay(null, 450)
    const email = data.email.toLowerCase().trim()
    if (!data.fullName.trim() || !email || !data.password) {
      throw new ApiError('Correo, contraseña y nombre completo son requeridos', 400)
    }
    if (data.password.length < 8) {
      throw new ApiError('La contraseña debe tener al menos 8 caracteres', 400)
    }
    if (users.some((u) => u.email === email)) {
      throw new ApiError('Ya existe una cuenta con este correo', 409)
    }
    const user: MockUser = {
      id: randomId(),
      email,
      fullName: data.fullName.trim(),
      role: 'user',
      kyc: { status: 'unsubmitted', documentLabel: null, submittedAt: null, reviewedAt: null },
      createdAt: new Date().toISOString(),
      password: data.password,
      pointsBalance: STARTING_POINTS,
      redemptions: [],
    }
    users.push(user)
    const token = `mock.${user.id}`
    await setToken(token)
    return { token, user: toPublic(user) }
  },

  login: async (data: { email: string; password: string }) => {
    await delay(null, 400)
    const email = data.email.toLowerCase().trim()
    const user = users.find((u) => u.email === email && u.password === data.password)
    if (!user) throw new ApiError('Credenciales inválidas', 401)
    const token = `mock.${user.id}`
    await setToken(token)
    return { token, user: toPublic(user) }
  },

  me: async () => {
    const user = await currentUser()
    return { user: toPublic(user) }
  },

  deleteAccount: async () => {
    const user = await currentUser()
    const idx = users.findIndex((u) => u.id === user.id)
    if (idx >= 0) users.splice(idx, 1)
    companies = companies.filter((c) => c.ownerId !== user.id)
    await setToken(null)
  },

  forgotPassword: async (email: string) => {
    await delay(null, 400)
    const message = 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.'
    const user = users.find((u) => u.email === email.toLowerCase().trim())
    if (!user) return { message }
    const resetToken = `mock-reset.${randomId()}`
    resetTokens.set(resetToken, user.id)
    return { message, demoResetToken: resetToken }
  },

  resetPassword: async (token: string, newPassword: string) => {
    await delay(null, 400)
    if (newPassword.length < 8) throw new ApiError('La contraseña debe tener al menos 8 caracteres', 400)
    const userId = resetTokens.get(token)
    const user = userId ? users.find((u) => u.id === userId) : undefined
    if (!user) throw new ApiError('El enlace de restablecimiento no es válido o ha expirado', 400)
    user.password = newPassword
    resetTokens.delete(token)
    return { message: 'Contraseña actualizada correctamente' }
  },

  categories: async () => delay<{ categories: Category[] }>({ categories: MOCK_CATEGORIES }, 200),

  countries: async () => delay<{ countries: Country[] }>({ countries: MOCK_COUNTRIES }, 200),

  listCompanies: async (params: Record<string, string | undefined>) => {
    await delay(null, 300)
    let list = companies.filter((c) => c.kyc.status !== 'unsubmitted')
    if (params.country) list = list.filter((c) => c.countrySlug === params.country)
    if (params.city) list = list.filter((c) => c.citySlug === params.city)
    if (params.category) list = list.filter((c) => c.categorySlug === params.category)
    if (params.q) {
      const q = params.q.toLowerCase()
      list = list.filter(
        (c) =>
          c.tradeName.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.productsServices.some((p) => p.toLowerCase().includes(q)),
      )
    }
    list = [...list].sort((a, b) => Number(b.verified) - Number(a.verified) || a.tradeName.localeCompare(b.tradeName))
    return { companies: list }
  },

  getCompany: async (id: string) => {
    await delay(null, 250)
    const company = companies.find((c) => c.id === id)
    if (!company) throw new ApiError('Comercio no encontrado', 404)
    return { company }
  },

  myCompany: async () => {
    const user = await currentUser()
    await delay(null, 200)
    const company = companies.find((c) => c.ownerId === user.id) ?? null
    return { company }
  },

  createCompany: async (data: Partial<Company>) => {
    const user = await currentUser()
    await delay(null, 500)
    if (companies.some((c) => c.ownerId === user.id)) {
      throw new ApiError('Ya tienes una empresa registrada', 409)
    }
    const now = new Date().toISOString()
    const company: Company = {
      id: randomId(),
      ownerId: user.id,
      legalName: data.legalName ?? '',
      tradeName: data.tradeName ?? '',
      taxId: data.taxId ?? '',
      categorySlug: data.categorySlug ?? '',
      productsServices: data.productsServices ?? [],
      countrySlug: data.countrySlug ?? '',
      citySlug: data.citySlug ?? '',
      address: data.address ?? '',
      lat: data.lat ?? 0,
      lng: data.lng ?? 0,
      description: data.description ?? '',
      logoDataUrl: data.logoDataUrl ?? null,
      coverDataUrl: data.coverDataUrl ?? null,
      gallery: data.gallery ?? [],
      socials: data.socials ?? {},
      hours: data.hours ?? null,
      kyc: { status: 'unsubmitted', documents: [], submittedAt: null, reviewedAt: null, note: null },
      verified: false,
      acceptsOrigen: true,
      createdAt: now,
      updatedAt: now,
    }
    companies.push(company)
    return { company }
  },

  updateCompany: async (id: string, data: Partial<Company>) => {
    await delay(null, 400)
    const idx = companies.findIndex((c) => c.id === id)
    if (idx < 0) throw new ApiError('Empresa no encontrada', 404)
    companies[idx] = {
      ...companies[idx],
      ...data,
      id: companies[idx].id,
      ownerId: companies[idx].ownerId,
      updatedAt: new Date().toISOString(),
    }
    return { company: companies[idx] }
  },

  submitKyc: async (id: string, documents: { label: string; dataUrl: string }[]) => {
    await delay(null, 600)
    const idx = companies.findIndex((c) => c.id === id)
    if (idx < 0) throw new ApiError('Empresa no encontrada', 404)
    if (!documents || documents.length === 0) throw new ApiError('Debes adjuntar al menos un documento', 400)
    const now = new Date().toISOString()
    companies[idx] = {
      ...companies[idx],
      kyc: {
        status: 'pending',
        documents: documents.map((d) => ({ id: randomId(), label: d.label, dataUrl: d.dataUrl, uploadedAt: now })),
        submittedAt: now,
        reviewedAt: null,
        note: null,
      },
      updatedAt: now,
    }
    return { company: companies[idx] }
  },

  submitUserKyc: async (documentLabel: string) => {
    const user = await currentUser()
    await delay(null, 500)
    const now = new Date().toISOString()
    user.kyc = { status: 'pending', documentLabel, submittedAt: now, reviewedAt: null }
    // Personal ID checks are automated in this demo (unlike business KYB, which
    // stays "pending" for manual review) — simulate a quick automatic approval.
    setTimeout(() => {
      if (user.kyc.status === 'pending' && user.kyc.submittedAt === now) {
        user.kyc = { ...user.kyc, status: 'verified', reviewedAt: new Date().toISOString() }
      }
    }, 1800)
    return { user: toPublic(user) }
  },

  listRewards: async () => delay<{ rewards: Reward[] }>({ rewards: MOCK_REWARDS }, 250),

  myRewardsState: async () => {
    const user = await currentUser()
    await delay(null, 150)
    return { pointsBalance: user.pointsBalance, redemptions: user.redemptions }
  },

  redeemReward: async (rewardId: string) => {
    const user = await currentUser()
    await delay(null, 500)
    const reward = MOCK_REWARDS.find((r) => r.id === rewardId)
    if (!reward) throw new ApiError('Recompensa no encontrada', 404)
    if (user.pointsBalance < reward.pointsCost) {
      throw new ApiError('No tienes suficientes puntos ORIGEN para este canje', 400)
    }
    user.pointsBalance -= reward.pointsCost
    const redemption: Redemption = { id: randomId(), rewardId, redeemedAt: new Date().toISOString() }
    user.redemptions = [redemption, ...user.redemptions]
    return { pointsBalance: user.pointsBalance, redemption }
  },
}
