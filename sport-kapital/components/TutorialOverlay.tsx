// src/components/TutorialOverlay.tsx
// Tour guiado por pantalla, al estilo de los exchanges profesionales:
// backdrop oscuro, tarjeta inferior con icono, progreso por puntos,
// "Omitir" / "Siguiente" / "Entendido". Se muestra una sola vez por pantalla.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Icon, IconName } from '@/components/Icon';
import { tap, success } from '@/utils/haptics';
import { t } from '@/utils/i18n';

export interface TutorialStep {
  icon: IconName;
  title: string;
  body: string;
  accent?: string;
}

export function useTutorial(key: string) {
  const seen = useStore((s) => s.tutorialsSeen[key]);
  const mark = useStore((s) => s.markTutorial);
  const [forced, setForced] = useState(false);
  return {
    visible: !seen || forced,
    open: () => setForced(true),
    close: () => { setForced(false); mark(key); },
  };
}

export function TutorialOverlay({ steps, visible, onClose, title }: {
  steps: TutorialStep[];
  visible: boolean;
  onClose: () => void;
  title: string;
}) {
  const { width } = useWindowDimensions();
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  const iconScale = useSharedValue(1);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  if (!visible || !step) return null;

  const next = () => {
    if (last) { success(); setI(0); onClose(); return; }
    tap();
    iconScale.value = 0.5;
    iconScale.value = withSpring(1, { damping: 12 });
    setI(i + 1);
  };
  const skip = () => { tap(); setI(0); onClose(); };

  const accent = step.accent ?? colors.gold;

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={skip}>
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={next} />
        <Animated.View entering={SlideInDown.springify().damping(18)} exiting={SlideOutDown} style={[styles.card, { width: width - 32 }]}>
          <View style={styles.header}>
            <Text style={styles.kicker}>{title}</Text>
            <Pressable onPress={skip} hitSlop={12}><Text style={styles.skip}>{t('common.skip')}</Text></Pressable>
          </View>

          <Animated.View style={[styles.iconWrap, { borderColor: accent }, iconStyle]}>
            <Icon name={step.icon} size={30} color={accent} />
          </Animated.View>

          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.stepBody}>{step.body}</Text>

          <View style={styles.dots}>
            {steps.map((_, d) => (
              <View key={d} style={[styles.dot, d === i && { backgroundColor: accent, width: 20 }]} />
            ))}
          </View>

          <Pressable onPress={next} style={[styles.cta, { backgroundColor: accent }]}>
            <Text style={styles.ctaTxt}>{last ? t('common.understood') : `${t('common.next')}  ${i + 1}/${steps.length}`}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/** Botón de ayuda para reabrir el tour desde el header de cada pantalla. */
export function HelpButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={styles.help} hitSlop={8}>
      <Icon name="info" size={17} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,2,4,0.82)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 34 },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  kicker: { color: colors.textTertiary, fontSize: font.size.xs, letterSpacing: 2, textTransform: 'uppercase', fontFamily: font.family.headingBold },
  skip: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '600' },
  iconWrap: { width: 64, height: 64, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 16, backgroundColor: colors.bgCard },
  stepTitle: { color: colors.text, fontSize: font.size.xl, marginBottom: 8, fontFamily: font.family.heading },
  stepBody: { color: colors.textSecondary, fontSize: font.size.md, lineHeight: 22, marginBottom: 20 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  cta: { borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  ctaTxt: { color: '#0A0A0F', fontWeight: '800', fontSize: font.size.md },
  help: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
}));
