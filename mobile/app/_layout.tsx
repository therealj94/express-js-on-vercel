import { useCallback, useEffect, useState } from 'react'
import { Stack } from 'expo-router'
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
import { useAuthStore } from '../src/store/auth'
import { useMetaStore } from '../src/store/meta'
import { useThemeStore } from '../src/store/theme'
import { useTheme } from '../src/hooks/useTheme'

SplashScreen.preventAutoHideAsync().catch(() => {})

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
  const init = useAuthStore((s) => s.init)
  const loadMeta = useMetaStore((s) => s.load)
  const { colors, isDark } = useTheme()

  useEffect(() => {
    const unsub = useThemeStore.persist.onFinishHydration(() => setThemeHydrated(true))
    if (useThemeStore.persist.hasHydrated()) setThemeHydrated(true)
    return unsub
  }, [])

  const ready = fontsLoaded && themeHydrated

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {})
      init()
      loadMeta()
    }
  }, [ready, init, loadMeta])

  const handleIntroDone = useCallback(() => setIntroDone(true), [])

  if (!ready) return null

  if (!introDone) {
    return <AnimatedSplash onDone={handleIntroDone} />
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
      </Stack>
    </GestureHandlerRootView>
  )
}
