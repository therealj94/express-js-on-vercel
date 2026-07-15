import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, fonts, radius } from '../../lib/theme'

export function Chip({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.chip, style]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
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
