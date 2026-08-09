// Payment provider seam.
//
// Stripe is the implementation, chosen because the business bills through a US
// entity. Everything the app needs from a processor is behind these three
// functions, so adding PayPal later means writing a second adapter, not
// touching the booking flow.
//
// With no STRIPE_SECRET_KEY set the app runs in "quote mode": bookings are
// still taken and confirmed, but the guest is told an invoice is on the way
// instead of being sent to a card form. That is what makes the whole thing
// demoable before the Stripe account exists.

let stripeClient = null
let stripeLoadError = null

async function client() {
  if (stripeClient || stripeLoadError) return stripeClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  try {
    const { default: Stripe } = await import('stripe')
    stripeClient = new Stripe(key)
  } catch (err) {
    stripeLoadError = err
    console.error('[payments] stripe sdk unavailable:', err.message)
  }
  return stripeClient
}

export async function isLive() {
  return Boolean(await client())
}

export function mode() {
  return process.env.STRIPE_SECRET_KEY ? 'stripe' : 'quote'
}

const cents = (n) => Math.round(n * 100)

/**
 * Hosted checkout for a booking. `amount` is what we charge now — the deposit
 * or the full total, depending on what the guest chose.
 */
export async function createCheckout({ booking, quote, amount, label, origin }) {
  const stripe = await client()
  if (!stripe) return { mode: 'quote', url: null }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: booking.customer.email,
    client_reference_id: booking.ref,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (quote.currency || 'USD').toLowerCase(),
          unit_amount: cents(amount),
          product_data: {
            name: `${quote.vesselName} — ${quote.date}`,
            description: label,
          },
        },
      },
    ],
    metadata: {
      bookingRef: booking.ref,
      bookingId: booking.id,
      vesselId: quote.vesselId,
      tripDate: quote.date,
      guests: String(quote.guests),
      paying: label,
    },
    success_url: `${origin}/confirmation.html?ref=${booking.ref}&paid=1`,
    cancel_url: `${origin}/?ref=${booking.ref}&cancelled=1`,
  })

  return { mode: 'stripe', url: session.url, sessionId: session.id }
}

/** Payment link for an admin-issued invoice. */
export async function createInvoiceLink({ invoice, origin }) {
  const stripe = await client()
  if (!stripe) return { mode: 'quote', url: null }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: invoice.customer.email,
    client_reference_id: invoice.number,
    line_items: invoice.lines.map((l) => ({
      quantity: l.qty || 1,
      price_data: {
        currency: (invoice.currency || 'USD').toLowerCase(),
        unit_amount: cents(l.unitPrice),
        product_data: { name: l.label, description: l.detail || undefined },
      },
    })),
    metadata: { invoiceNumber: invoice.number, invoiceId: invoice.id },
    success_url: `${origin}/invoice.html?n=${invoice.number}&paid=1`,
    cancel_url: `${origin}/invoice.html?n=${invoice.number}`,
  })

  return { mode: 'stripe', url: session.url, sessionId: session.id }
}

/**
 * Verify and parse a webhook. Without a signing secret we refuse rather than
 * trusting the body — an unverified webhook is a way to mark bookings paid for
 * free.
 */
export async function parseWebhook(rawBody, signature) {
  const stripe = await client()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) throw new Error('webhooks not configured')
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}
