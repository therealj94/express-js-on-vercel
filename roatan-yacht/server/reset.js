// Throw away everything and start from the seed catalog again.
//
//   npm run reset
//
// Wipes bookings, invoices, promos and any catalog edits. There is no undo, so
// it asks unless you pass --force.

import 'dotenv/config'
import * as store from './store.js'
import * as pg from './store-postgres.js'

const force = process.argv.includes('--force')

if (!force) {
  console.log('This deletes every booking, invoice and catalog edit.')
  console.log(`Target: ${pg.isEnabled() ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@') : 'the local JSON file'}`)
  console.log('Run it again with --force if that is what you want.')
  process.exit(1)
}

await store.init()
const fresh = store.resetToSeed()
if (pg.isEnabled()) await pg.persistAll(fresh)
await store.shutdown()
console.log('Reset to the seed catalog.')
