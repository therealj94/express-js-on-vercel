// components/GoalAlert.tsx
// Aviso en pantalla cuando anota un equipo que tienes comprado — estilo
// alerta de mercado (ticker + %), no un cartel de "¡GOL!". Se retira solo
// a los pocos segundos (lo controla utils/goalAlerts.ts).
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, neon, themedSheet, type Palette } from '@/theme/tokens';
import { TeamBadge } from './TeamBadge';
import { Icon } from './Icon';
import { success as hSuccess } from '@/utils/haptics';
import { t } from '@/utils/i18n';

export function GoalAlert() {
  const insets = useSafeAreaInsets();
  const alert = useStore((s) => s.goalAlert);

  useEffect(() => {
    if (alert) hSuccess();
  }, [alert?.id]);

  if (!alert) return null;

  const up = alert.pct >= 0;

  return (
    <Animated.View
      key={alert.id}
      entering={SlideInUp.springify().damping(16)}
      exiting={SlideOutUp.duration(220)}
      style={[styles.wrap, { top: insets.top + 8 }, neon(up ? colors.profit : colors.loss, 'md')]}
      pointerEvents="none"
    >
      <TeamBadge short={alert.ticker} color={alert.color} color2={alert.color2} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={styles.ticker}>{alert.ticker} {up ? '+' : ''}{alert.pct.toFixed(2)}%</Text>
        <Text style={[styles.sub, { color: up ? colors.profit : colors.loss }]}>{t('goal.confirmed', { team: alert.teamName })}</Text>
      </View>
      <Icon name="bolt" size={18} color={up ? colors.profit : colors.loss} />
    </Animated.View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  wrap: {
    position: 'absolute', left: spacing.xl, right: spacing.xl, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  ticker: { color: colors.text, fontSize: font.size.md, fontFamily: font.family.headingBold, letterSpacing: 1 },
  sub: { fontSize: font.size.xs, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
}));
