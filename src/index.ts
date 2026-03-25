import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { skillsData, VALID_CATEGORIES, type CategoryKey } from './data/skills.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// Home route - HTML
app.get('/', (req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Express on Vercel</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/api-data">API Data</a>
          <a href="/healthz">Health</a>
        </nav>
        <h1>Welcome to Express on Vercel 🚀</h1>
        <p>This is a minimal example without a database or forms.</p>
        <img src="/logo.png" alt="Logo" width="120" />
      </body>
    </html>
  `)
})

app.get('/about', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'components', 'about.htm'))
})

// Example API endpoint - JSON
app.get('/api-data', (req, res) => {
  res.json({
    message: 'Here is some sample API data',
    items: ['apple', 'banana', 'cherry'],
  })
})

// Health check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Skills API - list all categories
app.get('/api/skills', (req, res) => {
  const categories = Object.values(skillsData).map(({ key, label, description }) => ({
    key,
    label,
    description,
  }))
  res.json({ categories })
})

// Skills API - detail for a single category
app.get('/api/skills/:category', (req, res) => {
  const { category } = req.params
  const data = skillsData[category as CategoryKey]
  if (!data) {
    res.status(404).json({ error: 'Category not found', validCategories: VALID_CATEGORIES })
    return
  }
  res.json(data)
})

export default app
