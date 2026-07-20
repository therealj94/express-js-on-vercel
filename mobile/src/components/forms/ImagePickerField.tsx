import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Upload } from 'lucide-react-native'
import { Field } from '../ui/TextField'
import { uriToDataUrl } from '../../lib/file'
import { fonts, radius } from '../../lib/theme'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'

interface Props {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  round?: boolean
}

export function ImagePickerField({ label, value, onChange, round }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const opacity = useRef(new Animated.Value(value ? 1 : 0)).current
  const scale = useRef(new Animated.Value(value ? 1 : 0.95)).current

  useEffect(() => {
    if (!value) return
    opacity.setValue(0)
    scale.setValue(0.95)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [value])

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: false,
    })
    if (result.canceled || !result.assets[0]) return
    const dataUrl = await uriToDataUrl(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg')
    onChange(dataUrl)
  }

  return (
    <Field label={label}>
      <Pressable onPress={pick} style={styles.wrap}>
        <View style={[styles.thumb, round && styles.round]}>
          {value ? (
            <Animated.Image
              source={{ uri: value }}
              style={[StyleSheet.absoluteFill, { opacity, transform: [{ scale }] }]}
            />
          ) : (
            <Upload size={16} color={colors.muted2} />
          )}
        </View>
        <Text style={styles.text}>{value ? 'Cambiar imagen' : 'Subir imagen'}</Text>
      </Pressable>
    </Field>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: radius.md,
      padding: 10,
    },
    thumb: {
      width: 52,
      height: 52,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    round: { borderRadius: 26 },
    text: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  })
}
