import type { NextFunction, Request, Response } from 'express'

/**
 * Envuelve un manejador asíncrono para que un error no quede colgado.
 *
 * Express 4 no atrapa las promesas rechazadas de un handler `async`: si una
 * lectura de la base falla, la petición se queda esperando hasta que el cliente
 * se rinde. Con esto, cualquier error va al middleware de errores y el cliente
 * recibe una respuesta en vez de un silencio.
 */
export function h(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
