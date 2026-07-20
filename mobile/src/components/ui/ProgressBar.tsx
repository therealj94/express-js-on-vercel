import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'

export function ProgressBar({ value }: { value: number }) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const scaleX = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(scaleX, {
      toValue: Math.max(0, Math.min(1, value / 100)),
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [value])

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { transform: [{ scaleX }] }]} />
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    track: { height: 8, borderRadius: 999, backgroundColor: colors.surfaceHi, marginTop: 10, overflow: 'hidden' },
    fill: {
      height: '100%',
      width: '100%',
      backgroundColor: colors.blue,
      borderRadius: 999,
      transformOrigin: 'left',
    },
  })
}
