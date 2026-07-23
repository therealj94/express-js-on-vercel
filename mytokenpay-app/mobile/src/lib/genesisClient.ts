// Cliente del motor Genesis ID real. Si EXPO_PUBLIC_GENESIS_URL está definida,
// envía el registro/verificación al backend real (genesis-id/). Si no, no hace
// nada (la app usa su flujo en dispositivo). Best-effort: nunca bloquea la UI.

const BASE = process.env.EXPO_PUBLIC_GENESIS_URL || null

export const genesisEnabled = Boolean(BASE)

async function req(path: string, body?: unknown): Promise<any | null> {
  if (!BASE) return null
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    return await res.json()
  } catch {
    return null
  }
}

export const genesisClient = {
  /** Crea o reanuda la identidad por correo en el backend real. */
  start: (email: string, fullName?: string) => req('/identities', { email, fullName }),

  /** Verifica y emite UID en el backend real. */
  async process(email: string): Promise<{ genesisUid: string | null } | null> {
    if (!BASE) return null
    const created = await req('/identities', { email })
    const idn = created?.identity
    if (!idn?.id) return null
    const done = await req(`/identities/${idn.id}/process`)
    return done?.identity ?? null
  },

  /** Registra el negocio (KYB) en el backend real. */
  registerBusiness: (input: {
    ownerEmail: string
    legalName: string
    tradeName: string
    taxId: string
    category: string
    country: string
    city: string
    address: string
  }) => req('/business', input),
}
