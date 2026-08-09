import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TextInput, StyleSheet, Share, Pressable, Linking, Image, TouchableOpacity,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { mono, serif, sans, money, shadow } from '../theme'
import { getBooking } from '../api'
import { INTRO_STILL } from '../images'
import { getDemoBooking, setDemoTransport } from '../demo'
import { Plate, Label, Chip, Button, Notice, Serif } from '../components/ui'
import Confetti from '../components/Confetti'
import CaptainChat from '../components/CaptainChat'
import { celebrationFor } from '../fun'

const KEY = 'roatan.bookings'

/** Every booking made on this phone, newest first. */
export async function remember(ref) {
  const raw = await AsyncStorage.getItem(KEY)
  const refs = raw ? JSON.parse(raw) : []
  const next = [ref, ...refs.filter((r) => r !== ref)].slice(0, 20)
  await AsyncStorage.setItem(KEY, JSON.stringify(next))
}

const RIDES = [
  { id: 'hotel', emoji: '🏨', label: 'From my hotel', note: 'Anywhere on the island. Free within 30 minutes of the dock.' },
  { id: 'terminal', emoji: '🚢', label: 'From the cruise terminal', note: 'We watch your ship’s arrival and wait, even when it is late.' },
  { id: 'none', emoji: '🚗', label: 'We will drive ourselves', note: 'Free parking at The Verandas. Ask the gate for Love Cloud.' },
]

