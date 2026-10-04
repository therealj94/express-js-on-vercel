// La aplicación, armada con sus dependencias para poder probarla sin red ni base.

import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Almacen } from './almacen.js'
import type { Cadena } from './cadena.js'
import type { Arbol } from './merkle.js'
import { rutasPublicas } from './rutas/publico.js'
import { rutasPanel } from './rutas/panel.js'
import { configSafe, type ConfigSafe } from './operaciones.js'

const PUBLICO = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

export interface Contexto {
  almacen: Almacen
  cadena: Cadena
  entorno: NodeJS.ProcessEnv
  /** Firmas necesarias para aprobar una liberación de ORIGEN sin firma múltiple configurada. */
  umbral: number
  /** La firma múltiple (SAFE_DIRECCION): con ella, aprobar es firmar la transacción de la Safe y el umbral es el de la Safe. */
  safe: ConfigSafe | null
  /** Árboles de Merkle ya construidos, por foto. */
  arbol(fotoId: string, construir: () => Arbol): Arbol
  /** Barridos de la cadena ya hechos, por bloque: varias fotos del mismo bloque no lo repiten. */
  barrido(clave: string, barrer: () => Promise<string[]>): Promise<string[]>
}

export function crearContexto(almacen: Almacen, cadena: Cadena, entorno = process.env): Contexto {
  const arboles = new Map<string, Arbol>()
  const barridos = new Map<string, Promise<string[]>>()
  return {
    almacen, cadena, entorno,
    umbral: Math.max(1, Number(entorno.MIGRACION_UMBRAL) || 2),
    safe: configSafe(entorno),
    arbol(id, construir) {
      if (!arboles.has(id)) arboles.set(id, construir())
      return arboles.get(id)!
    },
    barrido(clave, barrer) {
      if (!barridos.has(clave)) {
        const p = barrer()
        p.catch(() => barridos.delete(clave))
        barridos.set(clave, p)
      }
      return barridos.get(clave)!
    },
  }
}

export function crearApp(ctx: Contexto) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '5mb' }))
  app.use((_req, res, sig) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    sig()
  })

  app.get('/healthz', (_req, res) => res.json({ ok: true, motor: ctx.almacen.motor }))
  app.use('/api', rutasPublicas(ctx))
  app.use('/api/panel', rutasPanel(ctx))
  app.get('/', (_req, res) => res.sendFile(join(PUBLICO, 'index.html')))
  app.get('/panel', (_req, res) => res.sendFile(join(PUBLICO, 'panel.html')))
  app.get('/estilo.css', (_req, res) => res.sendFile(join(PUBLICO, 'estilo.css')))
  return app
}
