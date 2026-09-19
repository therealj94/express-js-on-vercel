// OrdenExchange — la casa de cambio P2P del ecosistema Orden Global.
//
// Un solo servidor Express sirve la API (/api/*), la app web (/) y el panel de
// operadores (/admin). El activo se custodia en una billetera interna y los
// depósitos y retiros pasan por la cadena 5550; la identidad la pone Genesis ID.

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { store, iniciar, motor } from './store.js'
import { prepararPrecios, precios } from './motor/precios.js'
import { asegurarAdministrador, limpiarSesiones } from './motor/operadores.js'
import { modoDemo, sembrar, CONTRASENA_DEMO } from './motor/demo.js'
import { genesisConfigurado } from './motor/genesis.js'
import { revisarVencidas } from './motor/ordenes.js'
import { verificarCadena } from './motor/bitacora.js'
import { authRouter } from './routes/auth.js'
import { genesisRouter, parserRostro } from './routes/genesis.js'
import { mercadoRouter, usuariosRouter } from './routes/mercado.js'
import { billeteraRouter } from './routes/billetera.js'
import { metodosPagoRouter } from './routes/metodosPago.js'
import { anunciosRouter } from './routes/anuncios.js'
import { ordenesRouter } from './routes/ordenes.js'
import { agentesRouter } from './routes/agentes.js'
import { panelRouter } from './routes/panel.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PUBLICO = join(__dirname, '..', 'public')

const app = express()
app.set('trust proxy', 1)
app.use(cors())

// Cabeceras de seguridad básicas.
app.use((_req, res, siguiente) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()')
  siguiente()
})

// El arranque es asíncrono (abre el almacén). Ninguna petición se atiende
// antes de que termine: en Vercel el módulo se importa y responde en el acto.
let arranque: Promise<void> | null = null
app.use(async (_req, _res, siguiente) => {
  try {
    await arrancar()
    siguiente()
  } catch (e) {
    siguiente(e)
  }
})

// Los fotogramas del rostro para Genesis ID no caben en el límite general; el
// cuerpo lo parsea el primer parser que lo alcanza, así que este va antes.
app.use('/api/genesis/biometria', parserRostro)
// 3 MB: un comprobante de pago en el chat (≤ 1,5 MB en base64) más holgura.
app.use(express.json({ limit: '3mb' }))

// ── Páginas ──────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => res.sendFile(join(PUBLICO, 'index.html')))
app.get(['/admin', '/panel'], (_req, res) => res.sendFile(join(PUBLICO, 'admin.html')))
app.use(express.static(PUBLICO, { index: false, extensions: false, maxAge: '5m' }))

// ── Estado ───────────────────────────────────────────────────────────────────

const COMMIT = process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'desconocido'
const RAMA = process.env.RENDER_GIT_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || 'desconocida'
const ARRANQUE = new Date().toISOString()

app.get('/healthz', (_req, res) => {
  const cadena = verificarCadena()
  const p = precios()
  const cfg = store.todo().configuracion
  const listo = motor === 'mongodb' && cadena.integra && genesisConfigurado() && Boolean(cfg.tesoreria) && p.oroUsdOnza > 0
  res.json({
    estado: listo ? 'ok' : 'degradado',
    en: new Date().toISOString(),
    version: { commit: COMMIT.slice(0, 12), rama: RAMA, arrancadoEn: ARRANQUE },
    comprobaciones: {
      almacenPersistente: motor === 'mongodb',
      genesisConfigurado: genesisConfigurado(),
      tesoreriaConfigurada: Boolean(cfg.tesoreria),
      precioMetal: p.oroUsdOnza > 0 && p.plataUsdOnza > 0,
      bitacoraIntegra: cadena.integra,
      demo: modoDemo(),
    },
  })
})

app.get('/api', (_req, res) => {
  res.json({
    nombre: 'OrdenExchange',
    lema: 'Casa de cambio P2P · Orden Global',
    version: 1,
    demo: modoDemo(),
    rutas: {
      mercado: '/api/mercado/* — catálogo, precios y anuncios (público)',
      auth: '/api/auth/* — cuentas y sesión',
      genesis: '/api/genesis/* — puente con Genesis ID',
      billetera: '/api/billetera/* — saldos, depósitos y retiros',
      metodosPago: '/api/metodos-pago/*',
      anuncios: '/api/anuncios/* — mis anuncios',
      ordenes: '/api/ordenes/* — órdenes y chat',
      agentes: '/api/agentes/* — agentes de cambio',
      panel: '/api/panel/* — operadores',
    },
  })
})

