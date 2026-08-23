import React, { useRef } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Animated } from 'react-native'
import * as Haptics from 'expo-haptics'
import { mono, serif, sans, shadow } from '../theme'
import { play } from '../sound'

// Anything you can press, presses back.
//
// A flat opacity change reads as a web page. A control that physically dips
// under the thumb, ticks, and springs back reads as an app — and the spring
// on the way up is what makes it feel alive rather than merely animated.
//
// Every interactive surface in the app goes through this, so the feel is
// identical everywhere and there is one place to change it.
const HAPTIC = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  none: () => {},
}

export function Tap({
  children, onPress, onPressIn, style, disabled, flex,
  scaleTo = 0.955, haptic = 'selection', sound = 'tap', ...rest
}) {
  const s = useRef(new Animated.Value(1)).current

  const down = (e) => {
    Animated.spring(s, { toValue: scaleTo, friction: 7, tension: 300, useNativeDriver: true }).start()
    if (!disabled) {
      ;(HAPTIC[haptic] || HAPTIC.selection)()
      if (sound) play(sound)
    }
    onPressIn?.(e)
  }
  const up = () => {
    Animated.spring(s, { toValue: 1, friction: 4.5, tension: 220, useNativeDriver: true }).start()
  }

  // The Pressable is the outer box so `flex` works in a row; the Animated view
  // inside carries the paint, so scaling shrinks the button and not its slot.
  return (
    <Pressable
      onPress={onPress}
      onPressIn={down}
      onPressOut={up}
      disabled={disabled}
      style={flex ? { flex: 1 } : undefined}
      {...rest}
    >
      <Animated.View
        style={[style, { transform: [{ scale: s }] }, disabled && { opacity: 0.45 }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  )
}

export const Plate = ({ c, title, right, children, style }) => (
  <View style={[styles.plate, { backgroundColor: c.plate, borderColor: c.rule }, style]}>
    {(title || right) && (
      <View style={[styles.plateHead, { borderBottomColor: c.rule }]}>
        <Text style={[styles.plateTitle, { color: c.ink }]}>{title}</Text>
        {right}
      </View>
    )}
    <View style={styles.plateBody}>{children}</View>
  </View>
)

export const Label = ({ c, children, signal, style }) => (
  <Text style={[styles.label, { color: signal ? c.signal : c.inkFaint }, style]}>{children}</Text>
)

export const Chip = ({ c, tone = 'shoal', children }) => (
  <View style={[styles.chip, { borderColor: c[tone] }]}>
    <Text style={[styles.chipText, { color: c[tone] }]}>{children}</Text>
  </View>
)

export const Button = ({ c, onPress, children, ghost, disabled, busy, style, haptic, flex }) => (
  <Tap
    onPress={onPress}
    disabled={disabled || busy}
    flex={flex}
    haptic={haptic || (ghost ? 'selection' : 'medium')}
    style={[
      styles.btn,
      ghost
        ? { borderColor: c.rule, backgroundColor: 'transparent' }
        : { backgroundColor: c.signal, borderColor: c.signal },
      style,
    ]}
  >
    {busy ? (
      <ActivityIndicator color={ghost ? c.ink : '#fff'} />
    ) : (
      <Text style={[styles.btnText, { color: ghost ? c.ink : '#fff' }]}>{children}</Text>
    )}
  </Tap>
)

export const Notice = ({ c, tone = 'signal', children }) => (
  <View style={[styles.notice, { backgroundColor: c.sunk, borderLeftColor: c[tone] }]}>
    {typeof children === 'string' ? (
      <Text style={{ color: c.inkSoft, fontFamily: mono, fontSize: 12, lineHeight: 18 }}>{children}</Text>
    ) : (
      children
    )}
  </View>
)

export const Serif = ({ c, children, size = 22, style }) => (
  <Text style={[{ fontFamily: serif, fontSize: size, color: c.ink, letterSpacing: -0.4 }, style]}>
    {children}
  </Text>
)

const styles = StyleSheet.create({
  plate: { borderWidth: 0, borderRadius: 20, ...shadow },
  plateHead: {
    borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  plateTitle: { fontFamily: serif, fontSize: 15, flexShrink: 1 },
  plateBody: { padding: 16, gap: 12 },
  label: { fontFamily: mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
  chip: { borderWidth: 1.2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontFamily: mono, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  btn: {
    borderWidth: 1.5, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontFamily: sans, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  notice: { borderLeftWidth: 3, padding: 13, gap: 4, borderRadius: 12 },
})
