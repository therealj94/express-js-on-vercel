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
import { EN_PRODUCCION, modoDemo, TRAS_PROXY, ORIGENES } from './lib/entorno.js'
import { prepararPrecios, precios } from './motor/precios.js'
import { asegurarAdministrador, limpiarSesiones } from './motor/operadores.js'
import { sembrar, CONTRASENA_DEMO } from './motor/demo.js'
import { genesisConfigurado } from './motor/genesis.js'
import { correoConfigurado } from './motor/correo.js'
import * as usuarios from './motor/usuarios.js'
import * as anuncios from './motor/anuncios.js'
import { revisarVencidas } from './motor/ordenes.js'
import { verificarCadena } from './motor/bitacora.js'
import { authRouter } from './routes/auth.js'
import { genesisRouter } from './routes/genesis.js'
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
// Solo se confía en X-Forwarded-For cuando de verdad hay un proxy delante:
// si no, cualquiera se inventa una IP por petición y el límite por IP no vale.
if (TRAS_PROXY) app.set('trust proxy', 1)
// En producción la API solo se abre a los orígenes declarados (vacío = mismo
// origen); en desarrollo, a cualquiera.
app.use(cors(EN_PRODUCCION ? { origin: ORIGENES.length ? ORIGENES : false } : {}))

// Cabeceras de seguridad. La CSP permite lo que la app usa: sus propios
// archivos, estilos e íconos en línea, las fuentes de Google e imágenes en
// data: (los comprobantes se muestran desde la propia API).
app.use((_req, res, siguiente) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()')
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  if (EN_PRODUCCION) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
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
    // Un arranque fallido (Mongo inalcanzable un momento) no se queda pegado:
    // la siguiente petición vuelve a intentarlo.
    arranque = null
    siguiente(e)
  }
})

// 3 MB: un comprobante de pago en el chat (≤ 1,5 MB en base64) más holgura.
// Los fotogramas del rostro para Genesis ID (25 MB) tienen su propio parser
// dentro del router, DESPUÉS de comprobar la sesión: sin token no se parsea nada.
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
  const listo = motor === 'mongodb' && cadena.integra && genesisConfigurado() && Boolean(cfg.tesoreria) && p.oroUsdOnza > 0 && correoConfigurado()
  res.json({
    estado: listo ? 'ok' : 'degradado',
    en: new Date().toISOString(),
    version: { commit: COMMIT.slice(0, 12), rama: RAMA, arrancadoEn: ARRANQUE },
    comprobaciones: {
      almacenPersistente: motor === 'mongodb',
      genesisConfigurado: genesisConfigurado(),
      correoConfigurado: correoConfigurado(),
      tesoreriaConfigurada: Boolean(cfg.tesoreria),
      precioMetal: p.oroUsdOnza > 0 && p.plataUsdOnza > 0,
      bitacoraIntegra: cadena.integra,
      demo: modoDemo(),
      produccion: EN_PRODUCCION,
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
  usuarios.migrar()
  prepararPrecios()
  const admin = asegurarAdministrador()
  limpiarSesiones()
  const demo = modoDemo()
  if (demo) {
    const r = sembrar()
    if (r.sembrado) console.log(`[ordenexchange] demo sembrada: ${r.usuarios} usuarios, ${r.anuncios} anuncios (contraseña de todos: ${CONTRASENA_DEMO})`)
  } else {
    // Si el almacén trae cuentas de demostración de una arrancada anterior,
    // quedan bloqueadas y sus anuncios fuera del mercado.
    const bloqueadas = usuarios.bloquearCuentasDemo()
    if (bloqueadas) {
      for (const u of store.todo().usuarios) if (usuarios.esDemo(u)) anuncios.pausarTodos(u.id, 'cuenta de demostración fuera del modo demo')
      console.warn(`[ordenexchange] AVISO — ${bloqueadas} cuentas de demostración bloqueadas al pasar a modo real`)
    }
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
  if (!correoConfigurado() && !demo) avisos.push('SIN BREVO_API_KEY: no se pueden mandar los códigos de confirmación del correo; nadie podrá verificar su identidad.')
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
