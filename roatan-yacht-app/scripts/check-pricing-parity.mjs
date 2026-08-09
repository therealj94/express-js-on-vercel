// Two copies of a pricing formula is a real risk, so prove they agree.
// Runs the app's offline mirror and the live server over the same carts and
// fails loudly on any difference.
import { quoteLocally } from '../src/pricing.js'
import { readFileSync } from 'node:fs'

const catalog = JSON.parse(readFileSync(new URL('../src/catalog-snapshot.json', import.meta.url)))
const API = process.env.API || 'http://localhost:3150'

const CARTS = [
  { name: 'boat only', cart: { vesselId: 'v_yacht_day', date: '2027-06-01', guests: 4, items: [], bundleIds: [] } },
  { name: 'per-person extra', cart: { vesselId: 'v_yacht_day', date: '2027-06-02', guests: 6, items: [{ extraId: 'x_lobster' }], bundleIds: [] } },
  { name: 'flat extra with qty', cart: { vesselId: 'v_yacht_day', date: '2027-06-03', guests: 2, items: [{ extraId: 'x_fruit', qty: 3 }], bundleIds: [] } },
  { name: 'bundle', cart: { vesselId: 'v_yacht_day', date: '2027-06-04', guests: 6, items: [], bundleIds: ['b_proposal'] } },
  { name: 'bundle + overlapping extra', cart: { vesselId: 'v_yacht_day', date: '2027-06-05', guests: 6, items: [{ extraId: 'x_champagne' }, { extraId: 'x_tender' }], bundleIds: ['b_proposal'] } },
  { name: 'speedboat, many guests', cart: { vesselId: 'v_speedboat_day', date: '2027-06-06', guests: 10, items: [{ extraId: 'x_scuba' }], bundleIds: ['b_family'] } },
  { name: 'multi-night package', cart: { vesselId: 'v_gold', date: '2027-06-10', nights: 6, guests: 4, items: [{ extraId: 'x_turndown' }], bundleIds: [] } },
  { name: 'copper minimum nights', cart: { vesselId: 'v_copper', date: '2027-07-01', nights: 4, guests: 2, items: [], bundleIds: ['b_anniversary'] } },
]

let failures = 0
for (const { name, cart } of CARTS) {
  const res = await fetch(`${API}/api/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cart),
  })
  const body = await res.json()
  if (!body.ok) { console.log(`✗ ${name}: server said ${body.error}`); failures++; continue }

  const server = body.quote
  const local = quoteLocally(catalog, cart)
  if (!local) { console.log(`✗ ${name}: the offline mirror produced nothing`); failures++; continue }

  const diffs = []
  if (local.total !== server.total) diffs.push(`total ${local.total} vs ${server.total}`)
  if (local.subtotal !== server.subtotal) diffs.push(`subtotal ${local.subtotal} vs ${server.subtotal}`)
  if (local.deposit !== server.deposit) diffs.push(`deposit ${local.deposit} vs ${server.deposit}`)
  if (local.lines.length !== server.lines.length) {
    diffs.push(`${local.lines.length} lines vs ${server.lines.length}`)
  } else {
    server.lines.forEach((sl, i) => {
      const ll = local.lines[i]
      if (ll.label !== sl.label || ll.amount !== sl.amount) {
        diffs.push(`line ${i}: "${ll.label}" ${ll.amount} vs "${sl.label}" ${sl.amount}`)
      }
    })
  }

  if (diffs.length) { console.log(`✗ ${name}\n    ${diffs.join('\n    ')}`); failures++ }
  else console.log(`✓ ${name} — $${server.total}`)
}

console.log(failures ? `\n${failures} MISMATCH(ES)` : '\nOffline pricing matches the server exactly.')
process.exit(failures ? 1 : 0)
