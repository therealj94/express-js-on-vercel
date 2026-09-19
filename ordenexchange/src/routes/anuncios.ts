// Mis anuncios.

import { Router } from 'express'
import { seguro } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import * as anuncios from '../motor/anuncios.js'

export const anunciosRouter = Router()
anunciosRouter.use(exigirSesion)

anunciosRouter.get('/', (req, res) => {
  res.json({ anuncios: anuncios.misAnuncios(req.usuario!.id).map(anuncios.propio) })
})

anunciosRouter.post('/', limite(20), seguro((req, res) => {
  res.status(201).json({ anuncio: anuncios.propio(anuncios.crear(req.usuario!, req.body ?? {})) })
}))

anunciosRouter.get('/:id', seguro((req, res) => {
  res.json({ anuncio: anuncios.propio(anuncios.exigirPropietario(req.usuario!, req.params.id)) })
}))

anunciosRouter.patch('/:id', seguro((req, res) => {
  res.json({ anuncio: anuncios.propio(anuncios.actualizar(req.usuario!, req.params.id, req.body ?? {})) })
}))

anunciosRouter.post('/:id/estado', seguro((req, res) => {
  res.json({ anuncio: anuncios.propio(anuncios.cambiarEstado(req.usuario!, req.params.id, req.body?.estado)) })
}))
