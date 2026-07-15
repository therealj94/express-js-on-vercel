import { useCallback, useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { useFonts, Sora_500Medium, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter'
import { AnimatedSplash } from '../src/components/AnimatedSplash'
import { useAuthStore } from '../src/store/auth'
import { useMetaStore } from '../src/store/meta'
import { colors } from '../src/lib/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  })
  const [introDone, setIntroDone] = useState(false)
  const init = useAuthStore((s) => s.init)
  const loadMeta = useMetaStore((s) => s.load)

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {})
      init()
      loadMeta()
    }
  }, [fontsLoaded, init, loadMeta])

  const handleIntroDone = useCallback(() => setIntroDone(true), [])

  if (!fontsLoaded) return null

  if (!introDone) {
    return <AnimatedSplash onDone={handleIntroDone} />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="negocio/[id]" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="registro" options={{ presentation: 'modal' }} />
        <Stack.Screen name="registrar-empresa" />
        <Stack.Screen name="mi-empresa" />
      </Stack>
    </GestureHandlerRootView>
  )
}
