import React, { useState } from 'react'
import {
  View, Text, ScrollView, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Linking,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Haptics from 'expo-haptics'
import { mono, serif, money } from '../theme'
import { createBooking } from '../api'
import { requestMessage } from '../pricing'
import { Plate, Label, Button, Notice, Serif } from '../components/ui'
import { spanDates } from '../components/Calendar'

export default function CheckoutScreen({ c, cart, quote, settings, onBooked, insets }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', occasion: '', notes: '' })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const fmt = (d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
  const span = spanDates(quote.date, quote.nights)

  async function pay(payNow) {
    setError('')
    setBusy(payNow)
    try {
      const result = await createBooking({ ...cart, payNow, customer: form })
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
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.chart }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Label c={c} signal>Plate 04 — Review &amp; pay</Label>
          <Serif c={c} size={21}>Everything before you commit</Serif>
        </View>

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
            <View style={styles.line}>
              <Text style={[styles.grand, { color: c.ink }]}>Total</Text>
              <Text style={[styles.grand, { color: c.ink }]}>{money(quote.total, quote.currency)}</Text>
            </View>
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
          <>
            <Notice c={c} tone="shoal">
              This total is an estimate worked out on your phone — we are not connected to the
              booking office right now. Send it over and the crew confirms the price and the date.
            </Notice>
            <Button c={c} onPress={sendByWhatsApp}>Send the request on WhatsApp</Button>
          </>
        ) : (
          <>
            <Button c={c} busy={busy === 'deposit'} disabled={Boolean(busy)} onPress={() => pay('deposit')}>
              Pay {money(quote.deposit, quote.currency)} deposit
            </Button>
            <Button c={c} ghost busy={busy === 'full'} disabled={Boolean(busy)} onPress={() => pay('full')}>
              Pay {money(quote.total, quote.currency)} in full
            </Button>
          </>
        )}

        <Text style={[styles.small, { color: c.inkFaint }]}>{settings.cancellationPolicy}</Text>
      </ScrollView>
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
})
