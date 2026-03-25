import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { skillsData, VALID_CATEGORIES, type CategoryKey } from './data/skills.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  const categories = Object.values(skillsData).map(({ key, label, description, agentName }) => ({
    key,
    label,
    description,
    agentName,
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

// Skills API - chat with a category's AI agent
app.post('/api/skills/:category/chat', async (req, res) => {
  const { category } = req.params
  const agent = skillsData[category as CategoryKey]
  if (!agent) {
    res.status(404).json({ error: 'Category not found', validCategories: VALID_CATEGORIES })
    return
  }

  const { message } = req.body as { message?: string }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: 'Request body must include a non-empty "message" string' })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: agent.systemPrompt,
      messages: [{ role: 'user', content: message.trim() }],
    })

    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    res.json({ agent: agent.agentName, reply: text })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: 'API key not configured' })
    } else {
      res.status(500).json({ error: 'Failed to reach the AI agent' })
    }
  }
})

export default app
