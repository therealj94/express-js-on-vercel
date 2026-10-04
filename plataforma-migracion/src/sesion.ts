// Quién entra al panel interno y qué puede hacer.
//
// Los operadores se declaran en la variable MIGRACION_OPERADORES, separados por
// punto y coma, cada uno como «correo|roles|clave»:
//
//   jose@ordenglobal.link|operador,firmante|scrypt$<sal>$<hash>
//
// La clave nunca va en claro: se genera con `npm run clave`. Los roles son
//   - operador: carga listas, toma y publica fotos, concilia, propone liberaciones;
//   - firmante: aprueba o rechaza liberaciones (los custodios de nivel 1);
//   - lectura: solo mira.
//
// La sesión es un token firmado con MIGRACION_SECRETO que vence a las 8 horas.
// No se guarda en ningún lado: rotar el secreto cierra todas las sesiones.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import type { Request, Response, NextFunction } from 'express'

export type Rol = 'operador' | 'firmante' | 'lectura'
export interface Operador { correo: string; roles: Rol[] }
interface Declarado extends Operador { clave: string }

const HORAS = 8

export function leerOperadores(texto = process.env.MIGRACION_OPERADORES || ''): Declarado[] {
  return texto.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [correo, roles, clave] = s.split('|').map((x) => x.trim())
    return {
      correo: (correo || '').toLowerCase(),
      roles: (roles || '').split(',').map((r) => r.trim()).filter((r): r is Rol => ['operador', 'firmante', 'lectura'].includes(r)),
      clave: clave || '',
    }
  }).filter((o) => o.correo.includes('@') && o.clave.startsWith('scrypt$'))
}

export function hashClave(clave: string): string {
  const sal = randomBytes(16).toString('hex')
  return `scrypt$${sal}$${scryptSync(clave, sal, 32).toString('hex')}`
}

function claveCorrecta(clave: string, guardada: string): boolean {
  const [, sal, hash] = guardada.split('$')
  if (!sal || !hash) return false
  const calculado = scryptSync(clave, sal, 32)
  const esperado = Buffer.from(hash, 'hex')
  return esperado.length === calculado.length && timingSafeEqual(calculado, esperado)
}

function secreto(): string {
  const s = process.env.MIGRACION_SECRETO || ''
  if (s.length < 32) throw new Error('MIGRACION_SECRETO tiene que tener al menos 32 caracteres')
  return s
}

const firmar = (cuerpo: string) => createHmac('sha256', secreto()).update(cuerpo).digest('base64url')

export function entrar(correo: string, clave: string, operadores = leerOperadores()): string | null {
  const o = operadores.find((x) => x.correo === String(correo || '').toLowerCase())
  // Se calcula el hash aunque el correo no exista, para no delatar por el tiempo de respuesta quién es operador.
  const ok = claveCorrecta(String(clave || ''), o?.clave || 'scrypt$00$00')
  if (!o || !ok) return null
  const cuerpo = Buffer.from(JSON.stringify({ c: o.correo, r: o.roles, v: Date.now() + HORAS * 3600_000 })).toString('base64url')
  return `${cuerpo}.${firmar(cuerpo)}`
}

export function operadorDe(token: string): Operador | null {
  const [cuerpo, firma] = String(token || '').split('.')
  if (!cuerpo || !firma) return null
  const esperada = firmar(cuerpo)
  if (esperada.length !== firma.length || !timingSafeEqual(Buffer.from(esperada), Buffer.from(firma))) return null
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString())
    if (typeof d.v !== 'number' || d.v < Date.now()) return null
    // Si al operador lo quitaron de la variable, su sesión deja de valer en el acto.
    const vigente = leerOperadores().find((x) => x.correo === d.c)
    return vigente ? { correo: vigente.correo, roles: vigente.roles } : null
  } catch { return null }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { operador?: Operador } }
}

export function exige(...roles: Rol[]) {
  return (req: Request, res: Response, sig: NextFunction) => {
    const auth = String(req.headers.authorization || '')
    const o = operadorDe(auth.startsWith('Bearer ') ? auth.slice(7) : '')
    if (!o) return res.status(401).json({ error: 'Hace falta entrar al panel' })
    if (roles.length && !roles.some((r) => o.roles.includes(r))) {
      return res.status(403).json({ error: `Hace falta el rol ${roles.join(' o ')}` })
    }
    req.operador = o
    sig()
  }
}
