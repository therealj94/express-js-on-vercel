import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Gift, LogIn, MapPin, Sparkle } from 'lucide-react-native'
import { api, ApiError } from '../src/lib/api'
import { useAuthStore } from '../src/store/auth'
import type { Redemption, Reward } from '../src/lib/types'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { AnimatedText } from '../src/components/AnimatedText'
import { Card } from '../src/components/ui/Card'
import { GradientButton } from '../src/components/ui/GradientButton'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { fonts, radius, shadow } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'descuento', label: 'Descuentos' },
  { key: 'gratis', label: 'Gratis' },
  { key: 'experiencia', label: 'Experiencias' },
]

export default function Bonos() {
  const router = useRouter()
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const { user } = useAuthStore()
  const [rewards, setRewards] = useState<Reward[]>([])
  const [pointsBalance, setPointsBalance] = useState(0)
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [target, setTarget] = useState<Reward | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    Promise.all([api.listRewards(), api.myRewardsState()])
      .then(([r, s]) => {
        setRewards(r.rewards)
        setPointsBalance(s.pointsBalance)
        setRedemptions(s.redemptions)
      })
      .finally(() => setLoading(false))
  }, [user])

  const filtered = useMemo(() => (filter ? rewards.filter((r) => r.category === filter) : rewards), [rewards, filter])

  async function handleRedeem() {
    if (!target) return
    try {
      const { pointsBalance: newBalance, redemption } = await api.redeemReward(target.id)
      setPointsBalance(newBalance)
      setRedemptions((prev) => [redemption, ...prev])
      setFeedback(`Canjeaste "${target.title}". Muestra tu app en ${target.partnerName} para reclamarlo.`)
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'No se pudo completar el canje')
    } finally {
      setTarget(null)
    }
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SafeAreaView edges={['top']} style={styles.topBar}>
          <AnimatedPressable onPress={() => router.back()} style={styles.iconBtn}>
            <ArrowLeft size={16} color={colors.text} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Bonos y regalos</Text>
          <View style={{ width: 32 }} />
        </SafeAreaView>
        <View style={styles.guestWrap}>
          <Gift size={28} color={colors.muted} />
          <Text style={styles.successTitle}>Inicia sesión para ver tus bonos</Text>
          <Text style={styles.body}>Acumula puntos ORIGEN al gastar en comercios afiliados y canjéalos por premios.</Text>
          <GradientButton
            label="Iniciar sesión"
            onPress={() => router.push('/login')}
            icon={<LogIn size={16} color={colors.bg} />}
            style={{ marginTop: 18, alignSelf: 'stretch' }}
          />
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <AnimatedPressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Bonos y regalos</Text>
        <View style={{ width: 32 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
          <Sparkle size={20} color={colors.bg} />
          <Text style={styles.balanceNumber}>{pointsBalance}</Text>
          <Text style={styles.balanceLabel}>puntos ORIGEN disponibles</Text>
        </LinearGradient>

        <AnimatedText style={styles.sectionTitle}>Canjea por premios</AnimatedText>
        <Text style={styles.sectionSub}>Gana puntos ORIGEN al pagar en comercios afiliados y canjéalos aquí.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <AnimatedPressable
                key={f.key}
                scaleTo={0.94}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && { color: colors.bg }]}>{f.label}</Text>
              </AnimatedPressable>
            )
          })}
        </ScrollView>

        {loading ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.blue} />
          </View>
        ) : (
          <AnimatedScreen fill={false} distance={8} style={{ gap: 12, marginTop: 6 }}>
            {filtered.map((reward) => {
              const affordable = pointsBalance >= reward.pointsCost
              return (
                <Card key={reward.id} style={{ padding: 0, overflow: 'hidden' }}>
                  <Image source={{ uri: reward.imageUrl }} style={styles.rewardImage} />
                  <View style={{ padding: 14 }}>
                    <View style={styles.rewardHeaderRow}>
                      <Text style={styles.rewardTitle}>{reward.title}</Text>
                      <View style={styles.pointsPill}>
                        <Text style={styles.pointsPillText}>{reward.pointsCost} pts</Text>
                      </View>
                    </View>
                    <Text style={styles.rewardDesc}>{reward.description}</Text>
                    <View style={styles.partnerRow}>
                      <MapPin size={11} color={colors.muted2} />
                      <Text style={styles.partnerText}>{reward.partnerName}</Text>
                    </View>
                    <AnimatedPressable
                      scaleTo={0.97}
                      disabled={!affordable}
                      onPress={() => setTarget(reward)}
                      style={[styles.redeemBtn, !affordable && styles.redeemBtnDisabled]}
                    >
                      <Text style={[styles.redeemBtnText, !affordable && { color: colors.muted2 }]}>
                        {affordable ? 'Canjear' : 'Puntos insuficientes'}
                      </Text>
                    </AnimatedPressable>
                  </View>
                </Card>
              )
            })}
          </AnimatedScreen>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={Boolean(target)}
        icon={Gift}
        title="Confirmar canje"
        message={target ? `Vas a canjear "${target.title}" por ${target.pointsCost} puntos ORIGEN.` : ''}
        confirmLabel="Canjear"
        onConfirm={handleRedeem}
        onCancel={() => setTarget(null)}
      />

      <ConfirmDialog
        visible={Boolean(feedback)}
        icon={Gift}
        title="Canje realizado"
        message={feedback ?? ''}
        confirmLabel="Entendido"
        onConfirm={() => setFeedback(null)}
        onCancel={() => setFeedback(null)}
      />
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
    guestWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    successTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 16, textAlign: 'center', marginTop: 14 },
    body: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
    balanceCard: { borderRadius: radius.xl, padding: 20, alignItems: 'center', ...shadow(colors.violet, 'lg') },
    balanceNumber: { color: colors.bg, fontFamily: fonts.displayBold, fontSize: 34, marginTop: 8 },
    balanceLabel: { color: colors.bg, opacity: 0.85, fontFamily: fonts.bodySemiBold, fontSize: 12, marginTop: 2 },
    sectionTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 17, marginTop: 24 },
    sectionSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 4, lineHeight: 18 },
    filterRow: { gap: 8, marginTop: 14, paddingBottom: 4 },
    filterChip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.full,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    filterChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    filterChipText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
    rewardImage: { width: '100%', height: 130 },
    rewardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    rewardTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 14.5, flex: 1 },
    pointsPill: { backgroundColor: colors.surfaceHi, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 },
    pointsPillText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 11 },
    rewardDesc: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
    partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
    partnerText: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11 },
    redeemBtn: {
      marginTop: 12,
      backgroundColor: colors.blue,
      borderRadius: radius.md,
      paddingVertical: 11,
      alignItems: 'center',
    },
    redeemBtnDisabled: { backgroundColor: colors.surfaceHi },
    redeemBtnText: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  })
}
