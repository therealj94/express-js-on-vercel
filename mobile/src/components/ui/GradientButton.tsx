import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fonts, gradient, radius } from '../../lib/theme'

interface Props {
  label: string
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  variant?: 'primary' | 'ghost'
  style?: StyleProp<ViewStyle>
}

export function GradientButton({ label, onPress, disabled, loading, icon, variant = 'primary', style }: Props) {
  const isDisabled = disabled || loading

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [styles.ghost, isDisabled && styles.disabled, pressed && styles.pressed, style]}
      >
        {loading ? <ActivityIndicator color={colors.text} /> : icon}
        <Text style={styles.ghostLabel}>{label}</Text>
      </Pressable>
    )
  }

  return (
    <Pressable onPress={onPress} disabled={isDisabled} style={({ pressed }) => [isDisabled && styles.disabled, pressed && styles.pressed, style]}>
      <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
        {loading ? <ActivityIndicator color={colors.bg} /> : icon}
        <Text style={styles.primaryLabel}>{label}</Text>
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  primaryLabel: {
    color: colors.bg,
    fontFamily: fonts.displayMedium,
    fontSize: 15,
  },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ghostLabel: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 15,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
})

interface RowProps {
  children: React.ReactNode
}
export function ButtonRow({ children }: RowProps) {
  return <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>
}
