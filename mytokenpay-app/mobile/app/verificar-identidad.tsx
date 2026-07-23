import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, Easing, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Clock3,
  Fingerprint,
  IdCard,
  Mail,
  RefreshCcw,
  ScanFace,
  ShieldCheck,
} from 'lucide-react-native'
import { api } from '../src/lib/api'
import { useAuthStore } from '../src/store/auth'
import { useGenesisStore, SCAN_SECONDS, type GenesisStep } from '../src/store/genesis'
import { useNotificationsStore } from '../src/store/notifications'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { AnimatedScreen } from '../src/components/AnimatedScreen'
import { TextField } from '../src/components/ui/TextField'
import { GradientButton } from '../src/components/ui/GradientButton'
import { fonts, radius, shadow } from '../src/lib/theme'
import { useTheme, type ThemeColors } from '../src/hooks/useTheme'

const { width: SCREEN_W } = Dimensions.get('window')

// Genesis ID — la identidad digital única de Orden Global.
// Un solo flujo de verificación sirve para todo el ecosistema
// (Veta Wallet, MyTokenPay y las apps que vengan).

const STEP_ORDER: GenesisStep[] = ['email', 'doc-front', 'doc-back', 'face', 'processing', 'done']

function stepIndex(step: GenesisStep): number {
  if (step === 'review24') return 3
  const i = STEP_ORDER.indexOf(step)
  return i < 0 ? 0 : i
}

