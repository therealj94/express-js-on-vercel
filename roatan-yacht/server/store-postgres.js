// The Postgres side of the storage seam.
//
// Chosen when DATABASE_URL is set. Same functions as the JSON store, same
// plain objects in and out, so no route knows which one is running.
//
// The shape is deliberately boring: one table, one row per record, the record
// itself in JSONB. The catalog changes shape often while a business finds its
// feet, and a migration for every new field on an extra is a bad trade. What
// matters here is that writes survive a restart and two servers see the same
// data — which is exactly what the JSON file cannot do on Vercel.

import pg from 'pg'
import * as seed from './seed-data.js'

const COLLECTIONS = [
  'vessels', 'extras', 'categories', 'gallery', 'bundles',
  'coupons', 'blackouts', 'bookings', 'invoices',
]

let pool = null
let cache = null // in-process mirror, so reads stay synchronous like the file store

export const isEnabled = () => Boolean(process.env.DATABASE_URL)

function connect() {
  if (pool) return pool
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Hosted Postgres (Neon, Supabase, RDS) terminates TLS with its own chain.
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
    max: 4,
  })
  return pool
}

export async function init() {
  const db = connect()
  await db.query(`
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS singletons (
      key  TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS counters (
      kind  TEXT PRIMARY KEY,
      value BIGINT NOT NULL
    )`)

  const { rows } = await db.query('SELECT count(*)::int AS n FROM singletons WHERE key = $1', ['settings'])
  if (!rows[0].n) await seedDatabase()

  await refresh()
  return cache
}

/** First boot only: put the catalog in so the app has something to show. */
async function seedDatabase() {
  const db = connect()
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO singletons (key, data) VALUES ($1, $2)', ['settings', JSON.stringify(seed.settings)])
    for (const name of COLLECTIONS) {
      const rows = seed[name] || []
      for (const [i, row] of rows.entries()) {
        // categories and gallery are ordered lists without ids of their own
        const id = row.id || `${name}_${i}`
        await client.query(
          'INSERT INTO records (collection, id, data) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [name, id, JSON.stringify(row)],
        )
      }
    }
    await client.query('INSERT INTO counters (kind, value) VALUES ($1, $2), ($3, $4)', ['booking', 1000, 'invoice', 100])
    await client.query('COMMIT')
    console.log('[store:pg] seeded a fresh database')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Pull everything into memory. Small catalog, tiny cost, synchronous reads. */
export async function refresh() {
  const db = connect()
  const [records, settings, counters] = await Promise.all([
    db.query('SELECT collection, id, data FROM records ORDER BY collection, id'),
    db.query('SELECT data FROM singletons WHERE key = $1', ['settings']),
    db.query('SELECT kind, value FROM counters'),
  ])

  const next = { settings: settings.rows[0]?.data || structuredClone(seed.settings), counters: {} }
  for (const name of COLLECTIONS) next[name] = []
  for (const r of records.rows) (next[r.collection] ||= []).push(r.data)
  for (const c of counters.rows) next.counters[c.kind] = Number(c.value)

  // Seed order is meaningful for these two; ids carry it.
  for (const name of ['categories', 'gallery']) {
    next[name].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
  }

  cache = next
  return cache
}

export const snapshot = () => cache

export async function upsert(collection, row) {
  await connect().query(
    `INSERT INTO records (collection, id, data) VALUES ($1, $2, $3)
     ON CONFLICT (collection, id) DO UPDATE SET data = $3, updated_at = now()`,
    [collection, row.id, JSON.stringify(row)],
  )
}

export async function remove(collection, id) {
  await connect().query('DELETE FROM records WHERE collection = $1 AND id = $2', [collection, id])
}

export async function putSettings(settings) {
  await connect().query(
    `INSERT INTO singletons (key, data) VALUES ('settings', $1)
     ON CONFLICT (key) DO UPDATE SET data = $1`,
    [JSON.stringify(settings)],
  )
}

/**
 * Reference numbers come from the database, not from a counter in memory —
 * otherwise two servers hand two guests the same booking number.
 */
export async function nextRef(kind) {
  const { rows } = await connect().query(
    `INSERT INTO counters (kind, value) VALUES ($1, 1)
     ON CONFLICT (kind) DO UPDATE SET value = counters.value + 1
     RETURNING value`,
    [kind],
  )
  if (cache) cache.counters[kind] = Number(rows[0].value)
  return Number(rows[0].value)
}

/** Write the whole in-memory picture back. Used after a batch of mutations. */
export async function persistAll(data) {
  const db = connect()
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO singletons (key, data) VALUES ('settings', $1)
       ON CONFLICT (key) DO UPDATE SET data = $1`,
      [JSON.stringify(data.settings)],
    )
    for (const name of COLLECTIONS) {
      const rows = data[name] || []
      const ids = rows.map((r, i) => r.id || `${name}_${i}`)
      await client.query(
        ids.length
          ? `DELETE FROM records WHERE collection = $1 AND id <> ALL($2::text[])`
          : `DELETE FROM records WHERE collection = $1`,
        ids.length ? [name, ids] : [name],
      )
      for (const [i, row] of rows.entries()) {
        const id = row.id || `${name}_${i}`
        await client.query(
          `INSERT INTO records (collection, id, data) VALUES ($1, $2, $3)
           ON CONFLICT (collection, id) DO UPDATE SET data = $3, updated_at = now()`,
          [name, id, JSON.stringify(row)],
        )
      }
    }
    for (const [kind, value] of Object.entries(data.counters || {})) {
      await client.query(
        `INSERT INTO counters (kind, value) VALUES ($1, $2)
         ON CONFLICT (kind) DO UPDATE SET value = GREATEST(counters.value, $2)`,
        [kind, value],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function close() {
  if (pool) await pool.end()
  pool = null
}
