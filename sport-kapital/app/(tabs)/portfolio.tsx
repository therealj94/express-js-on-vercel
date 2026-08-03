// app/(tabs)/portfolio.tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { useStore, selectPortfolioValue, selectInvested, selectUnrealized, selectPositionsDetailed } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd, pct } from '@/utils/format';
import { TeamBadge } from '@/components/TeamBadge';
import { PriceFlash } from '@/components/PriceFlash';
import { Icon } from '@/components/Icon';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { useBallRefresh, ballRefreshControl } from '@/components/BallRefresh';

export default function Portfolio() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const positions = useStore(selectPositionsDetailed);
  const invested = useStore(selectInvested);
  const value = useStore(selectPortfolioValue);
  const unrealized = useStore(selectUnrealized);
  const realized = useStore((s) => s.realizedTotal);
  const roi = invested > 0 ? (unrealized / invested) * 100 : 0;
  const refresh = useBallRefresh();

  if (positions.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>{t('port.title')}</Text>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="pie" size={32} color={colors.textTertiary} /></View>
          <Text style={styles.emptyTitle}>{t('port.emptyTitle')}</Text>
          <Text style={styles.emptyTxt}>{t('port.emptyTxt')}</Text>
          {realized !== 0 && (
            <View style={[styles.realizedBadge, { backgroundColor: realized >= 0 ? colors.profitDim : colors.lossDim }]}>
              <Text style={[styles.realizedTxt, { color: realized >= 0 ? colors.profit : colors.loss }]}>
                {t('port.histRealized', { v: `${realized >= 0 ? '+' : ''}${usd(realized)}` })}
              </Text>
            </View>
          )}
          <Pressable onPress={() => { tap(); router.push('/(tabs)/market'); }} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnTxt}>{t('port.goMarket')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>{t('port.title')}</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 24 }} refreshControl={ballRefreshControl(refresh)}>
        <View style={styles.summaryGrid}>
          <Summary label={t('port.invested')} value={usd(invested)} />
          <Summary label={t('port.currentValue')} value={usd(value)} />
          <Summary label={t('dash.pnlUnreal')} value={`${unrealized >= 0 ? '+' : ''}${usd(unrealized)}`} color={unrealized >= 0 ? colors.profit : colors.loss} sub={pct(roi)} />
          <Summary label={t('dash.pnlReal')} value={`${realized >= 0 ? '+' : ''}${usd(realized)}`} color={realized >= 0 ? colors.profit : colors.loss} />
        </View>

        <Text style={styles.section}>{t('port.openPositions')}</Text>
        {!isFocused ? null : positions.map((p) => (
          <Pressable key={p.teamId} onPress={() => { tap(); router.push(`/team/${p.teamId}`); }} style={styles.pos}>
            <View style={styles.posTop}>
              <TeamBadge short={p.team?.short ?? '?'} color={p.team?.color ?? colors.gold} color2={p.team?.color2 ?? colors.gold} size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.posName} numberOfLines={1}>{p.team?.name}</Text>
                <Text style={styles.posSub}>{t('port.tokensAvg', { n: p.shares.toFixed(2), price: usd(p.avgBuyPrice) })}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <PriceFlash value={p.value} format={usd} style={styles.posValue} />
                <View style={styles.pctRow}>
                  <Icon name={p.unrealized >= 0 ? 'arrow-up-right' : 'arrow-down-right'} size={11} color={p.unrealized >= 0 ? colors.profit : colors.loss} />
                  <Text style={[styles.posPct, { color: p.unrealized >= 0 ? colors.profit : colors.loss }]}>{pct(p.unrealizedPct)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.posDetail}>
              <Detail label={t('port.currentPrice')} value={usd(p.price)} />
              <Detail label={t('dash.pnlUnreal')} value={`${p.unrealized >= 0 ? '+' : ''}${usd(p.unrealized)}`} color={p.unrealized >= 0 ? colors.profit : colors.loss} />
              {p.realizedPnl !== 0 && <Detail label={t('port.realized')} value={`${p.realizedPnl >= 0 ? '+' : ''}${usd(p.realizedPnl)}`} color={p.realizedPnl >= 0 ? colors.profit : colors.loss} />}
            </View>

            <View style={styles.posActions}>
              <Pressable onPress={() => { tap(); router.push(`/trade/${p.teamId}?side=BUY`); }} style={[styles.actBtn, { backgroundColor: colors.profitDim }]}>
                <Text style={[styles.actTxt, { color: colors.profit }]}>{t('port.buyMore')}</Text>
              </Pressable>
              <Pressable onPress={() => { tap(); router.push(`/trade/${p.teamId}?side=SELL`); }} style={[styles.actBtn, { backgroundColor: colors.lossDim }]}>
                <Text style={[styles.actTxt, { color: colors.loss }]}>{t('common.sell')}</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const Summary = ({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) => (
  <View style={styles.summary}>
    <Text style={styles.summaryLbl}>{label}</Text>
    <Text style={[styles.summaryVal, color ? { color } : null]}>{value}</Text>
    {sub && <Text style={[styles.summarySub, color ? { color } : null]}>{sub}</Text>}
  </View>
);

const Detail = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={{ flex: 1 }}>
    <Text style={styles.detailLbl}>{label}</Text>
    <Text style={[styles.detailVal, color ? { color } : null]}>{value}</Text>
  </View>
);

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: font.size['2xl'], fontFamily: font.family.heading, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: spacing.xl, marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summary: { width: '47.7%', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  summaryLbl: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
  summaryVal: { color: colors.text, fontSize: font.size.lg, fontWeight: '800', marginTop: 4 },
  summarySub: { fontSize: font.size.xs, fontWeight: '700', marginTop: 2 },
  section: { color: colors.text, fontSize: font.size.lg, fontWeight: '800', marginTop: 26, marginBottom: 14 },
  pos: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  posTop: { flexDirection: 'row', alignItems: 'center' },
  posName: { color: colors.text, fontSize: font.size.md, fontWeight: '700' },
  posSub: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 2 },
  posValue: { color: colors.text, fontSize: font.size.md, fontWeight: '800' },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  posPct: { fontSize: font.size.sm, fontWeight: '700' },
  posDetail: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  detailLbl: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
  detailVal: { color: colors.text, fontSize: font.size.sm, fontWeight: '800', marginTop: 2 },
  posActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  actTxt: { fontSize: font.size.sm, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { color: colors.text, fontSize: font.size.xl, fontWeight: '800', marginBottom: 8 },
  emptyTxt: { color: colors.textSecondary, fontSize: font.size.md, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  realizedBadge: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 20 },
  realizedTxt: { fontSize: font.size.sm, fontWeight: '800' },
  emptyBtn: { backgroundColor: colors.gold, borderRadius: radius.md, paddingHorizontal: 28, paddingVertical: 14 },
  emptyBtnTxt: { color: '#1A1500', fontWeight: '800', fontSize: font.size.md },
}));
