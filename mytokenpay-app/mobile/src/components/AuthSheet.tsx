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
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, User, X } from 'lucide-react-native'
import { useAuthStore } from '../store/auth'
import { api, ApiError } from '../lib/api'
import { TextField } from './ui/TextField'
import { GradientButton } from './ui/GradientButton'
import { fonts, radius, shadow } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'

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
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const { login, signup, error, clearError } = useAuthStore()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const translateY = useRef(new Animated.Value(40)).current
  const opacity = useRef(new Animated.Value(0)).current

  const [view, setView] = useState<'credentials' | 'forgot' | 'reset'>('credentials')
  const [displayedView, setDisplayedView] = useState(view)
  const viewOpacity = useRef(new Animated.Value(1)).current
  const viewShift = useRef(new Animated.Value(0)).current
  const [resetEmail, setResetEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotSent, setForgotSent] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    if (visible) {
      clearError()
      setView('credentials')
      setDisplayedView('credentials')
      viewOpacity.setValue(1)
      viewShift.setValue(0)
      setForgotError(null)
      setForgotSent(false)
      setResetDone(false)
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start()
    } else {
      translateY.setValue(40)
      opacity.setValue(0)
    }
  }, [visible])

  // Cross-fade between credentials/forgot/reset instead of an instant content swap.
  useEffect(() => {
    if (displayedView === view) return
    Animated.timing(viewOpacity, { toValue: 0, duration: 120, easing: Easing.out(Easing.ease), useNativeDriver: true }).start(() => {
      setDisplayedView(view)
      viewShift.setValue(6)
      Animated.parallel([
        Animated.timing(viewOpacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(viewShift, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start()
    })
  }, [view])

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

  function openForgot() {
    setForgotError(null)
    setForgotSent(false)
    setResetEmail(email)
    setView('forgot')
  }

  async function onSubmitForgot() {
    if (!resetEmail.trim()) return
    setForgotError(null)
    setForgotSubmitting(true)
    try {
      const res = await api.forgotPassword(resetEmail.trim())
      setForgotSent(true)
      if (res.demoResetToken) {
        setResetToken(res.demoResetToken)
        setNewPassword('')
        setResetDone(false)
        setView('reset')
      }
    } catch (err) {
      setForgotError(err instanceof ApiError ? err.message : 'No se pudo procesar la solicitud')
    } finally {
      setForgotSubmitting(false)
    }
  }

  async function onSubmitReset() {
    if (newPassword.length < 8) {
      setForgotError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setForgotError(null)
    setForgotSubmitting(true)
    try {
      await api.resetPassword(resetToken, newPassword)
      setResetDone(true)
    } catch (err) {
      setForgotError(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña')
    } finally {
      setForgotSubmitting(false)
    }
  }

  function backToLogin() {
    setView('credentials')
    onModeChange('login')
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
                {displayedView === 'forgot'
                  ? 'Recuperar contraseña'
                  : displayedView === 'reset'
                    ? 'Nueva contraseña'
                    : mode === 'login'
                      ? 'Iniciar sesión'
                      : isBusiness
                        ? 'Afilia tu negocio'
                        : 'Crear cuenta'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <X size={16} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              {displayedView === 'forgot'
                ? 'Ingresa tu correo y te ayudaremos a restablecer tu contraseña.'
                : displayedView === 'reset'
                  ? resetDone
                    ? 'Tu contraseña se actualizó correctamente.'
                    : 'Elige una nueva contraseña para tu cuenta.'
                  : mode === 'login'
                    ? 'Ingresa para administrar tu negocio afiliado.'
                    : isBusiness
                      ? 'Crea tu cuenta y luego completa el perfil y verificación de tu empresa.'
                      : 'Explora el directorio y guarda tus comercios favoritos.'}
            </Text>

            <Animated.View
              style={{ opacity: viewOpacity, transform: [{ translateY: viewShift }] }}
            >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ marginTop: 18 }}>
              {displayedView === 'forgot' ? (
                <View style={{ gap: 14 }}>
                  <TextField
                    label="Correo"
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="tucorreo@empresa.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    icon={<Mail size={15} color={colors.muted2} />}
                  />

                  {forgotError && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{forgotError}</Text>
                    </View>
                  )}

                  {forgotSent && (
                    <View style={styles.infoBox}>
                      <CheckCircle2 size={15} color={colors.ok} />
                      <Text style={styles.infoText}>
                        Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.
                      </Text>
                    </View>
                  )}

                  <GradientButton
                    label={forgotSubmitting ? 'Enviando…' : 'Enviar instrucciones'}
                    onPress={onSubmitForgot}
                    loading={forgotSubmitting}
                    icon={<KeyRound size={16} color={colors.bg} />}
                  />

                  <Pressable onPress={() => setView('credentials')} style={styles.switchRow}>
                    <ArrowLeft size={13} color={colors.muted} />
                    <Text style={[styles.switchText, { marginLeft: 6 }]}>Volver a iniciar sesión</Text>
                  </Pressable>
                </View>
              ) : displayedView === 'reset' ? (
                <View style={{ gap: 14 }}>
                  {resetDone ? (
                    <>
                      <View style={styles.infoBox}>
                        <CheckCircle2 size={15} color={colors.ok} />
                        <Text style={styles.infoText}>Ya puedes iniciar sesión con tu nueva contraseña.</Text>
                      </View>
                      <GradientButton label="Iniciar sesión" onPress={backToLogin} icon={<ArrowRight size={16} color={colors.bg} />} />
                    </>
                  ) : (
                    <>
                      <Text style={styles.demoNote}>
                        Esta app aún no envía correos reales: en producción este enlace llegaría a tu bandeja de
                        entrada. Por ahora puedes completar el cambio de contraseña directamente aquí.
                      </Text>
                      <TextField
                        label="Nueva contraseña"
                        value={newPassword}
                        onChangeText={setNewPassword}
                        placeholder="Mínimo 8 caracteres"
                        secureTextEntry={!showNewPassword}
                        icon={<Lock size={15} color={colors.muted2} />}
                        rightElement={
                          <Pressable onPress={() => setShowNewPassword((v) => !v)} hitSlop={10}>
                            {showNewPassword ? <EyeOff size={15} color={colors.muted2} /> : <Eye size={15} color={colors.muted2} />}
                          </Pressable>
                        }
                      />

                      {forgotError && (
                        <View style={styles.errorBox}>
                          <Text style={styles.errorText}>{forgotError}</Text>
                        </View>
                      )}

                      <GradientButton
                        label={forgotSubmitting ? 'Guardando…' : 'Guardar nueva contraseña'}
                        onPress={onSubmitReset}
                        loading={forgotSubmitting}
                        icon={<KeyRound size={16} color={colors.bg} />}
                      />
                    </>
                  )}
                </View>
              ) : (
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

                  {mode === 'login' && (
                    <Pressable onPress={openForgot} hitSlop={6} style={styles.forgotLink}>
                      <Text style={styles.forgotLinkText}>¿Olvidaste tu contraseña?</Text>
                    </Pressable>
                  )}

                  {error && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  {mode === 'signup' && (
                    <Text style={styles.consentText}>
                      Al crear tu cuenta aceptas nuestra Política de privacidad y Términos de servicio.
                    </Text>
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
              )}
            </ScrollView>
            </Animated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    ...shadow(colors.bg, 'lg', 'up'),
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.ok + '55',
    backgroundColor: colors.ok + '18',
    borderRadius: radius.sm,
    padding: 10,
  },
  infoText: { color: colors.text, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, flex: 1 },
  demoNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 17 },
  forgotLink: { alignSelf: 'flex-end' },
  forgotLinkText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  consentText: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  switchText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  switchLink: { color: colors.text, fontFamily: fonts.bodySemiBold },
  })
}
