// The same arithmetic the server does, kept here for one purpose only: so the
// app can still show a running total with no signal.
//
// The rule has not changed — when the phone can reach the server, the server's
// number is the one that counts and this file is not consulted. Offline the
// screen says "estimate", and the crew confirms the total when the request
// lands. Two copies of a formula is a real risk, so this one mirrors
// server/pricing.js line for line; change one, change the other.

const round = (n) => Math.round(n * 100) / 100

export function quoteLocally(catalog, cart) {
  const vessel = catalog.vessels.find((v) => v.id === cart.vesselId)
  if (!vessel || !cart.date) return null

  const guests = Number(cart.guests) || 0
  if (guests < vessel.capacityMin || guests > vessel.capacityMax) return null

  const nights =
    vessel.priceUnit === 'per_night'
      ? Math.max(vessel.minNights, Number(cart.nights) || vessel.minNights)
      : 0
  const baseTotal = vessel.priceUnit === 'per_night' ? vessel.basePrice * nights : vessel.basePrice

  const lines = [{
    kind: 'vessel',
    id: vessel.id,
    label: vessel.name,
    detail:
      vessel.priceUnit === 'per_night'
        ? `${nights} nights × $${vessel.basePrice.toLocaleString('en-US')}`
        : vessel.durationLabel,
    qty: 1,
    unitPrice: vessel.basePrice,
    amount: round(baseTotal),
  }]

  // Bundles first: an extra bought inside a bundle is not charged again below.
  const bundled = new Set()
  for (const bundleId of cart.bundleIds || []) {
    const bundle = catalog.bundles.find((b) => b.id === bundleId)
    if (!bundle) continue
    const members = bundle.extraIds
      .map((id) => catalog.extras.find((e) => e.id === id))
      .filter(Boolean)
    if (!members.length) continue

    const gross = members.reduce((s, e) => s + e.price * (e.unit === 'per_person' ? guests : 1), 0)
    const amount = round(gross * (1 - (bundle.discountPct || 0) / 100))
    members.forEach((e) => bundled.add(e.id))
    lines.push({
      kind: 'bundle',
      id: bundle.id,
      label: bundle.name,
      detail: `${members.map((e) => e.name).join(' · ')} — ${bundle.discountPct}% off`,
      qty: 1,
      unitPrice: amount,
      amount,
      saved: round(gross - amount),
    })
  }

  for (const item of cart.items || []) {
    const e = catalog.extras.find((x) => x.id === item.extraId)
    if (!e || bundled.has(e.id)) continue
    const qty =
      e.unit === 'per_person' ? guests : Math.min(Math.max(1, item.qty || 1), e.maxQty || 5)
    lines.push({
      kind: 'extra',
      id: e.id,
      label: e.name,
      detail: e.unit === 'per_person' ? `${qty} guests × $${e.price}` : qty > 1 ? `× ${qty}` : '',
      qty,
      unitPrice: e.price,
      amount: round(e.price * qty),
    })
  }

  const subtotal = round(lines.reduce((s, l) => s + l.amount, 0))

  // Mirrors the server: gratuity on the (undiscounted, offline) trip, capped.
  const tipPct = Math.min(Math.max(0, Number(cart.tipPct) || 0), 30)
  const tip = round((subtotal * tipPct) / 100)

  const total = round(subtotal + tip)
  const depositPct = catalog.settings.depositPct || 30
  const deposit = round((total * depositPct) / 100)

  return {
    estimate: true, // the screen must say so; only the server quotes for real
    vesselId: vessel.id,
    vesselName: vessel.name,
    date: cart.date,
    nights,
    guests,
    lines,
    subtotal,
    // Promo codes are the server's business: it holds the redemption count and
    // the expiry, and guessing here would promise a discount we cannot honour.
    discount: 0,
    couponCode: null,
    tipPct,
    tip,
    total,
    depositPct,
    deposit,
    balance: round(total - deposit),
    currency: catalog.settings.currency || 'USD',
    savings: round(lines.reduce((s, l) => s + (l.saved || 0), 0)),
  }
}

/** The request, written out for WhatsApp when there is no server to post to. */
export function requestMessage(quote, customer, settings) {
  const fmt = (d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
  const extras = quote.lines.filter((l) => l.kind !== 'vessel')

  return [
    'CHARTER REQUEST',
    '',
    quote.vesselName,
    `${fmt(quote.date)}${quote.nights ? ` · ${quote.nights} nights aboard` : ''}`,
    `${quote.guests} guests`,
    '',
    extras.length ? 'Aboard with us:' : 'Just the boat.',
    ...extras.map((l) => `· ${l.label}${l.detail ? ` (${l.detail})` : ''}`),
    '',
    quote.tip ? `Crew tip (${quote.tipPct}%): ${quote.currency} ${quote.tip.toLocaleString('en-US')}` : null,
    `Estimated total: ${quote.currency} ${quote.total.toLocaleString('en-US')}`,
    '',
    customer.name ? `Name: ${customer.name}` : null,
    customer.email ? `Email: ${customer.email}` : null,
    customer.occasion ? `Occasion: ${customer.occasion}` : null,
    customer.notes ? `Notes: ${customer.notes}` : null,
    '',
    `Sent from the ${settings.brand} app.`,
  ].filter((l) => l !== null).join('\n')
}
