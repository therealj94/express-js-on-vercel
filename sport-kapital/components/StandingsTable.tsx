// components/StandingsTable.tsx
// Tabla de posiciones estilo liga real: PJ/G/E/P/GF/GC/DG/Pts, ordenada por
// puntos (criterio de desempate: diferencia de gol). Toca una fila para ir
// directo al token del equipo.
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { TeamBadge } from '@/components/TeamBadge';
import { tap } from '@/utils/haptics';
import { tName, t } from '@/utils/i18n';
import type { League, Team } from '@/data/teams';
import { LEAGUE_LABEL } from '@/data/teams';

interface Row {
  team: Team;
  points: number;
  goalDiff: number;
}

function buildRows(teams: Team[], league: League): Row[] {
  return teams
    .filter((t) => t.league === league)
    .map((team) => ({
      team,
      points: team.wins * 3 + team.draws,
      goalDiff: team.goalsFor - team.goalsAgainst,
    }))
    .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.team.goalsFor - a.team.goalsFor);
}

export function StandingsTable({ teams, league }: { teams: Team[]; league: League }) {
  const rows = useMemo(() => buildRows(teams, league), [teams, league]);
  if (rows.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{LEAGUE_LABEL[league]}</Text>
      <View style={styles.headerRow}>
        <Text style={[styles.hCell, styles.hRank]}>#</Text>
        <Text style={[styles.hCell, styles.hTeam]}>{t('standings.team')}</Text>
        <Text style={styles.hCell}>PJ</Text>
        <Text style={styles.hCell}>G</Text>
        <Text style={styles.hCell}>E</Text>
        <Text style={styles.hCell}>P</Text>
        <Text style={styles.hCell}>DG</Text>
        <Text style={[styles.hCell, styles.hPts]}>Pts</Text>
      </View>
      {rows.map((r, i) => (
        <Pressable
          key={r.team.id}
          onPress={() => { tap(); router.push(`/team/${r.team.id}`); }}
          style={[styles.row, i % 2 === 1 && styles.rowAlt]}
        >
          <Text style={[styles.cell, styles.rank]}>{i + 1}</Text>
          <View style={styles.teamCell}>
            <TeamBadge short={r.team.short} color={r.team.color} color2={r.team.color2} size={22} />
            <Text style={styles.teamName} numberOfLines={1}>{tName(r.team)}</Text>
          </View>
          <Text style={styles.cell}>{r.team.played}</Text>
          <Text style={styles.cell}>{r.team.wins}</Text>
          <Text style={styles.cell}>{r.team.draws}</Text>
          <Text style={styles.cell}>{r.team.losses}</Text>
          <Text style={[styles.cell, r.goalDiff > 0 ? styles.pos : r.goalDiff < 0 ? styles.neg : undefined]}>
            {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
          </Text>
          <Text style={[styles.cell, styles.pts]}>{r.points}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  wrap: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 14, overflow: 'hidden' },
  title: { color: colors.gold, fontSize: font.size.sm, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1, padding: 12, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  hCell: { flex: 1, color: colors.textTertiary, fontSize: 10, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase' },
  hRank: { flex: 0.5 },
  hTeam: { flex: 3, textAlign: 'left' },
  hPts: { flex: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9 },
  rowAlt: { backgroundColor: colors.bgCardHover },
  cell: { flex: 1, color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '600', textAlign: 'center' },
  rank: { flex: 0.5, color: colors.textTertiary, fontWeight: '800' },
  teamCell: { flex: 3, flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamName: { flex: 1, color: colors.text, fontSize: font.size.xs, fontWeight: '700' },
  pts: { flex: 0.8, color: colors.gold, fontWeight: '900', fontSize: font.size.sm },
  pos: { color: colors.profit },
  neg: { color: colors.loss },
}));
