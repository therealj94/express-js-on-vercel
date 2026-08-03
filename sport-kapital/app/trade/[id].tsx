// app/trade/[id].tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useStore, TRADE_FEE } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Panel } from '@/components/Panel';
import { PriceFlash } from '@/components/PriceFlash';
import { usd, pct } from '@/utils/format';
import { success as hSuccess, error as hError, tap } from '@/utils/haptics';
import { runBusy } from '@/utils/busy';
import { t } from '@/utils/i18n';

const FEE = TRADE_FEE;
const PRESETS = [0.25, 0.5, 0.75, 1];

export default function Trade() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; side?: string }>();
  const side = (params.side === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL';

  const team = useStore((s) => s.teams.find((t) => t.id === params.id));
  const balance = useStore((s) => s.balance);
  const position = useStore((s) => s.positions.find((p) => p.teamId === params.id));
  const buy = useStore((s) => s.buy);
  const sell = useStore((s) => s.sell);

  const [unit, setUnit] = useState<'TOKENS' | 'USDT'>('USDT');
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState<null | { ok: boolean; msg: string; pnl?: number }>(null);

  const scale = useSharedValue(1);
  const successStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (!team) return <View style={styles.container} />;

  const price = team.currentPrice;
  const tokens = unit === 'TOKENS' ? Number(amount) || 0 : price ? (Number(amount) || 0) / price : 0;
  const gross = tokens * price;
  const fee = gross * FEE;
  const total = side === 'BUY' ? gross + fee : gross - fee;
  const estPnl = side === 'SELL' && position ? (price - position.avgBuyPrice) * tokens - fee : 0;

  const maxTokens = side === 'BUY' ? (price ? balance / (price * (1 + FEE)) : 0) : position?.shares ?? 0;
  // margen de redondeo: el preset MAX reserva la comisión con un .toFixed
  // intermedio que puede quedar una fracción de centavo por encima del
  // saldo/posición real — la tienda (buy/sell) tolera ese mismo margen.
  const insufficient = side === 'BUY' ? total > balance + 0.01 : tokens > (position?.shares ?? 0) + 0.001;
  const valid = tokens > 0 && !insufficient;

  const applyPreset = (f: number) => {
    tap();
    if (side === 'SELL') {
      // vender en base a los tokens exactos que tienes (no convertir a USDT y
      // de vuelta, que puede redondear por encima de lo que en verdad tienes
      // y bloquear la venta completa con "no tienes tantos tokens").
      setUnit('TOKENS');
      setAmount(((position?.shares ?? 0) * f).toFixed(6));
      return;
    }
    // compra: reserva la comisión para que el total nunca pase del saldo disponible
    if (unit === 'USDT') setAmount((balance * f / (1 + FEE)).toFixed(2));
    else setAmount((maxTokens * f).toFixed(4));
  };

  const confirm = () => {
    runBusy(() => {
      const res = side === 'BUY' ? buy(team.id, tokens) : sell(team.id, tokens);
      if (res.ok) {
        hSuccess();
        scale.value = withSequence(withSpring(1.2, { damping: 6 }), withSpring(1));
        setDone(res);
        setTimeout(() => router.back(), 1600);
      } else {
        hError();
        setDone(res);
        setTimeout(() => setDone(null), 1800);
      }
    });
  };

  if (done?.ok) {
    const pnlColor = (done.pnl ?? 0) >= 0 ? colors.profit : colors.loss;
    return (
      <View style={styles.successWrap}>
        <Animated.View entering={ZoomIn} style={[styles.successCircle, { backgroundColor: side === 'BUY' ? colors.profit : colors.gold }, successStyle]}>
          <Icon name="check" size={52} color="#03150B" strokeWidth={3} />
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(150)} style={styles.successTitle}>{side === 'BUY' ? t('trade.buyDone') : t('trade.sellDone')}</Animated.Text>
        <Animated.Text entering={FadeIn.delay(250)} style={styles.successSub}>{done.msg}</Animated.Text>
        {side === 'SELL' && done.pnl !== undefined && (
          <Animated.Text entering={FadeIn.delay(350)} style={[styles.successPnl, { color: pnlColor }]}>
            P&L: {done.pnl >= 0 ? '+' : ''}{usd(done.pnl)}
          </Animated.Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{side === 'BUY' ? t('trade.buyTitle') : t('trade.sellTitle')} {team.short}/USDT</Text>
        <Pressable onPress={() => { tap(); router.back(); }} style={styles.closeBtn}><Icon name="close" size={18} color={colors.textSecondary} /></Pressable>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.markLbl}>{t('trade.marketPrice')}</Text>
        <PriceFlash value={price} format={usd} style={styles.markPrice} />
        <Text style={[styles.markPct, { color: team.priceChange >= 0 ? colors.profit : colors.loss }]}>{pct(team.priceChange)}</Text>
      </View>

      <View style={styles.unitRow}>
        <Text style={styles.fieldLabel}>{t('trade.amount')}</Text>
        <Pressable onPress={() => { tap(); setUnit(unit === 'USDT' ? 'TOKENS' : 'USDT'); setAmount(''); }} style={styles.unitBtn}>
          <Icon name="swap" size={13} color={colors.gold} />
          <Text style={styles.unitTxt}>{unit === 'USDT' ? 'USDT' : t('trade.tokens')}</Text>
        </Pressable>
      </View>
      <View style={styles.field}>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textTertiary} style={styles.inputLarge} />
        <Text style={styles.unitSuffix}>{unit === 'USDT' ? 'USDT' : team.short}</Text>
      </View>

      <View style={styles.presets}>
        {PRESETS.map((f) => (
          <Pressable key={f} onPress={() => applyPreset(f)} style={styles.preset}><Text style={styles.presetTxt}>{f === 1 ? 'MAX' : `${f * 100}%`}</Text></Pressable>
        ))}
      </View>

      <Panel style={styles.preview}>
        <Row k={t('trade.tokens')} v={tokens.toFixed(4)} />
        <Row k={t('trade.price')} v={usd(price)} />
        <Row k={t('trade.subtotal')} v={usd(gross)} />
        <Row k={t('team.feePct', { pct: (FEE * 100).toFixed(0) })} v={usd(fee)} />
        <View style={styles.divider} />
        <Row k={side === 'BUY' ? t('trade.totalPay') : t('trade.totalGet')} v={usd(total)} bold />
        {side === 'SELL' && position && <Row k={t('trade.estPnl')} v={`${estPnl >= 0 ? '+' : ''}${usd(estPnl)}`} color={estPnl >= 0 ? colors.profit : colors.loss} />}
      </Panel>

      <Text style={styles.available}>
        {side === 'BUY' ? t('trade.availBal', { v: usd(balance) }) : t('trade.inPosition', { n: (position?.shares ?? 0).toFixed(4), ticker: team.short })}
      </Text>

      {insufficient && (
        <View style={styles.warn}>
          <Icon name="alert" size={16} color={colors.loss} />
          <Text style={styles.warnTxt}>{side === 'BUY' ? t('trade.insufBal') : t('trade.insufTokens')}</Text>
        </View>
      )}
      {done && !done.ok && <Text style={styles.err}>{done.msg}</Text>}

      <View style={{ flex: 1 }} />
      <Button label={side === 'BUY' ? t('trade.confirmBuy') : t('trade.confirmSell')} onPress={confirm} variant={side === 'BUY' ? 'success' : 'danger'} disabled={!valid} style={{ marginBottom: insets.bottom + 12 }} />
    </View>
  );
}

