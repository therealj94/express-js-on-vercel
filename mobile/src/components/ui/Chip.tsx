import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { fonts, radius } from '../../lib/theme'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'

export function Chip({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  return (
    <View style={[styles.chip, style]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceHi,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    label: {
      color: colors.muted,
      fontFamily: fonts.bodySemiBold,
      fontSize: 11,
    },
  })
}
