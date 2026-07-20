import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { fonts, radius, shadow } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'

export interface ActionItem {
  key: string
  label: string
  icon: LucideIcon
  onPress: () => void
  danger?: boolean
  disabled?: boolean
}

interface Props {
  visible: boolean
  onClose: () => void
  header?: ReactNode
  title?: string
  items: ActionItem[]
}

export function ActionSheet({ visible, onClose, header, title, items }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
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

  function handlePress(item: ActionItem) {
    onClose()
    setTimeout(item.onPress, 180)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { opacity, transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          {header}
          {title && <Text style={styles.title}>{title}</Text>}
          <View style={{ marginTop: header || title ? 10 : 0 }}>
            {items.map((item, i) => {
              const needsDivider = item.danger && !items[i - 1]?.danger && i > 0
              return (
                <View key={item.key}>
                  {needsDivider && <View style={styles.divider} />}
                  <Pressable
                    onPress={() => handlePress(item)}
                    disabled={item.disabled}
                    style={({ pressed }) => [styles.item, pressed && styles.itemPressed, item.disabled && { opacity: 0.4 }]}
                  >
                    <View style={[styles.itemIcon, item.danger && styles.itemIconDanger]}>
                      <item.icon size={16} color={item.danger ? colors.danger : colors.text} />
                    </View>
                    <Text style={[styles.itemLabel, item.danger && { color: colors.danger }]}>{item.label}</Text>
                  </Pressable>
                </View>
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
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 30,
    ...shadow(colors.bg, 'lg', 'up'),
  },
  handle: { width: 36, height: 4, borderRadius: 999, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10 },
  title: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 10, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 13, borderRadius: radius.md },
  itemPressed: { backgroundColor: colors.surfaceHi },
  itemIcon: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  itemIconDanger: { backgroundColor: colors.danger + '18' },
  itemLabel: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14.5 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6, marginHorizontal: 10 },
  })
}
