// components/Lineups.tsx
// Alineaciones confirmadas de un partido real, dibujadas sobre una cancha:
// el once inicial se coloca por líneas según la formación (la API entrega la
// posición en cuadrícula "fila:columna"), más el DT y el banco.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, font, radius, themedSheet, type Palette } from '@/theme/tokens';
import { fetchFixtureLineups, type ApiLineup } from '@/utils/footballApi';
import { t } from '@/utils/i18n';

interface PlayerDot { number: number | null; name: string; row: number }

/** Agrupa el once en líneas (arquero, defensa, medio, ataque) usando `grid`. */
function toRows(lineup: ApiLineup): PlayerDot[][] {
  const players: PlayerDot[] = lineup.startXI.map((p) => {
    const grid = p.player.grid ?? '1:1';
    const row = parseInt(grid.split(':')[0] ?? '1', 10) || 1;
    return { number: p.player.number, name: shortName(p.player.name), row };
  });
  const maxRow = players.reduce((m, p) => Math.max(m, p.row), 1);
  const rows: PlayerDot[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const line = players.filter((p) => p.row === r);
    if (line.length) rows.push(line);
  }
  // sin datos de cuadrícula la API devuelve todo en la fila 1: mostralo plano
  return rows.length ? rows : [players];
}

/** "L. Messi" a partir de "Lionel Messi" — cabe mejor en la cancha. */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function TeamPitch({ lineup, accent }: { lineup: ApiLineup; accent: string }) {
  const rows = toRows(lineup);
  return (
    <View style={styles.pitchWrap}>
      <View style={styles.pitchHead}>
        <Text style={styles.pitchTeam} numberOfLines={1}>{lineup.team.name}</Text>
        {lineup.formation ? <Text style={[styles.formation, { color: accent }]}>{lineup.formation}</Text> : null}
      </View>

      <View style={styles.pitch}>
        <View style={styles.midLine} />
        <View style={styles.centerCircle} />
        {rows.map((line, i) => (
          <View key={i} style={styles.pitchRow}>
            {line.map((p, j) => (
              <View key={`${i}-${j}`} style={styles.playerSlot}>
                <View style={[styles.shirt, { borderColor: accent }]}>
                  <Text style={styles.shirtNum}>{p.number ?? '–'}</Text>
                </View>
                <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {lineup.coach?.name ? (
        <Text style={styles.coach}>{t('lineup.coach')}: <Text style={styles.coachName}>{lineup.coach.name}</Text></Text>
      ) : null}

      {lineup.substitutes.length > 0 && (
        <View style={styles.benchWrap}>
          <Text style={styles.benchTitle}>{t('lineup.bench')}</Text>
          <View style={styles.benchList}>
            {lineup.substitutes.map((p, i) => (
              <Text key={i} style={styles.benchTxt} numberOfLines={1}>
                <Text style={styles.benchNum}>{p.player.number ?? '–'}</Text>  {shortName(p.player.name)}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export function Lineups({ fixtureId, homeColor, awayColor }: { fixtureId: number | null; homeColor: string; awayColor: string }) {
  const [data, setData] = useState<ApiLineup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (fixtureId == null) { setTried(true); return; }
    let cancelled = false;
    setLoading(true);
    fetchFixtureLineups(fixtureId)
      .then((res) => { if (!cancelled) setData(res); })
      .finally(() => { if (!cancelled) { setLoading(false); setTried(true); } });
    return () => { cancelled = true; };
  }, [fixtureId]);

  if (loading) {
    return <View style={styles.state}><ActivityIndicator color={colors.gold} /></View>;
  }
  if (!data || data.length === 0) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateTxt}>{tried ? t('lineup.none') : ''}</Text>
      </View>
    );
  }

  const safe = (c: string) => (c === '#FFFFFF' ? colors.textSecondary : c);
  return (
    <View style={{ gap: 14 }}>
      {data.map((lu, i) => (
        <TeamPitch key={lu.team.id} lineup={lu} accent={safe(i === 0 ? homeColor : awayColor)} />
      ))}
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  state: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  stateTxt: { color: colors.textSecondary, fontSize: font.size.sm, textAlign: 'center' },
  pitchWrap: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  pitchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.bgElevated },
  pitchTeam: { flex: 1, color: colors.text, fontSize: font.size.sm, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 0.6 },
  formation: { fontSize: font.size.sm, fontWeight: '900', letterSpacing: 1 },
  pitch: { backgroundColor: 'rgba(0,120,60,0.10)', paddingVertical: 16, gap: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  midLine: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  centerCircle: { position: 'absolute', alignSelf: 'center', top: '50%', width: 62, height: 62, borderRadius: 31, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginTop: -31 },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  playerSlot: { alignItems: 'center', gap: 4, width: 58 },
  shirt: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  shirtNum: { color: colors.text, fontSize: 11, fontWeight: '900' },
  playerName: { color: colors.textSecondary, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  coach: { color: colors.textTertiary, fontSize: font.size.xs, paddingHorizontal: 14, paddingTop: 10 },
  coachName: { color: colors.textSecondary, fontWeight: '700' },
  benchWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 },
  benchTitle: { color: colors.textTertiary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  benchList: { gap: 4 },
  benchTxt: { color: colors.textSecondary, fontSize: font.size.xs },
  benchNum: { color: colors.textTertiary, fontWeight: '900' },
}));
