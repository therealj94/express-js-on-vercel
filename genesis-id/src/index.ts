import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { store, iniciar, motor } from './store.js'
import { asegurarAdministrador, limpiarSesiones } from './auth/operadores.js'
import { asegurarAplicaciones } from './auth/aplicaciones.js'
import { estadoListas, hayListas } from './aml/listas.js'
import { biometriaConfigurada } from './kyc/biometria.js'
import { verificarCadena } from './audit/bitacora.js'
import { sesionRouter } from './routes/sesion.js'
import { appsRouter } from './routes/apps.js'
import { panelRouter } from './routes/panel.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// CORS abierto solo tiene sentido para las apps del ecosistema, que se
// identifican con clave de API; el panel se sirve desde el mismo origen.
app.use(cors())
app.use(express.json({ limit: '2mb' }))

// Cabeceras de seguridad. Son pocas líneas y evitan las formas más comunes de
// abuso de un panel: incrustarlo en un iframe ajeno para engañar al operador, y
// que el navegador adivine tipos de contenido.
app.use((_req, res, siguiente) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  siguiente()
})

app.get(['/', '/admin'], (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'admin.html'))
})

/**
 * Estado del servicio.
 *
 * Se publica sin autenticar porque es lo que consultan los sistemas de
 * vigilancia, pero solo dice si el motor está en condiciones de operar — no
 * revela ningún dato de ninguna persona. La versión anterior publicaba aquí, y
 * en `/api/admin/*`, el recuento y la lista entera de identidades sin pedir nada.
 */
app.get('/healthz', (_req, res) => {
  const cadena = verificarCadena()
  const listas = estadoListas()
  const listo = hayListas() && cadena.integra && motor === 'mongodb'
  res.json({
    estado: listo ? 'ok' : 'degradado',
    en: new Date().toISOString(),
    comprobaciones: {
      almacenPersistente: motor === 'mongodb',
      listasCargadas: listas.cargadas,
      listasVencidas: listas.vencidas,
      biometria: biometriaConfigurada(),
      ssoConfigurado: Boolean(process.env.GENESIS_SSO_SECRETO),
      bitacoraIntegra: cadena.integra,
    },
  })
})

app.get('/api', (_req, res) => {
  res.json({
    nombre: 'Genesis ID',
    lema: 'Identidad digital · Orden Global',
    version: 2,
    rutas: {
      sesion: '/api/sesion/* — operadores del panel',
      apps: '/api/v1/* — aplicaciones del ecosistema (cabecera X-API-Key)',
      panel: '/api/panel/* — cumplimiento (sesión de operador)',
    },
  })
})

app.use('/api/sesion', sesionRouter)
app.use('/api/v1', appsRouter)
app.use('/api/panel', panelRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

// Cualquier error no previsto se registra completo pero se responde escueto: el
// detalle de una excepción puede filtrar rutas de archivos y estructura interna.
app.use((error: any, _req: express.Request, res: express.Response, _n: express.NextFunction) => {
  console.error('[genesis-id] error no controlado:', error)
  res.status(500).json({ error: 'Error interno' })
})

// ─────────────────────────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────────────────────────

const puerto = Number(process.env.PORT || 4000)
const __filename = fileURLToPath(import.meta.url)
const debeEscuchar =
  process.argv[1] === __filename || Boolean(process.env.PORT) || Boolean(process.env.RENDER)

export async function arrancar(): Promise<void> {
  await iniciar()

  const admin = asegurarAdministrador()
  const appsNuevas = asegurarAplicaciones()
  limpiarSesiones()

  console.log(`[genesis-id] almacén: ${motor}`)

  // Los avisos van juntos y al final, donde se ven. Cada uno describe algo que
  // impide operar con datos reales.
  const avisos: string[] = []
  if (motor === 'archivo') {
    avisos.push(
      'ALMACEN EN ARCHIVO: en Render el disco es efímero y los datos se pierden en cada ' +
      'despliegue. Configure GENESIS_MONGO_URL antes de verificar identidades reales.',
    )
  }
  if (!hayListas()) {
    avisos.push(
      'SIN LISTAS DE SANCIONES: no se puede tamizar a nadie, y por eso ninguna identidad ' +
      'podrá aprobarse sin anulación expresa. Configure GENESIS_LISTAS_DIR.',
    )
  }
  if (!biometriaConfigurada()) {
    avisos.push(
      'SIN PROVEEDOR DE BIOMETRIA: el cotejo del rostro tendrá que resolverlo un operador ' +
      'a mano en cada verificación.',
    )
  }
  if (!process.env.GENESIS_SSO_SECRETO) {
    avisos.push('SIN GENESIS_SSO_SECRETO: el inicio de sesión único entre apps está desactivado.')
  }
  for (const a of avisos) console.warn(`[genesis-id] AVISO — ${a}`)

  if (admin.creado) {
    console.log(`[genesis-id] primer administrador: ${admin.email}`)
    if (admin.contrasena) {
      console.log(
        `[genesis-id] CONTRASEÑA INICIAL (se muestra una sola vez): ${admin.contrasena}\n` +
        '[genesis-id] Cámbiela al entrar. Defina GENESIS_ADMIN_PASSWORD para fijarla usted.',
      )
    }
  }
  for (const a of appsNuevas) {
    console.log(`[genesis-id] clave de API de ${a.clave} (se muestra una sola vez): ${a.secreta}`)
  }

  setInterval(limpiarSesiones, 3600000).unref?.()
}

if (debeEscuchar) {
  arrancar()
    .then(() => {
      app.listen(puerto, '0.0.0.0', () => {
        console.log(`[genesis-id] escuchando en http://0.0.0.0:${puerto}`)
      })
    })
    .catch((e) => {
      console.error('[genesis-id] no se pudo arrancar:', e)
      process.exit(1)
    })
}

export default app
export { store }