// ── API ──────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter)
app.use('/api/genesis', genesisRouter)
app.use('/api/mercado', mercadoRouter)
app.use('/api/usuarios', usuariosRouter)
app.use('/api/billetera', billeteraRouter)
app.use('/api/metodos-pago', metodosPagoRouter)
app.use('/api/anuncios', anunciosRouter)
app.use('/api/ordenes', ordenesRouter)
app.use('/api/agentes', agentesRouter)
app.use('/api/panel', panelRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada', codigo: 'no-encontrado' }))

app.use((error: any, _req: express.Request, res: express.Response, _n: express.NextFunction) => {
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({ error: 'El contenido pesa demasiado (imágenes: máximo 1,5 MB)', codigo: 'demasiado-grande' })
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido', codigo: 'json' })
  }
  console.error('[ordenexchange] error no controlado:', error)
  res.status(500).json({ error: 'Error interno' })
})

// ── Arranque ─────────────────────────────────────────────────────────────────

export function arrancar(): Promise<void> {
  if (!arranque) arranque = arrancarDeVerdad()
  return arranque
}

async function arrancarDeVerdad(): Promise<void> {
  await iniciar()
  prepararPrecios()
  const admin = asegurarAdministrador()
  limpiarSesiones()
  const demo = modoDemo()
  if (demo) {
    const r = sembrar()
    if (r.sembrado) console.log(`[ordenexchange] demo sembrada: ${r.usuarios} usuarios, ${r.anuncios} anuncios (contraseña de todos: ${CONTRASENA_DEMO})`)
  }
  const vencidas = revisarVencidas()
  if (vencidas) console.log(`[ordenexchange] ${vencidas} órdenes vencidas al arrancar`)
  setInterval(() => { try { revisarVencidas() } catch (e: any) { console.error('[ordenexchange] revisando vencidas:', e?.message) } }, 30000).unref?.()

  console.log(`[ordenexchange] almacén: ${motor} · modo: ${demo ? 'DEMOSTRACIÓN' : 'real'}`)
  const p = precios()
  console.log(`[ordenexchange] precios: oro ${p.oroUsdOnza || '—'} USD/oz · plata ${p.plataUsdOnza || '—'} USD/oz · ${Object.keys(p.fx).length} tasas (${p.fuente}, ${p.actualizadoEn.slice(0, 10)})`)

  const avisos: string[] = []
  if (motor === 'archivo') avisos.push('ALMACÉN EN ARCHIVO: en Render y Vercel el disco es efímero. Configure ORDENEX_MONGO_URL antes de custodiar saldos reales.')
  if (!genesisConfigurado()) avisos.push('SIN GENESIS_API_KEY: nadie puede verificar su identidad, así que nadie puede operar salvo en modo demostración.')
  if (!store.todo().configuracion.tesoreria) avisos.push('SIN ORDENEX_TESORERIA: no se pueden comprobar depósitos de la cadena.')
  if (!(p.oroUsdOnza > 0)) avisos.push('SIN PRECIO DEL ORO: no hay precio de referencia; fíjelo en el panel (Precios) o con ORDENEX_ORO_USD_ONZA.')
  if (!process.env.ORDENEX_JWT_SECRETO) avisos.push('SIN ORDENEX_JWT_SECRETO: las sesiones se firman con el secreto de desarrollo.')
  for (const a of avisos) console.warn(`[ordenexchange] AVISO — ${a}`)

  if (admin.creado) {
    console.log(`[ordenexchange] primer administrador del panel: ${admin.email}`)
    if (admin.contrasena) console.log(`[ordenexchange] CONTRASEÑA INICIAL (se muestra una sola vez): ${admin.contrasena}\n[ordenexchange] Cámbiela al entrar en /admin. Defina ORDENEX_ADMIN_PASSWORD para fijarla usted.`)
  }
}

const puerto = Number(process.env.PORT || 4100)
const debeEscuchar = process.argv[1] === __filename || Boolean(process.env.RENDER)
if (debeEscuchar && !process.env.VERCEL) {
  arrancar()
    .then(() => app.listen(puerto, () => console.log(`[ordenexchange] escuchando en http://localhost:${puerto}`)))
    .catch((e) => { console.error('[ordenexchange] no se pudo arrancar:', e); process.exit(1) })
}

export default app
