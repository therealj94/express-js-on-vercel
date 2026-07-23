import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Compass, LogIn, Sparkle, UserPlus, X } from 'lucide-react-native'
import { AuthSheet, type AuthMode } from '../src/components/AuthSheet'
import { GradientButton } from '../src/components/ui/GradientButton'
import { Logo } from '../src/components/Logo'
import { AnimatedText } from '../src/components/AnimatedText'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { useAuthStore } from '../src/store/auth'
import { DEMO_SEEDS, DEMO_CLIENT } from '../src/lib/mockApi'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

const DEMO_QUICK = [
  { label: 'Cliente', email: DEMO_CLIENT.email, password: DEMO_CLIENT.password },
  { label: 'Café', email: DEMO_SEEDS[0].user.email, password: DEMO_SEEDS[0].user.password },
  { label: 'Hotel', email: DEMO_SEEDS[1].user.email, password: DEMO_SEEDS[1].user.password },
  { label: 'Gym', email: DEMO_SEEDS[2].user.email, password: DEMO_SEEDS[2].user.password },
  { label: 'Tech', email: DEMO_SEEDS[3].user.email, password: DEMO_SEEDS[3].user.password },
]

export default function Welcome() {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string; tipo?: string }>()
  const isBusiness = params.tipo === 'negocio'

  const [sheetOpen, setSheetOpen] = useState(params.mode === 'signup' || params.mode === 'login')
  const [mode, setMode] = useState<AuthMode>(params.mode === 'login' ? 'login' : 'signup')
  const login = useAuthStore((s) => s.login)
  const [demoLoading, setDemoLoading] = useState<string | null>(null)

  async function quickLogin(d: { label: string; email: string; password: string }) {
    setDemoLoading(d.label)
    try {
      await login(d.email, d.password)
      router.replace('/(tabs)')
    } catch {
      // el error queda visible en el store; no bloquear la pantalla
    } finally {
      setDemoLoading(null)
    }
  }

  useEffect(() => {
    if (params.mode === 'login' || params.mode === 'signup') {
      setMode(params.mode)
      setSheetOpen(true)
    }
  }, [params.mode])

  function openSheet(m: AuthMode) {
    setMode(m)
    setSheetOpen(true)
  }

  function handleAuthenticated(businessIntent: boolean) {
    setSheetOpen(false)
    // Siempre llega al directorio. Registrar una empresa es una opción, no
    // el destino por defecto — salvo que el usuario haya entrado justamente
    // desde el botón "Registrar mi negocio".
    router.replace(businessIntent ? '/registrar-empresa' : '/(tabs)')
  }

  // La pantalla de bienvenida puede ser la primera al abrir la app (sin
  // sesión) o un modal abierto desde el directorio. En ambos casos, salir
  // debe llevar al directorio sin quedar en un callejón sin salida.
  function goToApp() {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={require('../assets/hero-people.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.scrim} />
      <LinearGradient
        colors={['transparent', 'rgba(7,8,15,0.55)', colors.bg]}
        locations={[0, 0.55, 1]}
        style={styles.scrimBottom}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <AnimatedPressable onPress={goToApp} style={styles.closeBtn}>
          <X size={18} color={colors.text} />
        </AnimatedPressable>

        <View style={styles.content}>
          <View style={styles.brandRow}>
            <Logo size="md" shadow />
          </View>

          <AnimatedText style={styles.headline}>Tu ORIGEN, en cada esquina</AnimatedText>
          <Text style={styles.subhead}>
            El mapa vivo de comercios donde tu rendimiento se convierte en experiencia real.
          </Text>

          <View style={styles.actions}>
            <GradientButton label="Iniciar sesión" onPress={() => openSheet('login')} icon={<LogIn size={16} color={colors.bg} />} />
            <GradientButton
              label="Crear cuenta"
              variant="ghost"
              onPress={() => openSheet('signup')}
              icon={<UserPlus size={16} color={colors.text} />}
            />
            <AnimatedPressable onPress={goToApp} style={styles.guestBtn}>
              <Compass size={15} color={colors.muted} />
              <Text style={styles.guestText}>Continuar como invitado</Text>
            </AnimatedPressable>

            <View style={styles.demoBox}>
              <View style={styles.demoHead}>
                <Sparkle size={12} color={colors.cyan} />
                <Text style={styles.demoTitle}>Cuentas demo — entra con un toque</Text>
              </View>
              <View style={styles.demoRow}>
                {DEMO_QUICK.map((d) => (
                  <AnimatedPressable key={d.label} onPress={() => quickLogin(d)} scaleTo={0.93} style={styles.demoChip}>
                    <Text style={styles.demoChipText}>{demoLoading === d.label ? '…' : d.label}</Text>
                  </AnimatedPressable>
                ))}
              </View>
              <Text style={styles.demoHint}>Café, Hotel, Gym y Tech son dueños de negocio con cobros y retiros.</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <AuthSheet
        visible={sheetOpen}
        mode={mode}
        isBusiness={isBusiness}
        onClose={() => setSheetOpen(false)}
        onModeChange={setMode}
        onAuthenticated={handleAuthenticated}
      />
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,6,10,0.35)' },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '68%',
  },
  safe: { flex: 1, justifyContent: 'space-between' },
  closeBtn: {
    marginLeft: 16,
    marginTop: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16,19,31,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 24, paddingBottom: 8 },
  brandRow: { marginBottom: 18 },
  headline: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: 30,
    lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  subhead: {
    color: 'rgba(238,240,247,0.88)',
    fontFamily: fonts.body,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  actions: { marginTop: 28, gap: 10 },
  guestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 12,
  },
  guestText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  demoBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(16,19,31,0.6)',
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
  },
  demoHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  demoTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  demoRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  demoChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  demoChipText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  demoHint: { color: 'rgba(238,240,247,0.6)', fontFamily: fonts.body, fontSize: 10.5, lineHeight: 14 },
  })
}
