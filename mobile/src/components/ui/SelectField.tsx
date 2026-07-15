import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ChevronDown, Check, Search, X } from 'lucide-react-native'
import { fonts, radius } from '../../lib/theme'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'

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
  searchable?: boolean
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function SelectField({ label, value, options, onChange, placeholder = 'Selecciona una opción', disabled, searchable }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((o) => o.value === value)
  const showSearch = searchable ?? options.length > 6

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = normalize(query)
    return options.filter((o) => normalize(o.label).includes(q))
  }, [options, query])

  function close() {
    setOpen(false)
    setQuery('')
  }

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

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
                <X size={16} color={colors.muted} />
              </Pressable>
            </View>

            {showSearch && (
              <View style={styles.searchWrap}>
                <Search size={14} color={colors.muted2} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar…"
                  placeholderTextColor={colors.muted2}
                  style={styles.searchInput}
                  autoCorrect={false}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={10}>
                    <X size={14} color={colors.muted2} />
                  </Pressable>
                )}
              </View>
            )}

            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Sin resultados para "{query}"</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.value}
                style={{ maxHeight: 380 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                    onPress={() => {
                      onChange(item.value)
                      close()
                    }}
                  >
                    <Text style={[styles.optionText, item.value === value && styles.optionTextActive]}>
                      {item.label}
                    </Text>
                    {item.value === value && <Check size={16} color={colors.blue} />}
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      backgroundColor: 'rgba(4,3,8,0.68)',
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
      maxHeight: '80%',
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    sheetTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 15,
    },
    closeBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 20,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 13,
      padding: 0,
    },
    empty: { paddingHorizontal: 20, paddingVertical: 28, alignItems: 'center' },
    emptyText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 10,
      paddingHorizontal: 10,
      paddingVertical: 13,
      borderRadius: radius.sm,
    },
    optionPressed: { backgroundColor: colors.surfaceHi },
    optionText: {
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 14,
    },
    optionTextActive: {
      fontFamily: fonts.bodySemiBold,
      color: colors.blue,
    },
  })
}
