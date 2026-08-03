// components/FixtureRow.tsx
// Fila de partido al estilo de las apps de resultados: a la izquierda la hora
// (o el minuto en vivo / "FIN"), en el centro los dos equipos uno sobre otro
// con su escudo, y a la derecha el marcador. Los equipos tokenizados se marcan
// con un punto dorado y la fila lleva al partido o al token.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { colors, font, radius, themedSheet, type Palette } from '@/theme/tokens';
import { TeamBadge } from '@/components/TeamBadge';
import { Icon } from '@/components/Icon';
import { tap } from '@/utils/haptics';
import { t, tName } from '@/utils/i18n';
import { isLive, isFinished, type LeagueFixtureLite } from '@/utils/realData';
import type { Team } from '@/data/teams';

const NEUTRAL = { color: '#3A4150', color2: '#252B36' };

function sideOf(teams: Team[], teamId: string | undefined, fallbackName: string) {
  const tm = teamId ? teams.find((x) => x.id === teamId) : undefined;
  if (tm) return { name: tName(tm), short: tm.short, color: tm.color, color2: tm.color2, tokenId: tm.id };
  const short = fallbackName.replace(/[^A-Za-zÀ-ÿ ]/g, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '—';
  return { name: fallbackName, short, ...NEUTRAL, tokenId: undefined as string | undefined };
}

/** Etiqueta de estado a la izquierda: minuto en vivo, "FIN" o la hora del saque. */
function statusLabel(fx: LeagueFixtureLite): { text: string; live: boolean; done: boolean } {
  if (isLive(fx.statusShort)) {
    return { text: fx.statusShort === 'HT' ? 'HT' : `${fx.elapsed ?? 0}'`, live: true, done: false };
  }
  if (isFinished(fx.statusShort)) return { text: t('common.final'), live: false, done: true };
  const d = new Date(fx.dateISO);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return { text: `${hh}:${mm}`, live: false, done: false };
}

/** Punto rojo que late — deja claro de un vistazo qué partido está corriendo. */
function LiveDot() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(0.25, { duration: 650 }), withTiming(1, { duration: 650 })), -1);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.liveDot, style]} />;
}

export function FixtureRow({ fx, teams, index = 0 }: { fx: LeagueFixtureLite; teams: Team[]; index?: number }) {
  const home = sideOf(teams, fx.homeTeamId, fx.homeName);
  const away = sideOf(teams, fx.awayTeamId, fx.awayName);
  const st = statusLabel(fx);
  const showScore = st.live || st.done;

  // tocar la fila SIEMPRE abre la ficha del partido (con eventos, estadísticas
  // y alineaciones). Para ir al token hay que tocar el equipo dentro de la ficha.
  const onPress = () => { tap(); router.push(`/fixture/${fx.fixtureId}`); };

  const winnerHome = showScore && (fx.goalsHome ?? 0) > (fx.goalsAway ?? 0);
  const winnerAway = showScore && (fx.goalsAway ?? 0) > (fx.goalsHome ?? 0);

  return (
    <Animated.View entering={index < 8 ? FadeInDown.delay(index * 45).duration(320) : undefined}>
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.statusCol}>
        {st.live && <LiveDot />}
        <Text style={[styles.statusTxt, st.live && styles.statusLive, st.done && styles.statusDone]} numberOfLines={1}>
          {st.text}
        </Text>
      </View>

      <View style={styles.teamsCol}>
        <View style={styles.teamLine}>
          <TeamBadge short={home.short} color={home.color} color2={home.color2} size={20} />
          <Text style={[styles.teamName, winnerHome && styles.teamWinner]} numberOfLines={1}>{home.name}</Text>
          {home.tokenId && <View style={styles.tokenDot} />}
          {showScore && <Text style={[styles.score, winnerHome && styles.teamWinner]}>{fx.goalsHome ?? 0}</Text>}
        </View>
        <View style={styles.teamLine}>
          <TeamBadge short={away.short} color={away.color} color2={away.color2} size={20} />
          <Text style={[styles.teamName, winnerAway && styles.teamWinner]} numberOfLines={1}>{away.name}</Text>
          {away.tokenId && <View style={styles.tokenDot} />}
          {showScore && <Text style={[styles.score, winnerAway && styles.teamWinner]}>{fx.goalsAway ?? 0}</Text>}
        </View>
      </View>
      <Icon name="chevron-right" size={14} color={colors.textTertiary} />
    </Pressable>
    </Animated.View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.bgCardHover },
  statusCol: { width: 52, alignItems: 'center', justifyContent: 'center', gap: 3 },
  statusTxt: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '700' },
  statusLive: { color: colors.loss, fontWeight: '900' },
  statusDone: { color: colors.textTertiary, fontSize: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.loss },
  teamsCol: { flex: 1, gap: 7 },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamName: { flex: 1, color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '600' },
  teamWinner: { color: colors.text, fontWeight: '800' },
  tokenDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold },
  score: { color: colors.textSecondary, fontSize: font.size.md, fontWeight: '800', minWidth: 18, textAlign: 'right' },
}));

/** Encabezado de liga para agrupar filas de partidos. */
export function LeagueHeader({ label, country, onPress }: { label: string; country?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={headerStyles.wrap}>
      <View style={headerStyles.dot} />
      <Text style={headerStyles.label}>{label}</Text>
      {country ? <Text style={headerStyles.country}>{country}</Text> : null}
    </Pressable>
  );
}

const headerStyles = themedSheet((colors: Palette) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 9, backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  dot: { width: 3, height: 14, borderRadius: 2, backgroundColor: colors.gold },
  label: { color: colors.text, fontSize: font.size.sm, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 0.8 },
  country: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
}));