export default function GenesisId() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const { user, refreshMe } = useAuthStore()
  const pushNotif = useNotificationsStore((s) => s.push)
  const genesis = useGenesisStore()

  const [emailInput, setEmailInput] = useState(genesis.email || user?.email || '')
  const [secondsLeft, setSecondsLeft] = useState(SCAN_SECONDS)
  const [redirectIn, setRedirectIn] = useState(6)
  const [resumed] = useState(genesis.step !== 'email' && genesis.step !== 'done')

  const step = genesis.step

  // ---- animación de línea de escaneo + pulso del marco ----
  const scanY = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanY, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    )
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: false }),
      ]),
    )
    loop1.start()
    loop2.start()
    return () => {
      loop1.stop()
      loop2.stop()
    }
  }, [scanY, pulse])

  // ---- temporizador de 30 s por escaneo; al agotarse → revisión de 24 h ----
  const isScanStep = step === 'doc-front' || step === 'doc-back' || step === 'face'
  useEffect(() => {
    if (!isScanStep) return
    setSecondsLeft(SCAN_SECONDS)
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t)
          genesis.markReview24()
          pushNotif({
            kind: 'kyc',
            title: 'Verificación en revisión',
            body: 'No completamos el escaneo a tiempo. Tu verificación Genesis ID pasó a revisión manual y puede tardar hasta 24 horas.',
          })
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ---- procesamiento simulado → verificado ----
  useEffect(() => {
    if (step !== 'processing') return
    let cancelled = false
    ;(async () => {
      try {
        await api.submitUserKyc('Genesis ID')
      } catch {
        // demo: continuar aunque el mock falle
      }
      setTimeout(async () => {
        if (cancelled) return
        genesis.markVerified()
        await refreshMe()
        pushNotif({
          kind: 'kyc',
          title: 'Identidad verificada',
          body: 'Tu Genesis ID quedó verificada. Ya puedes usarla en Veta Wallet, MyTokenPay y todo el ecosistema Orden Global.',
        })
      }, 2600)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ---- al terminar: cuenta regresiva y regreso automático a la app ----
  useEffect(() => {
    if (step !== 'done') return
    setRedirectIn(6)
    const t = setInterval(() => {
      setRedirectIn((s) => {
        if (s <= 1) {
          clearInterval(t)
          goBackToApp()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const goBackToApp = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/panel')
  }, [router])

  function handleEmail() {
    const v = emailInput.trim()
    if (!v.includes('@') || v.length < 6) return
    genesis.setEmail(v)
  }

  function handleCapture() {
    if (step === 'doc-front') genesis.advance('doc-back')
    else if (step === 'doc-back') genesis.advance('face')
    else if (step === 'face') genesis.advance('processing')
  }

  const scanTranslate = scanY.interpolate({ inputRange: [0, 1], outputRange: [8, FACE_H - 20] })
  const docScanTranslate = scanY.interpolate({ inputRange: [0, 1], outputRange: [8, DOC_H - 20] })
  const frameBorder = pulse.interpolate({ inputRange: [0, 1], outputRange: [colors.cyan + '66', colors.cyan] })

  const idx = stepIndex(step)

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <AnimatedPressable onPress={goBackToApp} style={styles.iconBtn}>
          <ArrowLeft size={16} color={colors.text} />
        </AnimatedPressable>
        <View style={{ alignItems: 'center' }}>
          <View style={styles.brandRow}>
            <Fingerprint size={15} color={colors.cyan} />
            <Text style={styles.topTitle}>Genesis ID</Text>
          </View>
          <Text style={styles.topSub}>Identidad digital · Orden Global</Text>
        </View>
        <View style={{ width: 32 }} />
      </SafeAreaView>

      {/* progreso */}
      <View style={styles.stepsRow}>
        {['Correo', 'Documento', 'Rostro', 'Listo'].map((label, i) => {
          const activeIdx = idx >= 4 ? 3 : idx >= 3 ? 2 : idx >= 1 ? 1 : 0
          const on = i <= activeIdx
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, on && { backgroundColor: colors.cyan }]} />
              <Text style={[styles.stepLabel, on && { color: colors.text }]}>{label}</Text>
            </View>
          )
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AnimatedScreen fill={false} animKey={step} style={{ gap: 18 }}>
          {resumed && step !== 'done' && step !== 'review24' && (
            <View style={styles.resumeBox}>
              <RefreshCcw size={14} color={colors.cyan} />
              <Text style={styles.resumeText}>
                Continuando donde quedaste{genesis.email ? ` (${genesis.email})` : ''}. No necesitas empezar de nuevo.
              </Text>
            </View>
          )}

          {step === 'email' && (
            <>
              <View style={styles.heroIcon}>
                <Mail size={26} color={colors.cyan} />
              </View>
              <Text style={styles.h1}>Tu identidad única para todo el ecosistema</Text>
              <Text style={styles.body}>
                Con una sola verificación Genesis ID quedas verificado en MyTokenPay, Veta Wallet y
                todas las apps de Orden Global. Empieza con tu correo: si sales a mitad del proceso,
                continuarás justo donde quedaste.
              </Text>
              <TextField
                label="Correo electrónico"
                value={emailInput}
                onChangeText={setEmailInput}
                placeholder="tu@correo.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                icon={<Mail size={15} color={colors.muted2} />}
              />
              <GradientButton
                label="Comenzar verificación"
                onPress={handleEmail}
                disabled={!emailInput.trim().includes('@')}
                icon={<ShieldCheck size={16} color={colors.bg} />}
              />
            </>
          )}

          {(step === 'doc-front' || step === 'doc-back') && (
            <>
              <Text style={styles.h1}>{step === 'doc-front' ? 'Frente de tu documento' : 'Reverso de tu documento'}</Text>
              <Text style={styles.body}>
                Coloca el {step === 'doc-front' ? 'frente' : 'reverso'} dentro del marco. Tienes{' '}
                <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold }}>{SCAN_SECONDS} segundos</Text> por
                lado — sin prisa, el contador está a la vista.
              </Text>

              <View style={styles.docFrameWrap}>
                <Animated.View style={[styles.docFrame, { borderColor: frameBorder as unknown as string }]}>
                  <View style={styles.docInner}>
                    <IdCard size={54} color={colors.muted2} />
                    <Text style={styles.docSideLabel}>{step === 'doc-front' ? 'FRENTE' : 'REVERSO'}</Text>
                  </View>
                  <Animated.View style={[styles.scanLine, { transform: [{ translateY: docScanTranslate }] }]}>
                    <LinearGradient
                      colors={['transparent', colors.cyan, 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1 }}
                    />
                  </Animated.View>
                  <Corner style={{ top: -1, left: -1 }} colors={colors} />
                  <Corner style={{ top: -1, right: -1, transform: [{ rotate: '90deg' }] }} colors={colors} />
                  <Corner style={{ bottom: -1, right: -1, transform: [{ rotate: '180deg' }] }} colors={colors} />
                  <Corner style={{ bottom: -1, left: -1, transform: [{ rotate: '270deg' }] }} colors={colors} />
                </Animated.View>
              </View>

              <TimerBar secondsLeft={secondsLeft} colors={colors} />

              <GradientButton
                label={step === 'doc-front' ? 'Capturar frente' : 'Capturar reverso'}
                onPress={handleCapture}
                icon={<IdCard size={16} color={colors.bg} />}
              />
            </>
          )}

          {step === 'face' && (
            <>
              <Text style={styles.h1}>Verificación de rostro</Text>
              <Text style={styles.body}>
                Centra tu rostro dentro del óvalo con buena luz. Prueba de vida activa — parpadea con
                naturalidad.
              </Text>

              <View style={styles.faceWrap}>
                <Animated.View style={[styles.faceFrame, { borderColor: frameBorder as unknown as string }]}>
                  <View style={styles.faceInner}>
                    <ScanFace size={92} color={colors.muted2} />
                  </View>
                  <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanTranslate }] }]}>
                    <LinearGradient
                      colors={['transparent', colors.cyan, 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1 }}
                    />
                  </Animated.View>
                </Animated.View>
              </View>

              <TimerBar secondsLeft={secondsLeft} colors={colors} />

              <GradientButton label="Capturar rostro" onPress={handleCapture} icon={<ScanFace size={16} color={colors.bg} />} />
            </>
          )}

          {step === 'processing' && (
            <View style={styles.centerBox}>
              <View style={styles.spinnerOuter}>
                <Spinner colors={colors} />
              </View>
              <Text style={styles.h1c}>Validando con Genesis</Text>
              <Text style={styles.bodyC}>Documento · Biometría · Prueba de vida</Text>
            </View>
          )}

          {step === 'review24' && (
            <View style={styles.centerBox}>
              <View style={[styles.heroIcon, { backgroundColor: colors.warn + '18', alignSelf: 'center' }]}>
                <Clock3 size={26} color={colors.warn} />
              </View>
              <Text style={styles.h1c}>Pasamos tu caso a revisión</Text>
              <Text style={styles.bodyC}>
                No se completó el escaneo dentro del tiempo. Un agente revisará tu verificación
                manualmente: puede tardar{' '}
                <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold }}>hasta 24 horas</Text>. Te
                avisaremos por notificación y al correo {genesis.email || 'registrado'}.
              </Text>
              <GradientButton
                label="Volver a la app"
                onPress={goBackToApp}
                style={{ alignSelf: 'stretch', marginTop: 8 }}
                icon={<ArrowRight size={16} color={colors.bg} />}
              />
              <AnimatedPressable onPress={() => genesis.advance('doc-front')} style={styles.retryBtn}>
                <RefreshCcw size={13} color={colors.cyan} />
                <Text style={styles.retryText}>Reintentar escaneo ahora</Text>
              </AnimatedPressable>
            </View>
          )}

          {step === 'done' && (
            <View style={styles.centerBox}>
              <View style={styles.doneBadge}>
                <BadgeCheck size={40} color={colors.ok} />
              </View>
              <Text style={styles.h1c}>Identidad verificada</Text>
              <Text style={styles.bodyC}>Tu Genesis ID está activa para todo el ecosistema Orden Global.</Text>
              {genesis.genesisUid && (
                <View style={styles.uidChip}>
                  <Fingerprint size={13} color={colors.cyan} />
                  <Text style={styles.uidText}>{genesis.genesisUid}</Text>
                </View>
              )}
              <GradientButton
                label="Volver a MyTokenPay ahora"
                onPress={goBackToApp}
                style={{ alignSelf: 'stretch', marginTop: 14 }}
                icon={<ArrowRight size={16} color={colors.bg} />}
              />
              <Text style={styles.redirectNote}>Volviendo automáticamente en {redirectIn} s…</Text>
            </View>
          )}
        </AnimatedScreen>
      </ScrollView>
    </View>
  )
}

