import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors, fonts, radius } from '../../lib/theme'

interface Props extends TextInputProps {
  label?: string
  icon?: React.ReactNode
  rightElement?: React.ReactNode
}

export function TextField({ label, icon, rightElement, style, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrap}>
        {icon && <View style={styles.icon}>{icon}</View>}
        <TextInput
          placeholderTextColor={colors.muted2}
          style={[
            styles.input,
            icon ? { paddingLeft: 40 } : null,
            rightElement ? { paddingRight: 40 } : null,
            style,
          ]}
          {...props}
        />
        {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
      </View>
    </View>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    color: colors.muted2,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  icon: { position: 'absolute', left: 14, zIndex: 1 },
  rightElement: { position: 'absolute', right: 14, zIndex: 1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
})
