export type UserRole = 'user' | 'business'

export type KycStatus = 'unsubmitted' | 'pending' | 'verified' | 'rejected'

/** Un plato o producto del menú del negocio. El precio vive en su moneda. */
export interface PlatoMenu {
  id: string
  nombre: string
  descripcion: string
  precio: number
  moneda: 'HNL' | 'USD'
}

export interface PersonalKyc {
  status: KycStatus
  documentLabel: string | null
  submittedAt: string | null
  reviewedAt: string | null
}

export interface PublicUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  kyc: PersonalKyc
  createdAt: string
}

export interface KycDocument {
  id: string
  label: string
  dataUrl: string
  uploadedAt: string
}

export interface CompanySocials {
  website?: string
  instagram?: string
  facebook?: string
  tiktok?: string
  whatsapp?: string
  x?: string
}

export interface DayHours {
  open: string
  close: string
  closed: boolean
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WeekHours = Record<DayKey, DayHours>

export interface Company {
  id: string
  ownerId: string
  legalName: string
  tradeName: string
  taxId: string
  categorySlug: string
  productsServices: string[]
  countrySlug: string
  citySlug: string
  address: string
  lat: number
  lng: number
  description: string
  logoDataUrl: string | null
  coverDataUrl: string | null
  gallery: string[]
  socials: CompanySocials
  hours: WeekHours | null
  kyc: {
    status: KycStatus
    documents: KycDocument[]
    submittedAt: string | null
    reviewedAt: string | null
    note: string | null
  }
  verified: boolean
  acceptsOrigen: boolean
  /** Dirección de la cadena 8532 donde el negocio recibe sus cobros. */
  walletAddress?: string | null
  /** Menú del negocio: lo que se puede ordenar desde MyTokenPay. */
  menu?: PlatoMenu[]
  createdAt: string
  updatedAt: string
}

export interface Category {
  slug: string
  label: string
  icon: string
}

export interface City {
  slug: string
  label: string
  lat: number
  lng: number
}

export interface Country {
  slug: string
  label: string
  flag: string
  lat: number
  lng: number
  zoom: number
  cities: City[]
}

export interface Reward {
  id: string
  title: string
  description: string
  pointsCost: number
  category: string
  imageUrl: string
  partnerCompanyId: string | null
  partnerName: string
}

export interface Redemption {
  id: string
  rewardId: string
  redeemedAt: string
}
