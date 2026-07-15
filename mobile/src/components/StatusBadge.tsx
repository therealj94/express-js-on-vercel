import { StyleSheet, Text, View } from 'react-native'
import { BadgeCheck, Clock, ShieldAlert, ShieldQuestion, type LucideIcon } from 'lucide-react-native'
import { fonts, radius } from '../lib/theme'
import { useTheme } from '../hooks/useTheme'
import type { KycStatus } from '../lib/types'

export function StatusBadge({ status }: { status: KycStatus }) {
  const { colors } = useTheme()
  const CONFIG: Record<KycStatus, { label: string; color: string; bg: string; icon: LucideIcon }> = {
    verified: { label: 'Verificado', color: colors.ok, bg: '#34d39922', icon: BadgeCheck },
    pending: { label: 'En revisión', color: colors.warn, bg: '#fbbf2422', icon: Clock },
    rejected: { label: 'Rechazado', color: colors.danger, bg: '#f8717122', icon: ShieldAlert },
    unsubmitted: { label: 'Sin verificar', color: colors.muted, bg: '#ffffff11', icon: ShieldQuestion },
  }
  const c = CONFIG[status]
  const Icon = c.icon
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.color + '55' }]}>
      <Icon size={12} color={c.color} strokeWidth={2.25} />
      <Text style={[styles.label, { color: c.color }]}>{c.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
  },
})
