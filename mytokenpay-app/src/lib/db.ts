// El almacén. Antes eran tres `Map()` en memoria; ahora es MongoDB.
//
// LO QUE SE ROMPIO Y POR QUE
//
// Todas las funciones pasaron a ser ASINCRONAS. No hay forma de evitarlo —una
// base de datos no contesta en el mismo tick— y disimularlo con una caché
// síncrona habría sido peor: dos fuentes de verdad que se desincronizan.
//
// El motor de memoria SIGUE EXISTIENDO, para desarrollo y pruebas: sin
// `MONGODB_URI` todo funciona igual, en RAM. Lo que no puede pasar es que
// producción se quede ahí sin que nadie lo note, y de eso se encarga
// `exigirPersistencia()` en el arranque.
//
// EL SEED, UNA SOLA VEZ
//
// Los comercios de ejemplo se cargaban en el Map en cada arranque. Contra una
// base persistente eso duplicaría el directorio en cada despliegue, así que se
// siembran solo si la colección está vacía.

import { randomUUID } from 'crypto'
import type { Company, PublicUser, User, Cobro, EstadoCobro, MedioPago } from '../types.js'
import { buildSeedCompanies } from '../data/seed.js'
import { baseDatos, hayMongo } from './mongo.js'

// ── Motor de memoria (desarrollo y pruebas) ──────────────────────────────────

const usuariosMem = new Map<string, User>()
const comerciosMem = new Map<string, Company>()
const cobrosMem = new Map<string, Cobro>()
let sembradoMem = false

function sembrarMemoria(): void {
  if (sembradoMem) return
  for (const c of buildSeedCompanies()) comerciosMem.set(c.id, c)
  sembradoMem = true
}

// ── Acceso a las colecciones ─────────────────────────────────────────────────

async function col(nombre: string): Promise<any | null> {
  if (!hayMongo()) { sembrarMemoria(); return null }
  const db = await baseDatos()
  return db ? db.collection(nombre) : null
}

/** Siembra el directorio si nunca se sembró. Idempotente por diseño. */
let sembrando: Promise<void> | null = null
export async function sembrarSiHaceFalta(): Promise<void> {
  if (sembrando) return sembrando
  sembrando = (async () => {
    const c = await col('comercios')
    if (!c) { sembrarMemoria(); return }
    const n = await c.countDocuments({})
    if (n > 0) return
    const semilla = buildSeedCompanies()
    if (!semilla.length) return
    // `ordered: false` y un índice único por id: si dos dynos arrancan a la vez
    // el segundo choca con duplicados en vez de duplicar el directorio.
    try {
      await c.insertMany(semilla, { ordered: false })
      console.log(`[db] directorio sembrado: ${semilla.length} comercios`)
    } catch (e: any) {
      if (e?.code !== 11000) console.error('[db] no se pudo sembrar:', e?.message)
    }
  })()
  return sembrando
}

const sinMongoId = <T>(d: any): T | undefined => {
  if (!d) return undefined
  const { _id, ...resto } = d
  return resto as T
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash, ...rest } = user
  return rest
}

// ── El almacén ───────────────────────────────────────────────────────────────

