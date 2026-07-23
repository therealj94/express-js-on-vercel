import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowRight,
  Bell,
  Building2,
  Gift,
  IdCard,
  LogIn,
  Sparkle,
  Store,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native'
import { Screen } from '../../src/components/Screen'
import { TopBar } from '../../src/components/TopBar'
import { StatusBadge } from '../../src/components/StatusBadge'
import { AnimatedText } from '../../src/components/AnimatedText'
import { AnimatedScreen } from '../../src/components/AnimatedScreen'
import { Pressable3D } from '../../src/components/Pressable3D'
import { GradientButton } from '../../src/components/ui/GradientButton'
import { api } from '../../src/lib/api'
import type { Company } from '../../src/lib/types'
import { useAuthStore } from '../../src/store/auth'
import { useWalletStore, ORIGEN_USD } from '../../src/store/wallet'
import { useGenesisStore } from '../../src/store/genesis'
import { useNotificationsStore } from '../../src/store/notifications'
import { fonts, radius, shadow } from '../../src/lib/theme'
import { useTheme, type ThemeColors } from '../../src/hooks/useTheme'

interface QuickAction {
  key: string
  label: string
  hint: string
  icon: LucideIcon
  route: string
  tint: 'violet' | 'blue' | 'cyan' | 'ok'
}

