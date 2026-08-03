// app/(tabs)/news.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { pct, timeAgo } from '@/utils/format';
import { Icon } from '@/components/Icon';
import { tap } from '@/utils/haptics';
import { t, tName } from '@/utils/i18n';
import type { NewsItem } from '@/utils/matchEngine';
import type { Team } from '@/data/teams';

type Filter = 'ALL' | 'PARTIDO' | 'MERCADO';

export default function News() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const news = useStore((s) => s.news);
  const teams = useStore((s) => s.teams);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = news.filter((n) => filter === 'ALL' || n.source === filter);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>{t('news.title')}</Text>
      <Text style={styles.subtitle}>{t('news.subtitle')}</Text>

      <View style={styles.chips}>
        {(['ALL', 'PARTIDO', 'MERCADO'] as Filter[]).map((f) => (
          <Pressable key={f} onPress={() => { tap(); setFilter(f); }} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={[styles.chipTxt, filter === f && styles.chipTxtOn]}>{{ ALL: t('common.all'), PARTIDO: t('news.matches'), MERCADO: t('news.market') }[f]}</Text>
          </Pressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="news" size={28} color={colors.gold} /></View>
          <Text style={styles.emptyTxt}>{t('news.empty')}</Text>
        </View>
      ) : !isFocused ? (
        <View style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 24, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: n, index: i }) => (
            <NewsCard
              n={n}
              index={i}
              team={teams.find((t) => t.id === n.teamId)}
              open={expanded === n.id}
              onToggle={() => setExpanded(expanded === n.id ? null : n.id)}
            />
          )}
        />
      )}
    </View>
  );
}

function NewsCard({ n, index, team, open, onToggle }: { n: NewsItem; index: number; team?: Team; open: boolean; onToggle: () => void }) {
  return (
    <Animated.View entering={index < 8 ? FadeInDown.delay(index * 35) : undefined}>
      <Pressable onPress={() => { tap(); onToggle(); }} style={[styles.card, { borderLeftColor: n.impact >= 0 ? colors.profit : n.impact < 0 ? colors.loss : colors.border }]}>
        <View style={styles.cardHead}>
          <Text style={styles.headline} numberOfLines={open ? undefined : 2}>{n.headline}</Text>
          {n.impact !== 0 && <Text style={[styles.impact, { color: n.impact >= 0 ? colors.profit : colors.loss }]}>{pct(n.impact)}</Text>}
        </View>
        <Text style={styles.meta}>{n.source === 'PARTIDO' ? t('news.matchTag') : t('news.marketTag')} · {timeAgo(n.ts)}</Text>
        {open && (
          <>
            <Text style={styles.body}>{n.body}</Text>
            {team && (
              <Pressable onPress={() => { tap(); router.push(`/team/${team.id}`); }} style={styles.teamLink}>
                <Text style={styles.teamLinkTxt}>{t('news.viewTeam', { name: tName(team) })}</Text>
                <Icon name="chevron-right" size={14} color={colors.gold} />
              </Pressable>
            )}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: font.size['2xl'], fontFamily: font.family.heading, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: spacing.xl },
  subtitle: { color: colors.textSecondary, fontSize: font.size.sm, paddingHorizontal: spacing.xl, marginTop: 4 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.xl, paddingVertical: 12 },
  chip: { backgroundColor: colors.bgCard, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipTxt: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700' },
  chipTxtOn: { color: '#1A1500' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100, paddingHorizontal: 40 },
  emptyIcon: { width: 76, height: 76, borderRadius: 22, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTxt: { color: colors.textSecondary, fontSize: font.size.md, textAlign: 'center', lineHeight: 22 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  headline: { color: colors.text, fontSize: font.size.md, fontWeight: '700', flex: 1, lineHeight: 21 },
  impact: { fontSize: font.size.md, fontWeight: '900' },
  meta: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 6, fontWeight: '600' },
  body: { color: colors.textSecondary, fontSize: font.size.sm, lineHeight: 20, marginTop: 10 },
  teamLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  teamLinkTxt: { color: colors.gold, fontSize: font.size.sm, fontWeight: '800' },
}));
