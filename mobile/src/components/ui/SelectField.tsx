import { useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, Check, X } from 'lucide-react-native'
import { colors, fonts, radius } from '../../lib/theme'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function SelectField({ label, value, options, onChange, placeholder = 'Selecciona una opción', disabled }: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[styles.trigger, disabled && { opacity: 0.5 }]}
      >
        <Text style={[styles.triggerText, !selected && { color: colors.muted2 }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color={colors.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <X size={20} color={colors.muted} />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange(item.value)
                    setOpen(false)
                  }}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                  {item.value === value && <Check size={16} color={colors.blue} />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    color: colors.muted2,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  triggerText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgSoft,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: 24,
    paddingTop: 12,
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 15,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
})