export default function BookingScreen({ c, initialRef, celebrate, settings, onBack, insets }) {
  const [ref, setRef] = useState(initialRef || '')
  const [booking, setBooking] = useState(null)
  const [saved, setSaved] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ride, setRide] = useState(null)

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => setSaved(raw ? JSON.parse(raw) : []))
  }, [booking])

  useEffect(() => {
    if (initialRef) look(initialRef)
  }, [initialRef])

  async function look(which) {
    const target = String(which || ref).trim().toUpperCase()
    if (!target) return
    setBusy(true)
    setError('')
    // A booking made in the demo lives on this phone; look there first, so the
    // trip opens instantly and works with the aeroplane mode on.
    const local = await getDemoBooking(target)
    if (local) {
      setBooking(local)
      setRef(target)
      setRide(local.transport || null)
      await remember(target)
      setBusy(false)
      return
    }
    try {
      const { booking: b } = await getBooking(target)
      setBooking(b)
      setRef(target)
      await remember(target)
    } catch (err) {
      setBooking(null)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function chooseRide(id) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setRide(id)
    if (booking?.demo) await setDemoTransport(booking.ref, id)
  }

  const where = booking?.departurePoint || settings.departurePoint
  const openMap = () =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`)

  const whatsapp = (text) => {
    const digits = String(settings.whatsapp || '').replace(/\D/g, '')
    if (!digits) return
    Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`)
  }

  if (!booking) {
    return (
      <View style={{ flex: 1, backgroundColor: c.chart }}>
        <TopBar c={c} insets={insets} onBack={onBack} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Label c={c} signal>Your booking</Label>
            <Serif c={c} size={21}>Find your trip</Serif>
          </View>
          <Plate c={c} title="Booking number">
            <TextInput
              value={ref}
              onChangeText={setRef}
              placeholder="LC-1001"
              placeholderTextColor={c.inkFaint}
              autoCapitalize="characters"
              style={[styles.input, { color: c.ink, borderColor: c.rule, backgroundColor: c.plate }]}
            />
            <Button c={c} busy={busy} onPress={() => look()}>Find it</Button>
            {error ? <Notice c={c}>{error}</Notice> : null}
            {saved.length ? (
              <View style={{ gap: 6 }}>
                <Label c={c}>Booked on this phone</Label>
                {saved.map((r) => (
                  <Pressable key={r} onPress={() => look(r)}>
                    <Text style={[styles.savedRef, { color: c.shoal }]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Plate>
        </ScrollView>
      </View>
    )
  }

  const paidLabel =
    { paid: 'Paid in full', deposit_paid: 'Deposit received', unpaid: 'Awaiting payment' }[
      booking.paymentStatus
    ] || 'Confirmed'
  const owed = Math.round((booking.total - (booking.amountPaid || 0)) * 100) / 100
  const days = daysUntil(booking.date)
  const chosenRide = RIDES.find((r) => r.id === ride)

  return (
    <View style={{ flex: 1, backgroundColor: c.chart }}>
      {celebrate ? <Confetti burst={1} /> : null}

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* The trip gets a picture, not a receipt header. */}
        <View style={styles.hero}>
          <Image source={INTRO_STILL} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(2,13,18,0.75)', 'rgba(2,13,18,0.1)', 'rgba(2,13,18,0.9)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroTop, { paddingTop: insets.top + 10 }]}>
            <Pressable onPress={onBack} style={styles.heroBtn}>
              <Text style={{ fontSize: 17, color: '#fff' }}>←</Text>
            </Pressable>
            {booking.demo ? (
              <View style={styles.demoTag}>
                <Text style={styles.demoTagText}>DEMO BOOKING</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroKicker}>{countdownLine(days)}</Text>
            <Text style={styles.heroTitle}>{booking.vesselName}</Text>
            <Text style={styles.heroSub}>
              {longDate(booking.date)} · {booking.guests} guests
              {booking.nights ? ` · ${booking.nights} nights aboard` : ''}
            </Text>
          </View>
        </View>

        <View style={{ padding: 16, gap: 14, marginTop: -22 }}>
          {celebrate ? (
            <Text style={{ fontFamily: serif, fontSize: 19, lineHeight: 25, color: c.ink }}>
              {celebrationFor(booking.ref)}
            </Text>
          ) : null}

          {/* 1 — the thing the crew reads at the dock */}
          <Plate c={c} title="Boarding pass" right={<Chip c={c} tone={booking.paymentStatus === 'paid' ? 'ok' : 'signal'}>{paidLabel}</Chip>}>
            <View style={[styles.pass, { borderColor: c.signal, backgroundColor: c.signalSoft }]}>
              <Text style={[styles.passLabel, { color: c.signal }]}>Show this at the dock</Text>
              <Text style={[styles.passCode, { color: c.ink }]}>{booking.boardingPass}</Text>
              <Text style={[styles.passRef, { color: c.inkFaint }]}>Booking {booking.ref}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat c={c} k="Paid" v={money(booking.amountPaid || 0, booking.currency)} />
              <Stat c={c} k="Total" v={money(booking.total, booking.currency)} />
              <Stat c={c} k={owed > 0.01 ? 'Balance' : 'Owing'} v={money(owed, booking.currency)} />
            </View>
            {booking.paymentMethod ? (
              <Text style={[styles.detail, { color: c.inkFaint }]}>
                Paid with {methodName(booking.paymentMethod)}
                {owed > 0.01 ? ` · balance due 48 h before departure` : ''}
              </Text>
            ) : null}
          </Plate>

          {/* 2 — where, in words a taxi driver understands */}
          <Plate c={c} title="Where we meet">
            <Text style={{ fontFamily: serif, fontSize: 20, color: c.ink, letterSpacing: -0.4 }}>
              The Verandas at Pristine Bay
            </Text>
            <Text style={[styles.body, { color: c.inkSoft }]}>
              {settings.departureNote ||
                'Come to the dock below the resort. There is free parking, and the crew will be waiting with your name on the board.'}
            </Text>
            <Text style={[styles.detail, { color: c.inkFaint }]}>{where}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button c={c} ghost style={{ flex: 1 }} onPress={openMap}>Open in Maps</Button>
              <Button
                c={c} ghost style={{ flex: 1 }}
                onPress={() => Share.share({ message: `Meet us at ${where} — Love Cloud Roatán, booking ${booking.ref}` })}
              >
                Send to a friend
              </Button>
            </View>
          </Plate>

          {/* 3 — the question every guest on this island has */}
          <Plate c={c} title="Do you need a ride?">
            {!ride ? (
              <>
                <Text style={[styles.body, { color: c.inkSoft }]}>
                  Roatán taxis are an adventure of their own. We would rather just come and get you.
                </Text>
                {RIDES.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.7}
                    onPress={() => chooseRide(r.id)}
                    style={[styles.ride, { borderColor: c.rule, backgroundColor: c.chart }]}
                  >
                    <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rideLabel, { color: c.ink }]}>{r.label}</Text>
                      <Text style={[styles.detail, { color: c.inkFaint }]}>{r.note}</Text>
                    </View>
                    <Text style={{ color: c.inkFaint, fontSize: 18 }}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <Notice c={c} tone="ok">
                  <Text style={{ fontFamily: sans, fontSize: 14, fontWeight: '700', color: c.ink }}>
                    {chosenRide.emoji}  {chosenRide.label}
                  </Text>
                  <Text style={[styles.body, { color: c.inkSoft }]}>
                    {ride === 'none'
                      ? 'Noted — we will leave your name at the gate so you are not explaining yourself to security at 8 am.'
                      : 'Noted. Tell the captain the address below and the van will be outside 45 minutes before departure.'}
                  </Text>
                </Notice>
                {ride !== 'none' ? (
                  <Button
                    c={c}
                    onPress={() =>
                      whatsapp(
                        `Hi! Booking ${booking.ref} on ${booking.date}. We need the pickup ${
                          ride === 'hotel' ? 'from our hotel' : 'from the cruise terminal'
                        }. The address is: `,
                      )
                    }
                  >
                    Send our pickup address
                  </Button>
                ) : null}
                <Pressable onPress={() => setRide(null)} hitSlop={8}>
                  <Text style={[styles.detail, { color: c.shoal, textAlign: 'center' }]}>Change my answer</Text>
                </Pressable>
              </>
            )}
          </Plate>

          {/* 4 — a human, immediately */}
          <Plate c={c} title="Messages">
            <CaptainChat c={c} booking={booking} />
            <Button
              c={c}
              onPress={() => whatsapp(`Hi Captain! About booking ${booking.ref} on ${booking.date}…`)}
            >
              WhatsApp the crew for real
            </Button>
          </Plate>

          {/* 5 — the day itself */}
          <Plate c={c} title="How the day goes">
            {[
              ['⏰', '45 minutes before', 'The van leaves for you, or you park at The Verandas and walk down to the dock.'],
              ['🥂', 'On arrival', 'Names checked, shoes off, cooler already loaded. Welcome drink in your hand before the lines are off.'],
              ['🤿', 'Out on the reef', 'Snorkelling, swimming, the lily pad, and whichever beach club you decided on.'],
              ['🌅', 'The way back', 'Slow. Music on. This is the part everyone remembers.'],
            ].map(([e, k, v]) => (
              <View key={k} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 19 }}>{e}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rideLabel, { color: c.ink }]}>{k}</Text>
                  <Text style={[styles.detail, { color: c.inkFaint }]}>{v}</Text>
                </View>
              </View>
            ))}
          </Plate>

          <Plate c={c} title="What is aboard">
            {booking.lines.map((l, i) => (
              <View key={`${l.id}-${i}`} style={styles.line}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.label, { color: c.ink }]}>{l.label}</Text>
                  {l.detail ? <Text style={[styles.detail, { color: c.inkFaint }]}>{l.detail}</Text> : null}
                </View>
                <Text style={[styles.amt, { color: c.ink }]}>{money(l.amount, booking.currency)}</Text>
              </View>
            ))}
            <View style={[styles.totals, { borderTopColor: c.rule }]}>
              <View style={styles.line}>
                <Text style={[styles.grand, { color: c.ink }]}>Total</Text>
                <Text style={[styles.grand, { color: c.ink }]}>{money(booking.total, booking.currency)}</Text>
              </View>
            </View>
          </Plate>

          <Notice c={c} tone="ok">
            <Text style={{ fontFamily: sans, fontSize: 13, fontWeight: '700', color: c.ink }}>What to bring</Text>
            <Text style={[styles.body, { color: c.inkSoft }]}>
              Swimsuit, a towel you like, reef-safe sunscreen. Everything else is already on the boat,
              including the ice, which is the part people forget.
            </Text>
          </Notice>

          <Button
            c={c} ghost
            onPress={() =>
              Share.share({
                message: `${booking.vesselName} — ${longDate(booking.date)}\nBooking ${booking.ref} · boarding pass ${booking.boardingPass}\nMeeting at ${where}`,
              })
            }
          >
            Share the details
          </Button>
          <Button c={c} ghost onPress={() => { setBooking(null); setRef(''); setRide(null) }}>
            Look up another booking
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}

