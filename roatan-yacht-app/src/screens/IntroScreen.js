import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, Pressable, StyleSheet, Animated, Image, Easing, Dimensions,
} from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { serif, sans } from '../theme'
import { INTRO_VIDEO, INTRO_STILL } from '../images'
import { Tap } from '../components/ui'

// The first fifteen seconds decide whether anyone books anything. So the app
// does not open on a menu — it opens on the actual water, shot from a drone
// over our own boat, with the pitch arriving one line at a time.
//
// The still sits underneath the video for the whole sequence. If the decoder
// is slow, or the file is missing on some device, the guest sees turquoise
// water instead of a black rectangle and never knows anything went wrong.

const { height: H } = Dimensions.get('window')

const BEATS = [
  {
    at: 0,
    kicker: 'ROATÁN · BAY ISLANDS · HONDURAS',
    line: 'Welcome to your adventure.',
    sub: 'No filter on this water. We checked. Twice. With snorkels.',
  },
  {
    at: 3400,
    kicker: 'THE SECOND-LARGEST REEF ON EARTH',
    line: 'It starts 200 metres offshore.',
    sub: 'Turtles, rays, a wall that drops into the blue — all before lunch.',
  },
  {
    at: 6800,
    kicker: 'AND THAT IS OUR BOAT',
    line: 'The one in the middle of the picture.',
    sub: 'Lobster, champagne, snorkels, flowers, cake, a proposal if you are brave.',
  },
  {
    at: 10000,
    kicker: 'BUILD IT LIKE A PICNIC BASKET',
    line: 'Drag what you want aboard.',
    sub: 'Pick a day. Pay. Then argue about the playlist — the only decision left.',
  },
]

const LAST = BEATS[BEATS.length - 1]

export default function IntroScreen({ c, insets, onDone }) {
  const [beat, setBeat] = useState(0)
  const [ready, setReady] = useState(false)
  const fade = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(0)).current
  const progress = useRef(new Animated.Value(0)).current
  const videoIn = useRef(new Animated.Value(0)).current
  const done = useRef(false)

  const player = useVideoPlayer(INTRO_VIDEO, (p) => {
    p.loop = true
    p.muted = true
    p.play()
  })

  // Cross-fade the video in over the still, so the swap is never a flash.
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(videoIn, { toValue: 1, duration: 700, useNativeDriver: true }).start()
    }, 220)
    return () => clearTimeout(t)
  }, [videoIn])

  // One timer per beat rather than one interval, so a beat can be any length.
  useEffect(() => {
    const timers = BEATS.slice(1).map((b, i) =>
      setTimeout(() => setBeat(i + 1), b.at),
    )
    const finish = setTimeout(() => setReady(true), LAST.at + 2200)
    Animated.timing(progress, {
      toValue: 1,
      duration: LAST.at + 2200,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start()
    return () => { timers.forEach(clearTimeout); clearTimeout(finish) }
  }, [progress])

  // Every beat lands the same way: fade up while sliding a few points.
  useEffect(() => {
    fade.setValue(0)
    rise.setValue(18)
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 620, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
    ]).start()
    if (beat > 0) Haptics.selectionAsync()
  }, [beat, fade, rise])

  function leave() {
    if (done.current) return
    done.current = true
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onDone()
  }

  const b = BEATS[beat]

  return (
    <View style={styles.root}>
      <Image source={INTRO_STILL} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoIn }]}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          surfaceType="textureView"
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      </Animated.View>

      {/* Type needs a dark floor to sit on, but the water has to stay water. */}
      <LinearGradient
        colors={['rgba(2,13,18,0.55)', 'rgba(2,13,18,0.05)', 'rgba(2,13,18,0.72)', 'rgba(2,13,18,0.96)']}
        locations={[0, 0.32, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <View style={styles.ticks}>
          {BEATS.map((x, i) => (
            <View key={x.at} style={[styles.tick, { opacity: i <= beat ? 1 : 0.28 }]} />
          ))}
        </View>
        <Tap onPress={leave} hitSlop={14} style={styles.skip}>
          <Text style={styles.skipText}>Skip</Text>
        </Tap>
      </View>

      <View style={styles.brandWrap}>
        <Text style={styles.brand}>LOVE CLOUD ROATÁN</Text>
      </View>

      <View style={[styles.copy, { paddingBottom: insets.bottom + 30, minHeight: H * 0.42 }]}>
        <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
          <Text style={styles.kicker}>{b.kicker}</Text>
          <Text style={styles.line}>{b.line}</Text>
          <Text style={styles.sub}>{b.sub}</Text>
        </Animated.View>

        <Tap haptic="medium" onPress={leave} style={[styles.cta, { backgroundColor: c.signal }]}>
          <Text style={styles.ctaText}>{ready ? 'Start my adventure  →' : 'Take me aboard  →'}</Text>
        </Tap>

        <View style={styles.barTrack}>
          <Animated.View
            style={[
              styles.barFill,
              {
                backgroundColor: c.signal,
                width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#031A24', justifyContent: 'flex-end' },
  top: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20,
  },
  ticks: { flex: 1, flexDirection: 'row', gap: 5 },
  tick: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#fff' },
  skip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' },
  skipText: { fontFamily: sans, fontSize: 12, fontWeight: '700', color: '#fff' },
  brandWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', marginTop: 64 },
  brand: {
    fontFamily: sans, fontSize: 11, fontWeight: '800', letterSpacing: 4.5,
    color: 'rgba(255,255,255,0.9)',
  },
  copy: { paddingHorizontal: 26, gap: 16, justifyContent: 'flex-end' },
  kicker: { fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 2.4, color: 'rgba(255,255,255,0.72)' },
  line: { fontFamily: serif, fontSize: 34, lineHeight: 39, color: '#fff', letterSpacing: -0.8, marginTop: 8 },
  sub: { fontFamily: sans, fontSize: 14.5, lineHeight: 21, color: 'rgba(255,255,255,0.84)', marginTop: 8 },
  cta: { borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  ctaText: { fontFamily: sans, fontSize: 15.5, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  barTrack: { height: 2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  barFill: { height: 2, borderRadius: 2 },
})
