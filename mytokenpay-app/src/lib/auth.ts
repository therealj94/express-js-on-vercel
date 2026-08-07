import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHash } from 'crypto'

// A fallback secret is fine while developing, but shipping one to production
// means anyone who reads this file can mint a valid session for any account.
// Refuse to start instead of running with a secret the whole world knows.
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.VERCEL
if (IS_PRODUCTION && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET es obligatorio en producción: sin él cualquiera puede falsificar sesiones')
}

const JWT_SECRET = process.env.JWT_SECRET || 'mytokenpay-dev-secret-change-me'
const TOKEN_TTL = '30d'
const RESET_TOKEN_TTL = '15m'

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash)
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
    return payload.sub
  } catch {
    return null
  }
}

// A reset token carries a fingerprint of the password it was issued against, so
// changing the password retires every token minted before it. That makes a reset
// link single-use without keeping any server-side state: once it has been spent
// the fingerprint no longer matches. It also means that if someone requests a
// reset they did not ask for, the real owner logging in and changing their
// password kills the outstanding link.
export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16)
}

export function signResetToken(userId: string, passwordHash: string): string {
  return jwt.sign(
    { sub: userId, purpose: 'reset', pwd: passwordFingerprint(passwordHash) },
    JWT_SECRET,
    { expiresIn: RESET_TOKEN_TTL },
  )
}

/**
 * Reads a reset token without deciding whether it is still valid: the caller
 * must look the user up and check the fingerprint against their current
 * password hash. Returns null when the token is expired, forged, or was minted
 * for something other than a password reset.
 */
export function readResetToken(token: string): { userId: string; passwordFingerprint: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; purpose?: string; pwd?: string }
    if (payload.purpose !== 'reset' || typeof payload.pwd !== 'string') return null
    return { userId: payload.sub, passwordFingerprint: payload.pwd }
  } catch {
    return null
  }
}
