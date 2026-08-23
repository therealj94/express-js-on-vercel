// Walk the whole booking through, headless.
//
// The screens can only be judged on a phone, but the logic underneath them —
// pricing, what a demo booking contains, what the trip screen then reads back
// out of it, who is allowed to register — is plain JavaScript and can be run
// here. This catches the class of bug that a compile never will: a field the
// checkout never wrote and the trip screen expects.
//
//   node scripts/check-flow.mjs

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from '@babel/core'
import assert from 'node:assert/strict'

const require_ = createRequire(import.meta.url)

// A memory-backed stand-in for the phone's storage, plus the two native
// modules these files pull in. Everything else is real code.
const storage = new Map()
const STUBS = {
  '@react-native-async-storage/async-storage': {
    __esModule: true,
    default: {
      getItem: async (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: async (k, v) => void storage.set(k, v),
      removeItem: async (k) => void storage.delete(k),
    },
  },
}

const cache = new Map()

/** Load one of the app's modules with the native bits stubbed out. */
function load(path) {
  if (STUBS[path]) return STUBS[path]
  const file = require_.resolve(path.startsWith('.') ? path : `../src/${path}`, {
    paths: [new URL('.', import.meta.url).pathname],
  })
  if (cache.has(file)) return cache.get(file)
  const src = readFileSync(file, 'utf8')
  const { code } = transformSync(src, {
    filename: file,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
    babelrc: false,
    configFile: false,
  })
  const module = { exports: {} }
  cache.set(file, module.exports)
  const fn = new Function('require', 'module', 'exports', '__filename', code)
  fn((p) => (STUBS[p] ? STUBS[p] : load(p.startsWith('.') ? new URL(p, `file://${file}`).pathname : p)), module, module.exports, file)
  cache.set(file, module.exports)
  return module.exports
}

const ok = []
const check = (name, fn) => {
  try {
    fn()
    ok.push(name)
  } catch (err) {
    console.error(`✗ ${name}\n  ${err.message}`)
    process.exitCode = 1
  }
}

const catalog = JSON.parse(readFileSync(new URL('../src/catalog-snapshot.json', import.meta.url)))
const { quoteLocally } = load('../src/pricing.js')
const demo = load('../src/demo.js')
const account = load('../src/account.js')

// ---------------------------------------------------------------- pricing --

const yacht = catalog.vessels.find((v) => v.priceUnit !== 'per_night') || catalog.vessels[0]
const perPerson = catalog.extras.find((e) => e.unit === 'per_person')
const bundle = catalog.bundles[0]

const cart = {
  vesselId: yacht.id,
  date: '2099-03-14',
  nights: 0,
  guests: 6,
  items: [{ extraId: perPerson.id, qty: 1 }],
  bundleIds: [bundle.id],
  couponCode: '',
  occasion: 'birthday',
  tipPct: 15,
}

const quote = quoteLocally(catalog, cart)

check('a quote carries every field the checkout and the demo booking read', () => {
  for (const k of ['vesselId', 'vesselName', 'date', 'nights', 'guests', 'lines', 'total', 'deposit', 'currency', 'tip']) {
    assert.ok(quote[k] !== undefined, `quote.${k} is missing`)
  }
  assert.equal(quote.estimate, true)
})

check('every line the trip screen prints has a label and an amount', () => {
  assert.ok(quote.lines.length >= 3, 'boat + bundle + extra expected')
  for (const l of quote.lines) {
    assert.equal(typeof l.label, 'string')
    assert.ok(l.label.length > 0)
    assert.equal(typeof l.amount, 'number')
    assert.ok(Number.isFinite(l.amount))
  }
})

check('a per-guest extra is charged per guest, which is why the shelf says pp', () => {
  const line = quote.lines.find((l) => l.label === perPerson.name)
  assert.ok(line, 'the per-person extra is missing from the manifest')
  assert.equal(line.amount, perPerson.price * cart.guests)
})

check('the tip is a percentage of the discounted subtotal, not of the tip-inclusive total', () => {
  assert.equal(quote.tip, Math.round((quote.subtotal - quote.discount) * 0.15 * 100) / 100)
  assert.equal(quote.total, Math.round((quote.subtotal - quote.discount + quote.tip) * 100) / 100)
})

check('the deposit never exceeds the total and leaves a sane balance', () => {
  assert.ok(quote.deposit > 0 && quote.deposit <= quote.total)
  assert.equal(quote.balance, Math.round((quote.total - quote.deposit) * 100) / 100)
})

// ------------------------------------------------------------- the demo ----

const settings = catalog.settings
let deposited
let paidFull

await (async () => {
  deposited = await demo.createDemoBooking({
    quote,
    customer: { name: 'José Enamorado', email: 'jose@example.com', phone: '+50412345678' },
    method: 'gpay',
    payNow: 'deposit',
    settings,
  })
  paidFull = await demo.createDemoBooking({
    quote, customer: { name: 'Ana', email: 'ana@example.com' }, method: 'card', payNow: 'full', settings,
  })
})()

check('a demo booking is stamped as a demo and never claims to be paid in full', () => {
  assert.equal(deposited.demo, true)
  assert.equal(deposited.paymentStatus, 'deposit_paid')
  assert.equal(deposited.amountPaid, quote.deposit)
  assert.ok(deposited.amountPaid < deposited.total)
})

check('paying in full leaves nothing owing', () => {
  assert.equal(paidFull.paymentStatus, 'paid')
  assert.equal(paidFull.amountPaid, paidFull.total)
})

check('booking references are sequential and unique', () => {
  assert.equal(deposited.ref, 'LC-1001')
  assert.equal(paidFull.ref, 'LC-1002')
})

check('the trip screen can render a demo booking without reaching for the server', () => {
  // Exactly the fields BookingScreen reads.
  for (const k of ['ref', 'boardingPass', 'vesselName', 'date', 'guests', 'lines', 'total', 'amountPaid', 'currency', 'paymentStatus', 'paymentMethod', 'customer', 'departurePoint']) {
    assert.ok(deposited[k] !== undefined && deposited[k] !== null, `booking.${k} is missing`)
  }
  assert.match(deposited.departurePoint, /Pristine Bay/)
  assert.ok(deposited.customer.name, 'the captain greets people by name')
})

await (async () => {
  const found = await demo.getDemoBooking('lc-1001')
  check('a booking is found however it is typed', () => {
    assert.ok(found)
    assert.equal(found.ref, 'LC-1001')
  })
  const withRide = await demo.setDemoTransport('LC-1001', 'hotel')
  check('the transport answer survives a look-up', () => {
    assert.equal(withRide.transport, 'hotel')
  })
  const reread = await demo.getDemoBooking('LC-1001')
  check('and it is still there on the next read', () => {
    assert.equal(reread.transport, 'hotel')
  })
  const missing = await demo.getDemoBooking('LC-9999')
  check('an unknown reference returns nothing rather than throwing', () => {
    assert.equal(missing, null)
  })
})()

// -------------------------------------------------------------- accounts ---

await (async () => {
  await assert.rejects(() => account.register({ name: '', email: 'a@b.co' }))
  await assert.rejects(() => account.register({ name: 'A', email: 'not-an-email' }))
  const made = await account.register({ name: '  José  ', email: '  JOSE@Example.COM ', phone: '123' })
  check('registering trims and lowercases what the crew will read', () => {
    assert.equal(made.name, 'José')
    assert.equal(made.email, 'jose@example.com')
    assert.equal(made.guest, false)
  })
  const back = await account.signIn({ email: 'jose@example.com' })
  check('signing back in on the same phone keeps the name', () => {
    assert.equal(back.name, 'José')
  })
  const guest = await account.continueAsGuest()
  check('a guest is marked a guest', () => {
    assert.equal(guest.guest, true)
  })
})()

console.log(ok.map((n) => `✓ ${n}`).join('\n'))
console.log(
  process.exitCode
    ? '\nSomething in the booking logic is wrong.'
    : `\nAll ${ok.length} checks pass — the booking survives from cart to boarding pass.`,
)
