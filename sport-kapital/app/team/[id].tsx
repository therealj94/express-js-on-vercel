// app/team/[id].tsx
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore, TRADE_FEE } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd, pct, compact, timeAgo } from '@/utils/format';
import { TeamBadge } from '@/components/TeamBadge';
import { CandleChart } from '@/components/CandleChart';
import { PriceFlash } from '@/components/PriceFlash';
import { Icon, IconName } from '@/components/Icon';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TutorialOverlay, useTutorial, HelpButton } from '@/components/TutorialOverlay';

import { tap, success as hSuccess, error as hError } from '@/utils/haptics';
import { runBusy } from '@/utils/busy';
import { t, tName } from '@/utils/i18n';

const TUTORIAL = () => [
  { icon: 'candle' as IconName, title: t('tut.t1t'), body: t('tut.t1b'), accent: colors.profit },
  { icon: 'bolt' as IconName, title: t('tut.t2t'), body: t('tut.t2b'), accent: colors.gold },
  { icon: 'target' as IconName, title: t('tut.t3t'), body: t('tut.t3b'), accent: colors.blue },
];

export default function TeamDetail() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const team = useStore((s) => s.teams.find((t) => t.id === id));
  const position = useStore((s) => s.positions.find((p) => p.teamId === id));
  const match = useStore((s) => s.matches.find((m) => m.status !== 'FT' && (m.homeId === id || m.awayId === id)));
  const newsAll = useStore((s) => s.news);
  const news = useMemo(
    () => newsAll.filter((n) => n.teamId === id || n.rivalId === id).slice(0, 4),
    [newsAll, id],
  );
  const sell = useStore((s) => s.sell);
  const tut = useTutorial('team');

  const [confirmClose, setConfirmClose] = useState(false);
  const [closeMsg, setCloseMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!team) {
    return <View style={styles.container}><Text style={styles.missing}>{t('team.notFound')}</Text></View>;
  }

  const up = team.priceChange >= 0;
  const points = team.wins * 3 + team.draws;
  const gd = team.goalsFor - team.goalsAgainst;
  // rango de la sesión (últimas ~2h de velas) para la franja estilo exchange
  const recent = team.candles.slice(-120);
  const high24 = Math.max(...recent.map((c) => c.h));
  const low24 = Math.min(...recent.map((c) => c.l));
  const unrealized = position ? (team.currentPrice - position.avgBuyPrice) * position.shares : 0;

  // cierre total: vende toda la posición de una vez, sin pasar por la
  // pantalla manual de trade — la velocidad importa cuando quieres salir ya.
  const closeGross = position ? position.shares * team.currentPrice : 0;
  const closeFee = closeGross * TRADE_FEE;
  const closeNet = closeGross - closeFee;
  const closePnl = position ? (team.currentPrice - position.avgBuyPrice) * position.shares - closeFee : 0;

  const confirmCloseAll = () => {
    if (!position) return;
    runBusy(() => {
      const res = sell(team.id, position.shares);
      if (res.ok) hSuccess(); else hError();
      setConfirmClose(false);
      const pnl = res.pnl ?? closePnl;
      setCloseMsg({ ok: res.ok, text: res.ok ? t('team.closedMsg', { v: `${pnl >= 0 ? '+' : ''}${usd(pnl)}` }) : res.msg });
      setTimeout(() => setCloseMsg(null), 2600);
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => { tap(); router.back(); }} style={styles.back}><Icon name="chevron-left" size={20} color={colors.text} /></Pressable>
        <View style={styles.topMid}>
          <Text style={styles.topName} numberOfLines={1}>{tName(team)}</Text>
          <Text style={styles.topSub}>{team.short}/USDT · {t(`league.${team.league}`)}</Text>
        </View>
        <HelpButton onPress={tut.open} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Precio — bloque estilo exchange: precio grande + franja de datos 24h */}
        <View style={styles.priceHead}>
          <TeamBadge short={team.short} color={team.color} color2={team.color2} size={52} />
          <View style={{ marginLeft: 14, flex: 1 }}>
            <PriceFlash value={team.currentPrice} format={usd} style={styles.bigPrice} />
            <View style={styles.pctRow}>
              <View style={[styles.pctPill, { backgroundColor: up ? colors.profitDim : colors.lossDim }]}>
                <Icon name={up ? 'arrow-up-right' : 'arrow-down-right'} size={12} color={up ? colors.profit : colors.loss} />
                <Text style={[styles.pctTxt, { color: up ? colors.profit : colors.loss }]}>{t('team.session', { pct: pct(team.priceChange) })}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.statStrip}>
          <View style={styles.stripCell}>
            <Text style={styles.stripLbl}>{t('team.high24')}</Text>
            <Text style={[styles.stripVal, { color: colors.profit }]}>{usd(high24)}</Text>
          </View>
          <View style={styles.stripDiv} />
          <View style={styles.stripCell}>
            <Text style={styles.stripLbl}>{t('team.low24')}</Text>
            <Text style={[styles.stripVal, { color: colors.loss }]}>{usd(low24)}</Text>
          </View>
          <View style={styles.stripDiv} />
          <View style={styles.stripCell}>
            <Text style={styles.stripLbl}>{t('team.vol24')}</Text>
            <Text style={styles.stripVal}>{compact(team.volume24h)}</Text>
          </View>
          <View style={styles.stripDiv} />
          <View style={styles.stripCell}>
            <Text style={styles.stripLbl}>{t('team.liquidity')}</Text>
            <Text style={styles.stripVal}>{'$' + compact(team.liquidity)}</Text>
          </View>
        </View>

        <View style={styles.tierBadge}>
          <Icon name="layers" size={12} color={colors.gold} />
          <Text style={styles.tierTxt}>{t(`tier.${team.tier}`)}</Text>
        </View>

        {/* Partido en vivo */}
        {match && (
          <Pressable onPress={() => { tap(); router.push(`/match/${match.id}`); }} style={styles.liveBanner}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTxt}>
              {t('team.playing', { real: match.id.startsWith('real-') ? t('team.real') : '', min: match.minute })}
            </Text>
            <Icon name="chevron-right" size={16} color={colors.loss} />
          </Pressable>
        )}

        {/* Velas */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: 16 }}>
          <CandleChart candles={team.candles} width={width - spacing.xl * 2} height={270} entryPrice={position?.avgBuyPrice} />
        </View>

        {/* Stats de la temporada */}
        <Text style={styles.section}>{t('team.campaign')}</Text>
        <View style={styles.statsGrid}>
          <Stat label={t('team.played')} value={String(team.played)} />
          <Stat label={t('team.record')} value={`${team.wins}-${team.draws}-${team.losses}`} />
          <Stat label={t('team.points')} value={String(points)} />
          <Stat label={t('team.gf')} value={String(team.goalsFor)} />
          <Stat label={t('team.ga')} value={String(team.goalsAgainst)} />
          <Stat label={t('team.diff')} value={`${gd >= 0 ? '+' : ''}${gd}`} color={gd >= 0 ? colors.profit : colors.loss} />
          <Stat label={t('team.vol24')} value={compact(team.volume24h)} />
          <Stat label={t('team.liquidity')} value={'$' + compact(team.liquidity)} />
          <Stat label={t('team.sentiment')} value={team.sentiment === 'alcista' ? t('team.sentBull') : team.sentiment === 'bajista' ? t('team.sentBear') : t('team.sentNeutral')} color={team.sentiment === 'alcista' ? colors.profit : team.sentiment === 'bajista' ? colors.loss : colors.textSecondary} />
        </View>

        {/* Contexto real */}
        <View style={styles.noteBox}>
          <Icon name="info" size={16} color={colors.gold} />
          <Text style={styles.noteTxt}>{team.note}</Text>
        </View>

        {/* Tu posición */}
        {position && (
          <Panel style={styles.posBox} borderColor={colors.gold} glow>
            <Text style={styles.posTitle}>{t('team.yourPosition')}</Text>
            <View style={styles.posRow}>
              <PosCol label={t('team.tokens')} value={position.shares.toFixed(2)} />
              <PosCol label={t('team.avgPrice')} value={usd(position.avgBuyPrice)} />
              <PosCol label="P&L" value={`${unrealized >= 0 ? '+' : ''}${usd(unrealized)}`} color={unrealized >= 0 ? colors.profit : colors.loss} />
            </View>
            <View style={styles.posActions}>
              <Pressable onPress={() => { tap(); setConfirmClose(true); }} style={styles.closeAllBtn}>
                <Icon name="close" size={13} color={colors.loss} />
                <Text style={styles.closeAllTxt}>{t('team.closeAll')}</Text>
              </Pressable>
              <Pressable onPress={() => { tap(); router.push(`/trade/${team.id}?side=SELL`); }} style={styles.closePartialBtn}>
                <Text style={styles.closePartialTxt}>{t('team.closePartial')}</Text>
              </Pressable>
            </View>
          </Panel>
        )}

        {/* Resultado del último cierre — fuera del bloque de arriba porque un
            cierre total deja `position` en null justo antes de que este
            mensaje deba mostrarse. */}
        {closeMsg && (
          <Animated.View entering={FadeInDown.duration(220)} style={[styles.closeMsgOuter, { borderColor: closeMsg.ok ? colors.profit : colors.loss }]}>
            <Text style={[styles.closeMsgTxt, { color: closeMsg.ok ? colors.profit : colors.loss }]}>{closeMsg.text}</Text>
          </Animated.View>
        )}

        {/* Noticias del equipo */}
        {news.length > 0 && (
          <>
            <Text style={styles.section}>{t('team.newsMoved')}</Text>
            {news.map((n) => (
              <View key={n.id} style={styles.newsRow}>
                <View style={[styles.newsBar, { backgroundColor: n.impact >= 0 ? colors.profit : colors.loss }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.newsHead} numberOfLines={2}>{n.headline}</Text>
                  <Text style={styles.newsTime}>{timeAgo(n.ts)}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <TutorialOverlay title={t('tut.teamTitle')} steps={TUTORIAL()} visible={tut.visible} onClose={tut.close} />

      {position && (
        <ConfirmDialog
          visible={confirmClose}
          danger
          icon="alert"
          title={t('team.closeDlgTitle')}
          message={t('team.closeDlgMsg', { n: position.shares.toFixed(2), ticker: team.short })}
          confirmLabel={t('team.closeDlgConfirm')}
                    onConfirm={confirmCloseAll}
          onCancel={() => setConfirmClose(false)}
        >
          <View style={styles.dialogRow}><Text style={styles.dialogK}>{t('team.grossValue')}</Text><Text style={styles.dialogV}>{usd(closeGross)}</Text></View>
          <View style={styles.dialogRow}><Text style={styles.dialogK}>{t('team.feePct', { pct: (TRADE_FEE * 100).toFixed(0) })}</Text><Text style={styles.dialogV}>{usd(closeFee)}</Text></View>
          <View style={[styles.dialogRow, styles.dialogDivider]}><Text style={styles.dialogKBold}>{t('team.youGet')}</Text><Text style={styles.dialogVBold}>{usd(closeNet)}</Text></View>
          <View style={styles.dialogRow}>
            <Text style={styles.dialogK}>P&L</Text>
            <Text style={[styles.dialogVBold, { color: closePnl >= 0 ? colors.profit : colors.loss }]}>{closePnl >= 0 ? '+' : ''}{usd(closePnl)}</Text>
          </View>
        </ConfirmDialog>
      )}

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={t('common.buy')} onPress={() => router.push(`/trade/${team.id}?side=BUY`)} variant="success" style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={styles.stat}>
    <Text style={[styles.statVal, color ? { color } : null]}>{value}</Text>
    <Text style={styles.statLbl}>{label}</Text>
  </View>
);

const PosCol = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={{ flex: 1 }}>
    <Text style={styles.posLbl}>{label}</Text>
    <Text style={[styles.posVal, color ? { color } : null]}>{value}</Text>
  </View>
);

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  missing: { color: colors.text, textAlign: 'center', marginTop: 120 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: 8, gap: 12 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  topMid: { flex: 1 },
  topName: { color: colors.text, fontSize: font.size.lg, fontFamily: font.family.headingBold, textTransform: 'uppercase' },
  topSub: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600', marginTop: 2 },
  priceHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: 10 },
  bigPrice: { color: colors.text, fontSize: 46, letterSpacing: -1, fontFamily: font.family.heading },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  pctPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.sm },
  statStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.xl, marginTop: 14, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 10 },
  stripCell: { flex: 1, alignItems: 'center' },
  stripDiv: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  stripLbl: { color: colors.textTertiary, fontSize: 10, fontWeight: '700' },
  stripVal: { color: colors.text, fontSize: font.size.sm, fontWeight: '800', marginTop: 3 },
  pctTxt: { fontSize: font.size.sm, fontWeight: '700' },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginLeft: spacing.xl, marginTop: 10, backgroundColor: colors.goldDim, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.gold, paddingHorizontal: 10, paddingVertical: 4 },
  tierTxt: { color: colors.gold, fontSize: font.size.xs, fontWeight: '700', fontFamily: font.family.bodySemiBold },
  liveBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.lossDim, marginHorizontal: spacing.xl, marginTop: 14, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.loss },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.loss },
  liveTxt: { color: colors.loss, fontSize: font.size.sm, fontWeight: '700', flex: 1 },
  section: { color: colors.text, fontSize: font.size.md, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: spacing.xl, marginTop: 24, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.xl, gap: 10 },
  stat: { width: '30.7%', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  statVal: { color: colors.text, fontSize: font.size.md, fontWeight: '800' },
  statLbl: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 2 },
  noteBox: { flexDirection: 'row', gap: 10, backgroundColor: colors.goldDim, marginHorizontal: spacing.xl, marginTop: 14, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.gold, alignItems: 'flex-start' },
  noteTxt: { color: colors.text, fontSize: font.size.sm, lineHeight: 20, flex: 1 },
  posBox: { marginHorizontal: spacing.xl, marginTop: 16, padding: 14 },
  posTitle: { color: colors.gold, fontSize: font.size.xs, fontFamily: font.family.headingBold, letterSpacing: 1, marginBottom: 10 },
  posRow: { flexDirection: 'row' },
  posLbl: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
  posVal: { color: colors.text, fontSize: font.size.md, fontWeight: '800', marginTop: 2 },
  posActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  closeAllBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lossDim, borderRadius: radius.md, paddingVertical: 11, borderWidth: 1, borderColor: colors.loss },
  closeAllTxt: { color: colors.loss, fontSize: font.size.sm, fontWeight: '800' },
  closePartialBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, paddingVertical: 11, borderWidth: 1, borderColor: colors.border },
  closePartialTxt: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '800' },
  closeMsgOuter: { marginHorizontal: spacing.xl, marginTop: 16, borderRadius: radius.md, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 12 },
  closeMsgTxt: { fontSize: font.size.sm, fontWeight: '700', textAlign: 'center' },
  dialogRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  dialogK: { color: colors.textSecondary, fontSize: font.size.sm },
  dialogV: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  dialogDivider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 9 },
  dialogKBold: { color: colors.text, fontSize: font.size.sm, fontWeight: '800' },
  dialogVBold: { color: colors.text, fontSize: font.size.md, fontWeight: '800' },
  newsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8, marginHorizontal: spacing.xl, gap: 12 },
  newsBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  newsHead: { color: colors.text, fontSize: font.size.sm, fontWeight: '600', lineHeight: 19 },
  newsTime: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 3 },
  actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, paddingHorizontal: spacing.xl, paddingTop: 12, backgroundColor: colors.bgElevated, borderTopWidth: 0.5, borderTopColor: colors.border },
}));
