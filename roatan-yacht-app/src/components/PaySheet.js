import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, Pressable, TextInput, StyleSheet, Animated, Platform, Easing,
  ActivityIndicator, ScrollView,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { serif, sans, money } from '../theme'
import { play } from '../sound'
import { Tap } from './ui'

// The payment sheet. It slides up from the bottom like the platform wallet
// sheets do, because that is the shape people already trust with a card number.
//
// Three ways to pay: the phone's own wallet, or a card typed in. On a demo
// build nothing is charged and the sheet says so in plain words — the point is
// to show the flow, not to imitate a payment processor.

const METHODS = [
  {
    id: 'gpay',
    label: 'Google Pay',
    note: 'Confirm with your fingerprint. Nothing to type.',
    mark: 'G Pay',
    only: 'android',
  },
  {
    id: 'applepay',
    label: 'Apple Pay',
    note: 'Double-click the side button and you are aboard.',
    mark: ' Pay',
    only: 'ios',
  },
  {
    id: 'card',
    label: 'Debit or credit card',
    note: 'Visa, Mastercard, American Express, Discover.',
    mark: 'CARD',
  },
]

const digits = (s) => String(s || '').replace(/\D/g, '')
const groups = (s) => digits(s).slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const expiry = (s) => {
  const d = digits(s).slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

export default function PaySheet({ c, amount, currency, demo, busy, summary, note, insets, onClose, onPay }) {
  const wallet = METHODS.find((m) => m.only === Platform.OS)
  const [method, setMethod] = useState(wallet ? wallet.id : 'card')
  const [card, setCard] = useState({ number: '', exp: '', cvc: '', zip: '' })
  const [stage, setStage] = useState('choose')   // choose · working · approved
  const slide = useRef(new Animated.Value(0)).current
  const tick = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(slide, { toValue: 1, friction: 11, tension: 62, useNativeDriver: true }).start()
  }, [slide])

  const cardReady =
    digits(card.number).length >= 15 && digits(card.exp).length === 4 && digits(card.cvc).length >= 3
  // Card details are only typed here on a demo build; live, the processor's
  // own page collects them and this sheet just picks the method.
  const ready = method !== 'card' || !demo || cardReady
  const chosen = METHODS.find((m) => m.id === method)

  async function confirm() {
    if (!ready || stage !== 'choose') return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    // On a live build the charge happens on the processor's own hosted page.
    // Faking an approval here first would be a lie, so hand straight over.
    if (!demo) {
      onPay({ method, brand: chosen.label, last4: digits(card.number).slice(-4) })
      return
    }
    setStage('working')
    // A real processor takes a moment. Skipping straight to "approved" reads as
    // fake; the pause is what makes the wallet sheets feel like wallet sheets.
    await new Promise((r) => setTimeout(r, method === 'card' ? 1500 : 1100))
    setStage('approved')
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    // The one sound the app really needed: paying should feel like something
    // happened, and this is the moment it happens.
    play('success')
    Animated.timing(tick, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start()
    await new Promise((r) => setTimeout(r, 780))
    onPay({ method, brand: chosen.label, last4: digits(card.number).slice(-4) })
  }

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={stage === 'choose' ? onClose : undefined}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(2,13,18,0.62)' }]} />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          // Clear of the gesture bar; the pay button is the last thing that
          // should be fighting with the system navigation.
          { backgroundColor: c.plate, paddingBottom: 20 + (insets?.bottom || 0) },
          { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }] },
        ]}
      >
        <View style={[styles.grab, { backgroundColor: c.rule }]} />

        {stage !== 'choose' ? (
          <View style={styles.done}>
            {stage === 'working' ? (
              <>
                <ActivityIndicator size="large" color={c.signal} />
                <Text style={[styles.doneTitle, { color: c.ink }]}>
                  {method === 'card' ? 'Talking to your bank…' : `Confirming with ${chosen.label}…`}
                </Text>
                <Text style={[styles.doneSub, { color: c.inkFaint }]}>
                  Do not close this. The captain is already looking for the keys.
                </Text>
              </>
            ) : (
              <>
                <Animated.View
                  style={[
                    styles.tick,
                    { backgroundColor: c.ok, transform: [{ scale: tick }] },
                  ]}
                >
                  <Text style={styles.tickMark}>✓</Text>
                </Animated.View>
                <Text style={[styles.doneTitle, { color: c.ink }]}>
                  {money(amount, currency)} approved
                </Text>
                <Text style={[styles.doneSub, { color: c.inkFaint }]}>
                  {chosen.label}
                  {method === 'card' && digits(card.number) ? ` ···· ${digits(card.number).slice(-4)}` : ''}
                </Text>
              </>
            )}
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            <View style={{ gap: 3 }}>
              <Text style={[styles.kicker, { color: c.signal }]}>PAYMENT</Text>
              <Text style={[styles.amount, { color: c.ink }]}>{money(amount, currency)}</Text>
              <Text style={[styles.sub, { color: c.inkFaint }]}>
                {summary || 'Love Cloud Roatán · yacht charter'}
              </Text>
              {note ? <Text style={[styles.sub, { color: c.shoal }]}>{note}</Text> : null}
            </View>

            {METHODS.filter((m) => !m.only || m.only === Platform.OS).map((m) => {
              const on = method === m.id
              return (
                <Tap
                  key={m.id}
                  onPress={() => setMethod(m.id)}
                  scaleTo={0.98}
                  style={[
                    styles.method,
                    { borderColor: on ? c.signal : c.rule, backgroundColor: on ? c.signalSoft : c.chart },
                  ]}
                >
                  <View style={[styles.mark, { backgroundColor: c.deep }]}>
                    <Text style={styles.markText}>{m.mark}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.methodLabel, { color: c.ink }]}>{m.label}</Text>
                    <Text style={[styles.methodNote, { color: c.inkFaint }]}>{m.note}</Text>
                  </View>
                  <View style={[styles.radio, { borderColor: on ? c.signal : c.rule }]}>
                    {on ? <View style={[styles.radioDot, { backgroundColor: c.signal }]} /> : null}
                  </View>
                </Tap>
              )
            })}

            {/* The other platform's wallet, shown greyed rather than hidden, so
                nobody wonders whether we support it. */}
            {METHODS.filter((m) => m.only && m.only !== Platform.OS).map((m) => (
              <View key={m.id} style={[styles.method, { borderColor: c.rule, opacity: 0.45 }]}>
                <View style={[styles.mark, { backgroundColor: c.inkFaint }]}>
                  <Text style={styles.markText}>{m.mark}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.methodLabel, { color: c.ink }]}>{m.label}</Text>
                  <Text style={[styles.methodNote, { color: c.inkFaint }]}>
                    Waiting for you on an iPhone.
                  </Text>
                </View>
              </View>
            ))}

            {method === 'card' && demo ? (
              <View style={{ gap: 10 }}>
                <Input
                  c={c} label="CARD NUMBER" value={groups(card.number)} keyboardType="number-pad"
                  onChange={(v) => setCard((s) => ({ ...s, number: v }))} placeholder="4242 4242 4242 4242"
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Input
                    c={c} label="EXPIRES" value={expiry(card.exp)} keyboardType="number-pad" flex
                    onChange={(v) => setCard((s) => ({ ...s, exp: v }))} placeholder="09/28"
                  />
                  <Input
                    c={c} label="CVC" value={digits(card.cvc).slice(0, 4)} keyboardType="number-pad" flex
                    onChange={(v) => setCard((s) => ({ ...s, cvc: v }))} placeholder="123"
                  />
                </View>
              </View>
            ) : null}

            {demo ? (
              <View style={[styles.demoNote, { borderLeftColor: c.shoal, backgroundColor: c.sunk }]}>
                <Text style={[styles.demoText, { color: c.inkSoft }]}>
                  Demo build — no card is charged and no money moves. This is here so you can see
                  exactly what a guest sees, all the way to the boarding pass.
                </Text>
              </View>
            ) : null}

            <Tap
              disabled={!ready || busy}
              haptic="none"
              sound={null}
              onPress={confirm}
              style={[styles.pay, { backgroundColor: method === 'card' ? c.signal : c.deep }]}
            >
              <Text style={styles.payText}>
                {method === 'card'
                  ? `Pay ${money(amount, currency)}`
                  : `${chosen.mark.trim()}  ·  Pay ${money(amount, currency)}`}
              </Text>
            </Tap>

            <Tap onPress={onClose} hitSlop={8}>
              <Text style={[styles.cancel, { color: c.inkFaint }]}>Not yet — take me back</Text>
            </Tap>
          </ScrollView>
        )}
      </Animated.View>
    </View>
  )
}

