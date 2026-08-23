import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, Pressable, TextInput, StyleSheet, Animated, Image,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { serif, sans } from '../theme'
import { INTRO_VIDEO, INTRO_STILL } from '../images'
import { register, signIn, continueAsGuest } from '../account'
import { Tap } from '../components/ui'
import { play } from '../sound'

// The sign-in card floats on the water rather than covering it: the video keeps
// running behind frosted glass, the boat stays visible above the card, and the
// card itself only occupies the bottom half of the screen. Nobody signs in to
// a grey form when they could sign in to the Caribbean.

export default function AuthScreen({ c, insets, onDone }) {
  const [mode, setMode] = useState('register')
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const rise = useRef(new Animated.Value(0)).current

  const player = useVideoPlayer(INTRO_VIDEO, (p) => {
    p.loop = true
    p.muted = true
    p.play()
  })

  useEffect(() => {
    Animated.spring(rise, { toValue: 1, friction: 9, tension: 46, useNativeDriver: true }).start()
  }, [rise])

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const account = mode === 'register' ? await register(form) : await signIn(form)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      play('aboard')
      onDone(account)
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function guest() {
    Haptics.selectionAsync()
    onDone(await continueAsGuest())
  }

  return (
    <View style={styles.root}>
      <Image source={INTRO_STILL} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        surfaceType="textureView"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      <LinearGradient
        colors={['rgba(2,13,18,0.62)', 'rgba(2,13,18,0.06)', 'rgba(2,13,18,0.55)']}
        locations={[0, 0.34, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.head, { paddingTop: insets.top + 26 }]}>
            <Text style={styles.brand}>LOVE CLOUD ROATÁN</Text>
            <Text style={styles.headline}>Your boat is{'\n'}already floating.</Text>
          </View>

          <Animated.View
            style={{
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 18,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) }],
              opacity: rise,
            }}
          >
            <BlurView intensity={38} tint="dark" style={styles.card}>
              <View style={styles.switch}>
                {[['register', 'Create account'], ['signin', 'Sign in']].map(([id, txt]) => {
                  const on = mode === id
                  return (
                    <Tap
                      key={id}
                      flex
                      onPress={() => { setMode(id); setError('') }}
                      style={[styles.switchBtn, on && { backgroundColor: c.signal }]}
                    >
                      <Text style={[styles.switchText, { opacity: on ? 1 : 0.7 }]}>{txt}</Text>
                    </Tap>
                  )
                })}
              </View>

              {mode === 'register' ? (
                <Field label="Your name" value={form.name} onChange={set('name')} autoComplete="name" />
              ) : null}
              <Field
                label="Email" value={form.email} onChange={set('email')}
                keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              />
              {mode === 'register' ? (
                <Field
                  label="WhatsApp (so the captain can find you)"
                  value={form.phone} onChange={set('phone')} keyboardType="phone-pad"
                />
              ) : null}

              {error ? <Text style={[styles.error, { color: '#FFC4DC' }]}>{error}</Text> : null}

              <Tap
                disabled={busy}
                haptic="medium"
                onPress={submit}
                style={[styles.cta, { backgroundColor: c.signal }]}
              >
                <Text style={styles.ctaText}>
                  {mode === 'register' ? 'Create my account  →' : 'Sign me in  →'}
                </Text>
              </Tap>

              <Tap onPress={guest} hitSlop={10}>
                <Text style={styles.ghost}>Just let me look around  ·  continue as guest</Text>
              </Tap>

              <Text style={styles.fine}>
                No password, no spam, no newsletter about our journey as a brand. We keep your name
                so the crew can shout it across a dock.
              </Text>
            </BlurView>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor="rgba(255,255,255,0.45)"
        style={styles.input}
        {...rest}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#031A24' },
  head: { paddingHorizontal: 26, gap: 10 },
  brand: { fontFamily: sans, fontSize: 10.5, fontWeight: '800', letterSpacing: 4, color: 'rgba(255,255,255,0.85)' },
  headline: { fontFamily: serif, fontSize: 31, lineHeight: 36, color: '#fff', letterSpacing: -0.7 },
  card: {
    borderRadius: 30, padding: 20, gap: 14, overflow: 'hidden',
    backgroundColor: 'rgba(3,26,36,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  switch: {
    flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  switchBtn: { borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  switchText: { fontFamily: sans, fontSize: 13.5, fontWeight: '700', color: '#fff' },
  label: { fontFamily: sans, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.6, color: 'rgba(255,255,255,0.7)' },
  input: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14, paddingVertical: 13,
    fontFamily: sans, fontSize: 15, color: '#fff',
  },
  error: { fontFamily: sans, fontSize: 12.5, lineHeight: 18 },
  cta: { borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginTop: 2 },
  ctaText: { fontFamily: sans, fontSize: 15.5, fontWeight: '800', color: '#fff' },
  ghost: {
    fontFamily: sans, fontSize: 13, fontWeight: '600', textAlign: 'center',
    color: 'rgba(255,255,255,0.85)', paddingVertical: 4,
  },
  fine: { fontFamily: sans, fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
})