// ---- subcomponentes ----

const DOC_W = Math.min(SCREEN_W - 40, 380)
const DOC_H = Math.round(DOC_W / 1.586)
const FACE_W = Math.min(Math.round(SCREEN_W * 0.82), 340) // marco grande para el rostro
const FACE_H = Math.round(FACE_W * 1.22)

function Corner({ style, colors }: { style: object; colors: ThemeColors }) {
  return (
    <View
      style={[
        {
          position: 'absolute',
          width: 26,
          height: 26,
          borderLeftWidth: 3,
          borderTopWidth: 3,
          borderColor: colors.cyan,
          borderTopLeftRadius: 10,
        },
        style,
      ]}
    />
  )
}

function TimerBar({ secondsLeft, colors }: { secondsLeft: number; colors: ThemeColors }) {
  const pct = secondsLeft / SCAN_SECONDS
  const low = secondsLeft <= 10
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11.5 }}>Tiempo restante</Text>
        <Text style={{ color: low ? colors.danger : colors.text, fontFamily: fonts.displayBold, fontSize: 18 }}>
          {secondsLeft}s
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.surfaceHi, overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            borderRadius: 999,
            backgroundColor: low ? colors.danger : colors.cyan,
          }}
        />
      </View>
      <Text style={{ color: colors.muted2, fontFamily: fonts.body, fontSize: 10.5 }}>
        Si el tiempo se agota, tu verificación pasa a revisión manual (hasta 24 h).
      </Text>
    </View>
  )
}

