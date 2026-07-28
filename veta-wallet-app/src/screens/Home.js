import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { TokenIcon, ActionBtn, IconBtn, SectionHead, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt, tokensFromBalances } from '../data';
import { apiPortfolio } from '../api';
import { upsertApiAccount } from '../accounts';
import { useT } from '../i18n';

export default function Home({ nav }) {
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const t = useT();
  const { account, login } = useAccount();
  const refreshedOnce = useRef(false);

  const acc = account || { name: 'Cuenta', initials: 'VW', addr: '', balances: [], genesisUid: null };
  const shortAddr = acc.addr && acc.addr.length > 14 ? `${acc.addr.slice(0, 6)}…${acc.addr.slice(-4)}` : acc.addr || '';

  const list = tokensFromBalances(acc.balances);
  const total = list.reduce((s, t) => s + t.qty * t.price, 0);

  // Variación 24 h ponderada del portafolio (solo con datos reales del feed).
  const withChg = list.filter((t) => t.chg != null && t.qty * t.price > 0);
  const chgBase = withChg.reduce((s, t) => s + t.qty * t.price, 0);
  const dayPct = chgBase > 0 ? withChg.reduce((s, t) => s + t.chg * (t.qty * t.price), 0) / chgBase : null;
  const dayUsd = dayPct != null ? total * (dayPct / 100) : null;

  async function refresh(showToast) {
    try {
      const portfolio = await apiPortfolio();
      const updated = await upsertApiAccount({ email: acc.email, name: acc.name }, acc.addr, portfolio);
      login(updated);
      if (showToast) toast(t('home.updated'));
    } catch (e) {
      if (showToast) toast(t('home.offline'));
    }
  }

  // Al abrir la app: refresca los saldos reales en segundo plano.
  useEffect(() => {
    if (account?.email && !refreshedOnce.current) {
      refreshedOnce.current = true;
      refresh(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email]);

  const onRefresh = async () => {
    setRefreshing(true); hap();
    await refresh(true);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.acct}>
        <Pressable onPress={() => nav.go('settings')}>
          <LinearGradient colors={G.gold} style={styles.avatar}><Text style={styles.avatarTxt}>{acc.initials}</Text></LinearGradient>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.acctName} numberOfLines={1}>{acc.name}</Text>
          <Text style={styles.acctAddr}>{shortAddr}</Text>
        </View>
        <IconBtn icon="notifications" onPress={() => nav.go('notifs')} />
        <IconBtn icon="qr-code" onPress={() => nav.go('receive')} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} colors={[C.gold]} progressBackgroundColor={C.panel} />}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balCard}>
          <Text style={styles.balLbl}>{t('home.balance')}</Text>
          <Pressable onPress={() => { hap(); setHidden(!hidden); }} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.balAmt}>{hidden ? '••••••' : money(total)}</Text>
            <Icon name={hidden ? 'eye-off' : 'eye'} size={18} color={C.txt2} style={{ marginLeft: 8 }} />
          </Pressable>
          {dayPct != null ? (
            <Text style={[styles.balChg, { color: dayPct >= 0 ? C.up : C.down }]}>
              {dayPct >= 0 ? '+' : '-'}{money(Math.abs(dayUsd))}  <Text style={styles.pill}> {dayPct >= 0 ? '+' : ''}{dayPct.toFixed(2)}% </Text>  {t('home.today')}
            </Text>
          ) : (
            <Text style={styles.balChg}>{t('home.live')}</Text>
          )}
          <View style={styles.actions}>
            <ActionBtn icon="arrow-up" label={t('home.send')} onPress={() => nav.go('send')} />
            <ActionBtn icon="arrow-down" label={t('home.receive')} onPress={() => nav.go('receive')} />
            <ActionBtn icon="card" label={t('home.buy')} onPress={() => nav.go('buy')} />
            <ActionBtn icon="swap-horizontal" label={t('home.swap')} onPress={() => nav.go('swap')} />
          </View>
        </LinearGradient>

        {!acc.genesisUid && (
          <Pressable onPress={() => nav.go('kyc')} style={styles.promo}>
            <LinearGradient colors={G.gold} style={styles.promoIc}><Icon name="finger-print" size={22} color={C.darkText} /></LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoT}>{t('home.genesisT')}</Text>
              <Text style={styles.promoP}>{t('home.genesisP')}</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={C.gold} />
          </Pressable>
        )}

        <SectionHead title={t('home.assets')} action={t('home.activity')} onAction={() => nav.go('activity')} />
        {list.map((t) => (
          <Pressable key={t.s} onPress={() => { hap(); nav.go('token', { token: t }); }} style={styles.token}>
            <TokenIcon t={t} />
            <View style={{ flex: 1, marginLeft: 13 }}>
              <Text style={styles.tName}>{t.n}</Text>
              <Text style={styles.tPrice}>
                {money(t.price)}
                {t.chg != null && (
                  <Text style={{ color: t.chg < 0 ? C.down : C.up, fontWeight: '600' }}>  {t.chg > 0 ? '+' : ''}{t.chg.toFixed(2)}%</Text>
                )}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.tVal}>{money(t.qty * t.price)}</Text>
              <Text style={styles.tQty}>{qtyFmt(t.qty)} {t.s}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  acct: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 22, paddingBottom: 14, paddingTop: 4 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: C.darkText, fontWeight: '800', fontSize: 15 },
  acctName: { fontSize: 14.5, fontWeight: '700', color: C.txt },
  acctAddr: { fontSize: 11, color: C.txt3 },
  balCard: { borderRadius: 26, padding: 24, borderWidth: 1, borderColor: C.line },
  balLbl: { fontSize: 11.5, letterSpacing: 3, color: C.gold, fontWeight: '600', textAlign: 'center', opacity: 0.9 },
  balAmt: { fontSize: 44, fontWeight: '800', color: C.goldHi, letterSpacing: -1, marginTop: 7 },
  balChg: { textAlign: 'center', color: C.txt2, fontSize: 13, fontWeight: '600', marginTop: 5, marginBottom: 20 },
  pill: { backgroundColor: 'rgba(62,217,160,0.16)', fontSize: 12, overflow: 'hidden', borderRadius: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#0F3B3A', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 15, marginTop: 18 },
  promoIc: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  promoT: { fontSize: 14.5, fontWeight: '700', color: C.txt },
  promoP: { fontSize: 12, color: C.txt2, marginTop: 2 },
  token: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 18, padding: 13, marginBottom: 10 },
  tName: { fontSize: 14.5, fontWeight: '600', color: C.txt },
  tPrice: { fontSize: 12, color: C.txt3, marginTop: 2 },
  tQty: { fontSize: 12, color: C.txt3, marginTop: 2 },
  tVal: { fontSize: 14.5, fontWeight: '600', color: C.txt },
});
