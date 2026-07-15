export type UserRole = 'user' | 'business'

export interface PublicUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  createdAt: string
}

export type KycStatus = 'unsubmitted' | 'pending' | 'verified' | 'rejected'

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
