import { randomUUID } from 'crypto'
import type { Company, PublicUser, User } from '../types.js'
import { buildSeedCompanies } from '../data/seed.js'
import { coleccion } from './almacen.js'

const usuarios = coleccion<User>('usuarios')
const comercios = coleccion<Company>('comercios')

export function toPublicUser(user: User): PublicUser {
  const { passwordHash, ...rest } = user
  return rest
}

export const db = {
  /**
   * Siembra el directorio de comercios de demostración, una sola vez.
   *
   * Los comercios semilla tienen `id` estable, así que reinsertar es idempotente;
   * aun así solo se guarda el que falta, para no pisar los que el administrador
   * ya haya editado o verificado.
   */
  async sembrarComercios(): Promise<void> {
    for (const company of buildSeedCompanies()) {
      const existe = await comercios.uno({ id: company.id })
      if (!existe) await comercios.guardar(company)
    }
  },

  /**
   * Asegura que exista el administrador que paga los retiros.
   *
   * No se puede llegar a administrador registrándose: el rol solo se concede
   * aquí, desde variables de entorno del servidor. Si algún día se necesitan
   * más administradores, los crea uno que ya lo sea — nunca el formulario de
   * alta público.
   */
  async asegurarAdministrador(email: string, passwordHash: string): Promise<User> {
    const existente = await db.findUserByEmail(email)
    if (existente) {
      existente.role = 'admin'
      await usuarios.guardar(existente)
      return existente
    }
    const user = await db.createUser({ email, passwordHash, fullName: 'Administración Orden Global' })
    user.role = 'admin'
    await usuarios.guardar(user)
    return user
  },

  async createUser(input: { email: string; passwordHash: string; fullName: string }): Promise<User> {
    const user: User = {
      id: randomUUID(),
      email: input.email.toLowerCase().trim(),
      passwordHash: input.passwordHash,
      fullName: input.fullName.trim(),
      role: 'user',
      createdAt: new Date().toISOString(),
    }
    await usuarios.guardar(user)
    return user
  },

  async findUserByEmail(email: string): Promise<User | undefined> {
    return usuarios.uno({ email: email.toLowerCase().trim() })
  },

  async findUserById(id: string): Promise<User | undefined> {
    return usuarios.uno({ id })
  },

  async setUserRole(id: string, role: User['role']): Promise<void> {
    const user = await usuarios.uno({ id })
    if (user) {
      user.role = role
      await usuarios.guardar(user)
    }
  },

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    const user = await usuarios.uno({ id })
    if (user) {
      user.passwordHash = passwordHash
      await usuarios.guardar(user)
    }
  },

  async deleteUser(id: string): Promise<void> {
    const user = await usuarios.uno({ id })
    if (!user) return
    await comercios.borrar({ ownerId: id })
    await usuarios.borrar({ id })
  },

  async createCompany(
    input: Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'verified' | 'kyc'>,
  ): Promise<Company> {
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
    await comercios.guardar(company)
    return company
  },

  async updateCompany(id: string, patch: Partial<Company>): Promise<Company | undefined> {
    const existing = await comercios.uno({ id })
    if (!existing) return undefined
    const updated: Company = {
      ...existing,
      ...patch,
      id: existing.id,
      ownerId: existing.ownerId,
      updatedAt: new Date().toISOString(),
    }
    await comercios.guardar(updated)
    return updated
  },

  async findCompanyById(id: string): Promise<Company | undefined> {
    return comercios.uno({ id })
  },

  async findCompanyByOwner(ownerId: string): Promise<Company | undefined> {
    const list = await comercios.varios({ ownerId })
    return list[0]
  },

  async listCompanies(filter: {
    country?: string
    city?: string
    category?: string
    q?: string
    verifiedOnly?: boolean
  }): Promise<Company[]> {
    let list = (await comercios.varios()).filter((c) => c.kyc.status !== 'unsubmitted')
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
    return list.sort(
      (a, b) => Number(b.verified) - Number(a.verified) || a.tradeName.localeCompare(b.tradeName),
    )
  },
}
