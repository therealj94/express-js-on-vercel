import React from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { mono, serif } from '../theme'

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

export const Button = ({ c, onPress, children, ghost, disabled, busy, style }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || busy}
    style={({ pressed }) => [
      styles.btn,
      ghost
        ? { borderColor: c.rule, backgroundColor: 'transparent' }
        : { backgroundColor: c.signal, borderColor: c.signal },
      (disabled || busy) && { opacity: 0.45 },
      pressed && { opacity: 0.8 },
      style,
    ]}
  >
    {busy ? (
      <ActivityIndicator color={ghost ? c.ink : '#fff'} />
    ) : (
      <Text style={[styles.btnText, { color: ghost ? c.ink : '#fff' }]}>{children}</Text>
    )}
  </Pressable>
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
  plate: { borderWidth: 1, borderRadius: 2 },
  plateHead: {
    borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 11,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  plateTitle: { fontFamily: serif, fontSize: 15, flexShrink: 1 },
  plateBody: { padding: 14, gap: 12 },
  label: { fontFamily: mono, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
  chip: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  chipText: { fontFamily: mono, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  btn: {
    borderWidth: 1, borderRadius: 2, paddingVertical: 13, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontFamily: mono, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '700' },
  notice: { borderLeftWidth: 2, padding: 12, gap: 4 },
})
