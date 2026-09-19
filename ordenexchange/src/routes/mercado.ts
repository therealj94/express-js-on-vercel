// Lo público: catálogo, precios de referencia, anuncios y perfiles.

import { Router } from 'express'
import { seguro, noEncontrado } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { sesionOpcional } from '../lib/sesion.js'
import { PAISES } from '../data/latam.js'
import { ACTIVOS } from '../data/activos.js'
import { store } from '../store.js'
import * as anuncios from '../motor/anuncios.js'
import * as usuarios from '../motor/usuarios.js'
import { resumenPrecios } from '../motor/precios.js'
import { modoDemo } from '../motor/demo.js'

export const mercadoRouter = Router()

mercadoRouter.get('/catalogo', (_req, res) => {
  const cfg = store.todo().configuracion
  res.json({
    activos: ACTIVOS.map((a) => ({ simbolo: a.simbolo, nombre: a.nombre, decimales: a.decimales, ancla: a.ancla })),
    paises: PAISES,
    ventanasPago: [15, 30, 45, 60],
    configuracion: {
      comisionPct: cfg.comisionPct, garantiaAgente: cfg.garantiaAgente, maxOrdenesAbiertas: cfg.maxOrdenesAbiertas,
      minOrdenUsd: cfg.minOrdenUsd, maxOrdenUsdSinAgente: cfg.maxOrdenUsdSinAgente,
    },
    demo: modoDemo(),
  })
})

mercadoRouter.get('/precios', (req, res) => {
  res.json(resumenPrecios(String(req.query.moneda || 'USD')))
})

mercadoRouter.get('/anuncios', limite(120), sesionOpcional, seguro((req, res) => {
  const q = req.query as Record<string, string>
  res.json(anuncios.buscar(q, req.usuario ?? null))
}))

mercadoRouter.get('/anuncios/:id', sesionOpcional, seguro((req, res) => {
  const a = anuncios.porId(req.params.id)
  if (!a || !anuncios.disponibleEnMercado(a)) throw noEncontrado('Anuncio no disponible')
  const p = anuncios.publico(a, req.usuario ?? null)
  if (!p) throw noEncontrado('Anuncio no disponible')
  res.json({ anuncio: p })
}))

export const usuariosRouter = Router()

usuariosRouter.get('/:id/perfil', sesionOpcional, seguro((req, res) => {
  const u = usuarios.porId(req.params.id)
  if (!u) throw noEncontrado('Usuario no encontrado')
  res.json({ usuario: usuarios.publico(u), anuncios: anuncios.anunciosPublicosDe(u.id, req.usuario ?? null) })
}))