const TopBar = ({ c, insets, onBack }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 4 }}>
    <Pressable onPress={onBack} style={[{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.plate }, shadow]}>
      <Text style={{ fontSize: 17, color: c.ink }}>←</Text>
    </Pressable>
  </View>
)

const Stat = ({ c, k, v }) => (
  <View style={[styles.stat, { backgroundColor: c.sunk }]}>
    <Text style={[styles.statK, { color: c.inkFaint }]}>{k}</Text>
    <Text style={[styles.statV, { color: c.ink }]}>{v}</Text>
  </View>
)

const methodName = (id) =>
  ({ gpay: 'Google Pay', applepay: 'Apple Pay', card: 'a debit or credit card' }[id] || id)

function longDate(d) {
  if (!d) return ''
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function daysUntil(d) {
  if (!d) return null
  const today = new Date()
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const then = new Date(`${d}T12:00:00Z`)
  return Math.round((Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate()) - start) / 86400000)
}

function countdownLine(days) {
  if (days === null) return 'YOU ARE BOOKED'
  if (days < 0) return 'THAT ONE IS IN THE PHOTO ALBUM NOW'
  if (days === 0) return 'TODAY. GO. NOW. 🌊'
  if (days === 1) return 'TOMORROW — SLEEP IS OPTIONAL'
  if (days <= 7) return `${days} DAYS TO GO`
  return `${days} DAYS TO GO · START PACKING BADLY`
}

