import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, BadgeCheck, ShieldCheck } from 'lucide-react-native'
import { api, ApiError } from '../src/lib/api'
import { useAuthStore } from '../src/store/auth'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { StatusBadge } from '../src/components/StatusBadge'
import { DocPickerField, type PickedDoc } from '../src/components/forms/DocPickerField'
import { GradientButton } from '../src/components/ui/GradientButton'
import { fonts, radius } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

export default function VerifyIdentity() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const { user, refreshMe } = useAuthStore()
  const [doc, setDoc] = useState<PickedDoc | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const status = user?.kyc.status ?? 'unsubmitted'

  useEffect(() => {
    if (status === 'pending') {
      pollRef.current = setInterval(() => refreshMe(), 900)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, refreshMe])

  async function handleSubmit() {
    if (!doc) return
    setError(null)
    setSubmitting(true)
    try {
      await api.submitUserKyc(doc.label)
      await refreshMe()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar tu documento')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <AnimatedPressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Verificación de identidad</Text>
        <View style={{ width: 32 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        <AnimatedScreen fill={false} style={{ gap: 18 }}>
          <View>
            <StatusBadge status={status} />
          </View>

          {status === 'verified' ? (
            <View style={styles.successBox}>
              <View style={styles.successIcon}>
                <BadgeCheck size={26} color={colors.ok} />
              </View>
              <Text style={styles.successTitle}>Tu identidad está verificada</Text>
              <Text style={styles.body}>
                Ya puedes usar todas las funciones de MyTokenPay, incluyendo registrar un negocio y
                canjear bonos y regalos.
              </Text>
            </View>
          ) : status === 'pending' ? (
            <View style={styles.successBox}>
              <View style={styles.successIcon}>
                <ShieldCheck size={26} color={colors.warn} />
              </View>
              <Text style={styles.successTitle}>Estamos revisando tu documento</Text>
              <Text style={styles.body}>
                La verificación de identidad personal es automática y suele tardar unos segundos.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.infoBox}>
                <ShieldCheck size={16} color={colors.blue} />
                <Text style={styles.infoText}>
                  Esta verificación confirma tu identidad como usuario de MyTokenPay. Es independiente
                  de la verificación KYC/KYB que se hace al registrar un negocio.
                </Text>
              </View>

              <DocPickerField
                label="Documento de identidad"
                hint="DNI, pasaporte o identificación oficial"
                doc={doc}
                onChange={setDoc}
              />

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {status === 'rejected' && (
                <Text style={styles.body}>
                  Tu verificación anterior fue rechazada. Sube un documento válido para volver a
                  intentarlo.
                </Text>
              )}

              <GradientButton
                label={submitting ? 'Enviando…' : 'Enviar para verificación'}
                onPress={handleSubmit}
                disabled={!doc}
                loading={submitting}
              />
            </>
          )}
        </AnimatedScreen>
      </ScrollView>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    content: { padding: 20, paddingBottom: 48 },
    infoBox: {
      flexDirection: 'row',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.blue + '40',
      backgroundColor: colors.blue + '18',
      borderRadius: radius.md,
      padding: 14,
    },
    infoText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, flex: 1 },
    errorBox: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '18', borderRadius: radius.sm, padding: 10 },
    errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
    successBox: { alignItems: 'center', paddingVertical: 28, gap: 8 },
    successIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    successTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 16, textAlign: 'center' },
    body: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  })
}