const Row = ({ k, v, bold, color }: { k: string; v: string; bold?: boolean; color?: string }) => (
  <View style={styles.row}>
    <Text style={styles.rowK}>{k}</Text>
    <Text style={[styles.rowV, bold && { fontSize: font.size.lg, fontWeight: '800' }, color ? { color } : null]}>{v}</Text>
  </View>
);

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: font.size.lg, fontFamily: font.family.headingBold, textTransform: 'uppercase', flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10, marginBottom: 20 },
  markLbl: { color: colors.textSecondary, fontSize: font.size.sm },
  markPrice: { color: colors.text, fontSize: font.size.lg, fontWeight: '800' },
  markPct: { fontSize: font.size.sm, fontWeight: '700' },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  fieldLabel: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '600' },
  unitBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.bgCard, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  unitTxt: { color: colors.gold, fontSize: font.size.xs, fontWeight: '800' },
  field: { backgroundColor: colors.bgCard, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  inputLarge: { flex: 1, color: colors.text, fontSize: font.size['2xl'], height: 60, fontWeight: '800' },
  unitSuffix: { color: colors.textSecondary, fontSize: font.size.md, fontWeight: '700' },
  presets: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  preset: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  presetTxt: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  preview: { padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowK: { color: colors.textSecondary, fontSize: font.size.md },
  rowV: { color: colors.text, fontSize: font.size.md, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  available: { color: colors.textTertiary, fontSize: font.size.sm, marginTop: 10, fontWeight: '600' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.lossDim, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.loss, marginTop: 12 },
  warnTxt: { color: colors.loss, fontSize: font.size.sm, fontWeight: '600', flex: 1 },
  err: { color: colors.loss, fontSize: font.size.sm, marginTop: 12, fontWeight: '600' },
  successWrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  successCircle: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: colors.text, fontSize: font.size['2xl'], fontFamily: font.family.heading, textTransform: 'uppercase' },
  successSub: { color: colors.textSecondary, fontSize: font.size.md, textAlign: 'center', paddingHorizontal: 40 },
  successPnl: { fontSize: font.size.xl, fontWeight: '900' },
}));
