import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { authRouter } from './routes/auth.js'
import { metaRouter } from './routes/meta.js'
import { companiesRouter } from './routes/companies.js'
import { cobrosRouter } from './routes/cobros.js'
import { retirosRouter } from './routes/retiros.js'
import { adminRouter } from './routes/admin.js'
import { genesisRouter } from './routes/genesis.js'
import { premiosRouter } from './routes/premios.js'
import { actividadRouter } from './routes/actividad.js'
import { db } from './lib/db.js'
import { conectarAlmacen, modoAlmacen } from './lib/almacen.js'
import { hashPassword } from './lib/auth.js'
import telemetria from './lib/telemetria.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Arranque: primero se conecta el almacén (Mongo o memoria), después se siembra
 * el directorio y el administrador. En ese orden, porque sembrar antes de tener
 * dónde guardar no sirve de nada.
 */
async function inicializar() {
  const modo = await conectarAlmacen()
  await db.sembrarComercios()
  // El administrador se siembra al arrancar, si el entorno lo define. Es la única
  // vía para tener rol de administrador: nunca se concede desde el alta pública.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await db.asegurarAdministrador(process.env.ADMIN_EMAIL, hashPassword(process.env.ADMIN_PASSWORD))
  }
  console.log(`MyTokenPay API · almacén: ${modo}`)
}

const listo = inicializar()

const app = express()
app.use(cors())
app.use(express.json({ limit: '12mb' }))

// ─────────────────────────────────────────────────────────────────────────────
// Telemetría hacia el panel de analítica de Genesis ID.
//
// Se arranca aquí, antes que cualquier ruta, para que el middleware alcance a
// medir TODAS las peticiones. Si no hay clave configurada no hace absolutamente
// nada: ni una petición, ni un error en el registro. Eso permite desplegar este
// backend antes de que el panel exista y encenderlo después con solo poner la
// variable, sin volver a desplegar.
// ─────────────────────────────────────────────────────────────────────────────
telemetria.iniciar({
  url: process.env.GENESIS_URL || 'https://genesis-id.onrender.com',
  clave: (process.env.GENESIS_TELEMETRIA_KEY || process.env.GENESIS_API_KEY || '').trim(),
  app: 'mytokenpay',
  version: process.env.HEROKU_RELEASE_VERSION || '1.0.0',
  plataforma: 'servidor',
})
app.use(telemetria.express())

/**
 * El panel de administración, servido por el mismo backend.
 *
 * Sin framework ni compilación y desde aquí a propósito: un segundo despliegue
 * es un sitio más que se puede quedar viejo mientras la API avanza, y quien
 * paga los retiros no puede estar mirando datos de ayer.
 */
const PANEL = join(__dirname, 'publico', 'admin.html')
app.get('/admin', (_req, res) => res.sendFile(PANEL))
app.use('/admin', express.static(join(__dirname, 'publico'), { redirect: false }))

app.get('/', (_req, res) => {
  res.json({ name: 'MyTokenPay API', status: 'ok' })
})

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', almacen: modoAlmacen(), timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/companies', companiesRouter)
app.use('/api/cobros', cobrosRouter)
app.use('/api/retiros', retirosRouter)
app.use('/api/admin', adminRouter)
app.use('/genesis', genesisRouter)
app.use('/api', premiosRouter)
app.use('/api/actividad', actividadRouter)
app.use('/api', metaRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

// Reporta al panel cualquier excepción que llegue hasta aquí, y la deja seguir
// su curso hacia el manejador de errores de siempre.
app.use(telemetria.expressErrores())

// Middleware de errores: cierra las promesas rechazadas que `h()` reenvía. Sin
// esto, un fallo del almacén dejaría la petición colgada.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error no controlado:', err)
  if (res.headersSent) return
  res.status(500).json({ error: 'Algo salió mal de nuestro lado. Intentá de nuevo.' })
})

const port = process.env.PORT || 3001
if (process.env.VERCEL === undefined && process.argv[1] === __filename) {
  listo
    .then(() => {
      app.listen(port, () => {
        console.log(`MyTokenPay API listening on http://localhost:${port}`)
      })
    })
    .catch((err) => {
      console.error('No se pudo inicializar el almacén:', err)
      process.exit(1)
    })
}

export default app
