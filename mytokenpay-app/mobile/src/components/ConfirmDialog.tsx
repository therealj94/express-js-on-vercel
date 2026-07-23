import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { fonts, radius, shadow } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { AnimatedPressable } from './AnimatedPressable'

interface Props {
  visible: boolean
  icon?: LucideIcon
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({
  visible,
  icon: Icon,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const scale = useRef(new Animated.Value(0.92)).current
  const opacity = useRef(new Animated.Value(0)).current
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (visible) {
      setSubmitting(false)
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start()
    } else {
      scale.setValue(0.92)
      opacity.setValue(0)
    }
  }, [visible])

  async function handleConfirm() {
    setSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={submitting ? undefined : onCancel} />
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          {Icon && (
            <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
              <Icon size={22} color={danger ? colors.danger : colors.blue} />
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <AnimatedPressable onPress={onCancel} disabled={submitting} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={handleConfirm}
              disabled={submitting}
              style={[styles.confirmBtn, danger && styles.confirmBtnDanger]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={danger ? colors.text : colors.bg} />
              ) : (
                <Text style={[styles.confirmText, danger && styles.confirmTextDanger]}>{confirmLabel}</Text>
              )}
            </AnimatedPressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(4,5,10,0.7)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.bgSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      padding: 22,
      alignItems: 'center',
      ...shadow(colors.bg, 'lg'),
    },
    iconWrap: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: colors.blue + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    iconWrapDanger: { backgroundColor: colors.danger + '18' },
    title: { color: colors.text, fontFamily: fonts.display, fontSize: 17, textAlign: 'center' },
    message: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
    cancelBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13.5 },
    confirmBtn: {
      flex: 1,
      backgroundColor: colors.blue,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmBtnDanger: { backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger },
    confirmText: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 13.5 },
    confirmTextDanger: { color: colors.danger },
  })
}
