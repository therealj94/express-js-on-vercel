// components/TeamCard.tsx
// Fila de equipo estilo lista de mercado de exchange: escudo, nombre + par,
// mini-gráfico, y a la derecha el precio bien grande con el % del día en una
// píldora de color. La jerarquía deja claro de un vistazo cuánto vale y si
// sube o baja.
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd, pct } from '@/utils/format';
import { TeamBadge } from '@/components/TeamBadge';
import { Sparkline } from '@/components/Sparkline';
import { PriceFlash } from '@/components/PriceFlash';
import { Icon } from '@/components/Icon';
import { tap } from '@/utils/haptics';
import { tName } from '@/utils/i18n';
import type { Team } from '@/data/teams';

export function TeamCard({ team }: { team: Team }) {
  const up = team.priceChange >= 0;
  const closes = team.candles.slice(-30).map((c) => c.c);
  return (
    <Pressable onPress={() => { tap(); router.push(`/team/${team.id}`); }} style={styles.card}>
      <TeamBadge short={team.short} color={team.color} color2={team.color2} />
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={1}>{tName(team)}</Text>
        <Text style={styles.sub} numberOfLines={1}>{team.short}<Text style={styles.subDim}>/USDT</Text></Text>
      </View>
      <Sparkline data={closes} up={up} />
      <View style={styles.right}>
        <PriceFlash value={team.currentPrice} format={usd} style={styles.price} />
        <View style={[styles.pctPill, { backgroundColor: up ? colors.profitDim : colors.lossDim }]}>
          <Icon name={up ? 'arrow-up-right' : 'arrow-down-right'} size={11} color={up ? colors.profit : colors.loss} />
          <Text style={[styles.pct, { color: up ? colors.profit : colors.loss }]}>{pct(team.priceChange)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 12, gap: 14 },
  mid: { flex: 1 },
  name: { color: colors.text, fontSize: font.size.md, fontWeight: '700' },
  sub: { color: colors.textSecondary, fontSize: font.size.xs, marginTop: 3, fontWeight: '700', letterSpacing: 0.3 },
  subDim: { color: colors.textTertiary, fontWeight: '600' },
  right: { alignItems: 'flex-end', minWidth: 92, gap: 5 },
  price: { color: colors.text, fontSize: font.size.md, fontWeight: '800', letterSpacing: -0.2 },
  pctPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm },
  pct: { fontSize: font.size.xs, fontWeight: '800' },
}));
