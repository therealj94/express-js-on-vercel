// Errores con código HTTP y clave corta para el frontend.
//
// Los motores lanzan `Falla`; las rutas la atrapan con `responderFalla` y la
// convierten en `{ error, codigo }` con el estado que corresponde. Así la
// lógica de negocio no sabe nada de Express y se prueba sola.

import type { Response } from 'express'

export class Falla extends Error {
  constructor(public estado: number, mensaje: string, public codigo?: string, public extra?: Record<string, unknown>) {
    super(mensaje)
  }
}

export const malaPeticion = (m: string, codigo?: string, extra?: Record<string, unknown>) => new Falla(400, m, codigo, extra)
export const sinPermiso = (m: string, codigo?: string) => new Falla(403, m, codigo)
export const noEncontrado = (m: string, codigo?: string) => new Falla(404, m, codigo)
export const conflicto = (m: string, codigo?: string, extra?: Record<string, unknown>) => new Falla(409, m, codigo, extra)

export function responderFalla(res: Response, e: unknown): void {
  if (e instanceof Falla) {
    res.status(e.estado).json({ error: e.message, codigo: e.codigo, ...(e.extra ?? {}) })
    return
  }
  console.error('[ordenexchange] error no controlado:', e)
  res.status(500).json({ error: 'Error interno' })
}

/** Envuelve un manejador async para que cualquier `Falla` se responda bien. */
export function seguro<T extends (...args: any[]) => any>(fn: T) {
  return async (req: any, res: Response, siguiente?: any) => {
    try {
      await fn(req, res, siguiente)
    } catch (e) {
      responderFalla(res, e)
    }
  }
}
