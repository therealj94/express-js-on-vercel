import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Check, FileText } from 'lucide-react-native'
import { uriToDataUrl } from '../../lib/file'
import { fonts, radius } from '../../lib/theme'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'

export interface PickedDoc {
  label: string
  dataUrl: string
}

interface Props {
  label: string
  hint: string
  doc: PickedDoc | null
  onChange: (v: PickedDoc | null) => void
}

export function DocPickerField({ label, hint, doc, onChange }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const dataUrl = await uriToDataUrl(asset.uri, asset.mimeType ?? 'application/octet-stream')
    onChange({ label: asset.name, dataUrl })
  }

  return (
    <Pressable onPress={pick} style={styles.wrap}>
      <View style={styles.icon}>
        {doc ? <Check size={16} color={colors.ok} /> : <FileText size={16} color={colors.muted2} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint} numberOfLines={1}>{doc ? doc.label : hint}</Text>
      </View>
    </Pressable>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: radius.md,
      padding: 14,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, marginTop: 3 },
  })
}
