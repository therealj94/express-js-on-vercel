import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { identitiesRouter } from './routes/identities.js'
import { businessRouter } from './routes/business.js'
import { adminRouter } from './routes/admin.js'
import { store } from './store.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/', (_req, res) => {
  res.json({ name: 'Genesis ID', tagline: 'Identidad digital · Orden Global', status: 'ok' })
})
app.get('/healthz', (_req, res) => res.json({ status: 'ok', at: new Date().toISOString() }))

app.use('/api/identities', identitiesRouter)
app.use('/api/business', businessRouter)
app.use('/api/admin', adminRouter)

// Utilidad de demo: reiniciar la data sembrada.
app.post('/api/admin/reset', (_req, res) => {
  store.reset()
  res.json({ ok: true })
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

const __filename = fileURLToPath(import.meta.url)
const port = process.env.PORT || 4000
if (process.argv[1] === __filename) {
  app.listen(port, () => {
    console.log(`Genesis ID engine escuchando en http://localhost:${port}`)
  })
}

export default app
