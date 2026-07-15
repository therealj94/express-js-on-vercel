import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Plus, X } from 'lucide-react-native'
import { TextField, Field } from '../ui/TextField'
import { colors, fonts, radius } from '../../lib/theme'

interface Props {
  label: string
  values: string[]
  onChange: (v: string[]) => void
}

export function TagInput({ label, values, onChange }: Props) {
  const [draft, setDraft] = useState('')

  function add() {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }

  return (
    <Field label={label}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextField value={draft} onChangeText={setDraft} placeholder="Ej. Café de especialidad" onSubmitEditing={add} returnKeyType="done" />
        </View>
        <Pressable onPress={add} style={styles.addBtn}>
          <Plus size={16} color={colors.text} />
        </Pressable>
      </View>
      {values.length > 0 && (
        <View style={styles.tagWrap}>
          {values.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
              <Pressable onPress={() => onChange(values.filter((v) => v !== tag))} hitSlop={8}>
                <X size={11} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Field>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHi,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11 },
})
