import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Upload } from 'lucide-react-native'
import { Field } from '../ui/TextField'
import { uriToDataUrl } from '../../lib/file'
import { colors, fonts, radius } from '../../lib/theme'

interface Props {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  round?: boolean
}

export function ImagePickerField({ label, value, onChange, round }: Props) {
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
          {value ? <Image source={{ uri: value }} style={StyleSheet.absoluteFill} /> : <Upload size={16} color={colors.muted2} />}
        </View>
        <Text style={styles.text}>{value ? 'Cambiar imagen' : 'Subir imagen'}</Text>
      </Pressable>
    </Field>
  )
}

const styles = StyleSheet.create({
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
