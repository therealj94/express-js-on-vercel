import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

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

export function signResetToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: 'reset' }, JWT_SECRET, { expiresIn: RESET_TOKEN_TTL })
}

export function verifyResetToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; purpose?: string }
    return payload.purpose === 'reset' ? payload.sub : null
  } catch {
    return null
  }
}
