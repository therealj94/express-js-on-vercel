import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, ArrowRight, Check, Compass, Gift, Store, Wallet, type LucideIcon } from 'lucide-react-native'
import { fonts, radius, shadow } from '../lib/theme'
import { themes, type ThemeName } from '../lib/themes'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { useThemeStore } from '../store/theme'
import { AnimatedScreen } from './AnimatedScreen'
import { AnimatedPressable } from './AnimatedPressable'
import { Pressable3D } from './Pressable3D'
import { GradientButton } from './ui/GradientButton'
import { Logo } from './Logo'

interface Slide {
  icon: LucideIcon
  title: string
  body: string
}

const SLIDES: Slide[] = [
  {
    icon: Compass,
    title: 'Descubre comercios afiliados',
    body: 'Explora restaurantes, hoteles, cafés y más en toda Latinoamérica. Busca por categoría, país o ciudad y abre cada negocio para ver fotos, productos, horarios y ubicación.',
  },
  {
    icon: Gift,
    title: 'Gana y canjea con ORIGEN',
    body: 'Acumula puntos ORIGEN al comprar en comercios afiliados y canjéalos por descuentos, productos gratis y experiencias en la sección de Bonos y regalos.',
  },
  {
    icon: Wallet,
    title: 'Conecta tu Veta Wallet',
    body: 'Vincula tu billetera con tu coin address o UID para recibir tus puntos y liquidar tus compras. Todo desde el menú de tu cuenta.',
  },
  {
    icon: Store,
    title: '¿Tienes un negocio?',
    body: 'Regístralo gratis, complétalo con tu KYC/KYB y aparece en el directorio para recibir nuevos clientes que pagan con ORIGEN. Es solo una opción — la app es tuya como usuario.',
  },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const themeName = useThemeStore((s) => s.themeName)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [step, setStep] = useState(0)

  const total = SLIDES.length + 1 // + theme step
  const isThemeStep = step === SLIDES.length
  const slide = SLIDES[step]

  function next() {
    if (step < total - 1) setStep((s) => s + 1)
    else onDone()
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Logo size="sm" />
          {!isThemeStep && (
            <AnimatedPressable onPress={onDone} style={styles.skipBtn}>
              <Text style={styles.skipText}>Saltar</Text>
            </AnimatedPressable>
          )}
        </View>

        <View style={styles.progressRow}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
          ))}
        </View>

        <View style={styles.body}>
          <AnimatedScreen animKey={step} fill={false} distance={14}>
            {isThemeStep ? (
              <View>
                <Text style={styles.title}>Escoge cómo se ve tu app</Text>
                <Text style={styles.text}>Puedes cambiarlo cuando quieras desde Apariencia en tu menú.</Text>
                <View style={{ marginTop: 22, gap: 12 }}>
                  {Object.values(themes).map((def) => {
                    const active = def.name === themeName
                    return (
                      <Pressable3D key={def.name} tilt={5} onPress={() => setTheme(def.name as ThemeName)} style={[styles.themeOpt, active && styles.themeOptActive]}>
                        <View style={styles.swatchRow}>
                          {def.swatch.map((c, i) => (
                            <View key={i} style={[styles.swatchDot, { backgroundColor: c, marginLeft: i === 0 ? 0 : -8 }]} />
                          ))}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.themeLabel}>{def.label}</Text>
                          <Text style={styles.themeDesc}>{def.description}</Text>
                        </View>
                        {active && (
                          <View style={styles.themeCheck}>
                            <Check size={14} color={colors.bg} />
                          </View>
                        )}
                      </Pressable3D>
                    )
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.slideWrap}>
                <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.slideIcon}>
                  <slide.icon size={40} color={colors.bg} />
                </LinearGradient>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.text}>{slide.body}</Text>
              </View>
            )}
          </AnimatedScreen>
        </View>

        <View style={styles.footer}>
          {step > 0 ? (
            <AnimatedPressable onPress={() => setStep((s) => s - 1)} style={styles.backBtn}>
              <ArrowLeft size={18} color={colors.text} />
            </AnimatedPressable>
          ) : (
            <View style={{ width: 48 }} />
          )}
          <View style={{ flex: 1 }}>
            <GradientButton
              label={isThemeStep ? 'Empezar' : 'Continuar'}
              onPress={next}
              icon={isThemeStep ? <Check size={16} color={colors.bg} /> : <ArrowRight size={16} color={colors.bg} />}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
    skipBtn: { paddingHorizontal: 12, paddingVertical: 6 },
    skipText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    progressRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginTop: 18 },
    progressDot: { flex: 1, height: 4, borderRadius: 999, backgroundColor: colors.border },
    progressDotActive: { backgroundColor: colors.blue },
    body: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
    slideWrap: { alignItems: 'center' },
    slideIcon: { width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 28, ...shadow(colors.violet, 'lg') },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 25, lineHeight: 30, textAlign: 'center' },
    text: { color: colors.muted, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 22, textAlign: 'center', marginTop: 12 },
    themeOpt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 14,
    },
    themeOptActive: { borderColor: colors.blue },
    swatchRow: { flexDirection: 'row' },
    swatchDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.bg },
    themeLabel: { color: colors.text, fontFamily: fonts.display, fontSize: 15 },
    themeDesc: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, marginTop: 2, lineHeight: 15 },
    themeCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
    backBtn: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}
