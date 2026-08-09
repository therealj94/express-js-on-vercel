// Storage seam.
//
// Today: a single JSON document on disk, loaded once and written back on
// change. That is plenty for one operator with a handful of boats, and it keeps
// the app runnable with zero external services.
//
// Later: swap `readAll` / `writeAll` for Postgres (Supabase) without touching
// any route. Everything above this file talks in plain objects.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as seed from './seed-data.js'
import * as pg from './store-postgres.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data')
const DATA_FILE = path.join(DATA_DIR, 'db.json')

const emptyDb = () => ({
  settings: structuredClone(seed.settings),
  vessels: structuredClone(seed.vessels),
  extras: structuredClone(seed.extras),
  categories: structuredClone(seed.categories),
  gallery: structuredClone(seed.gallery),
  bundles: structuredClone(seed.bundles),
  coupons: structuredClone(seed.coupons),
  blackouts: structuredClone(seed.blackouts),
  bookings: structuredClone(seed.bookings),
  invoices: structuredClone(seed.invoices),
  counters: { booking: 1000, invoice: 100 },
})

let db = null
let writable = true
let usingPostgres = false
let flushTimer = null
let flushing = null

/**
 * Pick a backend and load it. Postgres when DATABASE_URL is set — which is what
 * production needs, because a JSON file on a serverless filesystem forgets
 * everything the moment the instance recycles.
 */
export async function init() {
  if (pg.isEnabled()) {
    try {
      db = await pg.init()
      usingPostgres = true
      writable = true
      console.log('[store] postgres')
      return
    } catch (err) {
      // Falling back is better than refusing to boot, but it must be loud:
      // edits made now will not survive.
      console.error('[store] postgres unavailable, falling back to the JSON file:', err.message)
    }
  }
  load()
  console.log(`[store] json file (${writable ? 'writable' : 'read-only'})`)
}

export const backend = () => (usingPostgres ? 'postgres' : 'json')

/**
 * Postgres writes are batched: a single request often mutates several rows, and
 * one flush per request beats one round trip per field.
 */
function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushing = pg.persistAll(db).catch((err) => console.error('[store] flush failed:', err.message))
  }, 20)
}

/** Await every pending write. Tests and shutdown need this; requests do not. */
export async function settled() {
  if (!usingPostgres) return
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
    flushing = pg.persistAll(db)
  }
  await flushing
}

function load() {
  if (db) return db
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      // Fill in collections added after a db.json was first written.
      for (const [key, value] of Object.entries(emptyDb())) {
        if (db[key] === undefined) db[key] = value
      }
      return db
    }
  } catch (err) {
    console.error('[store] could not read db.json, starting from seed:', err.message)
  }
  db = emptyDb()
  persist()
  return db
}

function persist() {
  if (usingPostgres) return scheduleFlush()
  if (!writable) return
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2))
  } catch (err) {
    // Read-only filesystems (Vercel serverless) keep working in memory for the
    // life of the instance. Loud on purpose: writes are being dropped.
    writable = false
    console.error('[store] filesystem is read-only, changes live in memory only:', err.message)
  }
}

export const isWritable = () => writable

/** Read a collection. Returns the live array — mutate, then call `commit()`. */
export function table(name) {
  const data = load()
  if (!(name in data)) throw new Error(`unknown collection: ${name}`)
  return data[name]
}

export function getSettings() {
  return load().settings
}

export function updateSettings(patch) {
  const data = load()
  data.settings = { ...data.settings, ...patch }
  persist()
  return data.settings
}

export function commit() {
  persist()
}

/**
 * Sequential, human-readable references: LC-1001, INV-100.
 *
 * Async because on Postgres the number has to come from the database — two
 * servers incrementing their own copy would hand two guests the same booking
 * number, and the guest quotes that number on the dock.
 */
export async function nextRef(kind) {
  const prefix = kind === 'invoice' ? 'INV' : 'LC'
  if (usingPostgres) return `${prefix}-${await pg.nextRef(kind)}`
  const data = load()
  data.counters[kind] = (data.counters[kind] || 0) + 1
  persist()
  return `${prefix}-${data.counters[kind]}`
}

export function insert(name, row) {
  const rows = table(name)
  rows.push(row)
  commit()
  return row
}

export function findById(name, id) {
  return table(name).find((r) => r.id === id) || null
}

export function updateById(name, id, patch) {
  const row = findById(name, id)
  if (!row) return null
  Object.assign(row, patch, { id: row.id })
  commit()
  return row
}

export function removeById(name, id) {
  const rows = table(name)
  const i = rows.findIndex((r) => r.id === id)
  if (i === -1) return false
  rows.splice(i, 1)
  commit()
  return true
}

export async function shutdown() {
  await settled()
  if (usingPostgres) await pg.close()
}

export function resetToSeed() {
  db = emptyDb()
  writable = true
  persist()
  return db
}
