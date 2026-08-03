// components/ConfirmDialog.tsx
// Diálogo de confirmación genérico ("¿estás seguro?") — mismo patrón de Modal
// que TutorialOverlay (backdrop + tarjeta), pero centrado y con acción única.
// Pensado para operaciones irreversibles rápidas (ej. cerrar toda una posición).
import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Icon, IconName } from '@/components/Icon';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';

export function ConfirmDialog({
  visible, title, message, confirmLabel, cancelLabel, danger, icon = 'alert', onConfirm, onCancel, children,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  icon?: IconName;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  if (!visible) return null;

  const accent = danger ? colors.loss : colors.gold;
  const cancelTxt = cancelLabel ?? t('common.cancel');
  const cancel = () => { tap(); onCancel(); };
  const confirm = () => { tap(); onConfirm(); };

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={cancel}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} />
        <Animated.View entering={ZoomIn.springify().damping(18)} style={[styles.card, { width: Math.min(width - 48, 380) }]}>
          <View style={[styles.iconWrap, { borderColor: accent }]}>
            <Icon name={icon} size={26} color={accent} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
          {children && <View style={styles.body}>{children}</View>}

          <View style={styles.actions}>
            <Pressable onPress={cancel} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>{cancelTxt}</Text>
            </Pressable>
            <Pressable onPress={confirm} style={[styles.confirmBtn, { backgroundColor: accent }]}>
              <Text style={styles.confirmTxt}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,2,4,0.82)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center' },
  iconWrap: { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 14, backgroundColor: colors.bgCard },
  title: { color: colors.text, fontSize: font.size.lg, fontFamily: font.family.headingBold, textAlign: 'center', textTransform: 'uppercase' },
  message: { color: colors.textSecondary, fontSize: font.size.sm, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  body: { alignSelf: 'stretch', marginTop: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22, alignSelf: 'stretch' },
  cancelBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  cancelTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: font.size.sm },
  confirmBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  confirmTxt: { color: '#0A0A0F', fontWeight: '800', fontSize: font.size.sm },
}));