function Spinner({ colors }: { colors: ThemeColors }) {
  const rot = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [rot])
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return (
    <Animated.View
      style={{
        width: 74,
        height: 74,
        borderRadius: 37,
        borderWidth: 5,
        borderColor: colors.cyan + '2A',
        borderTopColor: colors.cyan,
        transform: [{ rotate: spin }],
      }}
    />
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
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    topTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    topSub: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10, marginTop: 1 },

    stepsRow: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 14, gap: 8 },
    stepItem: { flex: 1, alignItems: 'center', gap: 6 },
    stepDot: { height: 4, alignSelf: 'stretch', borderRadius: 3, backgroundColor: colors.surfaceHi },
    stepLabel: { color: colors.muted2, fontFamily: fonts.bodySemiBold, fontSize: 10 },

    content: { padding: 20, paddingBottom: 48 },

    resumeBox: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.cyan + '40',
      backgroundColor: colors.cyan + '14',
      borderRadius: radius.md,
      padding: 12,
    },
    resumeText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, flex: 1 },

    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.cyan + '16',
      alignItems: 'center',
      justifyContent: 'center',
    },
    h1: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28 },
    h1c: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28, textAlign: 'center', marginTop: 16 },
    body: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
    bodyC: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },

    docFrameWrap: { alignItems: 'center', marginVertical: 6 },
    docFrame: {
      width: DOC_W,
      height: DOC_H,
      borderRadius: radius.lg,
      borderWidth: 2,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    docInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    docSideLabel: { color: colors.muted2, fontFamily: fonts.displayBold, fontSize: 12, letterSpacing: 3 },

    faceWrap: { alignItems: 'center', marginVertical: 6 },
    faceFrame: {
      width: FACE_W,
      height: FACE_H,
      borderRadius: FACE_W / 2,
      borderWidth: 3,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      ...shadow(colors.cyan, 'lg'),
    },
    faceInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    scanLine: { position: 'absolute', left: 12, right: 12, height: 3, borderRadius: 2 },

    centerBox: { alignItems: 'center', paddingVertical: 20 },
    spinnerOuter: { marginBottom: 6 },

    doneBadge: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.ok + '16',
      borderWidth: 2,
      borderColor: colors.ok + '55',
      alignItems: 'center',
      justifyContent: 'center',
    },
    uidChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderWidth: 1,
      borderColor: colors.cyan + '44',
      backgroundColor: colors.cyan + '12',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginTop: 14,
    },
    uidText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13, letterSpacing: 0.5 },
    redirectNote: { color: colors.muted2, fontFamily: fonts.body, fontSize: 11.5, marginTop: 12 },

    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 12, marginTop: 4 },
    retryText: { color: colors.cyan, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  })
}
