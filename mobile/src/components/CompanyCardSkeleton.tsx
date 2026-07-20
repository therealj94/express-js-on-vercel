import { StyleSheet, View } from 'react-native'
import { radius } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { Skeleton } from './ui/Skeleton'

export function CompanyCardSkeleton() {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  return (
    <View style={styles.card}>
      <Skeleton width="100%" height={168} round="sm" style={{ borderRadius: 0 }} />
      <View style={styles.footer}>
        <Skeleton width={90} height={22} round="full" />
        <Skeleton width={70} height={22} round="full" />
      </View>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    footer: { flexDirection: 'row', gap: 8, padding: 14 },
  })
}
