// app/(tabs)/market.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { TeamCard } from '@/components/TeamCard';
import { LiveMatchCard } from '@/components/LiveMatchCard';
import { StandingsTable } from '@/components/StandingsTable';
import { Icon } from '@/components/Icon';
import { type League } from '@/data/teams';
import { isRealMatch } from '@/utils/matchEngine';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { useBallRefresh, ballRefreshControl } from '@/components/BallRefresh';

type Sort = 'cap' | 'gainers' | 'losers';
type MatchFilter = 'ALL' | 'SIM' | 'REAL';
type ViewMode = 'tokens' | 'standings';
const LEAGUES: (League | 'ALL')[] = ['ALL', 'MUNDIAL', 'LALIGA', 'BRASIL', 'ESTADOS_UNIDOS', 'HONDURAS'];

export default function Market() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const teams = useStore((s) => s.teams);
  const matches = useStore((s) => s.matches);
  const [q, setQ] = useState('');
  const [league, setLeague] = useState<League | 'ALL'>('ALL');
  const [sort, setSort] = useState<Sort>('cap');
  const [viewMode, setViewMode] = useState<ViewMode>('tokens');
  // en cuenta real, la lista de partidos arranca mostrando solo los REALES
  const [matchFilter, setMatchFilter] = useState<MatchFilter>(() =>
    useStore.getState().accountMode === 'REAL' ? 'REAL' : 'ALL');
  const refresh = useBallRefresh();

  // los partidos del Mundial (id 'sched-…') tienen su propio apartado premium
  // (dashboard + /mundial), así que no se listan acá como "en vivo" del mercado.
  const liveMatchesAll = matches.filter((m) => m.status !== 'FT' && !m.id.startsWith('sched-'));
  const liveMatches = liveMatchesAll.filter((m) =>
    matchFilter === 'ALL' ? true : matchFilter === 'REAL' ? isRealMatch(m) : !isRealMatch(m)
  );
  const liveMatchesCap = matchFilter === 'ALL' ? 2 : 6;

  const filtered = useMemo(() => {
    let list = teams.filter((t) => {
      const mq = q === '' || t.name.toLowerCase().includes(q.toLowerCase()) || t.short.toLowerCase().includes(q.toLowerCase());
      const ml = league === 'ALL' || t.league === league;
      return mq && ml;
    });
    if (sort === 'gainers') list = [...list].sort((a, b) => b.priceChange - a.priceChange);
    else if (sort === 'losers') list = [...list].sort((a, b) => a.priceChange - b.priceChange);
    else list = [...list].sort((a, b) => b.liquidity - a.liquidity);
    return list;
  }, [teams, q, league, sort]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>{t('mkt.title')}</Text>

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput value={q} onChangeText={setQ} placeholder={t('mkt.search')} placeholderTextColor={colors.textTertiary} style={styles.searchInput} />
        {q !== '' && <Pressable onPress={() => { tap(); setQ(''); }} hitSlop={8}><Icon name="close" size={16} color={colors.textTertiary} /></Pressable>}
      </View>

      <View style={styles.chips}>
        {LEAGUES.map((l) => (
          <Pressable key={l} onPress={() => { tap(); setLeague(l); }} style={[styles.chip, league === l && styles.chipOn]}>
            <Text style={[styles.chipTxt, league === l && styles.chipTxtOn]}>{l === 'ALL' ? t('mkt.allLeagues') : t(`league.${l}`)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.segmentRow}>
        <View style={styles.segment}>
          {(['tokens', 'standings'] as ViewMode[]).map((m) => (
            <Pressable key={m} onPress={() => { tap(); setViewMode(m); }} style={[styles.segmentBtn, viewMode === m && styles.segmentBtnOn]}>
              <Text style={[styles.segmentTxt, viewMode === m && styles.segmentTxtOn]}>
                {m === 'tokens' ? t('mkt.viewTokens') : t('mkt.viewStandings')}
              </Text>
            </Pressable>
          ))}
        </View>
        {viewMode === 'tokens' && (
          <View style={styles.chipsInline}>
            {(['cap', 'gainers', 'losers'] as Sort[]).map((s) => (
              <Pressable key={s} onPress={() => { tap(); setSort(s); }} style={[styles.chipSmall, sort === s && styles.chipGold]}>
                <Text style={[styles.chipSmallTxt, sort === s && styles.chipTxtGold]}>{{ cap: t('mkt.sortLiquidity'), gainers: t('mkt.sortGainers'), losers: t('mkt.sortLosers') }[s]}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {viewMode === 'standings' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 10, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {league === 'ALL'
            ? (['MUNDIAL', 'LALIGA', 'BRASIL', 'ESTADOS_UNIDOS', 'HONDURAS'] as League[]).map((l) => (
                <StandingsTable key={l} teams={teams} league={l} />
              ))
            : <StandingsTable teams={teams} league={league} />}
        </ScrollView>
      ) : isFocused ? (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TeamCard team={item} />}
          ListHeaderComponent={
            liveMatchesAll.length > 0 && league === 'ALL' && q === '' ? (
              <View style={{ marginBottom: 6 }}>
                <View style={styles.liveHeaderRow}>
                  <Text style={styles.liveHeaderTxt}>{t('mkt.liveMatches')}</Text>
                  <View style={styles.chipsInline}>
                    {(['ALL', 'SIM', 'REAL'] as MatchFilter[]).map((f) => (
                      <Pressable key={f} onPress={() => { tap(); setMatchFilter(f); }} style={[styles.chipSmall, matchFilter === f && styles.chipOn]}>
                        <Text style={[styles.chipSmallTxt, matchFilter === f && styles.chipTxtOn]}>
                          {f === 'ALL' ? t('mkt.filterAll') : f === 'SIM' ? t('mkt.filterSim') : t('mkt.filterReal')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {liveMatches.length === 0
                  ? <Text style={styles.empty}>{t('mkt.noLiveOfType')}</Text>
                  : liveMatches.slice(0, liveMatchesCap).map((m) => <LiveMatchCard key={m.id} match={m} />)}
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 6, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={ballRefreshControl(refresh)}
          ListEmptyComponent={<Text style={styles.empty}>{t('mkt.empty')}</Text>}
        />
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: font.size['2xl'], fontFamily: font.family.heading, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: spacing.xl, marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgCard, borderRadius: radius.md, paddingHorizontal: 14, marginHorizontal: spacing.xl, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: font.size.md, height: 48 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.xl, paddingTop: 10 },
  chip: { backgroundColor: colors.bgCard, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.bgCardHover, borderColor: colors.borderStrong },
  chipGold: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipTxt: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700' },
  chipTxtOn: { color: colors.text },
  chipTxtGold: { color: '#1A1500' },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: font.size.md },
  liveHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 },
  liveHeaderTxt: { color: colors.text, fontSize: font.size.sm, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1 },
  chipsInline: { flexDirection: 'row', gap: 6 },
  chipSmall: { backgroundColor: colors.bgCard, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  chipSmallTxt: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: 12, flexWrap: 'wrap', gap: 8 },
  segment: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, padding: 3 },
  segmentBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full },
  segmentBtnOn: { backgroundColor: colors.gold },
  segmentTxt: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '800', textTransform: 'uppercase' },
  segmentTxtOn: { color: '#1A1500' },
}));
