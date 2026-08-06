// ─────────────────────────────────────────────────────────────────────────────
// La puerta del ecosistema: mytokenpay://sso?token=…&email=…
//
// Veta Wallet abre este enlace con un pase de sesión única firmado por
// Genesis ID. Aquí no se decide nada: el pase y el correo se mandan al
// backend, que es quien comprueba con Genesis ID que el pase sea válido y que
// el correo pertenezca a ESA identidad. La pantalla solo cuenta la historia:
// verificando → bienvenida con nombre y GID → adentro.
//
// Si algo falla, se dice claro y se ofrece el camino normal (correo y
// contraseña). Nunca se deja al usuario mirando un spinner eterno.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'
import { BadgeCheck, ShieldCheck, XCircle } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useAuthStore } from '../src/store/auth'
import { useWalletStore } from '../src/store/wallet'
import { Logo } from '../src/components/Logo'
import { GradientButton } from '../src/components/ui/GradientButton'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

const ORO = '#E8B84B'
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })

export default function EntrarConGenesis() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const { loginConGenesis } = useAuthStore()
  const params = useLocalSearchParams<{ token?: string; email?: string; direccion?: string }>()

  const [fase, setFase] = useState<'verificando' | 'listo' | 'error'>('verificando')
  const [detalle, setDetalle] = useState<string | null>(null)
  const [genesis, setGenesis] = useState<{ gid: string; nombre: string | null } | null>(null)
  const intentado = useRef(false)

  useEffect(() => {
    if (intentado.current) return
    intentado.current = true

    const token = typeof params.token === 'string' ? params.token : ''
    const email = typeof params.email === 'string' ? params.email : ''
    if (!token || !email) {
      setFase('error')
      setDetalle('El enlace está incompleto. Abrilo de nuevo desde Veta Wallet.')
      return
    }

    loginConGenesis(token, email)
      .then((g) => {
        setGenesis(g)
        // La billetera queda conectada sola: primero la dirección que Genesis
        // ID tiene registrada de esta identidad; si no hay, la que Veta Wallet
        // mandó en el enlace. Entrar con tu identidad y tener que teclear tu
        // propia dirección sería pedirle dos veces lo mismo a la misma persona.
        const candidata = g.direccion || (typeof params.direccion === 'string' ? params.direccion : '')
        if (/^0x[0-9a-fA-F]{40}$/.test(candidata)) {
          useWalletStore.getState().connect('address', candidata)
        }
        setFase('listo')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        // Un respiro para leer la bienvenida, y adentro.
        setTimeout(() => router.replace('/(tabs)'), 1600)
      })
      .catch((e) => {
        setFase('error')
        setDetalle(e?.message ?? 'No se pudo entrar con Genesis ID')
      })
  }, [params.token, params.email, loginConGenesis, router])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={styles.safe}>
        <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.brand}>
          <Logo size="md" />
        </Animated.View>

        {fase === 'verificando' && (
          <Animated.View entering={FadeInDown.delay(120).springify().damping(16)} style={styles.centro}>
            <View style={[styles.icono, { backgroundColor: ORO + '1c', borderColor: ORO + '44' }]}>
              <ShieldCheck size={30} color={ORO} />
            </View>
            <Text style={styles.titulo}>Verificando tu pase…</Text>
            <Text style={styles.body}>
              Genesis ID está confirmando tu identidad. Un momento.
            </Text>
            <ActivityIndicator color={ORO} style={{ marginTop: 14 }} />
          </Animated.View>
        )}

        {fase === 'listo' && genesis && (
          <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.centro}>
            <View style={[styles.icono, { backgroundColor: colors.ok + '1c', borderColor: colors.ok + '44' }]}>
              <BadgeCheck size={30} color={colors.ok} />
            </View>
            <Text style={styles.titulo}>
              {genesis.nombre ? `Hola, ${genesis.nombre.split(' ')[0]}` : 'Bienvenido'}
            </Text>
            <View style={styles.gidPill}>
              <ShieldCheck size={13} color={ORO} />
              <Text style={styles.gidText}>{genesis.gid}</Text>
            </View>
            <Text style={styles.body}>Identidad verificada por Genesis ID. Entrando…</Text>
          </Animated.View>
        )}

        {fase === 'error' && (
          <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.centro}>
            <View style={[styles.icono, { backgroundColor: colors.danger + '1c', borderColor: colors.danger + '44' }]}>
              <XCircle size={30} color={colors.danger} />
            </View>
            <Text style={styles.titulo}>No se pudo entrar</Text>
            <Text style={styles.body}>{detalle}</Text>
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 18 }}>
              <GradientButton label="Entrar con correo y contraseña" onPress={() => router.replace('/login?mode=login')} />
              <GradientButton label="Ir al directorio" variant="ghost" onPress={() => router.replace('/(tabs)')} />
            </View>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, paddingHorizontal: 28 },
    brand: { alignItems: 'center', marginTop: 48 },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 90 },
    icono: {
      width: 68,
      height: 68,
      borderRadius: radius.lg,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    titulo: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 20, textAlign: 'center' },
    body: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
    gidPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: ORO + '55',
      backgroundColor: ORO + '15',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginVertical: 4,
    },
    gidText: { color: ORO, fontFamily: MONO, fontSize: 13, letterSpacing: 1 },
  })
}