export const db = {
  /** null si ese correo ya está tomado — no es un error, es la respuesta. */
  async createUser(input: { email: string; passwordHash: string; fullName: string }): Promise<User | null> {
    const user: User = {
      id: randomUUID(),
      email: input.email.toLowerCase().trim(),
      passwordHash: input.passwordHash,
      fullName: input.fullName.trim(),
      role: 'user',
      createdAt: new Date().toISOString(),
      gid: null,
      direccionWallet: null,
    }
    const c = await col('usuarios')
    if (c) {
      // El índice único por email es lo que de verdad impide dos cuentas con el
      // mismo correo: la comprobación previa de la ruta pierde la carrera si
      // dos registros llegan a la vez, la base no.
      try {
        await c.insertOne({ ...user })
      } catch (e: any) {
        /* UN CORREO REPETIDO NO ES UNA EXCEPCION: ES UNA RESPUESTA.
           Lanzar aquí tumbó el servicio entero en producción. En Express 4 una
           promesa rechazada dentro de un handler `async` no llega al manejador
           de errores —queda como `unhandledRejection`, y Node mata el proceso—,
           así que el registro repetido de UNA persona dejaba a TODAS sin app.
           Se devuelve null y quien llama contesta 409, que es lo que siempre
           debió pasar. */
        if (e?.code === 11000) return null
        throw e
      }
    } else {
      usuariosMem.set(user.id, user)
    }
    return user
  },

  async findUserByEmail(email: string): Promise<User | undefined> {
    const correo = email.toLowerCase().trim()
    const c = await col('usuarios')
    if (c) return sinMongoId<User>(await c.findOne({ email: correo }))
    return [...usuariosMem.values()].find((u) => u.email === correo)
  },

  async findUserById(id: string): Promise<User | undefined> {
    const c = await col('usuarios')
    if (c) return sinMongoId<User>(await c.findOne({ id }))
    return usuariosMem.get(id)
  },

  async setUserRole(id: string, role: User['role']): Promise<void> {
    const c = await col('usuarios')
    if (c) { await c.updateOne({ id }, { $set: { role } }); return }
    const u = usuariosMem.get(id); if (u) u.role = role
  },

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    const c = await col('usuarios')
    if (c) { await c.updateOne({ id }, { $set: { passwordHash } }); return }
    const u = usuariosMem.get(id); if (u) u.passwordHash = passwordHash
  },

  /** Ata la cuenta a una identidad de Genesis ID. */
  async vincularGid(id: string, gid: string, direccionWallet: string | null): Promise<void> {
    const c = await col('usuarios')
    if (c) { await c.updateOne({ id }, { $set: { gid, direccionWallet } }); return }
    const u = usuariosMem.get(id); if (u) { u.gid = gid; u.direccionWallet = direccionWallet }
  },

  async deleteUser(id: string): Promise<void> {
    const u = await db.findUserById(id)
    if (!u) return
    const cu = await col('usuarios')
    if (cu) {
      await cu.deleteOne({ id })
      const cc = await col('comercios')
      if (cc) await cc.deleteMany({ ownerId: id })
      return
    }
    for (const comercio of comerciosMem.values()) {
      if (comercio.ownerId === id) comerciosMem.delete(comercio.id)
    }
    usuariosMem.delete(id)
  },

  async createCompany(
    input: Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'verified' | 'kyc'>,
  ): Promise<Company> {
    const now = new Date().toISOString()
    const company: Company = {
      ...input,
      id: randomUUID(),
      verified: false,
      kyc: { status: 'unsubmitted', documents: [], submittedAt: null, reviewedAt: null, note: null },
      createdAt: now,
      updatedAt: now,
    }
    const c = await col('comercios')
    if (c) await c.insertOne({ ...company })
    else comerciosMem.set(company.id, company)
    return company
  },

  async updateCompany(id: string, patch: Partial<Company>): Promise<Company | undefined> {
    const c = await col('comercios')
    if (c) {
      // `id` y `ownerId` se excluyen del parche: aceptarlos dejaría que una
      // petición cambiara de dueño un comercio ajeno.
      const { id: _i, ownerId: _o, ...limpio } = patch as any
      const r = await c.findOneAndUpdate(
        { id },
        { $set: { ...limpio, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )
      return sinMongoId<Company>(r?.value ?? r)
    }
    const existing = comerciosMem.get(id)
    if (!existing) return undefined
    const updated: Company = {
      ...existing, ...patch,
      id: existing.id, ownerId: existing.ownerId,
      updatedAt: new Date().toISOString(),
    }
    comerciosMem.set(id, updated)
    return updated
  },

  async findCompanyById(id: string): Promise<Company | undefined> {
    const c = await col('comercios')
    if (c) return sinMongoId<Company>(await c.findOne({ id }))
    return comerciosMem.get(id)
  },

  async findCompanyByOwner(ownerId: string): Promise<Company | undefined> {
    const c = await col('comercios')
    if (c) return sinMongoId<Company>(await c.findOne({ ownerId }))
    return [...comerciosMem.values()].find((x) => x.ownerId === ownerId)
  },

  async listCompanies(filter: {
    country?: string; city?: string; category?: string; q?: string; verifiedOnly?: boolean
  }): Promise<Company[]> {
    const c = await col('comercios')
    if (c) {
      const q: any = { 'kyc.status': { $ne: 'unsubmitted' } }
      if (filter.country) q.countrySlug = filter.country
      if (filter.city) q.citySlug = filter.city
      if (filter.category) q.categorySlug = filter.category
      if (filter.verifiedOnly) q.verified = true
      if (filter.q) {
        // Se escapa lo que escriba quien busca: un `.*` suelto convierte la
        // búsqueda en un recorrido de toda la colección.
        const t = filter.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        q.$or = [
          { tradeName: { $regex: t, $options: 'i' } },
          { description: { $regex: t, $options: 'i' } },
          { productsServices: { $regex: t, $options: 'i' } },
        ]
      }
      const lista = await c.find(q, { projection: { _id: 0 } })
        .sort({ verified: -1, tradeName: 1 }).limit(300).toArray()
      return lista as Company[]
    }
    let list = [...comerciosMem.values()].filter((x) => x.kyc.status !== 'unsubmitted')
    if (filter.country) list = list.filter((x) => x.countrySlug === filter.country)
    if (filter.city) list = list.filter((x) => x.citySlug === filter.city)
    if (filter.category) list = list.filter((x) => x.categorySlug === filter.category)
    if (filter.verifiedOnly) list = list.filter((x) => x.verified)
    if (filter.q) {
      const q = filter.q.toLowerCase()
      list = list.filter((x) =>
        x.tradeName.toLowerCase().includes(q) ||
        x.description.toLowerCase().includes(q) ||
        x.productsServices.some((p) => p.toLowerCase().includes(q)))
    }
    return list.sort((a, b) =>
      Number(b.verified) - Number(a.verified) || a.tradeName.localeCompare(b.tradeName))
  },

  // ── Cobros ─────────────────────────────────────────────────────────────────

  async crearCobro(cobro: Cobro): Promise<Cobro> {
    const c = await col('cobros')
    if (c) await c.insertOne({ ...cobro })
    else cobrosMem.set(cobro.id, cobro)
    return cobro
  },

  async cobroPorId(id: string): Promise<Cobro | undefined> {
    const c = await col('cobros')
    if (c) return sinMongoId<Cobro>(await c.findOne({ id }))
    return cobrosMem.get(id)
  },

  /**
   * Marca un cobro como pagado, Y SOLO SI SEGUIA PENDIENTE.
   *
   * ESTA ES LA FUNCION QUE NO SE PUEDE EQUIVOCAR.
   *
   * La condición `estado: 'pendiente'` va DENTRO del filtro de la actualización,
   * no en un `if` antes. Con un `if`, dos pagos simultáneos del mismo QR —el
   * cliente que toca dos veces, la red que reintenta— leen los dos «pendiente»,
   * los dos pasan la comprobación y los dos cobran. Poniéndola en el filtro,
   * la base decide: la primera actualización encuentra el documento, la segunda
   * no encuentra nada y devuelve null. Quien pierde la carrera se entera.
   *
   * Devuelve el cobro ya pagado, o null si otro se le adelantó.
   */
  async pagarCobro(id: string, pago: NonNullable<Cobro['pago']>): Promise<Cobro | null> {
    const c = await col('cobros')
    if (c) {
      const r = await c.findOneAndUpdate(
        { id, estado: 'pendiente' },
        {
          $set: { estado: 'pagado' as EstadoCobro, pago },
          // Un cobro pagado deja de caducar: es un asiento contable, no un QR.
          $unset: { caducaEn: '' },
        },
        { returnDocument: 'after' },
      )
      const d = r?.value ?? r
      return d ? (sinMongoId<Cobro>(d) as Cobro) : null
    }
    const existente = cobrosMem.get(id)
    if (!existente || existente.estado !== 'pendiente') return null
    existente.estado = 'pagado'
    existente.pago = pago
    return existente
  },

  async cancelarCobro(id: string, emisorId: string): Promise<Cobro | null> {
    const c = await col('cobros')
    if (c) {
      const r = await c.findOneAndUpdate(
        { id, emisorId, estado: 'pendiente' },
        { $set: { estado: 'cancelado' as EstadoCobro } },
        { returnDocument: 'after' },
      )
      const d = r?.value ?? r
      return d ? (sinMongoId<Cobro>(d) as Cobro) : null
    }
    const e = cobrosMem.get(id)
    if (!e || e.emisorId !== emisorId || e.estado !== 'pendiente') return null
    e.estado = 'cancelado'
    return e
  },

  /** Los cobros de un comercio, del más nuevo al más viejo. */
  async cobrosDeComercio(companyId: string, limite = 50, estado?: EstadoCobro): Promise<Cobro[]> {
    const c = await col('cobros')
    if (c) {
      const q: any = { companyId }
      if (estado) q.estado = estado
      return await c.find(q, { projection: { _id: 0 } })
        .sort({ creadoEn: -1 }).limit(limite).toArray() as Cobro[]
    }
    return [...cobrosMem.values()]
      .filter((x) => x.companyId === companyId && (!estado || x.estado === estado))
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).slice(0, limite)
  },

  /** Lo que pagó una persona. */
  async pagosDe(pagadorId: string, limite = 50): Promise<Cobro[]> {
    const c = await col('cobros')
    if (c) {
      return await c.find({ 'pago.pagadorId': pagadorId }, { projection: { _id: 0 } })
        .sort({ creadoEn: -1 }).limit(limite).toArray() as Cobro[]
    }
    return [...cobrosMem.values()]
      .filter((x) => x.pago?.pagadorId === pagadorId)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).slice(0, limite)
  },

  /** Lo que lleva cobrado un comercio, para su panel. */
  async resumenComercio(companyId: string): Promise<{
    cobros: number; pagados: number; pendientes: number; totalOrigen: number; totalUsd: number
  }> {
    const c = await col('cobros')
    if (c) {
      const r = await c.aggregate([
        { $match: { companyId } },
        { $group: {
          _id: null,
          cobros: { $sum: 1 },
          pagados: { $sum: { $cond: [{ $eq: ['$estado', 'pagado'] }, 1, 0] } },
          pendientes: { $sum: { $cond: [{ $eq: ['$estado', 'pendiente'] }, 1, 0] } },
          totalOrigen: { $sum: { $cond: [{ $eq: ['$estado', 'pagado'] }, '$montoOrigen', 0] } },
          totalUsd: { $sum: { $cond: [{ $eq: ['$estado', 'pagado'] }, '$montoUsd', 0] } },
        } },
      ]).toArray()
      const d = r[0] ?? {}
      return {
        cobros: d.cobros ?? 0, pagados: d.pagados ?? 0, pendientes: d.pendientes ?? 0,
        totalOrigen: d.totalOrigen ?? 0, totalUsd: d.totalUsd ?? 0,
      }
    }
    const lista = [...cobrosMem.values()].filter((x) => x.companyId === companyId)
    const pag = lista.filter((x) => x.estado === 'pagado')
    return {
      cobros: lista.length,
      pagados: pag.length,
      pendientes: lista.filter((x) => x.estado === 'pendiente').length,
      totalOrigen: pag.reduce((s, x) => s + x.montoOrigen, 0),
      totalUsd: pag.reduce((s, x) => s + x.montoUsd, 0),
    }
  },

  /** Solo para las pruebas: vacía el motor de memoria. */
  _vaciarMemoria(): void {
    usuariosMem.clear(); comerciosMem.clear(); cobrosMem.clear(); sembradoMem = false
  },
}
