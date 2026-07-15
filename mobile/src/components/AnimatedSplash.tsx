import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fonts, gradient } from '../lib/theme'

const DURATION = 1500

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current
  const enter = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start()

    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      setTimeout(onDone, 200)
    })
  }, [])

  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] })
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.6] })
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] })
  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <View style={styles.container}>
      <View style={[styles.glow, { backgroundColor: colors.violet }]} />
      <Animated.View style={{ opacity: enter, transform: [{ scale }, { translateY }], alignItems: 'center' }}>
        <View style={styles.logoWrap}>
          <Animated.View
            style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
          />
          <Image source={require('../../assets/logo.jpg')} style={styles.logo} resizeMode="cover" />
        </View>

        <View style={styles.barTrack}>
          <Animated.View style={{ width: barWidth, height: '100%' }}>
            <LinearGradient
              colors={gradient as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1, borderRadius: 999 }}
            />
          </Animated.View>
        </View>
        <Text style={styles.caption}>SISTEMA FINANCIERO SOCIAL</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    opacity: 0.18,
    top: '20%',
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  logo: {
    width: 168,
    height: 50,
    borderRadius: 10,
  },
  barTrack: {
    width: 200,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  caption: {
    marginTop: 12,
    color: colors.muted2,
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 2,
  },
})
