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

// ============================================================
// Cuentas DEMO del ecosistema (usuario y contraseña reales para
// entrar en la app — ver README). Cada dueño ya tiene Genesis ID
// verificado y una empresa inscrita y verificada con catálogo.
// ============================================================
interface DemoSeed {
  user: { id: string; email: string; password: string; fullName: string; genesisUid: string }
  company: {
    id: string
    tradeName: string
    legalName: string
    categorySlug: string
    countrySlug: string
    citySlug: string
    address: string
    lat: number
    lng: number
    description: string
    productsServices: string[]
  }
}

export const DEMO_SEEDS: DemoSeed[] = [
  {
    user: { id: 'demo-owner-cafe', email: 'cafe.veta@mytokenpay.demo', password: 'Cafe2026!', fullName: 'Carmen Aguilar', genesisUid: 'GEN-1101-2201' },
    company: {
      id: 'mtp-demo-cafe', tradeName: 'Café Veta Roasters', legalName: 'Café Veta Roasters S. de R.L.',
      categorySlug: 'cafeterias', countrySlug: 'honduras', citySlug: 'tegucigalpa',
      address: 'Col. Palmira, Ave. República de Chile', lat: 14.0932, lng: -87.1959,
      description: 'Tostaduría de especialidad con grano hondureño de altura. Café, repostería y baleadas gourmet — todo pagable en ORIGEN.',
      productsServices: ['Espresso doble', 'Cappuccino Veta', 'Cold brew', 'Baleada gourmet', 'Grano en bolsa'],
    },
  },
  {
    user: { id: 'demo-owner-hotel', email: 'bahia.hotel@mytokenpay.demo', password: 'Hotel2026!', fullName: 'Diego Martínez', genesisUid: 'GEN-1102-2202' },
    company: {
      id: 'mtp-demo-hotel', tradeName: 'Bahía Esmeralda Hotel', legalName: 'Bahía Esmeralda Hospitality S.A.',
      categorySlug: 'hoteles', countrySlug: 'honduras', citySlug: 'roatan',
      address: 'West Bay Beach, Roatán', lat: 16.2711, lng: -86.5931,
      description: 'Hotel boutique frente al arrecife con suites vista al mar, tours de snorkel y cenas en la playa.',
      productsServices: ['Habitación estándar', 'Suite vista al mar', 'Tour de snorkel', 'Cena en la playa', 'Traslados'],
    },
  },
  {
    user: { id: 'demo-owner-gym', email: 'ironhouse.gym@mytokenpay.demo', password: 'Gym2026!', fullName: 'Sofía Ramírez', genesisUid: 'GEN-1103-2203' },
    company: {
      id: 'mtp-demo-gym', tradeName: 'Ironhouse Gym', legalName: 'Ironhouse Fitness S.A.',
      categorySlug: 'gimnasios', countrySlug: 'guatemala', citySlug: 'ciudad-de-guatemala',
      address: 'Zona 10, Blvd. Los Próceres', lat: 14.5891, lng: -90.5109,
      description: 'Gimnasio de fuerza y acondicionamiento con entrenadores certificados, clases grupales y planes nutricionales.',
      productsServices: ['Día de entrenamiento', 'Membresía mensual', 'Entrenamiento personal', 'Plan nutricional'],
    },
  },
  {
    user: { id: 'demo-owner-tech', email: 'nova.tech@mytokenpay.demo', password: 'Tech2026!', fullName: 'Marco Flores', genesisUid: 'GEN-1104-2204' },
    company: {
      id: 'mtp-demo-tech', tradeName: 'Nova Tech Center', legalName: 'Nova Tech Center S.A. de C.V.',
      categorySlug: 'tecnologia', countrySlug: 'el-salvador', citySlug: 'san-salvador',
      address: 'Col. Escalón, Paseo General Escalón', lat: 13.7013, lng: -89.2244,
      description: 'Tienda de tecnología y centro de servicio: accesorios, wearables y reparaciones el mismo día.',
      productsServices: ['Audífonos inalámbricos', 'Cargadores rápidos', 'Cambio de pantalla', 'Smartwatch Nova'],
    },
  },
]

export const DEMO_CLIENT = { id: 'demo-client', email: 'cliente@mytokenpay.demo', password: 'Origen2026!', fullName: 'José Cliente', genesisUid: 'GEN-1100-2200' }

function seedDemoAccounts() {
  const now = new Date().toISOString()
  const verifiedKyc = { status: 'verified' as const, documentLabel: 'Genesis ID', submittedAt: now, reviewedAt: now }
  const mkUser = (u: { id: string; email: string; password: string; fullName: string; genesisUid: string }): MockUser => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: 'user',
    kyc: verifiedKyc,
    createdAt: now,
    genesisUid: u.genesisUid,
    password: u.password,
    pointsBalance: STARTING_POINTS,
    redemptions: [],
  })
  users.push(mkUser(DEMO_CLIENT))
  for (const seed of DEMO_SEEDS) {
    users.push(mkUser(seed.user))
    companies.push({
      id: seed.company.id,
      ownerId: seed.user.id,
      legalName: seed.company.legalName,
      tradeName: seed.company.tradeName,
      taxId: `TAX-${seed.company.id.toUpperCase()}`,
      categorySlug: seed.company.categorySlug,
      productsServices: seed.company.productsServices,
      countrySlug: seed.company.countrySlug,
      citySlug: seed.company.citySlug,
      address: seed.company.address,
      lat: seed.company.lat,
      lng: seed.company.lng,
      description: seed.company.description,
      logoDataUrl: `https://picsum.photos/seed/${seed.company.id}-logo/300/300`,
      coverDataUrl: `https://picsum.photos/seed/${seed.company.id}-cover/900/560`,
      gallery: [
        `https://picsum.photos/seed/${seed.company.id}-g1/700/700`,
        `https://picsum.photos/seed/${seed.company.id}-g2/700/700`,
      ],
      socials: {},
      hours: null,
      kyc: { status: 'verified', documents: [], submittedAt: now, reviewedAt: now, note: null },
      verified: true,
      acceptsOrigen: true,
      createdAt: now,
      updatedAt: now,
    })
  }
}
seedDemoAccounts()

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
