import React, { useEffect, useRef } from 'react'
import { View, Animated, Easing, Dimensions, StyleSheet } from 'react-native'

// Celebration without a dependency: forty little pieces of the brand palette
// falling once, then gone. Pure Animated on the native driver, so it costs
// nothing while it is not running and nothing much while it is.
const COLORS = ['#B4246B', '#17607E', '#1F6B4F', '#E4A33C', '#E4EDEC']
const COUNT = 40

// A tiny deterministic generator — enough chaos for confetti, no Math.random
// so a given burst always looks the same in tests.
const rng = (seed) => () => {
  seed = (seed * 9301 + 49297) % 233280
  return seed / 233280
}

export default function Confetti({ burst = 1 }) {
  const { width, height } = Dimensions.get('window')
  const progress = useRef(new Animated.Value(0)).current

  const pieces = useRef(null)
  if (!pieces.current) {
    const rand = rng(42)
    pieces.current = Array.from({ length: COUNT }, (_, i) => ({
      x: rand() * width,
      drift: (rand() - 0.5) * 120,
      delay: rand() * 0.25,
      size: 6 + rand() * 7,
      spin: rand() > 0.5 ? 1 : -1,
      color: COLORS[i % COLORS.length],
      round: rand() > 0.6,
    }))
  }

  useEffect(() => {
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: 1,
      duration: 2600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }, [burst, progress])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.current.map((p, i) => {
        // Each piece starts above the screen and falls past the bottom,
        // staggered by its delay slice of the shared clock.
        const t = progress.interpolate({
          inputRange: [p.delay, 1],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        })
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: -20,
              width: p.size,
              height: p.size * (p.round ? 1 : 0.55),
              borderRadius: p.round ? p.size / 2 : 1,
              backgroundColor: p.color,
              opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height + 60] }) },
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 540}deg`] }) },
              ],
            }}
          />
        )
      })}
    </View>
  )
}
