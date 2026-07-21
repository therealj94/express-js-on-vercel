import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C, G } from '../theme';
import { Logo, TokenIcon, ActionBtn, IconBtn, SectionHead, useToast, hap } from '../ui';
import { TOKENS, TOTAL, money, qtyFmt, SHORT_ADDR } from '../data';

export default function Home({ nav }) {
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const onRefresh = () => { setRefreshing(true); hap(); setTimeout(() => { setRefreshing(false); toast('Precios actualizados'); }, 900); };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.acct}>
        <Pressable onPress={() => nav.go('settings')}>
          <LinearGradient colors={G.gold} style={styles.avatar}><Text style={styles.avatarTxt}>JE</Text></LinearGradient>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.acctName}>Cuenta Principal <Ionicons name="chevron-down" size={13} color={C.txt2} /></Text>
          <Text style={styles.acctAddr}>{SHORT_ADDR}</Text>
        </View>
        <IconBtn icon="notifications" badge onPress={() => nav.go('notifs')} />
        <IconBtn icon="qr-code" onPress={() => nav.go('receive')} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} colors={[C.gold]} progressBackgroundColor={C.panel} />}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balCard}>
          <Text style={styles.balLbl}>BALANCE TOTAL</Text>
          <Pressable onPress={() => { hap(); setHidden(!hidden); }} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.balAmt}>{hidden ? '••••••' : money(TOTAL)}</Text>
            <Ionicons name={hidden ? 'eye-off' : 'eye'} size={18} color={C.txt2} style={{ marginLeft: 8 }} />
          </Pressable>
          <Text style={styles.balChg}>+$182.40  <Text style={styles.pill}> +2.83% </Text>  hoy</Text>
          <View style={styles.actions}>
            <ActionBtn icon="arrow-up" label="Enviar" onPress={() => nav.go('send')} />
            <ActionBtn icon="arrow-down" label="Recibir" onPress={() => nav.go('receive')} />
            <ActionBtn icon="card" label="Comprar" onPress={() => nav.go('buy')} />
            <ActionBtn icon="swap-horizontal" label="Swap" onPress={() => nav.go('swap')} />
          </View>
        </LinearGradient>

        <Pressable onPress={() => nav.go('remit')} style={styles.promo}>
          <LinearGradient colors={G.gold} style={styles.promoIc}><Ionicons name="globe" size={22} color={C.darkText} /></LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.promoT}>Recibir remesas a tu tarjeta</Text>
            <Text style={styles.promoP}>Convierte remesas a ORIGEN al instante</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.gold} />
        </Pressable>

        <SectionHead title="Mis activos" action="Actividad" onAction={() => nav.go('activity')} />
        {TOKENS.map((t) => (
          <Pressable key={t.s} onPress={() => { hap(); nav.go('token', { token: t }); }} style={styles.token}>
            <TokenIcon t={t} />
            <View style={{ flex: 1, marginLeft: 13 }}>
              <Text style={styles.tName}>{t.n}</Text>
              <Text style={styles.tPrice}>{money(t.price)} <Text style={{ color: t.chg < 0 ? C.down : C.up, fontWeight: '600' }}>{t.chg > 0 ? '+' : ''}{t.chg.toFixed(2)}%</Text></Text>
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
  balChg: { textAlign: 'center', color: C.up, fontSize: 13, fontWeight: '600', marginTop: 5, marginBottom: 20 },
  pill: { backgroundColor: 'rgba(62,217,160,0.16)', color: C.up, fontSize: 12, overflow: 'hidden', borderRadius: 8 },
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
