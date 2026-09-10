// ─────────────────────────────────────────────────────────────────────────────
// El perfil que ve la app: usuario + estado real de su identidad.
//
// El KYC personal NO vive en este backend. Vive en Genesis ID, que es el
// registro de identidad de todo el ecosistema — la misma identidad sirve en
// Veta Wallet, en MyTokenPay y en lo que venga. Aquí solo se consulta y se
// traduce al vocabulario que la app ya entiende (unsubmitted / pending /
// verified / rejected).
//
// Si Genesis ID no responde, no se inventa un estado: se cae al dato local
// (¿tiene GID atado?) que es lo único que este servidor sabe por sí mismo.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicUser, User } from '../types.js'
import { toPublicUser } from './db.js'
import { genesisConfigurado, identidadPorEmail } from './genesis.js'

export type EstadoKycPersonal = 'unsubmitted' | 'pending' | 'verified' | 'rejected'

export interface PerfilApp extends PublicUser {
  kyc: {
    status: EstadoKycPersonal
    documentLabel: string | null
    submittedAt: string | null
    reviewedAt: string | null
  }
}

function traducir(estado: string | undefined): EstadoKycPersonal {
  switch (estado) {
    case 'verificada':
      return 'verified'
    case 'rechazada':
    case 'suspendida':
      return 'rejected'
    case 'biometria':
    case 'en-revision':
      return 'pending'
    // 'iniciada', 'datos' y 'documento' son pasos a medio camino: para la app
    // el trámite aún no está entregado.
    default:
      return 'unsubmitted'
  }
}

export async function perfilApp(user: User): Promise<PerfilApp> {
  const base = toPublicUser(user)

  let status: EstadoKycPersonal = user.gid ? 'verified' : 'unsubmitted'
  let submittedAt: string | null = null
  let reviewedAt: string | null = null

  if (genesisConfigurado()) {
    const identidad = await identidadPorEmail(user.email)
    if (identidad) {
      status = traducir(identidad.estado)
      submittedAt = identidad.actualizadaEn ?? null
      reviewedAt = identidad.estado === 'verificada' ? identidad.actualizadaEn ?? null : null
    } else if (!user.gid) {
      status = 'unsubmitted'
    }
  }

  return {
    ...base,
    kyc: { status, documentLabel: null, submittedAt, reviewedAt },
  }
}
