import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, ActivityIndicator, useColorScheme, StyleSheet, BackHandler, Pressable, Animated,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as SystemUI from 'expo-system-ui'

import { light, dark, sans, serif } from './src/theme'
import { getCatalog, getAvailability, getQuote, loadApiUrl } from './src/api'
import { quoteLocally } from './src/pricing'
import { Button, Notice } from './src/components/ui'
import IntroScreen from './src/screens/IntroScreen'
import AuthScreen from './src/screens/AuthScreen'
import FleetScreen from './src/screens/FleetScreen'
import ExperienceScreen from './src/screens/ExperienceScreen'
import DateScreen from './src/screens/DateScreen'
import CheckoutScreen from './src/screens/CheckoutScreen'
import BookingScreen, { remember } from './src/screens/BookingScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import { spanDates } from './src/components/Calendar'
import { LOADING_LINES } from './src/fun'
import { loadAccount, hasSeenIntro, markIntroSeen, signOut } from './src/account'

const emptyCart = {
  vesselId: null, date: '', nights: 0, guests: 2,
  items: [], bundleIds: [], couponCode: '', occasion: '', tipPct: 0,
}

// The experience screen needs a running total before any date exists — the
// price of the day does not depend on which day it is. A placeholder date
// keeps the pricing mirror happy until the real one is picked.
const PLACEHOLDER_DATE = '2099-01-01'

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

  // Before the app there is an arrival: the drone footage and the pitch, then
  // a door. `phase` is that. It is separate from `screen` because the intro is
  // not a place you navigate to — it is what happens once.
  const [phase, setPhase] = useState('boot')
  const [account, setAccount] = useState(null)

  // Every screen change slides in — an app moves, a page repaints.
  const enter = useRef(new Animated.Value(1)).current
  useEffect(() => {
    enter.setValue(0)
    Animated.spring(enter, { toValue: 1, friction: 9, tension: 60, useNativeDriver: true }).start()
  }, [screen, enter])

  useEffect(() => { SystemUI.setBackgroundColorAsync(c.deep) }, [c])

  const load = useCallback(async () => {
    setLoadError('')
    try {
      await loadApiUrl()
      setCatalog(await getCatalog())
    } catch (err) {
      setLoadError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    (async () => {
      const [saved, seen] = await Promise.all([loadAccount(), hasSeenIntro()])
      setAccount(saved)
      setPhase(!seen ? 'intro' : saved ? 'app' : 'auth')
    })()
  }, [])

  async function introDone() {
    await markIntroSeen()
    setPhase(account ? 'app' : 'auth')
  }

  useEffect(() => {
    const back = {
      experience: 'fleet', date: 'experience', checkout: 'date',
      booking: 'fleet', settings: 'fleet',
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (back[screen]) { setScreen(back[screen]); return true }
      return false
    })
    return () => sub.remove()
  }, [screen])

  const vessel = useMemo(
    () => catalog?.vessels.find((v) => v.id === cart.vesselId) || null,
    [catalog, cart.vesselId],
  )

  // The number on the tray while the guest is still packing. Always local,
  // always instant — the server confirms once a date exists.
  const runningTotal = useMemo(() => {
    if (!catalog || !cart.vesselId) return 0
    const est = quoteLocally(catalog, { ...cart, date: cart.date || PLACEHOLDER_DATE })
    return est ? est.total : 0
  }, [catalog, cart])

  // The authoritative quote, once there is a real date to price.
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
        if (err.offline) {
          setQuote(quoteLocally(catalog, cart))
          setQuoteError('')
          return
        }
        if (err.field !== 'couponCode') setQuote(null)
        setQuoteError(err.message)
      }
    }, 180)
    return () => clearTimeout(t)
  }, [cart, catalog])

  async function pickVessel(v) {
    const nights = v.priceUnit === 'per_night' ? Math.max(v.minNights, cart.nights || v.minNights) : 0
    let taken = new Set()
    try {
      const { unavailable: days } = await getAvailability(v.id)
      taken = new Set(days)
    } catch { /* offline: every date shows open, the crew confirms */ }
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
    setScreen('experience')
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

  // The intro and the door come first, and the catalogue loads behind them —
  // by the time anyone has read the pitch, the fleet is ready.
  if (phase === 'boot') {
    return (
      <View style={{ flex: 1, backgroundColor: c.deep, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.signal} />
      </View>
    )
  }
  if (phase === 'intro') {
    return (
      <>
        <StatusBar style="light" />
        <IntroScreen c={c} insets={insets} onDone={introDone} />
      </>
    )
  }
  if (phase === 'auth') {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen
          c={c}
          insets={insets}
          onDone={(a) => { setAccount(a); setPhase('app') }}
        />
      </>
    )
  }

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
        <ActivityIndicator size="large" color={c.signal} />
        <LoadingLine c={c} />
      </Centered>
    )
  }

  const screenProps = { c, catalog, cart, vessel, insets, runningTotal }

  return (
    <View style={{ flex: 1, backgroundColor: screen === 'fleet' ? c.deep : c.chart }}>
      <StatusBar style={screen === 'fleet' || scheme === 'dark' ? 'light' : 'dark'} />

      {catalog.source === 'bundled' && screen === 'fleet' && (
        <Pressable
          onPress={() => setScreen('settings')}
          style={[styles.demoBadge, { top: insets.top + 6, backgroundColor: c.signal }]}
        >
          <Text style={styles.demoBadgeText}>DEMO</Text>
        </Pressable>
      )}

      <Animated.View
        style={{
          flex: 1,
          opacity: enter,
          transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [56, 0] }) }],
        }}
      >
        {screen === 'fleet' && (
          <FleetScreen
            {...screenProps}
            onOccasion={chooseOccasion}
            onPickVessel={pickVessel}
            onMyBooking={() => { setBookedRef(null); setScreen('booking') }}
            onSettings={() => setScreen('settings')}
          />
        )}

        {screen === 'experience' && (
          <ExperienceScreen
            {...screenProps}
            onToggleExtra={toggleExtra}
            onToggleBundle={toggleBundle}
            onContinue={() => setScreen('date')}
            onBack={() => setScreen('fleet')}
          />
        )}

        {screen === 'date' && (
          <DateScreen
            {...screenProps}
            unavailable={unavailable}
            onPickDate={(date) => setCart((p) => ({ ...p, date }))}
            onGuests={(guests) => setCart((p) => ({ ...p, guests }))}
            onNights={(nights) => setCart((p) => ({ ...p, nights }))}
            onContinue={() => setScreen('checkout')}
            onBack={() => setScreen('experience')}
          />
        )}

        {screen === 'checkout' && quote && (
          <CheckoutScreen
            {...screenProps}
            quote={quote} settings={catalog.settings} account={account}
            onTip={(tipPct) => setCart((p) => ({ ...p, tipPct }))}
            onBack={() => setScreen('date')}
            onBooked={async (ref) => {
              setCart(emptyCart)
              setQuote(null)
              if (!ref) { setScreen('fleet'); return }
              await remember(ref)
              setBookedRef(ref)
              setScreen('booking')
            }}
          />
        )}

        {screen === 'checkout' && !quote && (
          <Centered c={c} insets={insets}>
            <ActivityIndicator color={c.signal} />
            <Text style={{ fontFamily: sans, fontSize: 13, color: c.inkFaint }}>
              {quoteError || 'Pricing your day…'}
            </Text>
            <Button c={c} ghost onPress={() => setScreen('date')}>Back</Button>
          </Centered>
        )}

        {screen === 'booking' && (
          <BookingScreen
            c={c} initialRef={bookedRef} celebrate={Boolean(bookedRef)}
            settings={catalog.settings} insets={insets}
            onBack={() => setScreen('fleet')}
          />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            c={c} catalog={catalog} insets={insets} account={account}
            onSaved={async () => { setCatalog(null); await load(); setScreen('fleet') }}
            onReplayIntro={() => setPhase('intro')}
            onSignOut={async () => { await signOut(); setAccount(null); setPhase('auth') }}
          />
        )}
      </Animated.View>
    </View>
  )
}

/** A slow carousel of crew excuses while the fleet loads. */
function LoadingLine({ c }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 1400)
    return () => clearInterval(t)
  }, [])
  return (
    <Text style={{ fontFamily: sans, fontSize: 14, color: c.inkFaint }}>
      {LOADING_LINES[i % LOADING_LINES.length]}
    </Text>
  )
}

const Centered = ({ c, insets, children }) => (
  <View
    style={[
      styles.centered,
      { backgroundColor: c.chart, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
    ]}
  >
    <Text style={{ fontFamily: serif, fontSize: 24, color: c.ink }}>Love Cloud Roatán</Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  demoBadge: {
    position: 'absolute', alignSelf: 'center', zIndex: 10,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4,
  },
  demoBadgeText: { fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 2, color: '#fff' },
})
