import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { GenesisData } from './types.js'
import { seedData } from './seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = process.env.GENESIS_DATA_FILE || join(__dirname, '..', 'data', 'genesis.json')

let data: GenesisData

function load(): GenesisData {
  if (existsSync(DATA_FILE)) {
    try {
      return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as GenesisData
    } catch {
      // archivo corrupto → re-sembrar
    }
  }
  const seeded = seedData()
  persist(seeded)
  return seeded
}

function persist(next: GenesisData): void {
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(next, null, 2))
}

data = load()

export const store = {
  all(): GenesisData {
    return data
  },
  save(): void {
    persist(data)
  },
  reset(): void {
    data = seedData()
    persist(data)
  },
}
