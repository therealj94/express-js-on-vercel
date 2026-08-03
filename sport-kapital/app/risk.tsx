// app/risk.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { CyberBackground } from '@/components/CyberBackground';
import { GlitchText } from '@/components/GlitchText';
import { success, tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';

const POINTS = () => [t('risk.p1'), t('risk.p2'), t('risk.p3'), t('risk.p4'), t('risk.p5'), t('risk.p6'), t('risk.p7'), t('risk.p8')];

export default function Risk() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const acceptRisk = useStore((s) => s.acceptRisk);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [checked, setChecked] = useState(false);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 40 && !scrolledEnd) {
      setScrolledEnd(true);
      tap();
    }
  };

  const accept = () => {
    success();
    acceptRisk();
    router.replace('/(tabs)/dashboard');
  };

  const enabled = scrolledEnd && checked;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <CyberBackground variant="subtle" />

      <View style={styles.brandRow}>
        <Logo size={22} />
        <Text style={styles.brand}>SPORT KAPITAL</Text>
      </View>

      <View style={styles.badgeRow}>
        <Icon name="shield" size={16} color={colors.gold} />
        <Text style={styles.badge}>{t('risk.badge')}</Text>
      </View>
      <GlitchText style={styles.title}>{t('risk.title')}</GlitchText>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
      >
        <Text style={styles.intro}>{t('risk.intro')}</Text>
        {POINTS().map((p, i) => (
          <View key={i} style={styles.point}>
            <Text style={styles.num}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={styles.pointTxt}>{p}</Text>
          </View>
        ))}
        <Text style={styles.legal}>{t('risk.legal')}</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => { if (scrolledEnd) { tap(); setChecked((v) => !v); } }} style={[styles.checkRow, !scrolledEnd && { opacity: 0.4 }]}>
          <View style={[styles.checkbox, checked && styles.checkboxOn]}>
            {checked && <Icon name="check" size={15} color="#03150B" strokeWidth={3} />}
          </View>
          <Text style={styles.checkLabel}>{t('risk.check')}</Text>
        </Pressable>

        {!scrolledEnd && (
          <Animated.View entering={FadeInDown} style={styles.hintRow}>
            <Icon name="chevron-down" size={15} color={colors.gold} />
            <Text style={styles.hint}>{t('risk.hint')}</Text>
          </Animated.View>
        )}

        <Button label={t('risk.accept')} onPress={accept} variant="success" disabled={!enabled} />
      </View>
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  brand: { color: colors.text, fontSize: font.size.xs, fontWeight: '800', letterSpacing: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  badge: { color: colors.gold, fontSize: font.size.xs, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: font.size.xl, marginBottom: 16, fontFamily: font.family.heading, letterSpacing: 0.5 },
  scroll: { flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, padding: 16 },
  intro: { color: colors.textSecondary, fontSize: font.size.sm, marginBottom: 16, lineHeight: 20 },
  point: { flexDirection: 'row', marginBottom: 16 },
  num: { color: colors.gold, fontSize: font.size.sm, fontWeight: '800', width: 28 },
  pointTxt: { color: colors.text, fontSize: font.size.md, flex: 1, lineHeight: 22 },
  legal: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 8, lineHeight: 18, fontStyle: 'italic' },
  footer: { paddingTop: 16, gap: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.profit, borderColor: colors.profit },
  checkLabel: { color: colors.text, fontSize: font.size.md, fontWeight: '600', flex: 1 },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  hint: { color: colors.gold, fontSize: font.size.sm, fontWeight: '600' },
}));
