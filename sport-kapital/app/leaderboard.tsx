// app/leaderboard.tsx
// Top Traders: ranking mundial y regional. Todos los rivales son simulados con
// nombres de usuario generados — nunca nombres reales — por privacidad.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore, selectEquity } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd, pct } from '@/utils/format';
import { Icon } from '@/components/Icon';
import { Panel } from '@/components/Panel';
import { CyberBackground } from '@/components/CyberBackground';
import { COUNTRIES } from '@/app/register';
import {
  buildGlobalPool, buildRegionalPool, withYou, regionForCountry, REGION_LABEL,
  type LeaderboardEntry,
} from '@/utils/leaderboard';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';

type Scope = 'GLOBAL' | 'REGIONAL';

export default function Leaderboard() {
  const insets = useSafeAreaInsets();
  const user = useStore((s) => s.user);
  const alias = useStore((s) => s.alias);
  const equity = useStore(selectEquity);
  const [scope, setScope] = useState<Scope>('GLOBAL');

  const countryCode = user?.country ?? 'HN';
  const region = regionForCountry(countryCode);
  const displayName = alias || user?.name.split(' ')[0] || 'Trader';

  const you: LeaderboardEntry = useMemo(() => ({
    id: 'you', handle: `Tú (${displayName})`, countryCode, equity, roiPct: ((equity - 500) / 500) * 100, isYou: true,
  }), [displayName, countryCode, equity]);

  const globalList = useMemo(() => withYou(buildGlobalPool(), you), [you]);
  const regionalList = useMemo(() => withYou(buildRegionalPool(region), you), [you, region]);

  const { entries, rank } = scope === 'GLOBAL' ? globalList : regionalList;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <CyberBackground variant="subtle" />
      <View style={styles.header}>
        <Pressable onPress={() => { tap(); router.back(); }} style={styles.back}><Icon name="chevron-left" size={20} color={colors.text} /></Pressable>
        <Text style={styles.title}>TOP TRADERS</Text>
        <View style={{ width: 40 }} />
      </View>

      <Panel style={styles.rankCard} glow>
        <Icon name="trophy" size={22} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rankLbl}>{t('lead.yourRank', { scope: scope === 'GLOBAL' ? t('lead.worldScope') : t('lead.inRegion', { region: REGION_LABEL[region] }) })}</Text>
          <Text style={styles.rankVal}>{t('lead.of', { rank, total: entries.length })}</Text>
        </View>
        <Text style={styles.rankEquity}>{usd(equity)}</Text>
      </Panel>

      <View style={styles.tabs}>
        <Pressable onPress={() => { tap(); setScope('GLOBAL'); }} style={[styles.tab, scope === 'GLOBAL' && styles.tabOn]}>
          <Icon name="star" size={14} color={scope === 'GLOBAL' ? colors.gold : colors.textSecondary} />
          <Text style={[styles.tabTxt, scope === 'GLOBAL' && styles.tabTxtOn]}>{t('lead.world')}</Text>
        </Pressable>
        <Pressable onPress={() => { tap(); setScope('REGIONAL'); }} style={[styles.tab, scope === 'REGIONAL' && styles.tabOn]}>
          <Icon name="target" size={14} color={scope === 'REGIONAL' ? colors.gold : colors.textSecondary} />
          <Text style={[styles.tabTxt, scope === 'REGIONAL' && styles.tabTxtOn]}>{REGION_LABEL[region]}</Text>
        </Pressable>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 24, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => <Row entry={item} rank={index + 1} />}
      />
    </View>
  );
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function Row({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const country = COUNTRIES.find((c) => c.code === entry.countryCode);
  const up = entry.roiPct >= 0;
  return (
    <Animated.View entering={rank <= 12 ? FadeInDown.delay(Math.min(rank, 10) * 25) : undefined}>
      <View style={[styles.row, entry.isYou && styles.rowYou]}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeTxt}>{MEDAL[rank] ?? rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.handle, entry.isYou && { color: colors.gold }]} numberOfLines={1}>{entry.handle}</Text>
          <Text style={styles.country}>{country?.name ?? entry.countryCode}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.equity}>{usd(entry.equity)}</Text>
          <Text style={[styles.roi, { color: up ? colors.profit : colors.loss }]}>{pct(entry.roiPct)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginBottom: 14 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: font.size.lg, fontFamily: font.family.headingBold, textTransform: 'uppercase' },
  rankCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.xl, padding: 16, marginBottom: 16 },
  rankLbl: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '600' },
  rankVal: { color: colors.text, fontSize: font.size.lg, marginTop: 2, fontFamily: font.family.heading },
  rankEquity: { color: colors.gold, fontSize: font.size.md, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.xl, marginBottom: 14 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, paddingVertical: 10, justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  tabOn: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  tabTxt: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700' },
  tabTxtOn: { color: colors.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  rowYou: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  rankBadge: { width: 32, alignItems: 'center' },
  rankBadgeTxt: { color: colors.textSecondary, fontSize: font.size.md, fontWeight: '800' },
  handle: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  country: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 2, fontWeight: '600' },
  equity: { color: colors.text, fontSize: font.size.sm, fontWeight: '800' },
  roi: { fontSize: font.size.xs, fontWeight: '700', marginTop: 2 },
}));
