// Servidor de la Tesorería de Orden Global.
//
// Sirve el front (las tres plataformas, la carpeta de arriba) y expone el API
// bajo /api. Las reglas de negocio no viven aquí: viven en ../app/reglas.js y
// son las mismas que corre el navegador. Este servidor pone lo que el
// navegador no puede: identidad de quien opera, firmas Ed25519 del Consejo,
// libro sellado con SHA-256, almacén persistente y lectura de la cadena 5550.

import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { join } from 'path'

import { store, iniciar, motor } from './store.js'
import { CARPETA_FRONT, R } from './reglas.js'
import { rutas } from './rutas.js'
import { asegurarPresidente, limpiarSesiones } from './operadores.js'
import { genesisConfigurado } from './genesis.js'
import { anclajeConfigurado } from './ancla.js'
import { sha256 } from './cripto.js'

const app = express()

const ORIGENES = (process.env.TESORERIA_CORS || '').split(',').map((s) => s.trim()).filter(Boolean)
// Sin lista, el front se sirve desde este mismo origen y CORS no hace falta.
// Con lista (por ejemplo la copia estática en Vercel), solo esos orígenes.
app.use(cors(ORIGENES.length ? { origin: ORIGENES } : { origin: false }))
app.use(express.json({ limit: '2mb' }))

app.use((_req, res, siguiente) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  siguiente()
})

const COMMIT = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'desconocido'
const RAMA = process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || 'desconocida'
const ARRANQUE = new Date().toISOString()

app.get('/healthz', (_req, res) => {
  const v = R.verificarLibro(store.todo().estado, sha256)
  res.json({ estado: v.ok && motor === 'mongodb' ? 'ok' : 'degradado', en: new Date().toISOString(), version: { commit: COMMIT.slice(0, 12), rama: RAMA, arrancadoEn: ARRANQUE }, almacenPersistente: motor === 'mongodb', libroIntegro: v.ok })
})

app.use('/api', rutas({ commit: COMMIT.slice(0, 12), rama: RAMA, arranque: ARRANQUE }))

// El front: index.html, origen.html, security.html, utility.html y app/.
// Solo esos archivos; la carpeta del servidor no se sirve.
const PAGINAS = ['index.html', 'origen.html', 'security.html', 'utility.html', 'prueba.html', 'acta.html']
app.get('/', (_req, res) => res.sendFile(join(CARPETA_FRONT, 'index.html')))
for (const p of PAGINAS) app.get('/' + p, (_req, res) => res.sendFile(join(CARPETA_FRONT, p)))
app.use('/app', express.static(join(CARPETA_FRONT, 'app'), { index: false, extensions: [] }))

app.use((error: any, _req: express.Request, res: express.Response, _n: express.NextFunction) => {
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' })
  if (error?.type === 'entity.too.large' || error?.status === 413) return res.status(413).json({ error: 'Cuerpo demasiado grande' })
  console.error('[tesoreria] error no controlado:', error)
  res.status(500).json({ error: 'Error interno' })
})

// ─────────────────────────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────────────────────────

const puerto = Number(process.env.PORT || 4100)
const __filename = fileURLToPath(import.meta.url)
const debeEscuchar = process.argv[1] === __filename || Boolean(process.env.PORT) || Boolean(process.env.RENDER)

export async function arrancar(): Promise<void> {
  await iniciar()
  const presidente = asegurarPresidente()
  limpiarSesiones()
  const v = R.verificarLibro(store.todo().estado, sha256)

  console.log(`[tesoreria] almacén: ${motor} · asientos: ${v.total} · libro ${v.ok ? 'íntegro' : 'ROTO en ' + v.en}`)
  const avisos: string[] = []
  if (motor === 'archivo') avisos.push('ALMACEN EN ARCHIVO: en Render el disco es efímero y el libro se pierde en cada despliegue. Configure TESORERIA_MONGO_URL.')
  if (!genesisConfigurado()) avisos.push('SIN TESORERIA_GENESIS_API_KEY: la entrada con Genesis ID está desactivada; solo contraseña.')
  if (!anclajeConfigurado()) avisos.push('SIN TESORERIA_ANCLA_CLAVE: el libro no se ancla en la cadena 5550; el sello solo se publica por API.')
  if (!v.ok) avisos.push('EL LIBRO NO VERIFICA: alguien tocó el almacén por fuera. No opere hasta aclararlo.')
  for (const a of avisos) console.warn(`[tesoreria] AVISO — ${a}`)

  if (presidente.creado) {
    console.log(`[tesoreria] primer presidente: ${presidente.email}`)
    if (presidente.contrasena) {
      console.log(`[tesoreria] CONTRASEÑA INICIAL (se muestra una sola vez): ${presidente.contrasena}\n[tesoreria] Cámbiela al entrar. Defina TESORERIA_ADMIN_PASSWORD para fijarla usted.`)
    }
  }
  setInterval(limpiarSesiones, 3600000).unref?.()
}

if (debeEscuchar) {
  arrancar()
    .then(() => app.listen(puerto, '0.0.0.0', () => console.log(`[tesoreria] escuchando en http://0.0.0.0:${puerto}`)))
    .catch((e) => { console.error('[tesoreria] no se pudo arrancar:', e); process.exit(1) })
}

export default app
export { store }
