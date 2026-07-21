import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { Header, TokenIcon, ActionBtn, Button3D, Card, Candles, hap } from '../ui';
import { COIN_INFO, money, qtyFmt, genCandles } from '../data';

const TFS = ['15m', '1h', '4h', '1d', '1s'];

export default function TokenDetail({ nav, params }) {
  const t = params.token;
  const [tf, setTf] = useState('1d');
  const info = COIN_INFO[t.s] || { title: t.n, desc: '', rows: [] };
  const up = t.chg >= 0;
  const candles = useMemo(
    () => genCandles(t.s + tf, t.price, Math.max(t.price * 0.05, 0.05), up ? 0.06 : -0.05, 30),
    [tf, t]
  );
  const w = Dimensions.get('window').width - 68;

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t.s} onBack={() => nav.back()} right={<Pressable onPress={hap}><Ionicons name="star-outline" size={22} color={C.gold} /></Pressable>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <TokenIcon t={t} size={64} />
          <Text style={styles.qty}>{qtyFmt(t.qty)} {t.s}</Text>
          <Text style={styles.usd}>≈ {money(t.qty * t.price)} USD</Text>
          <Text style={[styles.chg, { color: up ? C.up : C.down }]}>{up ? '+' : ''}{t.chg.toFixed(2)}% hoy</Text>
        </View>

        <View style={styles.mini}>
          <ActionBtn icon="arrow-up" label="Enviar" size={48} onPress={() => nav.go('send')} />
          <ActionBtn icon="arrow-down" label="Recibir" size={48} onPress={() => nav.go('receive')} />
          <ActionBtn icon="card" label="Comprar" size={48} onPress={() => nav.go('buy')} />
        </View>

        <Card style={{ padding: 14, marginBottom: 14 }}>
          <View style={styles.tfRow}>
            <Text style={{ color: C.txt2, fontSize: 12, fontWeight: '600' }}>Precio · {money(t.price)}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {TFS.map((f) => (
                <Pressable key={f} onPress={() => { hap(); setTf(f); }} style={[styles.tf, tf === f && styles.tfOn]}>
                  <Text style={[styles.tfTxt, tf === f && { color: C.darkText }]}>{f}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Candles data={candles} width={w} up={up} />
          <View style={styles.legend}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={[styles.dot, { backgroundColor: C.up }]} /><Text style={styles.legTxt}>Alcista</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={[styles.dot, { backgroundColor: C.down }]} /><Text style={styles.legTxt}>Bajista</Text></View>
            <Text style={[styles.legTxt, { marginLeft: 'auto' }]}>Velas japonesas</Text>
          </View>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.infoTitle}>{info.title}</Text>
          <Text style={styles.infoDesc}>{info.desc}</Text>
          {info.rows.map((r, i) => (
            <View key={i} style={styles.infoRow}>
              <Text style={styles.infoK}>{r[0]}</Text>
              <Text style={styles.infoV}>{r[1]}</Text>
            </View>
          ))}
        </Card>

        <Button3D title="Operar" icon="swap-horizontal" onPress={() => nav.go('swap')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  qty: { fontSize: 25, fontWeight: '800', color: C.txt, marginTop: 8 },
  usd: { fontSize: 13, color: C.txt2, marginTop: 2 },
  chg: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  mini: { flexDirection: 'row', justifyContent: 'center', gap: 30, marginBottom: 18 },
  tfRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tf: { backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 9 },
  tfOn: { backgroundColor: C.gold },
  tfTxt: { color: C.txt2, fontSize: 11, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legTxt: { color: C.txt3, fontSize: 11 },
  infoTitle: { fontSize: 15.5, fontWeight: '700', color: C.txt, marginBottom: 8 },
  infoDesc: { fontSize: 12.5, color: C.txt2, lineHeight: 18, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  infoK: { color: C.txt3, fontSize: 13 },
  infoV: { color: C.txt, fontSize: 13, fontWeight: '600' },
});
