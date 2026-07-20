import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Compass } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { GradientButton } from '../src/components/ui/GradientButton'
import { Logo } from '../src/components/Logo'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

export default function NotFound() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = createStyles(colors)

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={styles.wrap} edges={['top', 'bottom']}>
        <Logo size="sm" />
        <View style={styles.iconWrap}>
          <Compass size={28} color={colors.muted} />
        </View>
        <Text style={styles.title}>No encontramos esta pantalla</Text>
        <Text style={styles.body}>El enlace que seguiste no existe o ya no está disponible.</Text>
        <GradientButton
          label="Volver al inicio"
          onPress={() => router.replace('/(tabs)')}
          style={{ marginTop: 24, alignSelf: 'stretch' }}
        />
      </SafeAreaView>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 28,
      marginBottom: 18,
    },
    title: { color: colors.text, fontFamily: fonts.display, fontSize: 17, textAlign: 'center' },
    body: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  })
}
