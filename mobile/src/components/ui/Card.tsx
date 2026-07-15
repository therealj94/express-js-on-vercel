import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { radius } from '../../lib/theme'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'
import { AnimatedPressable } from '../AnimatedPressable'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}

export function Card({ children, style, onPress }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)

  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} scaleTo={0.98} style={[styles.card, style]}>
        {children}
      </AnimatedPressable>
    )
  }
  return <View style={[styles.card, style]}>{children}</View>
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
}
