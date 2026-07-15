import { useEffect, useRef } from 'react'
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { fonts, radius } from '../lib/theme'
import { themes, type ThemeName } from '../lib/themes'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { useThemeStore } from '../store/theme'
import { AnimatedPressable } from './AnimatedPressable'

interface Props {
  visible: boolean
  onClose: () => void
}

export function ThemeSheet({ visible, onClose }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const themeName = useThemeStore((s) => s.themeName)
  const setTheme = useThemeStore((s) => s.setTheme)
  const translateY = useRef(new Animated.Value(30)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start()
    } else {
      translateY.setValue(30)
      opacity.setValue(0)
    }
  }, [visible])

  function select(name: ThemeName) {
    setTheme(name)
    setTimeout(onClose, 150)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { opacity, transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Apariencia</Text>
          <Text style={styles.subtitle}>Elige el tema visual de la app.</Text>

          <View style={{ marginTop: 14, gap: 10 }}>
            {Object.values(themes).map((def) => {
              const active = def.name === themeName
              return (
                <AnimatedPressable
                  key={def.name}
                  scaleTo={0.98}
                  onPress={() => select(def.name)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View style={styles.swatchRow}>
                    {def.swatch.map((c, i) => (
                      <View key={i} style={[styles.swatchDot, { backgroundColor: c, marginLeft: i === 0 ? 0 : -8 }]} />
                    ))}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{def.label}</Text>
                    <Text style={styles.optionDesc}>{def.description}</Text>
                  </View>
                  {active && (
                    <View style={styles.checkWrap}>
                      <Check size={14} color={colors.bg} />
                    </View>
                  )}
                </AnimatedPressable>
              )
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(4,5,10,0.65)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bgSoft,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 34,
    },
    handle: { width: 36, height: 4, borderRadius: 999, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: 18 },
    subtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 12,
    },
    optionActive: { borderColor: colors.blue },
    swatchRow: { flexDirection: 'row' },
    swatchDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.bgSoft },
    optionLabel: { color: colors.text, fontFamily: fonts.display, fontSize: 14.5 },
    optionDesc: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, marginTop: 2, lineHeight: 15 },
    checkWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}
