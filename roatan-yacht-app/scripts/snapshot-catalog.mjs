// Freeze the catalog into the app bundle.
//
// The phone should be able to show the fleet, the extras and the prices with
// no signal at all — Roatán is not a place with reliable data, and a booking
// app that shows an error screen when the tower is busy is not an app.
// The server stays the source of truth whenever it can be reached.
import { writeFileSync } from 'node:fs'
import * as seed from '../../roatan-yacht/server/seed-data.js'

const snapshot = {
  capturedAt: new Date().toISOString().slice(0, 10),
  settings: {
    brand: seed.settings.brand,
    productLine: seed.settings.productLine,
    currency: seed.settings.currency,
    depositPct: seed.settings.depositPct,
    contactEmail: seed.settings.contactEmail,
    contactPhone: seed.settings.contactPhone,
    whatsapp: seed.settings.whatsapp,
    departurePoint: seed.settings.departurePoint,
    departureNote: seed.settings.departureNote,
    cancellationPolicy: seed.settings.cancellationPolicy,
  },
  vessels: seed.vessels.filter((v) => v.active).sort((a, b) => a.sortOrder - b.sortOrder),
  categories: seed.categories,
  gallery: seed.gallery,
  extras: seed.extras.filter((e) => e.active),
  bundles: seed.bundles.filter((b) => b.active),
}

writeFileSync('src/catalog-snapshot.json', JSON.stringify(snapshot, null, 2) + '\n')
console.log(
  `snapshot: ${snapshot.vessels.length} vessels, ${snapshot.extras.length} extras, ${snapshot.bundles.length} packages`,
)
