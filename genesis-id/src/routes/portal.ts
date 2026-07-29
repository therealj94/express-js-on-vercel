import { Router } from 'express'
import { startIdentity, setPassportData, findIdentityByEmail } from '../engine.js'

// ============================================================
// Puente con el portal oficial de Genesis ID (genesisid.online).
//
// La API key (X-API-Key: gid_live_…) vive SOLO en el servidor, nunca en la
// app: un APK se descomprime y cualquiera podría extraerla. Las apps del
// ecosistema llaman a estas rutas y el servidor habla con el portal.
//
// Configura en el host (Render → Environment):
//   GENESIS_PORTAL_API=https://www.genesisid.online
//   GENESIS_API_KEY=gid_live_xxxxxxxxxxxxxxxxxxxx
// ============================================================

export const portalRouter = Router()

const PORTAL_API = (process.env.GENESIS_PORTAL_API || 'https://www.genesisid.online').replace(/\/$/, '')
const API_KEY = process.env.GENESIS_API_KEY || ''

export const portalConfigured = () => Boolean(API_KEY)

async function callPortal(path: string, body: unknown) {
  if (!API_KEY) {
    return { ok: false as const, status: 503, data: { error: 'GENESIS_API_KEY no configurada en el servidor' } }
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(`${PORTAL_API}${path}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(body ?? {}),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    return { ok: false as const, status: 502, data: { error: 'No se pudo contactar el portal Genesis ID' } }
  } finally {
    clearTimeout(timer)
  }
}

// Toma el primer valor no vacío entre varios nombres posibles de campo.
const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = o?.[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return null
}

// Normaliza lo que devuelva el portal a un pasaporte del ecosistema.
// Acepta el objeto plano o anidado (user/identity/data/profile/passport) y
// los nombres de campo más habituales, para no depender de un contrato exacto.
function toPassport(raw: any): any {
  if (!raw || typeof raw !== 'object') return null
  const src = raw.user || raw.identity || raw.data || raw.profile || raw.passport || raw
  // Si viene doblemente anidado (p. ej. { data: { user: {...} } }).
  const s = (src.user || src.identity || src.passport || src) as any

  const genesisUid = pick(s, 'genesisUid', 'gid', 'uid', 'genesis_uid', 'genesisId', 'genesis_id', 'GID')
  // Sin UID no hay pasaporte: no devolvemos un objeto lleno de nulls.
  if (!genesisUid) return null

  const statusRaw = String(pick(s, 'status', 'state', 'verificationStatus', 'kycStatus') || '').toLowerCase()
  const verified = statusRaw.includes('verif') || statusRaw.includes('approve') || statusRaw === 'active'
    || statusRaw === 'complete' || statusRaw === 'completed' || s.verified === true || s.isVerified === true

  return {
    genesisUid: String(genesisUid),
    fullName: pick(s, 'fullName', 'name', 'full_name', 'fullname', 'legalName', 'displayName', 'nombre'),
    email: pick(s, 'email', 'correo', 'mail'),
    documentId: pick(s, 'documentId', 'document', 'documentNumber', 'document_number', 'dni', 'idNumber', 'identity'),
    nationality: pick(s, 'nationality', 'country', 'nacionalidad', 'pais', 'countryCode'),
    birthDate: pick(s, 'birthDate', 'dob', 'dateOfBirth', 'birth_date', 'fechaNacimiento'),
    photoUrl: pick(s, 'photoUrl', 'photo', 'photo_url', 'avatar', 'avatarUrl', 'selfieUrl', 'selfie', 'picture', 'image', 'imageUrl', 'foto'),
    walletAddress: pick(s, 'walletAddress', 'wallet', 'wallet_address', 'address'),
    status: verified ? 'verified' : statusRaw.includes('review') || statusRaw.includes('pending') ? 'review' : (statusRaw || 'pending'),
    raw: s,
  }
}

// Guarda el pasaporte en el motor local para que el admin lo muestre.
function persist(email: string, p: ReturnType<typeof toPassport>, walletAddress?: string) {
  if (!p || !email) return
  startIdentity(email, p.fullName ?? undefined, walletAddress ?? p.walletAddress ?? undefined)
  if (p.genesisUid && p.status === 'verified') {
    setPassportData(email, {
      genesisUid: p.genesisUid,
      fullName: p.fullName ?? undefined,
      documentId: p.documentId ?? undefined,
      nationality: p.nationality ?? undefined,
      birthDate: p.birthDate ?? undefined,
      photoUrl: p.photoUrl ?? undefined,
      walletAddress: walletAddress ?? p.walletAddress ?? undefined,
    })
  }
}

/** ¿Está configurado el puente con el portal? */
portalRouter.get('/status', (_req, res) => {
  res.json({ configured: portalConfigured(), portal: PORTAL_API })
})

/**
 * Diagnóstico: muestra QUÉ CAMPOS devuelve el portal, sin exponer los datos
 * (los valores van enmascarados). Sirve para mapear nombres de campo cuando
 * el pasaporte llega incompleto.
 *   GET /api/portal/inspect?email=tu@correo.com
 */
portalRouter.get('/inspect', async (req, res) => {
  const email = String(req.query.email || '')
  if (!email.includes('@')) return res.status(400).json({ error: 'Usa ?email=tu@correo.com' })

  const mask = (v: any): any => {
    if (v === null || v === undefined) return null
    if (Array.isArray(v)) return v.length ? [mask(v[0]), `…(${v.length})`] : []
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x)]))
    const s = String(v)
    if (typeof v === 'boolean' || typeof v === 'number') return v
    if (/^https?:\/\//.test(s)) return `<url ${s.length} chars>`
    return s.length <= 4 ? s : `${s.slice(0, 3)}…(${s.length})`
  }

  const r = await callPortal('/api/apps/user-status', { email, app: 'veta-wallet' })
  const passport = toPassport(r.data)
  res.json({
    portalHttpStatus: r.status,
    camposQueDevuelveElPortal: mask(r.data),
    pasaporteQueLeeLaApp: passport
      ? Object.fromEntries(Object.entries(passport).filter(([k]) => k !== 'raw').map(([k, v]) => [k, v ? 'OK' : 'FALTA']))
      : 'el portal no devolvió un UID',
  })
})

/**
 * Registra/vincula la app del usuario en el portal (paso previo a verificar).
 * Body: { email, fullName?, walletAddress? }
 */
portalRouter.post('/register', async (req, res) => {
  const { email, fullName, walletAddress } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Correo válido requerido' })
  }
  startIdentity(email, fullName, walletAddress)
  const r = await callPortal('/api/apps/register-app', {
    email,
    fullName,
    name: fullName,
    walletAddress,
    wallet: walletAddress,
    app: 'veta-wallet',
  })
  res.status(r.ok ? 200 : r.status).json(r.data)
})

/**
 * Estado de verificación del usuario en el portal. Si ya está verificado,
 * devuelve el pasaporte completo y lo guarda en el motor.
 * Body: { email, walletAddress? }
 */
portalRouter.post('/user-status', async (req, res) => {
  const { email, walletAddress } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Correo válido requerido' })
  }
  const r = await callPortal('/api/apps/user-status', { email, walletAddress, app: 'veta-wallet' })
  const passport = toPassport(r.data)
  if (passport) {
    // El portal no siempre devuelve la billetera: la completamos con la
    // que envió la app para que el pasaporte salga entero.
    passport.email = passport.email || email
    passport.walletAddress = passport.walletAddress || walletAddress || null
  }
  if (r.ok && passport) persist(email, passport, walletAddress)

  // Respaldo: si el portal no responde, entrega lo que ya tengamos guardado.
  if (!r.ok || !passport?.genesisUid) {
    const local = findIdentityByEmail(email)
    if (local?.genesisUid) {
      return res.json({
        passport: {
          genesisUid: local.genesisUid,
          fullName: local.fullName,
          email: local.email,
          documentId: local.documentId ?? null,
          nationality: local.nationality ?? null,
          birthDate: local.birthDate ?? null,
          photoUrl: local.photoUrl ?? null,
          walletAddress: local.walletAddress ?? null,
          status: local.step === 'verified' ? 'verified' : local.step,
        },
        source: 'engine',
      })
    }
  }
  res.status(r.ok ? 200 : r.status).json({ passport, source: 'portal', portal: r.data })
})

/**
 * Valida el token que devuelve el portal al terminar la verificación y
 * entrega el pasaporte emitido.
 * Body: { token, email?, walletAddress? }
 */
portalRouter.post('/token-validate', async (req, res) => {
  const { token, email, walletAddress } = req.body ?? {}
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token requerido' })
  }
  const r = await callPortal('/api/apps/token-validate', { token, app: 'veta-wallet' })
  const passport = toPassport(r.data)
  const mail = passport?.email || email
  if (passport) {
    passport.email = mail || null
    passport.walletAddress = passport.walletAddress || walletAddress || null
  }
  if (r.ok && passport && mail) persist(mail, passport, walletAddress)
  res.status(r.ok ? 200 : r.status).json({ passport, source: 'portal', portal: r.data })
})
