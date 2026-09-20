// Órdenes y su chat.

import { Router } from 'express'
import { seguro, noEncontrado } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import * as ordenes from '../motor/ordenes.js'

export const ordenesRouter = Router()

/**
 * Las imágenes del chat salen por URL firmada, sin cabecera de sesión: el
 * navegador las pone en <img src>. La firma la conoce solo quien recibió la
 * URL en un mensaje, es decir, las partes de la orden y el panel.
 */
ordenesRouter.get('/:id/imagenes/:img', limite(120), seguro(async (req, res) => {
  const { id, img } = req.params
  if (!ordenes.firmaImagenValida(id, img, String(req.query.f || ''))) throw noEncontrado('Imagen no encontrada')
  const dataUrl = await ordenes.imagenDe(id, img)
  if (!dataUrl) throw noEncontrado('Imagen no encontrada')
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)
  if (!m) throw noEncontrado('Imagen no encontrada')
  res.setHeader('Content-Type', m[1])
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.setHeader('Content-Security-Policy', "default-src 'none'")
  res.send(Buffer.from(m[2], 'base64'))
}))

ordenesRouter.use(exigirSesion)

ordenesRouter.post('/', limite(20), seguro((req, res) => {
  const o = ordenes.crear(req.usuario!, req.body ?? {})
  res.status(201).json({ orden: ordenes.detalle(o, req.usuario!) })
}))

ordenesRouter.get('/', (req, res) => {
  res.json(ordenes.listar(req.usuario!, req.query as Record<string, string>))
})

ordenesRouter.get('/:id', seguro((req, res) => {
  res.json({ orden: ordenes.ver(req.usuario!, req.params.id) })
}))

ordenesRouter.post('/:id/pagado', seguro((req, res) => {
  const o = ordenes.marcarPagado(req.usuario!, req.params.id, req.body?.referencia)
  res.json({ orden: ordenes.detalle(o, req.usuario!) })
}))

ordenesRouter.post('/:id/liberar', limite(20), seguro(async (req, res) => {
  const o = await ordenes.liberar(req.usuario!, req.params.id, req.body?.contrasena)
  res.json({ orden: ordenes.detalle(o, req.usuario!) })
}))

ordenesRouter.post('/:id/cancelar', seguro((req, res) => {
  const o = ordenes.cancelar(req.usuario!, req.params.id, req.body?.motivo)
  res.json({ orden: ordenes.detalle(o, req.usuario!) })
}))

ordenesRouter.post('/:id/apelar', seguro((req, res) => {
  const o = ordenes.apelar(req.usuario!, req.params.id, req.body ?? {})
  res.json({ orden: ordenes.detalle(o, req.usuario!) })
}))

ordenesRouter.post('/:id/apelacion/retirar', seguro((req, res) => {
  const o = ordenes.retirarApelacion(req.usuario!, req.params.id)
  res.json({ orden: ordenes.detalle(o, req.usuario!) })
}))

/** Sondeo del chat: solo los mensajes nuevos y la orden sin mensajes. */
ordenesRouter.get('/:id/mensajes', limite(120, (req) => `msg:${req.params.id}`), seguro((req, res) => {
  const { mensajes, orden } = ordenes.mensajesDesde(req.usuario!, req.params.id, req.query.desde ? String(req.query.desde) : undefined)
  res.json({ mensajes, estado: orden.estado, orden: ordenes.detalleLigero(orden, req.usuario!) })
}))

ordenesRouter.post('/:id/mensajes', limite(60, (req) => `msg:${req.params.id}`), seguro(async (req, res) => {
  res.status(201).json({ mensaje: await ordenes.enviarMensaje(req.usuario!, req.params.id, req.body ?? {}) })
}))

ordenesRouter.post('/:id/calificar', seguro((req, res) => {
  const o = ordenes.calificar(req.usuario!, req.params.id, req.body?.tipo, req.body?.comentario)
  res.json({ orden: ordenes.detalle(o, req.usuario!) })
}))
