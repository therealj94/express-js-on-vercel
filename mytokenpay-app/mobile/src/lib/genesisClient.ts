// Cliente de Genesis ID para MyTokenPay.
//
// QUE CAMBIO Y POR QUE
//
// La versión anterior llamaba a `POST /api/identities/:id/process`, que emitía
// un UID verificado sin comprobar absolutamente nada: ni documento, ni
// tamizado de sanciones, ni una persona que respondiera por la decisión. Ese
// endpoint ya no existe, y con razón: una app no puede verificar identidades.
//
// Ahora la app solo APORTA datos. La verificación la decide un operador de
// cumplimiento en el panel de Genesis ID, y hasta entonces el estado es
// "en revisión".
//
// Y no habla con Genesis ID directamente: la clave de API vive en el backend
// de MyTokenPay, porque un APK se descomprime y cualquiera la sacaría de aquí.
//
//   app ──▶ backend de MyTokenPay (/genesis/*) ──X-API-Key──▶ Genesis ID
//
// El router del backend está en infra/genesis-proxy/genesis.router.js.

const BASE = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '')

export const genesisEnabled = Boolean(BASE)

export type EstadoIdentidad =
  | 'iniciada' | 'datos' | 'documento' | 'biometria'
  | 'en-revision' | 'verificada' | 'rechazada' | 'suspendida'

export interface EstadoGenesis {
  id: string
  email: string
  estado: EstadoIdentidad
  gid: string | null
  nombreLegal: string | null
  documentoAceptable: boolean | null
  faltan: number
  siguientePaso: string
  actualizadaEn: string
}

/** El token de sesión de MyTokenPay; el backend lo traduce a la clave de API. */
let sesion: string | null = null
export const usarSesion = (token: string | null) => { sesion = token }

async function pedir(ruta: string, cuerpo?: unknown): Promise<any | null> {
  if (!BASE) return null
  try {
    const r = await fetch(`${BASE}/genesis${ruta}`, {
      method: cuerpo ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    const datos = await r.json().catch(() => null)
    // Se devuelve también el cuerpo de los errores: trae el motivo, y la
    // pantalla puede explicárselo al usuario en vez de decir "algo falló".
    return r.ok ? datos : { error: datos?.error || `Error ${r.status}` }
  } catch {
    return null
  }
}

export const genesisClient = {
  /** Estado del trámite. Crea la identidad si aún no existe. */
  async estado(): Promise<EstadoGenesis | null> {
    const d = await pedir('/estado')
    return d?.identidad ?? null
  },

  /** Datos que declara la persona. */
  async declararDatos(datos: {
    nombreCompleto: string; fechaNacimiento?: string; paisResidencia?: string; telefono?: string
  }): Promise<EstadoGenesis | null> {
    const d = await pedir('/datos', datos)
    return d?.identidad ?? null
  },

  /**
   * MRZ del documento, ya leída en el teléfono.
   * Devuelve también qué falla, para poder decírselo al usuario.
   */
  async enviarDocumento(mrz: string): Promise<{
    identidad: EstadoGenesis | null; aceptable: boolean; problemas: string[]
  }> {
    const d = await pedir('/documento', { mrz })
    return {
      identidad: d?.identidad ?? null,
      aceptable: Boolean(d?.documento?.aceptable),
      problemas: d?.documento?.problemas ?? (d?.error ? [d.error] : []),
    }
  },

  async enviarSelfie(selfie: string, fotoDocumento?: string) {
    return pedir('/biometria', { selfie, fotoDocumento })
  },

  /** Ata esta cuenta de MyTokenPay al GID. */
  vincular: () => pedir('/vincular', {}),

  /** Token para entrar en otra app del ecosistema sin repetir el KYC. */
  async tokenEcosistema(): Promise<string | null> {
    const d = await pedir('/sso/token', {})
    return d?.token ?? null
  },

  /** Registra el negocio para KYB. Lo aprueba cumplimiento, no la app. */
  registrarNegocio: (input: {
    razonSocial: string; nombreComercial: string; identificadorFiscal: string
    categoria: string; pais: string; ciudad: string; direccion: string; sitioWeb?: string
  }) => pedir('/negocios', input),

  /**
   * Beneficiario final. Sin ellos el negocio no se aprueba: identificar a la
   * empresa sin saber quién está detrás no verifica nada.
   */
  agregarBeneficiario: (idNegocio: string, input: {
    nombreCompleto: string; porcentaje: number; nacionalidad?: string; fechaNacimiento?: string; gid?: string
  }) => pedir(`/negocios/${idNegocio}/beneficiarios`, input),
}
