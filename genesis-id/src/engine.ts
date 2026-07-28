// Motor Genesis ID — la lógica real de verificación (no teatro): crea y guarda
// identidades, avanza la máquina de estados, emite UID y registra negocios (KYB).
// El mismo contrato se refleja en el respaldo en dispositivo de las apps.
import { store } from './store.js'
import type { Identity, BusinessIdentity, VerifyStep, BusinessStatus } from './types.js'
import { personalUid, businessUid, id } from './lib/uid.js'

const now = () => new Date().toISOString()

// ---------- identidades personales ----------

export function findIdentityByEmail(email: string): Identity | undefined {
  return store.all().identities.find((i) => i.email === email.toLowerCase().trim())
}

export function getIdentity(identityId: string): Identity | undefined {
  return store.all().identities.find((i) => i.id === identityId)
}

/** Crea (o retoma) una identidad a partir del correo. Si ya existe, la devuelve
 *  tal cual para permitir reanudar donde quedó. Si viene walletAddress, queda
 *  emparejada la Veta Wallet del usuario (visible en el admin). */
export function startIdentity(email: string, fullName?: string, walletAddress?: string): Identity {
  const normalized = email.toLowerCase().trim()
  const existing = findIdentityByEmail(normalized)
  if (existing) {
    let changed = false
    if (fullName && !existing.fullName) {
      existing.fullName = fullName
      changed = true
    }
    if (walletAddress && existing.walletAddress !== walletAddress) {
      existing.walletAddress = walletAddress
      changed = true
    }
    if (changed) {
      existing.updatedAt = now()
      store.save()
    }
    return existing
  }
  const identity: Identity = {
    id: id('idn'),
    type: 'personal',
    email: normalized,
    fullName: fullName ?? null,
    walletAddress: walletAddress ?? null,
    step: 'doc-front',
    genesisUid: null,
    startedAt: now(),
    verifiedAt: null,
    review24At: null,
    updatedAt: now(),
  }
  store.all().identities.push(identity)
  store.save()
  return identity
}

/** Guarda los datos del pasaporte emitidos por el portal oficial. */
export function setPassportData(email: string, data: {
  genesisUid?: string
  fullName?: string
  documentId?: string
  nationality?: string
  birthDate?: string
  photoUrl?: string
  walletAddress?: string
}): Identity | undefined {
  const identity = findIdentityByEmail(email)
  if (!identity) return undefined
  if (data.genesisUid) identity.genesisUid = data.genesisUid
  if (data.fullName) identity.fullName = data.fullName
  if (data.documentId) identity.documentId = data.documentId
  if (data.nationality) identity.nationality = data.nationality
  if (data.birthDate) identity.birthDate = data.birthDate
  if (data.photoUrl) identity.photoUrl = data.photoUrl
  if (data.walletAddress) identity.walletAddress = data.walletAddress
  if (identity.genesisUid) {
    identity.step = 'verified'
    identity.verifiedAt = identity.verifiedAt ?? now()
  }
  identity.updatedAt = now()
  store.save()
  return identity
}

/** Empareja (o actualiza) la Veta Wallet de una identidad existente. */
export function linkWallet(email: string, walletAddress: string): Identity | undefined {
  const identity = findIdentityByEmail(email)
  if (!identity) return undefined
  identity.walletAddress = walletAddress
  identity.updatedAt = now()
  store.save()
  return identity
}

const NEXT: Partial<Record<VerifyStep, VerifyStep>> = {
  'doc-front': 'doc-back',
  'doc-back': 'face',
  face: 'processing',
}

/** Avanza un paso de captura (documento/rostro). */
export function advanceStep(identityId: string): Identity | undefined {
  const identity = getIdentity(identityId)
  if (!identity) return undefined
  const next = NEXT[identity.step]
  if (next) {
    identity.step = next
    identity.updatedAt = now()
    store.save()
  }
  return identity
}

/** Procesa la verificación: emite UID y marca verificada. */
export function processIdentity(identityId: string): Identity | undefined {
  const identity = getIdentity(identityId)
  if (!identity) return undefined
  identity.step = 'verified'
  identity.genesisUid = identity.genesisUid ?? personalUid()
  identity.verifiedAt = now()
  identity.updatedAt = now()
  store.save()
  return identity
}

/** El tiempo de escaneo expiró → revisión manual hasta 24 h. */
export function sendToReview(identityId: string): Identity | undefined {
  const identity = getIdentity(identityId)
  if (!identity) return undefined
  identity.step = 'review24'
  identity.review24At = now()
  identity.updatedAt = now()
  store.save()
  return identity
}

/** Reinicia el escaneo (desde revisión o para reintentar). */
export function retryScan(identityId: string): Identity | undefined {
  const identity = getIdentity(identityId)
  if (!identity) return undefined
  identity.step = 'doc-front'
  identity.review24At = null
  identity.updatedAt = now()
  store.save()
  return identity
}

// ---------- identidades de negocio (KYB) ----------

export function getBusiness(businessId: string): BusinessIdentity | undefined {
  return store.all().businesses.find((b) => b.id === businessId)
}

export function findBusinessByOwner(ownerEmail: string): BusinessIdentity | undefined {
  return store.all().businesses.find((b) => b.ownerEmail === ownerEmail.toLowerCase().trim())
}

export function registerBusiness(input: {
  ownerEmail: string
  legalName: string
  tradeName: string
  taxId: string
  category: string
  country: string
  city: string
  address: string
}): BusinessIdentity {
  const record: BusinessIdentity = {
    id: id('biz'),
    ownerEmail: input.ownerEmail.toLowerCase().trim(),
    legalName: input.legalName,
    tradeName: input.tradeName,
    taxId: input.taxId,
    category: input.category,
    country: input.country,
    city: input.city,
    address: input.address,
    status: 'pending',
    genesisUid: null,
    submittedAt: now(),
    reviewedAt: null,
    note: null,
  }
  store.all().businesses.push(record)
  store.save()
  return record
}

export function reviewBusiness(businessId: string, status: BusinessStatus, note?: string): BusinessIdentity | undefined {
  const record = getBusiness(businessId)
  if (!record) return undefined
  record.status = status
  record.reviewedAt = now()
  record.note = note ?? null
  if (status === 'verified' && !record.genesisUid) record.genesisUid = businessUid()
  store.save()
  return record
}

// ---------- admin / métricas ----------

export function stats() {
  const { identities, businesses } = store.all()
  return {
    identities: {
      total: identities.length,
      verified: identities.filter((i) => i.step === 'verified').length,
      inReview: identities.filter((i) => i.step === 'review24').length,
      inProgress: identities.filter((i) => i.step !== 'verified' && i.step !== 'review24').length,
    },
    businesses: {
      total: businesses.length,
      verified: businesses.filter((b) => b.status === 'verified').length,
      pending: businesses.filter((b) => b.status === 'pending').length,
      rejected: businesses.filter((b) => b.status === 'rejected').length,
    },
  }
}
