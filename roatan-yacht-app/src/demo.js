import AsyncStorage from '@react-native-async-storage/async-storage'

// A booking that exists only on this phone.
//
// The point of the demo build is that somebody can hold the app and go all the
// way through — boat, extras, date, payment, boarding pass, captain — before a
// booking server exists anywhere. Without this the checkout dead-ends at
// "send us a WhatsApp" and the best screen in the app is never seen.
//
// Every demo booking is stamped `demo: true`. Screens show that badge; nothing
// pretends money moved.

const KEY = 'roatan.demoBookings'

const pad = (n) => String(n).padStart(4, '0')

async function all() {
  const raw = await AsyncStorage.getItem(KEY)
  return raw ? JSON.parse(raw) : []
}

/** Sequential refs, so a demo booking looks like a real one and sorts like one. */
async function nextRef() {
  const list = await all()
  return `LC-${pad(1001 + list.length)}`
}

export async function createDemoBooking({ quote, customer, method, payNow, settings }) {
  const ref = await nextRef()
  const paid = payNow === 'full' ? quote.total : quote.deposit
  const booking = {
    ref,
    demo: true,
    boardingPass: `${ref.replace('LC-', 'LC')}-${quote.vesselName.replace(/[^A-Z]/g, '').slice(0, 3) || 'SEA'}`,
    vesselId: quote.vesselId,
    vesselName: quote.vesselName,
    date: quote.date,
    nights: quote.nights,
    guests: quote.guests,
    lines: quote.lines,
    total: quote.total,
    deposit: quote.deposit,
    currency: quote.currency,
    amountPaid: paid,
    paymentStatus: payNow === 'full' ? 'paid' : 'deposit_paid',
    paymentMethod: method,
    customer,
    departurePoint: settings?.departurePoint || '',
    createdAt: new Date().toISOString(),
    transport: null,
  }
  const list = await all()
  await AsyncStorage.setItem(KEY, JSON.stringify([booking, ...list]))
  return booking
}

export async function getDemoBooking(ref) {
  const list = await all()
  return list.find((b) => b.ref === String(ref).trim().toUpperCase()) || null
}

/** Used when the guest answers the "do you need a ride?" question. */
export async function setDemoTransport(ref, transport) {
  const list = await all()
  const next = list.map((b) => (b.ref === ref ? { ...b, transport } : b))
  await AsyncStorage.setItem(KEY, JSON.stringify(next))
  return next.find((b) => b.ref === ref) || null
}
