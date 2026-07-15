import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowRight, Compass, Eye, EyeOff, Lock, Mail, X } from 'lucide-react-native'
import { useAuthStore } from '../src/store/auth'
import { TextField } from '../src/components/ui/TextField'
import { GradientButton } from '../src/components/ui/GradientButton'
import { colors, fonts, radius } from '../src/lib/theme'

export default function Login() {
  const router = useRouter()
  const { login, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    clearError()
    setSubmitting(true)
    try {
      await login(email, password)
      router.replace('/(tabs)/panel')
    } catch {
      // error already set in the store
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={require('../assets/hero-people.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={styles.heroOverlay} />
            <SafeAreaView edges={['top']}>
              <Pressable onPress={() => router.back()} style={styles.closeBtn}>
                <X size={18} color={colors.text} />
              </Pressable>
            </SafeAreaView>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Cientos de negocios ya aceptan ORIGEN</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Bienvenido de nuevo</Text>
            <Text style={styles.subtitle}>Inicia sesión para administrar tu negocio afiliado.</Text>

            <View style={{ marginTop: 24, gap: 16 }}>
              <TextField
                label="Correo"
                value={email}
                onChangeText={setEmail}
                placeholder="tucorreo@empresa.com"
                autoCapitalize="none"
                keyboardType="email-address"
                icon={<Mail size={15} color={colors.muted2} />}
              />
              <TextField
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                icon={<Lock size={15} color={colors.muted2} />}
                rightElement={
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                    {showPassword ? <EyeOff size={15} color={colors.muted2} /> : <Eye size={15} color={colors.muted2} />}
                  </Pressable>
                }
              />

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <GradientButton
                label={submitting ? 'Ingresando…' : 'Iniciar sesión'}
                onPress={onSubmit}
                loading={submitting}
                icon={<ArrowRight size={16} color={colors.bg} />}
              />
            </View>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>¿No tienes cuenta?</Text>
              <Pressable onPress={() => router.replace('/registro')}>
                <Text style={styles.footerLink}>Regístrate</Text>
              </Pressable>
            </View>

            <Pressable onPress={() => router.back()} style={styles.guestBtn}>
              <Compass size={15} color={colors.muted} />
              <Text style={styles.guestText}>Continuar como invitado</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { height: 220, backgroundColor: colors.bgSoft, justifyContent: 'space-between' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,8,15,0.45)' },
  closeBtn: {
    marginLeft: 16,
    marginTop: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16,19,31,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { padding: 20 },
  heroTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
  form: { padding: 20 },
  title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 22 },
  subtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, marginTop: 6 },
  errorBox: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '18', borderRadius: radius.sm, padding: 10 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 20 },
  footerText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  footerLink: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  guestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  guestText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 13 },
})
