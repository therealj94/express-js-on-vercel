import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { Field } from '../ui/TextField'
import { fonts, radius } from '../../lib/theme'
import { useTheme, type ThemeColors } from '../../hooks/useTheme'
import type { DayKey, WeekHours } from '../../lib/types'

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom',
}
const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function HoursEditor({ hours, onChange }: { hours: WeekHours; onChange: (h: WeekHours) => void }) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  function updateDay(day: DayKey, patch: Partial<WeekHours[DayKey]>) {
    onChange({ ...hours, [day]: { ...hours[day], ...patch } })
  }

  return (
    <Field label="Horario de atención">
      <View style={styles.wrap}>
        {DAY_ORDER.map((day) => {
          const d = hours[day]
          return (
            <View key={day} style={styles.row}>
              <Text style={styles.day}>{DAY_LABELS[day]}</Text>
              <TextInput
                value={d.open}
                editable={!d.closed}
                onChangeText={(v) => updateDay(day, { open: v })}
                placeholder="08:00"
                placeholderTextColor={colors.muted2}
                style={[styles.timeInput, d.closed && styles.disabled]}
              />
              <TextInput
                value={d.close}
                editable={!d.closed}
                onChangeText={(v) => updateDay(day, { close: v })}
                placeholder="18:00"
                placeholderTextColor={colors.muted2}
                style={[styles.timeInput, d.closed && styles.disabled]}
              />
              <Pressable onPress={() => updateDay(day, { closed: !d.closed })} style={styles.checkRow}>
                <View style={[styles.checkbox, d.closed && styles.checkboxActive]}>
                  {d.closed && <Check size={10} color={colors.bg} />}
                </View>
                <Text style={styles.checkLabel}>Cerrado</Text>
              </Pressable>
            </View>
          )
        })}
      </View>
    </Field>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    day: { width: 30, color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11 },
    timeInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 8,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 12,
      textAlign: 'center',
    },
    disabled: { opacity: 0.35 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, width: 66 },
    checkbox: {
      width: 15,
      height: 15,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    checkLabel: { color: colors.muted2, fontFamily: fonts.body, fontSize: 10 },
  })
}
