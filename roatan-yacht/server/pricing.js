// The one place a total is ever calculated.
//
// The browser draws a running total so the builder feels alive, but nothing it
// sends is trusted: every quote and every booking is re-priced here from the
// catalog before a cent is charged.

import * as store from './store.js'

const round = (n) => Math.round(n * 100) / 100

export class QuoteError extends Error {
  constructor(message, field) {
    super(message)
    this.field = field
    this.status = 400
  }
}

function parseDate(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new QuoteError('Pick a date for your trip.', field)
  }
  const d = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) throw new QuoteError('That date is not valid.', field)
  return d
}

/** Every date the trip occupies, so multi-night bookings block the whole span. */
export function occupiedDates(startDate, nights) {
  const out = []
  const start = new Date(`${startDate}T12:00:00Z`)
  const span = Math.max(1, nights || 1)
  for (let i = 0; i < span; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/**
 * Does this booking still own its dates?
 *
 * A booking created but never paid holds its dates for a short window only.
 * Without this, one guest abandoning the card form kills that date forever —
 * which is exactly how a boat ends up sitting empty on a Saturday in March.
 */
export function holdsDates(booking) {
  if (booking.status === 'cancelled') return false
  if (booking.paymentStatus !== 'unpaid') return true
  if (!booking.holdExpiresAt) return true // taken by hand, or quote mode: ours to manage
  return new Date(booking.holdExpiresAt) > new Date()
}

export function isVesselFree(vesselId, startDate, nights, { ignoreBookingId } = {}) {
  const wanted = new Set(occupiedDates(startDate, nights))

  const blocked = store
    .table('blackouts')
    .some((b) => b.vesselId === vesselId && wanted.has(b.date))
  if (blocked) return false

  return !store.table('bookings').some((b) => {
    if (b.vesselId !== vesselId) return false
    if (b.id === ignoreBookingId) return false
    if (!holdsDates(b)) return false
    return occupiedDates(b.date, b.nights).some((d) => wanted.has(d))
  })
}

function applyCoupon(code, subtotal) {
  if (!code) return { discount: 0, coupon: null }
  const coupon = store
    .table('coupons')
    .find((c) => c.active && c.code.toUpperCase() === String(code).trim().toUpperCase())

  if (!coupon) throw new QuoteError('That promo code is not valid.', 'couponCode')
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    throw new QuoteError('That promo code has expired.', 'couponCode')
  }
  if (coupon.maxRedemptions && coupon.redemptions >= coupon.maxRedemptions) {
    throw new QuoteError('That promo code has been fully redeemed.', 'couponCode')
  }
  if (coupon.minTotal && subtotal < coupon.minTotal) {
    throw new QuoteError(
      `That code applies to trips over $${coupon.minTotal.toLocaleString('en-US')}.`,
      'couponCode',
    )
  }

  const discount =
    coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : Math.min(coupon.value, subtotal)
  return { discount: round(discount), coupon }
}

/**
 * Price a cart.
 * @param {{vesselId:string,date:string,nights?:number,guests:number,
 *          items?:Array<{extraId:string,qty?:number}>,bundleIds?:string[],
 *          couponCode?:string,tipPct?:number}} cart
 */
export function quote(cart) {
  const settings = store.getSettings()
  const vessel = store.table('vessels').find((v) => v.id === cart.vesselId && v.active)
  if (!vessel) throw new QuoteError('Pick a boat to get started.', 'vesselId')

  parseDate(cart.date, 'date')

  const guests = Number(cart.guests) || 0
  if (guests < vessel.capacityMin || guests > vessel.capacityMax) {
    throw new QuoteError(
      `This boat takes ${vessel.capacityMin} to ${vessel.capacityMax} guests.`,
      'guests',
    )
  }

  const nights = vessel.priceUnit === 'per_night' ? Math.max(vessel.minNights, Number(cart.nights) || vessel.minNights) : 0
  const baseTotal = vessel.priceUnit === 'per_night' ? vessel.basePrice * nights : vessel.basePrice

  const lines = [
    {
      kind: 'vessel',
      id: vessel.id,
      label: vessel.name,
      detail:
        vessel.priceUnit === 'per_night'
          ? `${nights} nights × $${vessel.basePrice.toLocaleString('en-US')}`
          : vessel.durationLabel,
      qty: 1,
      unitPrice: vessel.priceUnit === 'per_night' ? vessel.basePrice : vessel.basePrice,
      amount: round(baseTotal),
    },
  ]

  // Bundles first: an extra bought inside a bundle is not charged again below.
  const bundledExtraIds = new Set()
  for (const bundleId of cart.bundleIds || []) {
    const bundle = store.table('bundles').find((b) => b.id === bundleId && b.active)
    if (!bundle) continue
    const members = bundle.extraIds
      .map((id) => store.table('extras').find((e) => e.id === id && e.active))
      .filter(Boolean)
    if (!members.length) continue

    const gross = members.reduce(
      (sum, e) => sum + e.price * (e.unit === 'per_person' ? guests : 1),
      0,
    )
    const amount = round(gross * (1 - (bundle.discountPct || 0) / 100))
    members.forEach((e) => bundledExtraIds.add(e.id))
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
    const e = store.table('extras').find((x) => x.id === item.extraId && x.active)
    if (!e) continue
    if (bundledExtraIds.has(e.id)) continue

    const qty =
      e.unit === 'per_person' ? guests : Math.min(Math.max(1, Number(item.qty) || 1), e.maxQty || 5)
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

  const subtotal = round(lines.reduce((sum, l) => sum + l.amount, 0))
  const { discount, coupon } = applyCoupon(cart.couponCode, subtotal)

  // Crew gratuity, chosen by the guest, applied to the discounted trip. Capped
  // so a fat-fingered request can never triple a bill.
  const tipPct = Math.min(Math.max(0, Number(cart.tipPct) || 0), 30)
  const tip = round(((subtotal - discount) * tipPct) / 100)

  const total = round(subtotal - discount + tip)
  const depositPct = settings.depositPct || 30
  const deposit = round((total * depositPct) / 100)

  return {
    vesselId: vessel.id,
    vesselName: vessel.name,
    date: cart.date,
    nights,
    guests,
    lines,
    subtotal,
    discount,
    couponCode: coupon ? coupon.code : null,
    tipPct,
    tip,
    total,
    depositPct,
    deposit,
    balance: round(total - deposit),
    currency: settings.currency || 'USD',
    savings: round(lines.reduce((sum, l) => sum + (l.saved || 0), 0) + discount),
  }
}
