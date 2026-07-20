import { useRef } from 'react'
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { fonts, radius, shadow } from '../../lib/theme'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'
import { AnimatedPressable } from '../AnimatedPressable'

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
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const isDisabled = disabled || loading
  const shine = useRef(new Animated.Value(0)).current

  function sweep() {
    shine.setValue(0)
    Animated.timing(shine, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }

  if (variant === 'ghost') {
    return (
      <AnimatedPressable
        onPress={onPress}
        disabled={isDisabled}
        scaleTo={0.97}
        style={[styles.ghost, isDisabled && styles.disabled, style]}
      >
        {loading ? <ActivityIndicator color={colors.text} /> : icon}
        <Text style={styles.ghostLabel}>{label}</Text>
      </AnimatedPressable>
    )
  }

  const translateX = shine.interpolate({ inputRange: [0, 1], outputRange: [-260, 260] })

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={sweep}
      disabled={isDisabled}
      scaleTo={0.97}
      style={[!isDisabled && styles.glow, isDisabled && styles.disabled]}
    >
      <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.primary, style]}>
        {/* Sheen that sweeps across on press for a premium tactile feel. */}
        <Animated.View pointerEvents="none" style={[styles.shineWrap, { opacity: shine.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateX }, { rotate: '18deg' }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.45)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shine}
          />
        </Animated.View>
        {loading ? <ActivityIndicator color={colors.bg} /> : icon}
        <Text style={styles.primaryLabel}>{label}</Text>
      </LinearGradient>
    </AnimatedPressable>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    glow: {
      borderRadius: radius.md,
      ...shadow(colors.violet, 'sm'),
    },
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: radius.md,
      paddingVertical: 14,
      paddingHorizontal: 20,
      overflow: 'hidden',
    },
    shineWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    shine: { width: 70, height: 260 },
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
}

interface RowProps {
  children: React.ReactNode
}
export function ButtonRow({ children }: RowProps) {
  return <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>
}