function Input({ c, label, value, onChange, flex, ...rest }) {
  return (
    <View style={{ gap: 5, flex: flex ? 1 : undefined }}>
      <Text style={[styles.inputLabel, { color: c.inkFaint }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={c.inkFaint}
        style={[styles.input, { color: c.ink, borderColor: c.rule, backgroundColor: c.chart }]}
        {...rest}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 50 },
  sheet: {
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    padding: 20, paddingTop: 10, gap: 12, maxHeight: '92%',
  },
  grab: { width: 44, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  kicker: { fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  amount: { fontFamily: serif, fontSize: 32, letterSpacing: -0.8 },
  sub: { fontFamily: sans, fontSize: 12.5 },
  method: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.4, borderRadius: 18, padding: 13,
  },
  mark: { width: 52, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: sans, fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  methodLabel: { fontFamily: sans, fontSize: 14.5, fontWeight: '700' },
  methodNote: { fontFamily: sans, fontSize: 11.5, marginTop: 1 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  inputLabel: { fontFamily: sans, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12,
    fontFamily: sans, fontSize: 16, letterSpacing: 1,
  },
  demoNote: { borderLeftWidth: 3, borderRadius: 12, padding: 12 },
  demoText: { fontFamily: sans, fontSize: 12, lineHeight: 17 },
  pay: { borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  payText: { fontFamily: sans, fontSize: 15.5, fontWeight: '800', color: '#fff' },
  cancel: { fontFamily: sans, fontSize: 13, textAlign: 'center', paddingVertical: 4 },
  done: { alignItems: 'center', gap: 12, paddingVertical: 46 },
  doneTitle: { fontFamily: serif, fontSize: 22, letterSpacing: -0.4, textAlign: 'center' },
  doneSub: { fontFamily: sans, fontSize: 12.5, textAlign: 'center', paddingHorizontal: 20, lineHeight: 18 },
  tick: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  tickMark: { fontSize: 34, color: '#fff', fontWeight: '800' },
})
