import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, TextInput, StyleSheet, Share, Pressable, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { mono, serif, money } from '../theme'
import { getBooking } from '../api'
import { Plate, Label, Chip, Button, Notice, Serif } from '../components/ui'
import Confetti from '../components/Confetti'
import { celebrationFor } from '../fun'

const KEY = 'roatan.bookings'

/** Every booking made on this phone, newest first. */
export async function remember(ref) {
  const raw = await AsyncStorage.getItem(KEY)
  const refs = raw ? JSON.parse(raw) : []
  const next = [ref, ...refs.filter((r) => r !== ref)].slice(0, 20)
  await AsyncStorage.setItem(KEY, JSON.stringify(next))
}

export default function BookingScreen({ c, initialRef, celebrate, settings, insets }) {
  const [ref, setRef] = useState(initialRef || '')
  const [booking, setBooking] = useState(null)
  const [saved, setSaved] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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

  const paidLabel = booking
    ? { paid: 'Paid in full', deposit_paid: 'Deposit received', unpaid: 'Awaiting payment' }[booking.paymentStatus]
    : ''
  const owed = booking ? Math.round((booking.total - (booking.amountPaid || 0)) * 100) / 100 : 0

  return (
    <View style={{ flex: 1 }}>
    {celebrate && booking ? <Confetti burst={1} /> : null}
    <ScrollView
      style={{ backgroundColor: c.chart }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
    >
      <View style={{ gap: 6 }}>
        <Label c={c} signal>Your booking</Label>
        <Serif c={c} size={21}>{booking ? 'You are on the water' : 'Find your trip'}</Serif>
        {booking && celebrate ? (
          <Text style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 19, color: c.signal }}>
            {celebrationFor(booking.ref)}
          </Text>
        ) : null}
      </View>

      {!booking ? (
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
      ) : (
        <>
          <Plate
            c={c}
            title={booking.vesselName}
            right={<Chip c={c} tone={booking.paymentStatus === 'paid' ? 'ok' : 'signal'}>{paidLabel}</Chip>}
          >
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat c={c} k="Booking" v={booking.ref} />
              <Stat c={c} k="Departure" v={booking.date} />
              <Stat c={c} k="Guests" v={String(booking.guests)} />
            </View>

            {/* The boarding pass is the thing the crew reads at the dock, so it
                gets the biggest type on the screen. */}
            <View style={[styles.pass, { borderColor: c.signal, backgroundColor: c.signalSoft }]}>
              <Text style={[styles.passLabel, { color: c.signal }]}>Boarding pass</Text>
              <Text style={[styles.passCode, { color: c.ink }]}>{booking.boardingPass}</Text>
            </View>

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
              <View style={styles.line}>
                <Text style={[styles.label, { color: c.inkSoft }]}>Paid so far</Text>
                <Text style={[styles.amt, { color: c.inkSoft }]}>{money(booking.amountPaid || 0, booking.currency)}</Text>
              </View>
              {owed > 0.01 ? (
                <View style={styles.line}>
                  <Text style={[styles.label, { color: c.signal }]}>Balance, 48 h before departure</Text>
                  <Text style={[styles.amt, { color: c.signal }]}>{money(owed, booking.currency)}</Text>
                </View>
              ) : null}
            </View>
          </Plate>

          <Notice c={c} tone="shoal">
            <Text style={{ fontFamily: mono, fontSize: 12, color: c.ink }}>Where to meet us</Text>
            <Text style={[styles.detail, { color: c.inkSoft }]}>{settings.departurePoint}</Text>
          </Notice>

          <Notice c={c} tone="ok">
            <Text style={{ fontFamily: mono, fontSize: 12, color: c.ink }}>What to bring</Text>
            <Text style={[styles.detail, { color: c.inkSoft }]}>
              Swimsuit, a towel you like, reef-safe sunscreen. Everything else is aboard.
            </Text>
          </Notice>

          <Button
            c={c}
            onPress={() =>
              Linking.openURL(
                `https://wa.me/${String(settings.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Hi! About booking ${booking.ref} on ${booking.date}…`,
                )}`,
              )
            }
          >
            WhatsApp the crew
          </Button>
          <Button
            c={c}
            ghost
            onPress={() =>
              Share.share({
                message: `${booking.vesselName} — ${booking.date}\nBooking ${booking.ref} · boarding pass ${booking.boardingPass}`,
              })
            }
          >
            Share the details
          </Button>
          <Button c={c} ghost onPress={() => { setBooking(null); setRef('') }}>
            Look up another
          </Button>
        </>
      )}
    </ScrollView>
    </View>
  )
}

const Stat = ({ c, k, v }) => (
  <View style={[styles.stat, { backgroundColor: c.sunk, borderColor: c.rule }]}>
    <Text style={[styles.statK, { color: c.inkFaint }]}>{k}</Text>
    <Text style={[styles.statV, { color: c.ink }]}>{v}</Text>
  </View>
)

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 11, paddingVertical: 10, fontFamily: mono, fontSize: 15 },
  savedRef: { fontFamily: mono, fontSize: 13, paddingVertical: 3 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 2, padding: 9, gap: 2 },
  statK: { fontFamily: mono, fontSize: 8.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  statV: { fontFamily: mono, fontSize: 12 },
  pass: { borderWidth: 1, borderRadius: 2, padding: 12, alignItems: 'center', gap: 4 },
  passLabel: { fontFamily: mono, fontSize: 9.5, letterSpacing: 1.8, textTransform: 'uppercase' },
  passCode: { fontFamily: mono, fontSize: 24, letterSpacing: 3, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  label: { fontFamily: mono, fontSize: 12 },
  detail: { fontFamily: mono, fontSize: 11, lineHeight: 16 },
  amt: { fontFamily: mono, fontSize: 12 },
  totals: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  grand: { fontFamily: mono, fontSize: 16, fontWeight: '700' },
})
