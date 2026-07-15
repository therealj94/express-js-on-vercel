import { randomUUID } from 'crypto'
import type { Company, PublicUser, User } from '../types.js'
import { buildSeedCompanies } from '../data/seed.js'

const users = new Map<string, User>()
const usersByEmail = new Map<string, string>()
const companies = new Map<string, Company>()

for (const company of buildSeedCompanies()) {
  companies.set(company.id, company)
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash, ...rest } = user
  return rest
}

export const db = {
  createUser(input: { email: string; passwordHash: string; fullName: string }): User {
    const id = randomUUID()
    const user: User = {
      id,
      email: input.email.toLowerCase().trim(),
      passwordHash: input.passwordHash,
      fullName: input.fullName.trim(),
      role: 'user',
      createdAt: new Date().toISOString(),
    }
    users.set(id, user)
    usersByEmail.set(user.email, id)
    return user
  },

  findUserByEmail(email: string): User | undefined {
    const id = usersByEmail.get(email.toLowerCase().trim())
    return id ? users.get(id) : undefined
  },

  findUserById(id: string): User | undefined {
    return users.get(id)
  },

  setUserRole(id: string, role: User['role']): void {
    const user = users.get(id)
    if (user) user.role = role
  },

  createCompany(input: Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'verified' | 'kyc'>): Company {
    const now = new Date().toISOString()
    const company: Company = {
      ...input,
      id: randomUUID(),
      verified: false,
      kyc: {
        status: 'unsubmitted',
        documents: [],
        submittedAt: null,
        reviewedAt: null,
        note: null,
      },
      createdAt: now,
      updatedAt: now,
    }
    companies.set(company.id, company)
    return company
  },

  updateCompany(id: string, patch: Partial<Company>): Company | undefined {
    const existing = companies.get(id)
    if (!existing) return undefined
    const updated: Company = {
      ...existing,
      ...patch,
      id: existing.id,
      ownerId: existing.ownerId,
      updatedAt: new Date().toISOString(),
    }
    companies.set(id, updated)
    return updated
  },

  findCompanyById(id: string): Company | undefined {
    return companies.get(id)
  },

  findCompanyByOwner(ownerId: string): Company | undefined {
    return [...companies.values()].find((c) => c.ownerId === ownerId)
  },

  listCompanies(filter: {
    country?: string
    city?: string
    category?: string
    q?: string
    verifiedOnly?: boolean
  }): Company[] {
    let list = [...companies.values()].filter((c) => c.kyc.status !== 'unsubmitted')
    if (filter.country) list = list.filter((c) => c.countrySlug === filter.country)
    if (filter.city) list = list.filter((c) => c.citySlug === filter.city)
    if (filter.category) list = list.filter((c) => c.categorySlug === filter.category)
    if (filter.verifiedOnly) list = list.filter((c) => c.verified)
    if (filter.q) {
      const q = filter.q.toLowerCase()
      list = list.filter(
        (c) =>
          c.tradeName.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.productsServices.some((p) => p.toLowerCase().includes(q)),
      )
    }
    return list.sort((a, b) => Number(b.verified) - Number(a.verified) || a.tradeName.localeCompare(b.tradeName))
  },
}
