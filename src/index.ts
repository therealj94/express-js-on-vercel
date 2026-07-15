import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { authRouter } from './routes/auth.js'
import { metaRouter } from './routes/meta.js'
import { companiesRouter } from './routes/companies.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json({ limit: '12mb' }))

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/companies', companiesRouter)
app.use('/api', metaRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

// Serve the built client (production / vercel dev) if present.
const clientDist = path.join(__dirname, '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

const port = process.env.PORT || 3001
if (process.env.VERCEL === undefined && process.argv[1] === __filename) {
  app.listen(port, () => {
    console.log(`MyTokenPay API listening on http://localhost:${port}`)
  })
}

export default app
