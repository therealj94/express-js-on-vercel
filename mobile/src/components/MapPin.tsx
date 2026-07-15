import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme, type ThemeColors } from '../hooks/useTheme'

export function MapPin() {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  return (
    <View style={styles.wrap}>
      <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pin}>
        <View style={styles.dot} />
      </LinearGradient>
      <View style={styles.tail} />
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { alignItems: 'center' },
    pin: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderTopLeftRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bg },
    tail: {
      width: 2,
      height: 8,
      backgroundColor: colors.bg,
      marginTop: -1,
    },
  })
}
