export type UserRole = 'user' | 'business'

export interface User {
  id: string
  email: string
  passwordHash: string
  fullName: string
  role: UserRole
  createdAt: string
  /**
   * El GID de Genesis ID, cuando la persona ató su cuenta.
   *
   * Sin esto un pago no se puede atribuir a nadie: el monitoreo antilavado del
   * ecosistema es POR IDENTIDAD, no por correo. Antes la app guardaba un
   * `genesisUid` inventado con Math.random() en el teléfono que no salía de ahí
   * y no correspondía a ninguna identidad real.
   */
  gid?: string | null
  /** La dirección de la billetera, para poder cobrarle o pagarle en cadena. */
  direccionWallet?: string | null
}

export type PublicUser = Omit<User, 'passwordHash'>

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


// ─────────────────────────────────────────────────────────────────────────────
// Dinero
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POR QUE MYTOKENPAY NO GUARDA SALDOS
 *
 * La app móvil llevaba un `origenBalance` en el teléfono y `pay()` le restaba:
 * un saldo que solo existía en ese aparato, que se recuperaba borrando la app y
 * que no correspondía a ningún fondo real. Eso no es un error de programación,
 * es un modelo equivocado.
 *
 * MyTokenPay NO custodia fondos: los custodia la billetera, y el ORIGEN se
 * mueve en la cadena. Lo que MyTokenPay es de verdad es el LIBRO DE COBROS del
 * comercio — quién cobró, a quién, cuánto, y con qué transacción de la cadena
 * quedó pagado. Un saldo aquí sería una segunda contabilidad que puede
 * contradecir a la cadena, y cuando dos libros no cuadran gana el que tiene los
 * fondos: la cadena.
 */

export type EstadoCobro = 'pendiente' | 'pagado' | 'cancelado' | 'caducado'

/** Cómo se dice que se pagó. `cadena` es el único que trae prueba. */
export type MedioPago = 'cadena' | 'wallet' | 'efectivo' | 'otro'

export interface Cobro {
  id: string
  companyId: string
  /** Quién lo emitió: el dueño del comercio. */
  emisorId: string
  /** Importe en ORIGEN, en unidades humanas. */
  montoOrigen: number
  /** Equivalente en dólares al momento de emitirlo. Se congela: el precio se mueve. */
  montoUsd: number
  /** Y en lempiras, que es lo que entiende quien cobra en el mostrador. */
  montoHnl: number
  concepto: string
  estado: EstadoCobro
  /** Lo que va dentro del QR. */
  referencia: string
  creadoEn: string
  caducaEn: Date
  pago: {
    pagadorId: string | null
    pagadorGid: string | null
    medio: MedioPago
    /** El hash de la transacción en la cadena, cuando lo hay. Es la prueba. */
    hash: string | null
    pagadoEn: string
  } | null
}

/** Lo que se le enseña a quien va a pagar: sin datos internos del comercio. */
export interface CobroPublico {
  id: string
  referencia: string
  estado: EstadoCobro
  montoOrigen: number
  montoUsd: number
  montoHnl: number
  concepto: string
  comercio: { id: string; nombre: string; logoDataUrl: string | null } | null
  creadoEn: string
  pagadoEn: string | null
}
