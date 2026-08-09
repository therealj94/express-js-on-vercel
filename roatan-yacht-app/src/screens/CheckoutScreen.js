import React, { useState } from 'react'
import {
  View, Text, ScrollView, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Linking, Pressable,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Haptics from 'expo-haptics'
import { mono, serif, sans, money, shadow } from '../theme'
import { createBooking } from '../api'
import { requestMessage } from '../pricing'
import { Plate, Label, Button, Notice, Serif } from '../components/ui'
import { spanDates } from '../components/Calendar'
import { TIP_OPTIONS, celebrationFor } from '../fun'
import Confetti from '../components/Confetti'
import PaySheet from '../components/PaySheet'
import { createDemoBooking } from '../demo'

export default function CheckoutScreen({ c, cart, quote, settings, account, onBooked, onTip, onBack, insets }) {
  const [form, setForm] = useState({
    name: account?.name || '', email: account?.email || '', phone: account?.phone || '',
    occasion: '', notes: '',
  })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  // Which amount the pay sheet is open for: 'deposit', 'full', or nothing.
  const [paying, setPaying] = useState(null)

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const fmt = (d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
  const span = spanDates(quote.date, quote.nights)

  /** The pay sheet has a method and, on a demo build, an approval. */
  async function paid({ method }) {
    const payNow = paying
    setPaying(null)
    if (quote.estimate) {
      // No booking office to call. The booking is made on this phone so the
      // guest still gets a boarding pass, a captain and a meeting point.
      const booking = await createDemoBooking({ quote, customer: form, method, payNow, settings })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onBooked(booking.ref)
      return
    }
    await pay(payNow, method)
  }

  async function pay(payNow, method) {
    setError('')
    setBusy(payNow)
    try {
      const result = await createBooking({ ...cart, payNow, paymentMethod: method, customer: form })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      // Stripe's hosted page opens in the system browser sheet; when the guest
      // closes it we come back to the confirmation either way, because the
      // booking already exists and the webhook decides what is paid.
      if (result.checkoutUrl) {
        await WebBrowser.openBrowserAsync(result.checkoutUrl)
      }
      onBooked(result.booking.ref)
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (err.offline) {
        // No server to take the booking. Rather than lose a guest who has
        // already chosen a boat and a date, hand the whole manifest to
        // WhatsApp — which is where they would have written anyway.
        setError('')
        sendByWhatsApp()
        return
      }
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  function sendByWhatsApp() {
    const digits = String(settings.whatsapp || '').replace(/\D/g, '')
    const body = requestMessage(quote, form, settings)
    if (!digits) {
      setError('No booking server and no WhatsApp number set. Add one in Settings.')
      return
    }
    Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(body)}`)
    // The request is on its way — that deserves the same joy as a paid
    // booking, not a silent return to a form.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setSent(true)
  }

  if (sent) {
    return (
      <View style={{ flex: 1, backgroundColor: c.chart }}>
        <Confetti burst={1} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 40, paddingBottom: insets.bottom + 40, gap: 14 }}>
          <View style={{ gap: 8 }}>
            <Label c={c} signal>Request away</Label>
            <Serif c={c} size={24}>{celebrationFor(form.name || quote.vesselName)}</Serif>
            <Text style={[styles.small, { color: c.inkSoft }]}>
              Your manifest just sailed off to the crew on WhatsApp. A human — a real one, probably
              wearing a captain's hat — replies to confirm the date and the final price.
            </Text>
          </View>
          <Notice c={c} tone="shoal">
            <Text style={{ fontFamily: serif, fontSize: 15, color: c.ink }}>{quote.vesselName}</Text>
            <Text style={[styles.small, { color: c.inkSoft }]}>
              {quote.date} · {quote.guests} guests · estimated {money(quote.total, quote.currency)}
            </Text>
          </Notice>
          <Notice c={c} tone="ok">
            <Text style={{ fontFamily: mono, fontSize: 12, color: c.ink }}>Meanwhile</Text>
            <Text style={[styles.small, { color: c.inkSoft }]}>
              Start arguing about the playlist. It is the only real decision left.
            </Text>
          </Notice>
          <Button c={c} onPress={() => onBooked(null)}>Back to the fleet</Button>
        </ScrollView>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.chart }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 4 }}>
        <Pressable onPress={onBack} style={[{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.plate }, shadow]}>
          <Text style={{ fontSize: 17, color: c.ink }}>←</Text>
        </Pressable>
        <View>
          <Text style={{ fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 2, color: c.signal }}>LAST STEP</Text>
          <Serif c={c} size={21}>Make it official</Serif>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}>

        <Notice c={c} tone="shoal">
          <Text style={{ fontFamily: serif, fontSize: 16, color: c.ink }}>{quote.vesselName}</Text>
          <Text style={[styles.small, { color: c.inkSoft }]}>
            {quote.nights
              ? `${fmt(span[0])} → ${fmt(span[span.length - 1])} · ${quote.nights} nights`
              : fmt(quote.date)}{' '}· {quote.guests} guests
          </Text>
          <Text style={[styles.small, { color: c.inkFaint }]}>Departing {settings.departurePoint}</Text>
        </Notice>

        <Plate c={c} title="Manifest">
          {quote.lines.map((l, i) => (
            <View key={`${l.id}-${i}`} style={styles.line}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.label, { color: c.ink }]}>{l.label}</Text>
                {l.detail ? <Text style={[styles.detail, { color: c.inkFaint }]}>{l.detail}</Text> : null}
              </View>
              <Text style={[styles.amt, { color: c.ink }]}>{money(l.amount, quote.currency)}</Text>
            </View>
          ))}
          <View style={[styles.totals, { borderTopColor: c.rule }]}>
            {quote.discount ? (
              <View style={styles.line}>
                <Text style={[styles.label, { color: c.ok }]}>Promo {quote.couponCode}</Text>
                <Text style={[styles.amt, { color: c.ok }]}>−{money(quote.discount, quote.currency)}</Text>
              </View>
            ) : null}
            {quote.tip ? (
              <View style={styles.line}>
                <Text style={[styles.label, { color: c.inkSoft }]}>Crew tip ({quote.tipPct}%)</Text>
                <Text style={[styles.amt, { color: c.inkSoft }]}>{money(quote.tip, quote.currency)}</Text>
              </View>
            ) : null}
            <View style={styles.line}>
              <Text style={[styles.grand, { color: c.ink }]}>Total</Text>
              <Text style={[styles.grand, { color: c.ink }]}>{money(quote.total, quote.currency)}</Text>
            </View>
          </View>
        </Plate>

        <Plate c={c} title="The crew" right={<Label c={c}>Optional, always</Label>}>
          <Text style={[styles.small, { color: c.inkSoft }]}>
            Captain, mate and whoever grilled the lobster. A tip is never expected — it is
            very much noticed.
          </Text>
          <View style={styles.tipRow}>
            {TIP_OPTIONS.map((t) => {
              const on = (quote.tipPct || 0) === t.pct
              return (
                <Pressable
                  key={t.pct}
                  onPress={() => {
                    Haptics.selectionAsync()
                    onTip(t.pct)
                  }}
                  style={[
                    styles.tipChip,
                    { borderColor: on ? c.signal : c.rule, backgroundColor: on ? c.signalSoft : c.plate },
                  ]}
                >
                  <Text style={[styles.tipPct, { color: on ? c.signal : c.ink }]}>{t.label}</Text>
                  <Text style={[styles.tipNote, { color: c.inkFaint }]}>{t.note}</Text>
                </Pressable>
              )
            })}
          </View>
        </Plate>

        <Plate c={c} title="Who is coming">
          <Field c={c} label="Full name" value={form.name} onChange={set('name')} autoComplete="name" />
          <Field
            c={c} label="Email" value={form.email} onChange={set('email')}
            keyboardType="email-address" autoCapitalize="none" autoComplete="email"
          />
          <Field c={c} label="Phone or WhatsApp" value={form.phone} onChange={set('phone')} keyboardType="phone-pad" />
          <Field c={c} label="Occasion (optional)" value={form.occasion} onChange={set('occasion')} />
          <Field
            c={c} label="Anything we should know — allergies, surprises, arrival time"
            value={form.notes} onChange={set('notes')} multiline
          />
        </Plate>


        {error ? <Notice c={c}>{error}</Notice> : null}

        {quote.estimate ? (
          <Notice c={c} tone="shoal">
            This total was worked out on your phone — we are not connected to the booking office
            right now. Pay below to walk through the whole thing as a guest sees it, or send the
            manifest over on WhatsApp and a human confirms the price and the date.
          </Notice>
        ) : null}

        <View style={[styles.methods, { borderColor: c.rule }]}>
          <Text style={[styles.methodsLabel, { color: c.inkFaint }]}>WE TAKE</Text>
          {['💳  Debit & credit card', '🤖  Google Pay', '🍎  Apple Pay'].map((m) => (
            <Text key={m} style={[styles.methodsItem, { color: c.inkSoft }]}>{m}</Text>
          ))}
        </View>

        <Button c={c} busy={busy === 'deposit'} disabled={Boolean(busy)} onPress={() => setPaying('deposit')}>
          Pay {money(quote.deposit, quote.currency)} deposit
        </Button>
        <Button c={c} ghost busy={busy === 'full'} disabled={Boolean(busy)} onPress={() => setPaying('full')}>
          Pay {money(quote.total, quote.currency)} in full
        </Button>

        {quote.estimate ? (
          <Pressable onPress={sendByWhatsApp} hitSlop={8}>
            <Text style={[styles.whatsapp, { color: c.shoal }]}>
              Rather talk to a human? Send the manifest on WhatsApp
            </Text>
          </Pressable>
        ) : null}

        <Text style={[styles.small, { color: c.inkFaint }]}>{settings.cancellationPolicy}</Text>
      </ScrollView>

      {paying ? (
        <PaySheet
          c={c}
          amount={paying === 'full' ? quote.total : quote.deposit}
          currency={quote.currency}
          demo={Boolean(quote.estimate)}
          onClose={() => setPaying(null)}
          onPay={paid}
        />
      ) : null}
    </KeyboardAvoidingView>
  )
}

function Field({ c, label, value, onChange, multiline, ...rest }) {
  return (
    <View style={{ gap: 5 }}>
      <Label c={c}>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholderTextColor={c.inkFaint}
        style={[
          styles.input,
          { color: c.ink, borderColor: c.rule, backgroundColor: c.plate },
          multiline && { height: 78, textAlignVertical: 'top' },
        ]}
        {...rest}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  small: { fontFamily: mono, fontSize: 11.5, lineHeight: 17 },
  line: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  label: { fontFamily: mono, fontSize: 12 },
  detail: { fontFamily: mono, fontSize: 10.5, lineHeight: 15 },
  amt: { fontFamily: mono, fontSize: 12 },
  totals: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  grand: { fontFamily: mono, fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 11, paddingVertical: 10, fontFamily: mono, fontSize: 13 },
  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipChip: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 2, padding: 10, gap: 2 },
  tipPct: { fontFamily: mono, fontSize: 15, fontWeight: '700' },
  tipNote: { fontFamily: mono, fontSize: 9.5, letterSpacing: 0.4 },
  methods: {
    borderWidth: 1, borderRadius: 16, padding: 13, gap: 5,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
  },
  methodsLabel: { fontFamily: sans, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.6, width: '100%' },
  methodsItem: { fontFamily: sans, fontSize: 12.5, marginRight: 12 },
  whatsapp: { fontFamily: sans, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 4 },
})
