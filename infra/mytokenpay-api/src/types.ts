export type UserRole = 'user' | 'business' | 'admin'

export interface User {
  id: string
  email: string
  passwordHash: string
  fullName: string
  role: UserRole
  createdAt: string
  /** GID de Genesis ID atado a esta cuenta, si el usuario entró con su identidad. */
  gid?: string | null
}

export type PublicUser = Omit<User, 'passwordHash'>

export type KycStatus = 'unsubmitted' | 'pending' | 'verified' | 'rejected'

/** Un plato o producto del menú del negocio. El precio vive en su moneda. */
export interface PlatoMenu {
  id: string
  nombre: string
  descripcion: string
  precio: number
  moneda: 'HNL' | 'USD'
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

export type WeekHours = Record<
  'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
  DayHours
>

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
  /** Menú del negocio: lo que se puede ordenar desde MyTokenPay. */
  menu?: PlatoMenu[]
  /** Dirección en la cadena 8532 donde el comercio recibe los pagos. */
  walletAddress: string | null
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
