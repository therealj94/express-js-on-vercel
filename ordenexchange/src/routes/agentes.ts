import { Router } from 'express'
import { seguro } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import * as agentes from '../motor/agentes.js'
import * as usuarios from '../motor/usuarios.js'

export const agentesRouter = Router()
agentesRouter.use(exigirSesion)

agentesRouter.get('/estado', (req, res) => {
  res.json(agentes.estado(req.usuario!))
})

agentesRouter.post('/solicitar', limite(5), seguro((req, res) => {
  res.status(201).json({ solicitud: agentes.solicitar(req.usuario!, req.body?.descripcion), usuario: usuarios.propio(req.usuario!) })
}))

agentesRouter.post('/retirar', seguro((req, res) => {
  res.json({ solicitud: agentes.retirar(req.usuario!), usuario: usuarios.propio(req.usuario!) })
}))

agentesRouter.post('/renunciar', seguro((req, res) => {
  res.json({ usuario: usuarios.propio(agentes.renunciar(req.usuario!)) })
}))
