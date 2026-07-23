import type { GenesisData, Identity, BusinessIdentity } from './types.js'
import { id } from './lib/uid.js'

// Semilla del ecosistema: las mismas cuentas que las apps (Veta Wallet y
// MyTokenPay). Cada dueño es una identidad personal verificada y su negocio
// una identidad de negocio (KYB) verificada — con los MISMOS UID que las apps.

interface PersonSeed {
  email: string
  fullName: string
  uid: string
}
interface BizSeed extends PersonSeed {
  legalName: string
  tradeName: string
  taxId: string
  category: string
  country: string
  city: string
  address: string
  bizUid: string
}

export const CLIENT_SEED: PersonSeed = {
  email: 'cliente@mytokenpay.demo',
  fullName: 'José Cliente',
  uid: 'GEN-1100-2200',
}

export const OWNER_SEEDS: BizSeed[] = [
  {
    email: 'cafe.veta@mytokenpay.demo', fullName: 'Carmen Aguilar', uid: 'GEN-1101-2201',
    legalName: 'Café Veta Roasters S. de R.L.', tradeName: 'Café Veta Roasters', taxId: 'RTN-08011-CAFE',
    category: 'cafeterias', country: 'honduras', city: 'tegucigalpa', address: 'Col. Palmira, Ave. República de Chile',
    bizUid: 'GNB-1101-2201',
  },
  {
    email: 'bahia.hotel@mytokenpay.demo', fullName: 'Diego Martínez', uid: 'GEN-1102-2202',
    legalName: 'Bahía Esmeralda Hospitality S.A.', tradeName: 'Bahía Esmeralda Hotel', taxId: 'RTN-08012-HOTL',
    category: 'hoteles', country: 'honduras', city: 'roatan', address: 'West Bay Beach, Roatán',
    bizUid: 'GNB-1102-2202',
  },
  {
    email: 'ironhouse.gym@mytokenpay.demo', fullName: 'Sofía Ramírez', uid: 'GEN-1103-2203',
    legalName: 'Ironhouse Fitness S.A.', tradeName: 'Ironhouse Gym', taxId: 'NIT-01103-GYM',
    category: 'gimnasios', country: 'guatemala', city: 'ciudad-de-guatemala', address: 'Zona 10, Blvd. Los Próceres',
    bizUid: 'GNB-1103-2203',
  },
  {
    email: 'nova.tech@mytokenpay.demo', fullName: 'Marco Flores', uid: 'GEN-1104-2204',
    legalName: 'Nova Tech Center S.A. de C.V.', tradeName: 'Nova Tech Center', taxId: 'NIT-01104-TECH',
    category: 'tecnologia', country: 'el-salvador', city: 'san-salvador', address: 'Col. Escalón, Paseo General Escalón',
    bizUid: 'GNB-1104-2204',
  },
]

function personal(email: string, fullName: string, uid: string): Identity {
  const now = new Date().toISOString()
  return {
    id: id('idn'),
    type: 'personal',
    email: email.toLowerCase(),
    fullName,
    step: 'verified',
    genesisUid: uid,
    startedAt: now,
    verifiedAt: now,
    review24At: null,
    updatedAt: now,
  }
}

function business(seed: BizSeed): BusinessIdentity {
  const now = new Date().toISOString()
  return {
    id: id('biz'),
    ownerEmail: seed.email.toLowerCase(),
    legalName: seed.legalName,
    tradeName: seed.tradeName,
    taxId: seed.taxId,
    category: seed.category,
    country: seed.country,
    city: seed.city,
    address: seed.address,
    status: 'verified',
    genesisUid: seed.bizUid,
    submittedAt: now,
    reviewedAt: now,
    note: null,
  }
}

export function seedData(): GenesisData {
  const identities: Identity[] = [
    personal(CLIENT_SEED.email, CLIENT_SEED.fullName, CLIENT_SEED.uid),
    ...OWNER_SEEDS.map((s) => personal(s.email, s.fullName, s.uid)),
  ]
  const businesses: BusinessIdentity[] = OWNER_SEEDS.map(business)
  return { identities, businesses }
}
