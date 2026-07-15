import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius } from '../../lib/theme'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}

export function Card({ children, style, onPress }: Props) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    )
  }
  return <View style={[styles.card, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
  },
  pressed: {
    opacity: 0.85,
  },
})
