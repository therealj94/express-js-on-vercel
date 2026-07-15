import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Compass, LogIn, UserPlus, X } from 'lucide-react-native'
import { AuthSheet, type AuthMode } from '../src/components/AuthSheet'
import { GradientButton } from '../src/components/ui/GradientButton'
import { Logo } from '../src/components/Logo'
import { AnimatedText } from '../src/components/AnimatedText'
import { colors, fonts } from '../src/lib/theme'

export default function Welcome() {
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string; tipo?: string }>()
  const isBusiness = params.tipo === 'negocio'

  const [sheetOpen, setSheetOpen] = useState(params.mode === 'signup' || params.mode === 'login')
  const [mode, setMode] = useState<AuthMode>(params.mode === 'login' ? 'login' : 'signup')

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
    router.replace(businessIntent ? '/registrar-empresa' : '/(tabs)/panel')
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
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <X size={18} color={colors.text} />
        </Pressable>

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
            <Pressable onPress={() => router.back()} style={styles.guestBtn}>
              <Compass size={15} color={colors.muted} />
              <Text style={styles.guestText}>Continuar como invitado</Text>
            </Pressable>
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

const styles = StyleSheet.create({
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
})
