import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { ArrowRight, Eye, EyeOff, Lock, Mail, User, X } from 'lucide-react-native'
import { useAuthStore } from '../store/auth'
import { TextField } from './ui/TextField'
import { GradientButton } from './ui/GradientButton'
import { colors, fonts, radius } from '../lib/theme'

export type AuthMode = 'login' | 'signup'

interface Props {
  visible: boolean
  mode: AuthMode
  isBusiness?: boolean
  onClose: () => void
  onModeChange: (mode: AuthMode) => void
  onAuthenticated: (isBusiness: boolean) => void
}

export function AuthSheet({ visible, mode, isBusiness, onClose, onModeChange, onAuthenticated }: Props) {
  const { login, signup, error, clearError } = useAuthStore()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const translateY = useRef(new Animated.Value(40)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      clearError()
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start()
    } else {
      translateY.setValue(40)
      opacity.setValue(0)
    }
  }, [visible])

  async function onSubmit() {
    clearError()
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, fullName)
      }
      onAuthenticated(Boolean(isBusiness))
    } catch {
      // error already set in the store
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <Animated.View style={[styles.sheet, { opacity, transform: [{ translateY }] }]}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>
                {mode === 'login' ? 'Iniciar sesión' : isBusiness ? 'Afilia tu negocio' : 'Crear cuenta'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <X size={16} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              {mode === 'login'
                ? 'Ingresa para administrar tu negocio afiliado.'
                : isBusiness
                  ? 'Crea tu cuenta y luego completa el perfil y verificación de tu empresa.'
                  : 'Explora el directorio y guarda tus comercios favoritos.'}
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ marginTop: 18 }}>
              <View style={{ gap: 14 }}>
                {mode === 'signup' && (
                  <TextField
                    label="Nombre completo"
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="María Fernández"
                    icon={<User size={15} color={colors.muted2} />}
                  />
                )}
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
                  placeholder={mode === 'signup' ? 'Mínimo 8 caracteres' : '••••••••'}
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
                  label={submitting ? 'Un momento…' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                  onPress={onSubmit}
                  loading={submitting}
                  icon={<ArrowRight size={16} color={colors.bg} />}
                />

                <Pressable
                  onPress={() => onModeChange(mode === 'login' ? 'signup' : 'login')}
                  style={styles.switchRow}
                >
                  <Text style={styles.switchText}>
                    {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
                    <Text style={styles.switchLink}>{mode === 'login' ? 'Regístrate' : 'Inicia sesión'}</Text>
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,5,10,0.7)', justifyContent: 'flex-end' },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgSoft,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '86%',
  },
  handle: { width: 36, height: 4, borderRadius: 999, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 20 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 6, lineHeight: 19 },
  errorBox: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '18', borderRadius: radius.sm, padding: 10 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
  switchRow: { alignItems: 'center', marginTop: 4 },
  switchText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  switchLink: { color: colors.text, fontFamily: fonts.bodySemiBold },
})
