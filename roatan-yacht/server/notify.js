// Telling people things.
//
// Same shape as the payments seam: one adapter, swapped by configuration.
// Resend sends the email when RESEND_API_KEY exists; without it every message
// is written to the log instead, so the whole flow stays testable and nothing
// silently fails in the dark.
//
// WhatsApp is where guests in Roatán actually reply, so every notification also
// produces a wa.me link the crew can open with the message pre-written. That is
// deliberately manual: the WhatsApp Business API needs approved templates and a
// verified number, and a link that works today beats an integration that needs
// a week of Meta paperwork.

const money = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0)

const longDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })

export const emailMode = () => (process.env.RESEND_API_KEY ? 'resend' : 'log')

/** A wa.me link with the message already written, for the crew to send. */
export function whatsappLink(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

function bookingEmail(booking, settings, origin) {
  const extras = booking.lines.filter((l) => l.kind !== 'vessel')
  const owed = Math.round((booking.total - (booking.amountPaid || 0)) * 100) / 100

  const text = [
    `${booking.customer.name.split(' ')[0]}, you are on the water.`,
    '',
    `Booking ${booking.ref}`,
    `${booking.vesselName}`,
    `${longDate(booking.date)}${booking.nights ? ` · ${booking.nights} nights aboard` : ''}`,
    `${booking.guests} guests`,
    '',
    extras.length ? 'Aboard with you:' : 'Just the boat — a fine day too.',
    ...extras.map((l) => `  · ${l.label}${l.detail ? ` (${l.detail})` : ''} — ${money(l.amount, booking.currency)}`),
    '',
    `Total ${money(booking.total, booking.currency)}`,
    `Paid ${money(booking.amountPaid, booking.currency)}`,
    owed > 0.01 ? `Balance ${money(owed, booking.currency)}, charged 48 hours before departure.` : 'Paid in full.',
    '',
    `Where: ${settings.departurePoint}`,
    `Boarding pass: ${booking.boardingPass}`,
    `Your booking: ${origin}/confirmation.html?ref=${booking.ref}`,
    '',
    'Bring a swimsuit, a towel you like and reef-safe sunscreen. Everything else is aboard.',
    '',
    settings.cancellationPolicy,
    '',
    `— ${settings.brand}`,
  ].join('\n')

  return {
    to: booking.customer.email,
    subject: `Booking ${booking.ref} confirmed — ${booking.vesselName}, ${longDate(booking.date)}`,
    text,
  }
}

async function deliver(message, kind) {
  const from = process.env.MAIL_FROM || 'reservations@lovecloudroatan.com'
  const key = process.env.RESEND_API_KEY

  if (!key) {
    console.log(`\n[notify:${kind}] email not configured, would have sent →`)
    console.log(`  to: ${message.to}`)
    console.log(`  subject: ${message.subject}`)
    console.log(message.text.split('\n').map((l) => `  | ${l}`).join('\n'))
    return { sent: false, mode: 'log' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text }),
    })
    if (!res.ok) throw new Error(`Resend replied ${res.status}: ${await res.text()}`)
    return { sent: true, mode: 'resend' }
  } catch (err) {
    // A booking must never fail because an email did. Log it and move on; the
    // admin still shows the booking and the crew can call.
    console.error(`[notify:${kind}] send failed:`, err.message)
    return { sent: false, mode: 'resend', error: err.message }
  }
}

/** Guest confirmation, plus the crew's WhatsApp link and internal heads-up. */
export async function bookingConfirmed(booking, settings, origin) {
  const guest = await deliver(bookingEmail(booking, settings, origin), 'guest')

  const extras = booking.lines.filter((l) => l.kind !== 'vessel').map((l) => l.label)
  const crewText = [
    `NEW BOOKING ${booking.ref}`,
    `${booking.vesselName} · ${longDate(booking.date)} · ${booking.guests} guests`,
    `${booking.customer.name} · ${booking.customer.phone || booking.customer.email}`,
    booking.customer.occasion ? `Occasion: ${booking.customer.occasion}` : null,
    extras.length ? `Aboard: ${extras.join(', ')}` : 'No extras',
    booking.customer.notes ? `Note: ${booking.customer.notes}` : null,
    `Total ${money(booking.total, booking.currency)} · paid ${money(booking.amountPaid, booking.currency)}`,
  ].filter(Boolean).join('\n')

  if (settings.contactEmail) {
    await deliver({ to: settings.contactEmail, subject: `New booking ${booking.ref}`, text: crewText }, 'crew')
  }

  return {
    guestEmail: guest,
    guestWhatsapp: whatsappLink(
      booking.customer.phone,
      `Hi ${booking.customer.name.split(' ')[0]}, this is ${settings.brand}. Your charter ${booking.ref} on ${longDate(booking.date)} is confirmed. Anything you need before the day?`,
    ),
  }
}

/** Sent when a deposit or balance lands. */
export async function paymentReceived(booking, settings, origin, amount) {
  return deliver({
    to: booking.customer.email,
    subject: `Payment received — booking ${booking.ref}`,
    text: [
      `Thank you — we received ${money(amount, booking.currency)} for booking ${booking.ref}.`,
      '',
      `${booking.vesselName} · ${longDate(booking.date)} · ${booking.guests} guests`,
      `Paid so far ${money(booking.amountPaid, booking.currency)} of ${money(booking.total, booking.currency)}.`,
      '',
      `${origin}/confirmation.html?ref=${booking.ref}`,
      '',
      `— ${settings.brand}`,
    ].join('\n'),
  }, 'payment')
}

/** Sent when the admin issues an invoice. */
export async function invoiceIssued(invoice, settings, shareUrl) {
  return deliver({
    to: invoice.customer.email,
    subject: `Invoice ${invoice.number} from ${settings.brand} — ${money(invoice.total, invoice.currency)}`,
    text: [
      `${invoice.customer.name || 'Hello'},`,
      '',
      `Invoice ${invoice.number} for ${money(invoice.total, invoice.currency)}${invoice.dueDate ? `, due ${invoice.dueDate}` : ''}.`,
      '',
      ...invoice.lines.map((l) => `  · ${l.label} × ${l.qty} — ${money(l.amount, invoice.currency)}`),
      '',
      invoice.paymentUrl ? `Pay it here: ${invoice.paymentUrl}` : `View it here: ${shareUrl}`,
      invoice.notes ? `\n${invoice.notes}` : '',
      '',
      `— ${settings.brand}`,
    ].join('\n'),
  }, 'invoice')
}
