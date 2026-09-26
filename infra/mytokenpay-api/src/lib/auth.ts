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

/**
 * El token de sesión de MyTokenPay.
 *
 * `gid` va SOLO en la sesión que nace de un pase de Genesis ID (`/auth/sso`):
 * es la prueba de que quien tiene esta sesión es la persona de ese GID. El
 * alta y el login con contraseña no la llevan, porque aquí nadie comprueba el
 * correo —ni al registrarse ni al recuperar la contraseña—: una cuenta con el
 * correo de otra persona no es esa persona. El puente con Genesis
 * (routes/genesis.ts) solo toca una identidad con GID si la sesión trae el suyo.
 */
export function signToken(userId: string, extra: { gid?: string | null } = {}): string {
  return jwt.sign(extra.gid ? { sub: userId, gid: extra.gid } : { sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
    return payload.sub
  } catch {
    return null
  }
}

/** El token de sesión ya verificado: quién es y, si entró con Genesis ID, qué GID probó. */
export function leerToken(token: string): { sub: string; gid: string | null } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; gid?: unknown }
    if (!payload?.sub) return null
    return { sub: payload.sub, gid: typeof payload.gid === 'string' && payload.gid ? payload.gid : null }
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