const styles = StyleSheet.create({
  hero: { height: 330, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  heroBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  demoTag: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  demoTagText: { fontFamily: sans, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.6, color: '#fff' },
  heroBody: { padding: 22, paddingBottom: 40, gap: 4 },
  heroKicker: { fontFamily: sans, fontSize: 10.5, fontWeight: '800', letterSpacing: 2.2, color: '#FFC4DC' },
  heroTitle: { fontFamily: serif, fontSize: 29, lineHeight: 33, color: '#fff', letterSpacing: -0.7, marginTop: 4 },
  heroSub: { fontFamily: sans, fontSize: 13.5, color: 'rgba(255,255,255,0.85)' },
  input: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 11, paddingVertical: 10, fontFamily: mono, fontSize: 15 },
  savedRef: { fontFamily: mono, fontSize: 13, paddingVertical: 3 },
  stat: { flex: 1, borderRadius: 12, padding: 10, gap: 2 },
  statK: { fontFamily: sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '800' },
  statV: { fontFamily: sans, fontSize: 14, fontWeight: '700' },
  pass: { borderWidth: 1.4, borderRadius: 16, padding: 15, alignItems: 'center', gap: 3 },
  passLabel: { fontFamily: sans, fontSize: 9.5, letterSpacing: 1.8, textTransform: 'uppercase', fontWeight: '800' },
  passCode: { fontFamily: mono, fontSize: 26, letterSpacing: 3, fontWeight: '700' },
  passRef: { fontFamily: mono, fontSize: 11 },
  ride: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 13 },
  rideLabel: { fontFamily: sans, fontSize: 14, fontWeight: '700' },
  body: { fontFamily: sans, fontSize: 13, lineHeight: 19 },
  line: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  label: { fontFamily: sans, fontSize: 13 },
  detail: { fontFamily: sans, fontSize: 11.5, lineHeight: 16.5 },
  amt: { fontFamily: mono, fontSize: 12 },
  totals: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  grand: { fontFamily: sans, fontSize: 16, fontWeight: '800' },
})
