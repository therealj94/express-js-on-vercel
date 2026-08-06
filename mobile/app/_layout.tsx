import { useCallback, useEffect, useState } from 'react'
import { Stack, useRouter, useRootNavigationState } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import {
  useFonts,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque'
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans'
import { AnimatedSplash } from '../src/components/AnimatedSplash'
import { AvisoActualizacion } from '../src/components/AvisoActualizacion'
import { PantallaError } from '../src/components/PantallaError'
import { Onboarding } from '../src/components/Onboarding'
import { useAuthStore } from '../src/store/auth'
import { useMetaStore } from '../src/store/meta'
import { useThemeStore } from '../src/store/theme'
import { useOnboardingStore } from '../src/store/onboarding'
import { useLockStore } from '../src/store/lock'
import { LockGate } from '../src/components/LockGate'
import { useTheme } from '../src/hooks/useTheme'

SplashScreen.preventAutoHideAsync().catch(() => {})

/**
 * expo-router monta esto cuando una pantalla lanza. Sin él, un error en
 * tiempo de ejecución dejaba la app en negro y sin salida: había que cerrarla
 * a la fuerza justo después de haber transferido dinero.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <PantallaError error={error} retry={retry} />
}

// After the intro splash, if the user isn't signed in, take them to the
// welcome / login screen instead of dropping them straight into the app.
function AuthGate() {
  const router = useRouter()
  const navState = useRootNavigationState()
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const [handled, setHandled] = useState(false)

  useEffect(() => {
    if (!navState?.key || status !== 'ready' || handled) return
    if (!user) {
      setHandled(true)
      router.replace('/login')
    }
  }, [navState?.key, status, user, handled, router])

  return null
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  })
  const [introDone, setIntroDone] = useState(false)
  const [themeHydrated, setThemeHydrated] = useState(useThemeStore.persist.hasHydrated())
  const [onboardingHydrated, setOnboardingHydrated] = useState(useOnboardingStore.persist.hasHydrated())
  const init = useAuthStore((s) => s.init)
  const loadMeta = useMetaStore((s) => s.load)
  const onboardingDone = useOnboardingStore((s) => s.done)
  const setOnboardingDone = useOnboardingStore((s) => s.setDone)
  const { colors, isDark } = useTheme()

  useEffect(() => {
    const unsubTheme = useThemeStore.persist.onFinishHydration(() => setThemeHydrated(true))
    const unsubOnb = useOnboardingStore.persist.onFinishHydration(() => setOnboardingHydrated(true))
    if (useThemeStore.persist.hasHydrated()) setThemeHydrated(true)
    if (useOnboardingStore.persist.hasHydrated()) setOnboardingHydrated(true)
    return () => {
      unsubTheme()
      unsubOnb()
    }
  }, [])

  const ready = fontsLoaded && themeHydrated && onboardingHydrated

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {})
      init()
      loadMeta()
      useLockStore.getState().cargar()
    }
  }, [ready, init, loadMeta])

  const handleIntroDone = useCallback(() => setIntroDone(true), [])

  if (!ready) return null

  if (!introDone) {
    return <AnimatedSplash onDone={handleIntroDone} />
  }

  if (!onboardingDone) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Onboarding onDone={setOnboardingDone} />
      </GestureHandlerRootView>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="negocio/[id]" />
        <Stack.Screen name="login" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="registro" options={{ animation: 'none' }} />
        <Stack.Screen name="registrar-empresa" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="mi-empresa" />
        <Stack.Screen name="pos/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="pos/orden" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="pos/cobro/[id]" />
        <Stack.Screen name="pos/saldo" />
        <Stack.Screen name="pos/retirar" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="pagar/index" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="pagar/[codigo]" />
        <Stack.Screen name="ajustes" />
        <Stack.Screen name="sso" options={{ animation: 'fade' }} />
      </Stack>
      <AuthGate />
      <AvisoActualizacion />
    </GestureHandlerRootView>
  )
}
