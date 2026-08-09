import 'dotenv/config'
import express from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as store from './store.js'
import { quote, isVesselFree, occupiedDates, holdsDates, QuoteError } from './pricing.js'
import * as payments from './payments.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = express()

// Stripe signs the raw body, so the webhook route has to see it before any
// JSON parsing happens.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '1mb' }))

const publicDir = path.join(here, '..', 'public')
app.use(express.static(publicDir, { extensions: ['html'] }))

const originOf = (req) =>
  process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`

const ok = (res, body) => res.json({ ok: true, ...body })
const fail = (res, status, error, field) => res.status(status).json({ ok: false, error, field })

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      if (err instanceof QuoteError) return fail(res, err.status, err.message, err.field)
      console.error('[api]', req.method, req.path, err)
      fail(res, 500, 'Something broke on our side. Try again in a moment.')
    }
  }
}

// How long an unpaid booking keeps its dates while the guest is at the card
// form. Long enough to find a wallet, short enough that a Saturday in March
// does not die because someone changed their mind.
const HOLD_MINUTES = 30

function redeemCoupon(code) {
  const coupon = store.table('coupons').find((c) => c.code === code)
  if (!coupon) return
  coupon.redemptions = (coupon.redemptions || 0) + 1
  store.commit()
}

/* ------------------------------------------------------------------ public */

app.get('/api/catalog', (req, res) => {
  const s = store.getSettings()
  ok(res, {
    settings: {
      brand: s.brand,
      productLine: s.productLine,
      currency: s.currency,
      depositPct: s.depositPct,
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      whatsapp: s.whatsapp,
      departurePoint: s.departurePoint,
      cancellationPolicy: s.cancellationPolicy,
      instantBooking: s.instantBooking,
      paymentMode: payments.mode(),
    },
    vessels: store.table('vessels').filter((v) => v.active).sort((a, b) => a.sortOrder - b.sortOrder),
    categories: store.table('categories'),
    extras: store.table('extras').filter((e) => e.active),
    bundles: store.table('bundles').filter((b) => b.active),
  })
})

// Which days a boat cannot sail, for the calendar.
app.get('/api/availability', (req, res) => {
  const { vesselId, from, to } = req.query
  const vessel = store.table('vessels').find((v) => v.id === vesselId)
  if (!vessel) return fail(res, 404, 'Unknown boat.')

  const start = from || new Date().toISOString().slice(0, 10)
  const end = to || new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)

  const taken = new Set()
  for (const b of store.table('blackouts')) {
    if (b.vesselId === vesselId) taken.add(b.date)
  }
  for (const b of store.table('bookings')) {
    if (b.vesselId !== vesselId || !holdsDates(b)) continue
    occupiedDates(b.date, b.nights).forEach((d) => taken.add(d))
  }

  ok(res, {
    vesselId,
    minNights: vessel.minNights,
    unavailable: [...taken].filter((d) => d >= start && d <= end).sort(),
  })
})

app.post('/api/quote', wrap(async (req, res) => {
  ok(res, { quote: quote(req.body || {}) })
}))

app.post('/api/bookings', wrap(async (req, res) => {
  const { customer = {}, payNow = 'deposit', ...cart } = req.body || {}

  if (!customer.name || !String(customer.name).trim()) {
    return fail(res, 400, 'We need a name for the booking.', 'name')
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email || '')) {
    return fail(res, 400, 'Enter an email we can send the confirmation to.', 'email')
  }

  const q = quote(cart)

  if (!isVesselFree(q.vesselId, q.date, q.nights)) {
    return fail(res, 409, 'That boat was just booked for those dates. Pick another date.', 'date')
  }

  const ref = store.nextRef('booking')
  const booking = {
    id: `bk_${crypto.randomUUID()}`,
    ref,
    vesselId: q.vesselId,
    vesselName: q.vesselName,
    date: q.date,
    nights: q.nights,
    guests: q.guests,
    lines: q.lines,
    subtotal: q.subtotal,
    discount: q.discount,
    couponCode: q.couponCode,
    total: q.total,
    deposit: q.deposit,
    balance: q.balance,
    currency: q.currency,
    customer: {
      name: String(customer.name).trim(),
      email: String(customer.email).trim().toLowerCase(),
      phone: (customer.phone || '').trim(),
      notes: (customer.notes || '').trim(),
      occasion: (customer.occasion || '').trim(),
    },
    // Instant booking: the slot is held the moment the guest commits. When a
    // card is involved the hold is provisional until the payment lands, so an
    // abandoned checkout releases the date instead of burning it.
    status: 'confirmed',
    paymentStatus: 'unpaid',
    amountPaid: 0,
    holdExpiresAt:
      payments.mode() === 'stripe'
        ? new Date(Date.now() + HOLD_MINUTES * 60000).toISOString()
        : null,
    payNow,
    createdAt: new Date().toISOString(),
    boardingPass: crypto.randomBytes(6).toString('hex').toUpperCase(),
  }

  // A promo code is spent when money arrives, not when a form is submitted.
  if (q.couponCode && payments.mode() !== 'stripe') redeemCoupon(q.couponCode)

  store.insert('bookings', booking)

  const charge = payNow === 'full' ? q.total : q.deposit
  const label = payNow === 'full' ? 'Full payment' : `${q.depositPct}% deposit`
  const checkout = await payments.createCheckout({
    booking,
    quote: q,
    amount: charge,
    label,
    origin: originOf(req),
  })

  booking.checkoutSessionId = checkout.sessionId || null
  store.commit()

  ok(res, {
    booking: { ref: booking.ref, boardingPass: booking.boardingPass },
    amountDue: charge,
    paymentMode: checkout.mode,
    checkoutUrl: checkout.url,
  })
}))

app.get('/api/bookings/:ref', (req, res) => {
  const b = store.table('bookings').find((x) => x.ref === req.params.ref)
  if (!b) return fail(res, 404, 'We could not find that booking.')
  const s = store.getSettings()
  ok(res, {
    booking: b,
    settings: {
      departurePoint: s.departurePoint,
      cancellationPolicy: s.cancellationPolicy,
      contactEmail: s.contactEmail,
      whatsapp: s.whatsapp,
    },
  })
})

app.get('/api/invoices/:number', (req, res) => {
  const inv = store.table('invoices').find((i) => i.number === req.params.number)
  if (!inv) return fail(res, 404, 'We could not find that invoice.')
  ok(res, { invoice: inv, brand: store.getSettings().brand })
})

app.post('/api/webhooks/stripe', wrap(async (req, res) => {
  let event
  try {
    event = await payments.parseWebhook(req.body, req.headers['stripe-signature'])
  } catch (err) {
    console.error('[webhook] rejected:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const paid = (session.amount_total || 0) / 100

    const bookingRef = session.metadata?.bookingRef
    if (bookingRef) {
      const b = store.table('bookings').find((x) => x.ref === bookingRef)
      if (b) {
        b.amountPaid = Math.round((b.amountPaid + paid) * 100) / 100
        b.paymentStatus = b.amountPaid >= b.total - 0.01 ? 'paid' : 'deposit_paid'
        b.paidAt = new Date().toISOString()
        b.holdExpiresAt = null // paid: the date is theirs for good
        if (b.couponCode && !b.couponRedeemed) {
          redeemCoupon(b.couponCode)
          b.couponRedeemed = true
        }
        store.commit()
      }
    }

    const invoiceId = session.metadata?.invoiceId
    if (invoiceId) {
      const inv = store.findById('invoices', invoiceId)
      if (inv) {
        inv.status = 'paid'
        inv.paidAt = new Date().toISOString()
        store.commit()
      }
    }
  }

  res.json({ received: true })
}))

/* ------------------------------------------------------------------- admin */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lovecloud'
const sessions = new Map() // token -> expiry

function issueToken() {
  const token = crypto.randomBytes(24).toString('hex')
  sessions.set(token, Date.now() + 12 * 3600 * 1000)
  return token
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  const expiry = sessions.get(token)
  if (!expiry || expiry < Date.now()) {
    sessions.delete(token)
    return fail(res, 401, 'Your session expired. Sign in again.')
  }
  next()
}

// One shared password guarding real bookings and real money deserves at least
// a lockout, or it is a weekend of guessing away from being open.
const attempts = new Map() // ip -> { count, until }
const MAX_ATTEMPTS = 6
const LOCKOUT_MS = 15 * 60 * 1000

app.post('/api/admin/login', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip
  const record = attempts.get(ip)

  if (record?.until && record.until > Date.now()) {
    const minutes = Math.ceil((record.until - Date.now()) / 60000)
    return fail(res, 429, `Too many tries. Wait ${minutes} minute${minutes === 1 ? '' : 's'}.`)
  }

  const given = Buffer.from(String(req.body?.password || ''))
  const expected = Buffer.from(ADMIN_PASSWORD)
  const match = given.length === expected.length && crypto.timingSafeEqual(given, expected)

  if (!match) {
    const count = (record?.until > Date.now() ? record.count : (record?.count || 0)) + 1
    attempts.set(ip, { count, until: count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0 })
    return fail(res, 401, 'Wrong password.')
  }

  attempts.delete(ip)
  ok(res, { token: issueToken() })
})

app.use('/api/admin', requireAdmin)

const COLLECTIONS = {
  vessels: 'v',
  extras: 'x',
  bundles: 'b',
  coupons: 'c',
  blackouts: 'bo',
}

app.get('/api/admin/data', (req, res) => {
  ok(res, {
    settings: store.getSettings(),
    vessels: store.table('vessels'),
    extras: store.table('extras'),
    categories: store.table('categories'),
    bundles: store.table('bundles'),
    coupons: store.table('coupons'),
    blackouts: store.table('blackouts'),
    bookings: [...store.table('bookings')].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    invoices: [...store.table('invoices')].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    system: { writable: store.isWritable(), paymentMode: payments.mode() },
  })
})

app.patch('/api/admin/settings', (req, res) => ok(res, { settings: store.updateSettings(req.body || {}) }))

// Bookings and invoices are not plain CRUD, so they claim their paths before
// the generic collection routes below get a chance to swallow them.
app.patch('/api/admin/bookings/:id', (req, res) => {
  const allowed = ['status', 'paymentStatus', 'amountPaid', 'crewNotes']
  const patch = {}
  for (const key of allowed) if (key in (req.body || {})) patch[key] = req.body[key]
  const row = store.updateById('bookings', req.params.id, patch)
  if (!row) return fail(res, 404, 'Booking not found.')
  ok(res, { row })
})

app.post('/api/admin/invoices', wrap(async (req, res) => {
  const { customer = {}, lines = [], dueDate = null, notes = '', bookingRef = null } = req.body || {}
  if (!customer.email) return fail(res, 400, 'An invoice needs a customer email.', 'email')
  if (!lines.length) return fail(res, 400, 'Add at least one line to the invoice.', 'lines')

  const clean = lines
    .map((l) => ({
      label: String(l.label || 'Charter service'),
      detail: String(l.detail || ''),
      qty: Math.max(1, Number(l.qty) || 1),
      unitPrice: Math.max(0, Number(l.unitPrice) || 0),
    }))
    .map((l) => ({ ...l, amount: Math.round(l.qty * l.unitPrice * 100) / 100 }))

  const total = Math.round(clean.reduce((s, l) => s + l.amount, 0) * 100) / 100

  const invoice = {
    id: `inv_${crypto.randomUUID()}`,
    number: store.nextRef('invoice'),
    customer: {
      name: (customer.name || '').trim(),
      email: String(customer.email).trim().toLowerCase(),
      phone: (customer.phone || '').trim(),
    },
    lines: clean,
    total,
    currency: store.getSettings().currency || 'USD',
    notes,
    bookingRef,
    dueDate,
    status: 'sent',
    createdAt: new Date().toISOString(),
  }

  const link = await payments.createInvoiceLink({ invoice, origin: originOf(req) })
  invoice.paymentUrl = link.url
  invoice.paymentMode = link.mode
  store.insert('invoices', invoice)

  ok(res, { invoice, shareUrl: `${originOf(req)}/invoice.html?n=${invoice.number}` })
}))

app.patch('/api/admin/invoices/:id', (req, res) => {
  const row = store.updateById('invoices', req.params.id, { status: req.body?.status })
  if (!row) return fail(res, 404, 'Invoice not found.')
  ok(res, { row })
})

app.post('/api/admin/:collection', (req, res) => {
  const name = req.params.collection
  const prefix = COLLECTIONS[name]
  if (!prefix) return fail(res, 404, 'Unknown collection.')
  const row = { ...req.body, id: `${prefix}_${crypto.randomUUID().slice(0, 8)}` }
  if (row.active === undefined) row.active = true
  ok(res, { row: store.insert(name, row) })
})

app.patch('/api/admin/:collection/:id', (req, res) => {
  const name = req.params.collection
  if (!COLLECTIONS[name]) return fail(res, 404, 'Unknown collection.')
  const row = store.updateById(name, req.params.id, req.body || {})
  if (!row) return fail(res, 404, 'Not found.')
  ok(res, { row })
})

app.delete('/api/admin/:collection/:id', (req, res) => {
  const name = req.params.collection
  if (!COLLECTIONS[name]) return fail(res, 404, 'Unknown collection.')
  if (!store.removeById(name, req.params.id)) return fail(res, 404, 'Not found.')
  ok(res, {})
})

app.get('/api/admin/stats', (req, res) => {
  const bookings = store.table('bookings').filter((b) => b.status !== 'cancelled')
  const revenue = bookings.reduce((s, b) => s + b.total, 0)
  const collected = bookings.reduce((s, b) => s + (b.amountPaid || 0), 0)

  const extraSales = new Map()
  for (const b of bookings) {
    for (const line of b.lines) {
      if (line.kind === 'vessel') continue
      const cur = extraSales.get(line.label) || { label: line.label, count: 0, revenue: 0 }
      cur.count += 1
      cur.revenue += line.amount
      extraSales.set(line.label, cur)
    }
  }

  const byVessel = new Map()
  for (const b of bookings) {
    const cur = byVessel.get(b.vesselName) || { name: b.vesselName, trips: 0, revenue: 0 }
    cur.trips += 1
    cur.revenue += b.total
    byVessel.set(b.vesselName, cur)
  }

  ok(res, {
    stats: {
      bookings: bookings.length,
      revenue: Math.round(revenue * 100) / 100,
      collected: Math.round(collected * 100) / 100,
      outstanding: Math.round((revenue - collected) * 100) / 100,
      averageTicket: bookings.length ? Math.round((revenue / bookings.length) * 100) / 100 : 0,
      topExtras: [...extraSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      byVessel: [...byVessel.values()].sort((a, b) => b.revenue - a.revenue),
      upcoming: bookings
        .filter((b) => b.date >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10),
    },
  })
})

app.get('/api/health', (req, res) =>
  ok(res, { service: 'roatan-yacht-getaways', paymentMode: payments.mode(), writable: store.isWritable() }),
)

const PORT = process.env.PORT || 3000
if (process.env.VERCEL === undefined) {
  app.listen(PORT, () => {
    console.log(`⛵  Roatan Private Yacht Getaways → http://localhost:${PORT}`)
    console.log(`    admin → http://localhost:${PORT}/admin.html  (password: ${ADMIN_PASSWORD})`)
    console.log(`    payments: ${payments.mode()}`)
  })
}

export default app
