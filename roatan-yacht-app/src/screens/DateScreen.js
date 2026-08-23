import React from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { serif, sans, money, shadow } from '../theme'
import Calendar, { spanDates } from '../components/Calendar'
import { Tap } from '../components/ui'
import { play } from '../sound'

// Date and guests get their own screen, after the fun of packing the boat —
// the experience is chosen with the heart, the date with the calendar.

export default function DateScreen({
  c, cart, vessel, unavailable, runningTotal, insets,
  onPickDate, onGuests, onNights, onContinue, onBack,
}) {
  const ready = Boolean(cart.date && cart.guests)
  const fmt = (d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
  const span = cart.date ? spanDates(cart.date, cart.nights) : []

  return (
    <View style={[styles.root, { backgroundColor: c.chart }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Tap onPress={onBack} style={[styles.roundBtn, { backgroundColor: c.plate, ...shadow }]}>
          <Text style={{ fontSize: 17, color: c.ink }}>←</Text>
        </Tap>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: c.signal }]}>ALMOST THERE</Text>
          <Text style={[styles.title, { color: c.ink }]}>When do we sail?</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 16 }}>
        <View style={[styles.card, { backgroundColor: c.plate }, shadow]}>
          <Calendar
            c={c}
            unavailable={unavailable}
            value={cart.date}
            nights={cart.nights}
            onPick={(d) => { Haptics.selectionAsync(); play('pop'); onPickDate(d) }}
          />
          <Text style={[styles.note, { color: c.inkFaint }]}>
            {cart.nights
              ? `Crossed-out days are taken. Your ${cart.nights}-night trip needs ${cart.nights} clear days in a row.`
              : 'Crossed-out days are already booked.'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={[styles.card, { backgroundColor: c.plate, flex: 1, alignItems: 'center' }, shadow]}>
            <Text style={[styles.stepLabel, { color: c.inkFaint }]}>GUESTS</Text>
            <BigStepper
              c={c}
              value={cart.guests}
              min={vessel?.capacityMin || 1}
              max={vessel?.capacityMax || 12}
              onChange={onGuests}
            />
            <Text style={[styles.note, { color: c.inkFaint }]}>up to {vessel?.capacityMax}</Text>
          </View>
          {vessel?.priceUnit === 'per_night' ? (
            <View style={[styles.card, { backgroundColor: c.plate, flex: 1, alignItems: 'center' }, shadow]}>
              <Text style={[styles.stepLabel, { color: c.inkFaint }]}>NIGHTS</Text>
              <BigStepper c={c} value={cart.nights} min={vessel.minNights} max={14} onChange={onNights} />
              <Text style={[styles.note, { color: c.inkFaint }]}>min {vessel.minNights}</Text>
            </View>
          ) : null}
        </View>

        {cart.date ? (
          <View style={[styles.summary, { backgroundColor: c.deep }, shadow]}>
            <Text style={{ fontSize: 26 }}>🗓️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryTitle, { color: c.onDeep }]}>
                {cart.nights
                  ? `${fmt(span[0])} → ${fmt(span[span.length - 1])}`
                  : fmt(cart.date)}
              </Text>
              <Text style={[styles.summarySub, { color: c.onDeepSoft }]}>
                {vessel?.name} · {cart.guests} guests
                {cart.nights ? ` · ${cart.nights} nights aboard` : ''}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: c.deep, paddingBottom: insets.bottom + 14 }]}>
        <View>
          <Text style={[styles.footTotal, { color: c.onDeep }]}>{money(runningTotal)}</Text>
          <Text style={[styles.footSub, { color: c.onDeepSoft }]}>
            {ready ? 'Everything aboard' : 'Pick a date to continue'}
          </Text>
        </View>
        <Tap
          disabled={!ready}
          haptic="medium"
          onPress={onContinue}
          style={[styles.cta, { backgroundColor: c.signal }]}
        >
          <Text style={styles.ctaText}>Review & pay →</Text>
        </Tap>
      </View>
    </View>
  )
}

function BigStepper({ c, value, min, max, onChange }) {
  const btn = (txt, next, disabled) => (
    <Tap
      disabled={disabled}
      scaleTo={0.88}
      onPress={() => onChange(next)}
      style={[styles.stepBtn, { backgroundColor: c.sunk }]}
    >
      <Text style={{ fontFamily: sans, fontSize: 22, fontWeight: '700', color: c.ink }}>{txt}</Text>
    </Tap>
  )
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 6 }}>
      {btn('−', value - 1, value <= min)}
      <Text style={{ fontFamily: serif, fontSize: 34, color: c.ink, minWidth: 44, textAlign: 'center' }}>
        {value}
      </Text>
      {btn('+', value + 1, value >= max)}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  title: { fontFamily: serif, fontSize: 23, letterSpacing: -0.4 },
  card: { borderRadius: 22, padding: 16, gap: 8 },
  note: { fontFamily: sans, fontSize: 11.5, lineHeight: 16 },
  stepLabel: { fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  summary: { borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryTitle: { fontFamily: serif, fontSize: 18, letterSpacing: -0.3 },
  summarySub: { fontFamily: sans, fontSize: 12.5, marginTop: 2 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 16,
  },
  footTotal: { fontFamily: sans, fontSize: 21, fontWeight: '800' },
  footSub: { fontFamily: sans, fontSize: 11.5, marginTop: 1 },
  cta: { borderRadius: 999, paddingHorizontal: 24, paddingVertical: 15 },
  ctaText: { fontFamily: sans, fontSize: 15, fontWeight: '800', color: '#fff' },
})
