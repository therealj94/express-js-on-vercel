import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHash } from 'crypto'

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
 * Huella corta de la contraseña guardada (del hash, nunca de la contraseña).
 *
 * Va dentro de cada sesión y de cada token de reseteo: si la contraseña cambia,
 * cambia el hash —bcrypt lleva sal—, cambia la huella y dejan de valer las
 * sesiones y los reseteos firmados antes. Es el `tokenVersion` que esta casa no
 * tenía: sin él, rotar la contraseña del administrador no echaba a nadie que ya
 * tuviera un token de treinta días.
 */
export function huellaClave(passwordHash: string): string {
  return createHash('sha256').update(String(passwordHash)).digest('hex').slice(0, 16)
}

/** Lo que dice una sesión de MyTokenPay, con la firma ya comprobada. */
export interface Sesion {
  sub: string
  /**
   * El GID con el que se ABRIÓ esta sesión. Solo lo pone `/api/auth/sso`, después
   * de comprobar un pase de Genesis ID y que el correo es el de ese GID. Es la
   * única prueba que tiene MyTokenPay de que quien usa la sesión controla la
   * identidad: el alta con contraseña no verifica el correo.
   */
  gid?: string
  /** Huella de la contraseña con que se firmó (ver `huellaClave`). */
  pv?: string
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
 * `passwordHash` pone la huella de la contraseña (ver `huellaClave`).
 */
export function signToken(userId: string, extra: { passwordHash?: string; gid?: string | null } = {}): string {
  const reclamos: Record<string, string> = { sub: userId }
  if (extra.passwordHash) reclamos.pv = huellaClave(extra.passwordHash)
  if (extra.gid) reclamos.gid = extra.gid
  return jwt.sign(reclamos, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

/**
 * Lee una sesión. Un token con `purpose` (el de reseteo) NO es una sesión: se
 * firma con el mismo secreto, y antes de esto servía de Bearer durante sus
 * quince minutos —a quien lo pidiera en /forgot-password, sin tocar la
 * contraseña y sin que la dueña se enterara—.
 */
export function leerSesion(token: string): Sesion | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub?: unknown; purpose?: unknown; gid?: unknown; pv?: unknown }
    if (!p || typeof p.sub !== 'string' || p.purpose !== undefined) return null
    return {
      sub: p.sub,
      gid: typeof p.gid === 'string' && p.gid ? p.gid : undefined,
      pv: typeof p.pv === 'string' && p.pv ? p.pv : undefined,
    }
  } catch {
    return null
  }
}

export function verifyToken(token: string): string | null {
  return leerSesion(token)?.sub ?? null
}

/** El token de sesión ya verificado: quién es y, si entró con Genesis ID, qué GID probó. */
export function leerToken(token: string): { sub: string; gid: string | null } | null {
  const s = leerSesion(token)
  return s ? { sub: s.sub, gid: s.gid ?? null } : null
}

/**
 * ¿Sigue valiendo esta sesión para este usuario?
 *
 * Con huella, solo si la contraseña no cambió desde que se firmó. Sin huella
 * —las sesiones firmadas antes de que existiera— valen como siempre, para no
 * echar a nadie al desplegar; salvo la del ADMINISTRADOR: su contraseña estuvo
 * publicada y cualquiera pudo sacarse un token con ella, así que tiene que
 * volver a entrar una vez.
 */
export function sesionVigente(sesion: Sesion, usuario: { passwordHash: string; role: string }): boolean {
  if (sesion.pv !== undefined) return sesion.pv === huellaClave(usuario.passwordHash)
  return usuario.role !== 'admin'
}

export function signResetToken(userId: string, passwordHash: string): string {
  return jwt.sign({ sub: userId, purpose: 'reset', pv: huellaClave(passwordHash) }, JWT_SECRET, {
    expiresIn: RESET_TOKEN_TTL,
  })
}

/** El dueño del token de reseteo y la huella de la contraseña que tenía al pedirlo. */
export function verifyResetToken(token: string): { sub: string; pv?: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; purpose?: string; pv?: string }
    if (payload.purpose !== 'reset' || typeof payload.sub !== 'string') return null
    return { sub: payload.sub, pv: typeof payload.pv === 'string' ? payload.pv : undefined }
  } catch {
    return null
  }
}
