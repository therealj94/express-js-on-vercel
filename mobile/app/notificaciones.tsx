import { useEffect } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, BadgeCheck, Bell, Gift, Sparkle, Tag, Wallet, type LucideIcon } from 'lucide-react-native'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { useNotificationsStore, type NotificationKind } from '../src/store/notifications'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  promo: Tag,
  reward: Gift,
  kyc: BadgeCheck,
  welcome: Sparkle,
  wallet: Wallet,
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hours = Math.round(min / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  return `hace ${days} d`
}

export default function Notifications() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const items = useNotificationsStore((s) => s.items)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)

  useEffect(() => {
    const t = setTimeout(markAllRead, 900)
    return () => clearTimeout(t)
  }, [markAllRead])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <AnimatedPressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Notificaciones</Text>
        <View style={{ width: 32 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Bell size={26} color={colors.muted2} />
            <Text style={styles.emptyText}>No tienes notificaciones por ahora.</Text>
          </View>
        ) : (
          <AnimatedScreen fill={false} distance={8} style={{ gap: 10 }}>
            {items.map((n) => {
              const Icon = KIND_ICON[n.kind]
              return (
                <View key={n.id} style={[styles.card, !n.read && styles.cardUnread]}>
                  <View style={[styles.iconWrap, !n.read && styles.iconWrapUnread]}>
                    <Icon size={16} color={n.read ? colors.muted : colors.blue} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.cardTitle}>{n.title}</Text>
                      {!n.read && <View style={styles.dot} />}
                    </View>
                    <Text style={styles.cardBody}>{n.body}</Text>
                    <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
                  </View>
                </View>
              )
            })}
          </AnimatedScreen>
        )}
      </ScrollView>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    content: { padding: 20, paddingBottom: 48 },
    empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
    emptyText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
    card: {
      flexDirection: 'row',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 14,
    },
    cardUnread: { borderColor: colors.blue + '55', backgroundColor: colors.blue + '10' },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapUnread: { backgroundColor: colors.blue + '20' },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 14, flex: 1 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue },
    cardBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
    time: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10.5, marginTop: 6 },
  })
}
