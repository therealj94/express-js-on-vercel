// app/(tabs)/real.tsx
// Pestaña "Partidos": la cartelera REAL de las cuatro ligas, directo de
// api-football. Filtro por liga y tres vistas: hoy, próximos y resultados.
// Todo lo que se ve acá es fútbol real — no hay contenido simulado.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { startRealEngineLazy } from '@/utils/realMatchEngine';
import { refreshLeagueFixtures, allFixtures } from '@/utils/leagueFixtures';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { FixtureRow, LeagueHeader } from '@/components/FixtureRow';
import { LEAGUE_API, LEAGUE_ORDER } from '@/data/leagues';
import type { League } from '@/data/teams';
import { isLive, isFinished } from '@/utils/realData';
import { tap } from '@/utils/haptics';
import { t, getLang, WEEKDAYS_I18N, MONTHS_I18N } from '@/utils/i18n';
import { useBallRefresh, ballRefreshControl } from '@/components/BallRefresh';

type Tab = 'today' | 'upcoming' | 'results';

const pad = (n: number) => n.toString().padStart(2, '0');
const dayKey = (iso: string) => iso.slice(0, 10);

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return t('common.today').toUpperCase();
  if (same(d, tomorrow)) return t('common.tomorrow').toUpperCase();
  const lang = getLang();
  return `${WEEKDAYS_I18N[lang][d.getDay()]} ${pad(d.getDate())} ${MONTHS_I18N[lang][d.getMonth()]}`.toUpperCase();
}

export default function MatchesTab() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const teams = useStore((s) => s.teams);
  const leagueFixtures = useStore((s) => s.leagueFixtures);
  const loading = useStore((s) => s.isFetchingFixtures);
  const refresh = useBallRefresh();

  const [tab, setTab] = useState<Tab>('today');
  const [league, setLeague] = useState<League | 'ALL'>('ALL');

  // arranque perezoso de todo lo que toca la red (idempotente y cacheado)
  useEffect(() => {
    startRealEngineLazy();
    refreshLeagueFixtures();
  }, []);

  const rows = useMemo(() => {
    const all = allFixtures(leagueFixtures).filter((f) => league === 'ALL' || f.league === league);
    const now = Date.now();
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);

    if (tab === 'today') {
      return all.filter((f) => {
        const ts = Date.parse(f.dateISO);
        return isLive(f.statusShort) || (ts >= startToday.getTime() && ts <= endToday.getTime());
      });
    }
    if (tab === 'upcoming') {
      return all.filter((f) => !isFinished(f.statusShort) && !isLive(f.statusShort) && Date.parse(f.dateISO) > now);
    }
    return all.filter((f) => isFinished(f.statusShort)).sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  }, [leagueFixtures, league, tab]);

  // agrupado: por liga cuando se ven todas, por día cuando se filtra una sola
  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const fx of rows) {
      const key = league === 'ALL' ? fx.league : dayKey(fx.dateISO);
      const arr = map.get(key) ?? [];
      arr.push(fx);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [rows, league]);

  const liveCount = useMemo(
    () => allFixtures(leagueFixtures).filter((f) => isLive(f.statusShort)).length,
    [leagueFixtures],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('matches.title')}</Text>
        {liveCount > 0 && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillTxt}>{liveCount} {t('common.live')}</Text>
          </View>
        )}
      </View>

      <View style={styles.segment}>
        {(['today', 'upcoming', 'results'] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => { tap(); setTab(k); }} style={[styles.segBtn, tab === k && styles.segBtnOn]}>
            <Text style={[styles.segTxt, tab === k && styles.segTxtOn]}>{t(`matches.${k}`)}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {(['ALL', ...LEAGUE_ORDER] as (League | 'ALL')[]).map((l) => (
          <Pressable key={l} onPress={() => { tap(); setLeague(l); }} style={[styles.chip, league === l && styles.chipOn]}>
            <Text style={[styles.chipTxt, league === l && styles.chipTxtOn]}>
              {l === 'ALL' ? t('mkt.allLeagues') : LEAGUE_API[l].label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isFocused ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 10, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={ballRefreshControl(refresh)}
        >
          {groups.length === 0 ? (
            <View style={styles.empty}>
              {loading ? <ActivityIndicator color={colors.gold} /> : <Icon name="calendar" size={26} color={colors.textTertiary} />}
              <Text style={styles.emptyTxt}>{loading ? t('common.loading') : t('matches.empty')}</Text>
            </View>
          ) : (
            groups.map(([key, list]) => (
              <View key={key} style={styles.group}>
                <LeagueHeader
                  label={league === 'ALL' ? LEAGUE_API[key as League].label : dayLabel(list[0].dateISO)}
                  country={league === 'ALL' ? LEAGUE_API[key as League].country : undefined}
                />
                <View>
                  {list.map((fx, i) => <FixtureRow key={fx.fixtureId} fx={fx} teams={teams} index={i} />)}
                </View>
              </View>
            ))
          )}
          <Text style={styles.footNote}>{t('matches.footNote')}</Text>
        </ScrollView>
      ) : <View style={{ flex: 1 }} />}
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginBottom: 12 },
  title: { color: colors.text, fontSize: font.size['2xl'], fontFamily: font.family.heading, textTransform: 'uppercase', letterSpacing: 1 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.lossDim, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.loss },
  livePillTxt: { color: colors.loss, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  segment: { flexDirection: 'row', marginHorizontal: spacing.xl, backgroundColor: colors.bgCard, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.full, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.gold },
  segTxt: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '800', textTransform: 'uppercase' },
  segTxtOn: { color: '#14000F' },
  chipsScroll: { maxHeight: 52, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: spacing.xl, paddingTop: 12, paddingBottom: 2 },
  chip: { backgroundColor: colors.bgCard, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.bgCardHover, borderColor: colors.borderStrong },
  chipTxt: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '700' },
  chipTxtOn: { color: colors.text },
  group: { marginBottom: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.bgCard },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  emptyTxt: { color: colors.textSecondary, fontSize: font.size.sm, textAlign: 'center' },
  footNote: { color: colors.textTertiary, fontSize: font.size.xs, textAlign: 'center', marginTop: 6, lineHeight: 16 },
}));
