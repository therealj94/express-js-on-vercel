import { Router } from 'express'
import { seguro } from '../lib/errores.js'
import { exigirSesion } from '../lib/sesion.js'
import * as metodos from '../motor/metodosPago.js'

export const metodosPagoRouter = Router()
metodosPagoRouter.use(exigirSesion)

metodosPagoRouter.get('/', (req, res) => {
  res.json({ metodos: metodos.listar(req.usuario!.id) })
})

metodosPagoRouter.post('/', seguro((req, res) => {
  res.status(201).json({ metodo: metodos.crear(req.usuario!, req.body ?? {}) })
}))

metodosPagoRouter.patch('/:id', seguro((req, res) => {
  res.json({ metodo: metodos.actualizar(req.usuario!, req.params.id, req.body ?? {}) })
}))

metodosPagoRouter.delete('/:id', seguro((req, res) => {
  metodos.eliminar(req.usuario!, req.params.id)
  res.status(204).end()
}))