export default function Dashboard() {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()
  const { user } = useAuthStore()
  const wallet = useWalletStore((s) => s.wallet)
  const origenBalance = useWalletStore((s) => s.origenBalance)
  const genesisStep = useGenesisStore((s) => s.step)
  const genesisUid = useGenesisStore((s) => s.genesisUid)
  const unread = useNotificationsStore((s) => s.items.filter((n) => !n.read).length)
  const [company, setCompany] = useState<Company | null | undefined>(undefined)
  const [points, setPoints] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    api.myCompany().then(({ company }) => setCompany(company)).catch(() => setCompany(null))
    api.myRewardsState().then((s) => setPoints(s.pointsBalance)).catch(() => {})
  }, [user])

  if (!user) {
    return (
      <Screen edges={['top']}>
        <TopBar title="Mi cuenta" />
        <View style={styles.guestWrap}>
          <Image source={require('../../assets/hero-people.jpg')} style={styles.guestImage} resizeMode="cover" />
          <Text style={styles.guestTitle}>Inicia sesión para tu experiencia MyTokenPay</Text>
          <Text style={styles.guestBody}>
            Gana puntos ORIGEN al comprar en comercios afiliados, canjea premios y conecta tu Veta Wallet.
          </Text>
          <GradientButton
            label="Iniciar sesión"
            onPress={() => router.push('/login')}
            icon={<LogIn size={16} color={colors.bg} />}
            style={{ marginTop: 20, alignSelf: 'stretch' }}
          />
          <Pressable3D onPress={() => router.push('/registro')} style={{ marginTop: 12, padding: 4 }}>
            <Text style={styles.guestLink}>Crear una cuenta nueva</Text>
          </Pressable3D>
        </View>
      </Screen>
    )
  }

  const actions: QuickAction[] = [
    { key: 'bonos', label: 'Bonos y regalos', hint: 'Canjea tus puntos', icon: Gift, route: '/bonos', tint: 'violet' },
    {
      key: 'wallet',
      label: wallet ? 'Mi Veta Wallet' : 'Conectar wallet',
      hint: wallet ? 'Conectada' : 'Recibe tus puntos',
      icon: Wallet,
      route: '/conectar-wallet',
      tint: 'blue',
    },
    {
      key: 'identidad',
      label: 'Genesis ID',
      hint:
        genesisStep === 'done' || user.kyc.status === 'verified'
          ? 'Identidad verificada'
          : genesisStep === 'review24'
            ? 'En revisión (24 h)'
            : genesisStep !== 'email'
              ? 'Continuar donde quedaste'
              : 'Verifícate una sola vez',
      icon: IdCard,
      route: '/verificar-identidad',
      tint: 'cyan',
    },
    {
      key: 'notis',
      label: 'Notificaciones',
      hint: unread > 0 ? `${unread} nuevas` : 'Al día',
      icon: Bell,
      route: '/notificaciones',
      tint: 'ok',
    },
  ]

  return (
    <Screen edges={['top']}>
      <TopBar title="Mi cuenta" />

      <View style={styles.section}>
        <AnimatedText style={styles.hello}>Hola, {user.fullName.split(' ')[0]}</AnimatedText>
        <Text style={styles.subtitle}>Bienvenido de nuevo a MyTokenPay.</Text>
      </View>

      {/* Puntos ORIGEN + wallet */}
      <View style={styles.section}>
        <Pressable3D onPress={() => router.push('/bonos')} tilt={6}>
          <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
            <View style={styles.balanceTop}>
              <Sparkle size={18} color={colors.bg} />
              <View style={styles.walletChip}>
                <Wallet size={11} color={colors.bg} />
                <Text style={styles.walletChipText}>{wallet ? 'Wallet conectada' : 'Sin wallet'}</Text>
              </View>
            </View>
            <Text style={styles.balanceNumber}>{points ?? '—'}</Text>
            <Text style={styles.balanceLabel}>puntos ORIGEN · toca para canjear</Text>
          </LinearGradient>
        </Pressable3D>

        {/* Saldo ORIGEN reflejado desde la Veta Wallet */}
        <Pressable3D onPress={() => router.push('/(tabs)/pagar' as never)} tilt={4} style={{ marginTop: 12 }}>
          <View style={styles.vetaCard}>
            <View style={styles.vetaIcon}>
              <Wallet size={17} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vetaLabel}>Saldo Veta Wallet</Text>
              <Text style={styles.vetaValue}>
                {origenBalance.toLocaleString('es-HN', { maximumFractionDigits: 4 })} ORIGEN
                <Text style={styles.vetaUsd}>  ≈ ${(origenBalance * ORIGEN_USD).toFixed(2)}</Text>
              </Text>
            </View>
            <View style={styles.vetaPayBtn}>
              <Text style={styles.vetaPayText}>Pagar</Text>
              <ArrowRight size={13} color={colors.bg} />
            </View>
          </View>
        </Pressable3D>
      </View>

      {/* Accesos rápidos */}
      <AnimatedScreen animKey="actions" fill={false} distance={8} style={styles.section}>
        <View style={styles.grid}>
          {actions.map((a) => (
            <Pressable3D key={a.key} onPress={() => router.push(a.route as never)} style={styles.tile}>
              <View style={[styles.tileIcon, { backgroundColor: colors[a.tint] + '22' }]}>
                <a.icon size={18} color={colors[a.tint]} />
              </View>
              <Text style={styles.tileLabel}>{a.label}</Text>
              <Text style={styles.tileHint}>{a.hint}</Text>
            </Pressable3D>
          ))}
        </View>
      </AnimatedScreen>

      {/* Estado de identidad */}
      <View style={styles.section}>
        <View style={styles.identityCard}>
          <View style={styles.identityIcon}>
            <IdCard size={18} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.identityTitle}>Genesis ID · identidad del ecosistema</Text>
            <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusBadge status={user.kyc.status} />
              {genesisUid && <Text style={styles.genesisUid}>{genesisUid}</Text>}
            </View>
          </View>
          {user.kyc.status !== 'verified' && (
            <Pressable3D onPress={() => router.push('/verificar-identidad')} style={styles.identityBtn}>
              <ArrowRight size={16} color={colors.text} />
            </Pressable3D>
          )}
        </View>
      </View>

      {/* Negocio: una opción, no lo principal */}
      <View style={[styles.section, { marginBottom: 12 }]}>
        <Text style={styles.blockTitle}>Para negocios</Text>
        {company === undefined ? (
          <View style={styles.skeleton} />
        ) : company ? (
          <Pressable3D onPress={() => router.push('/negocio-panel')} tilt={6}>
            <View style={styles.companyCard}>
              {company.coverDataUrl ? (
                <Image source={{ uri: company.coverDataUrl }} style={styles.companyCover} />
              ) : (
                <LinearGradient colors={gradient as unknown as string[]} style={styles.companyCover} />
              )}
              <View style={styles.companyOverlay} />
              <View style={styles.companyContent}>
                <View style={styles.companyLogoWrap}>
                  {company.logoDataUrl ? (
                    <Image source={{ uri: company.logoDataUrl }} style={styles.companyLogo} />
                  ) : (
                    <Store size={20} color={colors.bg} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.companyName} numberOfLines={1}>{company.tradeName}</Text>
                  <View style={{ marginTop: 4, flexDirection: 'row' }}>
                    <StatusBadge status={company.kyc.status} />
                  </View>
                </View>
                <ArrowRight size={16} color="#fff" />
              </View>
            </View>
          </Pressable3D>
        ) : (
          <Pressable3D onPress={() => router.push('/registrar-empresa')} tilt={6}>
            <View style={styles.registerCard}>
              <View style={styles.registerIcon}>
                <Building2 size={20} color={colors.violet} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.registerTitle}>¿Tienes un negocio?</Text>
                <Text style={styles.registerBody}>
                  Regístralo gratis, verifícalo y aparece en el directorio para recibir pagos en ORIGEN.
                </Text>
                <View style={styles.registerLinkRow}>
                  <Text style={styles.registerLink}>Registrar mi empresa</Text>
                  <ArrowRight size={13} color={colors.violet} />
                </View>
              </View>
            </View>
          </Pressable3D>
        )}
      </View>
    </Screen>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: { paddingHorizontal: 20, marginTop: 18 },
    hello: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 24 },
    subtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
    skeleton: { height: 120, borderRadius: radius.xl, backgroundColor: colors.surface, marginTop: 12 },

    guestWrap: { paddingHorizontal: 20, marginTop: 12, alignItems: 'center' },
    guestImage: { width: '100%', height: 160, borderRadius: radius.xl },
    guestTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 18, textAlign: 'center', marginTop: 20 },
    guestBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
    guestLink: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },

    balanceCard: { borderRadius: radius.xl, padding: 20, ...shadow(colors.violet, 'lg') },
    balanceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    walletChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(5,6,10,0.18)',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    walletChipText: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 10 },
    balanceNumber: { color: colors.bg, fontFamily: fonts.displayBold, fontSize: 40, marginTop: 12 },
    balanceLabel: { color: colors.bg, opacity: 0.85, fontFamily: fonts.bodySemiBold, fontSize: 12, marginTop: 2 },

    vetaCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.cyan + '35',
      backgroundColor: colors.cyan + '0E',
      borderRadius: radius.lg,
      padding: 14,
    },
    vetaIcon: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: colors.cyan + '1C',
      alignItems: 'center',
      justifyContent: 'center',
    },
    vetaLabel: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 },
    vetaValue: { color: colors.text, fontFamily: fonts.display, fontSize: 15, marginTop: 3 },
    vetaUsd: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5 },
    vetaPayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.cyan,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    vetaPayText: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
    genesisUid: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 10.5, letterSpacing: 0.4 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: {
      width: '47%',
      flexGrow: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 14,
      gap: 8,
    },
    tileIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    tileLabel: { color: colors.text, fontFamily: fonts.display, fontSize: 13.5, marginTop: 2 },
    tileHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },

    identityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 14,
    },
    identityIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.blue + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    identityTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 14 },
    identityBtn: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },

    blockTitle: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },

    companyCard: { borderRadius: radius.xl, overflow: 'hidden', height: 120, ...shadow(colors.bg, 'sm') },
    companyCover: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    companyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,8,15,0.55)' },
    companyContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    companyLogoWrap: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: colors.violet,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    companyLogo: { width: 46, height: 46 },
    companyName: { color: '#fff', fontFamily: fonts.display, fontSize: 16 },

    registerCard: {
      flexDirection: 'row',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: 16,
    },
    registerIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.violet + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    registerTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    registerBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
    registerLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    registerLink: { color: colors.violet, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  })
}
