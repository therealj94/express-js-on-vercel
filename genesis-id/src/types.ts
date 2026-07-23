// Modelo de datos del motor Genesis ID. Es el MISMO modelo que las apps
// (Veta Wallet y MyTokenPay) reflejan en el dispositivo, para que backend y
// respaldo local hablen exactamente igual.

export type VerifyStep =
  | 'email' // capturó correo, falta documento
  | 'doc-front'
  | 'doc-back'
  | 'face'
  | 'processing'
  | 'review24' // pasó el tiempo → revisión manual hasta 24 h
  | 'verified'

export interface Identity {
  id: string
  type: 'personal'
  email: string
  fullName: string | null
  step: VerifyStep
  /** UID emitido al verificar (GEN-XXXX-XXXX). */
  genesisUid: string | null
  startedAt: string
  verifiedAt: string | null
  review24At: string | null
  updatedAt: string
}

export type BusinessStatus = 'pending' | 'verified' | 'rejected'

export interface BusinessIdentity {
  id: string
  /** correo del dueño (una identidad personal Genesis ID). */
  ownerEmail: string
  legalName: string
  tradeName: string
  taxId: string
  category: string
  country: string
  city: string
  address: string
  status: BusinessStatus
  /** UID de negocio emitido al verificar (GNB-XXXX-XXXX). */
  genesisUid: string | null
  submittedAt: string
  reviewedAt: string | null
  note: string | null
}

export interface GenesisData {
  identities: Identity[]
  businesses: BusinessIdentity[]
}
