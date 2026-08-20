// Envuelve un handler asíncrono para que sus fallos lleguen al manejador de
// errores en vez de matar el proceso.
//
// POR QUE HIZO FALTA, Y COMO SE DESCUBRIO
//
// En Express 4 un handler `async` que rechaza NO va a `next(err)`: la promesa
// queda sin atrapar, y Node la trata como `unhandledRejection`, que desde la
// versión 15 TERMINA EL PROCESO. O sea: un error en UNA petición de UNA persona
// tira el servicio para todas.
//
// No es teórico. La primera prueba del ciclo completo contra producción tumbó
// el dyno: dos registros con el mismo correo llegaron casi a la vez, el índice
// único de Mongo hizo su trabajo, `createUser` lanzó — y el proceso murió. El
// manejador de errores que ya estaba puesto no lo atrapó nunca, porque no puede.
//
// Se usa así:   router.post('/x', envolver(async (req, res) => { ... }))

import type { NextFunction, Request, Response } from 'express'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown

export function envolver(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}
