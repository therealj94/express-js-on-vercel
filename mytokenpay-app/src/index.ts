import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { authRouter } from './routes/auth.js'
import { metaRouter } from './routes/meta.js'
import { companiesRouter } from './routes/companies.js'

const __filename = fileURLToPath(import.meta.url)

const app = express()
app.use(cors())
app.use(express.json({ limit: '12mb' }))

app.get('/', (_req, res) => {
  res.json({ name: 'MyTokenPay API', status: 'ok' })
})

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/companies', companiesRouter)
app.use('/api', metaRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

const port = process.env.PORT || 3001
if (process.env.VERCEL === undefined && process.argv[1] === __filename) {
  app.listen(port, () => {
    console.log(`MyTokenPay API listening on http://localhost:${port}`)
  })
}

export default app
