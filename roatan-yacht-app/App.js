import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, ActivityIndicator, useColorScheme, StyleSheet, BackHandler, Pressable,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as SystemUI from 'expo-system-ui'

import { light, dark, mono, serif } from './src/theme'
import { getCatalog, getAvailability, getQuote } from './src/api'
import { Button, Notice } from './src/components/ui'
import FleetScreen from './src/screens/FleetScreen'
import BuildScreen from './src/screens/BuildScreen'
import CheckoutScreen from './src/screens/CheckoutScreen'
import BookingScreen, { remember } from './src/screens/BookingScreen'
import { spanDates } from './src/components/Calendar'

const emptyCart = {
  vesselId: null, date: '', nights: 0, guests: 2,
  items: [], bundleIds: [], couponCode: '', occasion: '',
}

function Shell() {
  const scheme = useColorScheme()
  const c = scheme === 'dark' ? dark : light
  const insets = useSafeAreaInsets()

  const [screen, setScreen] = useState('fleet')
  const [catalog, setCatalog] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [cart, setCart] = useState(emptyCart)
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [unavailable, setUnavailable] = useState(new Set())
  const [bookedRef, setBookedRef] = useState(null)
  const quoteSeq = useRef(0)

  useEffect(() => { SystemUI.setBackgroundColorAsync(c.chart) }, [c])

  const load = useCallback(async () => {
    setLoadError('')
    try {
      setCatalog(await getCatalog())
    } catch (err) {
      setLoadError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Android's back button is a real navigation control, not decoration.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'build') { setScreen('fleet'); return true }
      if (screen === 'checkout') { setScreen('build'); return true }
      if (screen === 'booking') { setScreen('fleet'); return true }
      return false
    })
    return () => sub.remove()
  }, [screen])

  const vessel = useMemo(
    () => catalog?.vessels.find((v) => v.id === cart.vesselId) || null,
    [catalog, cart.vesselId],
  )

  // Prices are never computed here. The phone shows what the server says the
  // trip costs, so a rebuilt APK can never disagree with the till.
  useEffect(() => {
    if (!cart.vesselId || !cart.date || !cart.guests) {
      setQuote(null)
      return
    }
    const seq = ++quoteSeq.current
    const t = setTimeout(async () => {
      try {
        const { quote: q } = await getQuote(cart)
        if (seq === quoteSeq.current) { setQuote(q); setQuoteError('') }
      } catch (err) {
        if (seq !== quoteSeq.current) return
        // A bad promo code should not wipe the boat they just loaded.
        if (err.field !== 'couponCode') setQuote(null)
        setQuoteError(err.message)
      }
    }, 180)
    return () => clearTimeout(t)
  }, [cart])

  async function pickVessel(v) {
    const nights = v.priceUnit === 'per_night' ? Math.max(v.minNights, cart.nights || v.minNights) : 0
    let taken = new Set()
    try {
      const { unavailable: days } = await getAvailability(v.id)
      taken = new Set(days)
    } catch { /* an empty calendar is better than a blocked one */ }
    setUnavailable(taken)

    const keepDate =
      cart.date && spanDates(cart.date, nights).every((d) => !taken.has(d)) ? cart.date : ''

    setCart((prev) => ({
      ...prev,
      vesselId: v.id,
      nights,
      guests: Math.min(Math.max(prev.guests, v.capacityMin), v.capacityMax),
      date: keepDate,
    }))
    setScreen('build')
  }

  function chooseOccasion(o) {
    setCart((prev) => {
      const bundleIds = o.bundle && !prev.bundleIds.includes(o.bundle)
        ? [...prev.bundleIds, o.bundle]
        : prev.bundleIds
      const items = [...prev.items]
      for (const id of o.extras || []) {
        if (!items.some((i) => i.extraId === id)) items.push({ extraId: id, qty: 1 })
      }
      return { ...prev, occasion: o.id, bundleIds, items }
    })
  }

  const toggleExtra = (extraId) =>
    setCart((prev) => ({
      ...prev,
      items: prev.items.some((i) => i.extraId === extraId)
        ? prev.items.filter((i) => i.extraId !== extraId)
        : [...prev.items, { extraId, qty: 1 }],
    }))

  const toggleBundle = (id) =>
    setCart((prev) => ({
      ...prev,
      bundleIds: prev.bundleIds.includes(id)
        ? prev.bundleIds.filter((b) => b !== id)
        : [...prev.bundleIds, id],
    }))

  const setQty = (extraId, qty) =>
    setCart((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.extraId === extraId ? { ...i, qty: Math.max(1, qty) } : i)),
    }))

  if (loadError) {
    return (
      <Centered c={c} insets={insets}>
        <Notice c={c}>{`We could not reach the marina office.\n\n${loadError}`}</Notice>
        <Button c={c} onPress={load}>Try again</Button>
      </Centered>
    )
  }
  if (!catalog) {
    return (
      <Centered c={c} insets={insets}>
        <ActivityIndicator color={c.signal} />
        <Text style={{ fontFamily: mono, fontSize: 12, color: c.inkFaint }}>Loading the fleet…</Text>
      </Centered>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.chart }}>
      <StatusBar style={screen === 'fleet' ? 'light' : scheme === 'dark' ? 'light' : 'dark'} />

      {screen !== 'fleet' && (
        <View style={[styles.bar, { backgroundColor: c.deep, paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => setScreen(screen === 'checkout' ? 'build' : 'fleet')}
            hitSlop={12}
          >
            <Text style={[styles.back, { color: c.onDeepSoft }]}>← Back</Text>
          </Pressable>
          <Text style={[styles.brand, { color: c.onDeep }]}>Roatán Yacht Getaways</Text>
        </View>
      )}

      {screen === 'fleet' && (
        <FleetScreen
          c={c} catalog={catalog} cart={cart} insets={insets}
          onOccasion={chooseOccasion}
          onPickVessel={pickVessel}
        />
      )}

      {screen === 'build' && (
        <BuildScreen
          c={c} catalog={catalog} cart={cart} quote={quote} quoteError={quoteError}
          unavailable={unavailable} vessel={vessel} insets={insets}
          onPickDate={(date) => setCart((p) => ({ ...p, date }))}
          onGuests={(guests) => setCart((p) => ({ ...p, guests }))}
          onNights={(nights) => setCart((p) => ({ ...p, nights }))}
          onToggleExtra={toggleExtra}
          onToggleBundle={toggleBundle}
          onQty={setQty}
          onCoupon={(couponCode) => setCart((p) => ({ ...p, couponCode }))}
          onCheckout={() => setScreen('checkout')}
        />
      )}

      {screen === 'checkout' && quote && (
        <CheckoutScreen
          c={c} cart={cart} quote={quote} settings={catalog.settings} insets={insets}
          onBooked={async (ref) => {
            await remember(ref)
            setBookedRef(ref)
            setCart(emptyCart)
            setQuote(null)
            setScreen('booking')
          }}
        />
      )}

      {screen === 'booking' && (
        <BookingScreen c={c} initialRef={bookedRef} settings={catalog.settings} insets={insets} />
      )}

      {screen === 'fleet' && (
        <Pressable
          onPress={() => { setBookedRef(null); setScreen('booking') }}
          style={[styles.fab, { backgroundColor: c.deep, bottom: insets.bottom + 16 }]}
        >
          <Text style={[styles.fabText, { color: c.onDeep }]}>My booking</Text>
        </Pressable>
      )}
    </View>
  )
}

const Centered = ({ c, insets, children }) => (
  <View
    style={[
      styles.centered,
      { backgroundColor: c.chart, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
    ]}
  >
    <Text style={{ fontFamily: serif, fontSize: 22, color: c.ink }}>Roatán Yacht Getaways</Text>
    {children}
  </View>
)

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  back: { fontFamily: mono, fontSize: 12, letterSpacing: 1.2 },
  brand: { fontFamily: serif, fontSize: 14, flexShrink: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  fab: {
    position: 'absolute', right: 16,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 2,
  },
  fabText: { fontFamily: mono, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
})
