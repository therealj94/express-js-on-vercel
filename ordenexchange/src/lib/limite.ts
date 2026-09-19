// Límite de peticiones por IP: cubo con goteo.
//
// Sin esto, las rutas de entrada quedan expuestas a fuerza bruta y la de
// mensajes a que alguien inunde el chat de una orden. Es el mismo mecanismo
// que usa Genesis ID.

import type { Request, Response, NextFunction } from 'express'

const cubos = new Map<string, { fichas: number; ultimo: number }>()

export function limite(porMinuto: number, clave?: (req: Request) => string) {
  const relleno = porMinuto / 60000
  return (req: Request, res: Response, siguiente: NextFunction) => {
    const llave = `${req.ip}|${clave ? clave(req) : req.baseUrl + req.path}`
    const ahora = Date.now()
    const cubo = cubos.get(llave) ?? { fichas: porMinuto, ultimo: ahora }
    cubo.fichas = Math.min(porMinuto, cubo.fichas + (ahora - cubo.ultimo) * relleno)
    cubo.ultimo = ahora
    if (cubo.fichas < 1) {
      cubos.set(llave, cubo)
      res.setHeader('Retry-After', '60')
      res.status(429).json({ error: 'Demasiadas peticiones. Espere un momento.', codigo: 'limite' })
      return
    }
    cubo.fichas -= 1
    cubos.set(llave, cubo)
    siguiente()
  }
}

setInterval(() => {
  const tope = Date.now() - 600000
  for (const [k, v] of cubos) if (v.ultimo < tope) cubos.delete(k)
}, 300000).unref?.()
