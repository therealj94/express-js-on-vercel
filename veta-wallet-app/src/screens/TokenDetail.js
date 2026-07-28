import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { Header, TokenIcon, ActionBtn, Button3D, Card, useToast, useAccount, hap } from '../ui';
import { COIN_INFO, money, qtyFmt } from '../data';

const shortHash = (h) => (h && h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h || '');

export default function TokenDetail({ nav, params }) {
  const t = params.token || { s: 'ORIGEN', n: 'Origen', qty: 0, price: 0, logo: true };
  const info = COIN_INFO[t.s] || { title: t.n, desc: '', rows: [] };
  const toast = useToast();
  const { account } = useAccount();
  const up = (t.chg ?? 0) >= 0;

  // Historial real de la red para este token (hoy la red reporta transferencias nativas).
  const transfers = (account?.transfers || []).filter((x) => (x.symbol || 'ORIGEN') === t.s || t.s === 'ORIGEN');
  const isIn = (x) => x.type === 'recive' || x.type === 'receive' || x.type === 'in';

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t.s} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <TokenIcon t={t} size={64} />
          <Text style={styles.qty}>{qtyFmt(t.qty)} {t.s}</Text>
          <Text style={styles.usd}>≈ {money(t.qty * t.price)} USD</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceTxt}>Precio: {money(t.price)}</Text>
            {t.chg != null && (
              <Text style={[styles.chg, { color: up ? C.up : C.down }]}>{up ? '+' : ''}{t.chg.toFixed(2)}% 24h</Text>
            )}
          </View>
        </View>

        <View style={styles.mini}>
          <ActionBtn icon="arrow-up" label="Enviar" size={48} onPress={() => nav.go('send')} />
          <ActionBtn icon="arrow-down" label="Recibir" size={48} onPress={() => nav.go('receive')} />
          <ActionBtn icon="swap-horizontal" label="Swap" size={48} onPress={() => nav.go('swap')} />
        </View>

        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.infoTitle}>{info.title}</Text>
          <Text style={styles.infoDesc}>{info.desc}</Text>
          {info.rows.map((r, i) => (
            <View key={i} style={styles.infoRow}>
              <Text style={styles.infoK}>{r[0]}</Text>
              <Text style={styles.infoV}>{r[1]}</Text>
            </View>
          ))}
          {t.contract && (
            <Pressable onPress={async () => { hap(); try { await Clipboard.setStringAsync(t.contract); toast('Contrato copiado'); } catch (e) {} }} style={styles.infoRow}>
              <Text style={styles.infoK}>Contrato</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.infoV}>{shortHash(t.contract)}</Text>
                <Ionicons name="copy" size={13} color={C.gold} />
              </View>
            </Pressable>
          )}
        </Card>

        <Text style={styles.secTitle}>Movimientos</Text>
        {transfers.length === 0 && (
          <Card style={{ padding: 18, alignItems: 'center' }}>
            <Text style={{ color: C.txt3, fontSize: 12.5 }}>Sin movimientos de {t.s} todavía.</Text>
          </Card>
        )}
        {transfers.slice(0, 15).map((x, i) => {
          const inbound = isIn(x);
          return (
            <Pressable key={x.hash || i} onPress={() => { hap(); toast('Tx ' + shortHash(x.hash)); }} style={styles.txn}>
              <View style={styles.txnIc}><Ionicons name={inbound ? 'arrow-down' : 'arrow-up'} size={17} color={inbound ? C.up : C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnT}>{inbound ? 'Recibido' : 'Enviado'}</Text>
                <Text style={styles.txnD}>{shortHash(x.hash)}</Text>
              </View>
              <Text style={[styles.txnV, inbound && { color: C.up }]}>{inbound ? '+' : '-'}{qtyFmt(Number(x.value) || 0)}</Text>
            </Pressable>
          );
        })}

        <View style={{ height: 14 }} />
        <Button3D title="Ver actividad completa" icon="pulse" onPress={() => nav.go('activity')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  qty: { fontSize: 25, fontWeight: '800', color: C.txt, marginTop: 8 },
  usd: { fontSize: 13, color: C.txt2, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  priceTxt: { fontSize: 13, color: C.txt2, fontWeight: '600' },
  chg: { fontSize: 13, fontWeight: '700' },
  mini: { flexDirection: 'row', justifyContent: 'center', gap: 30, marginBottom: 18 },
  infoTitle: { fontSize: 15.5, fontWeight: '700', color: C.txt, marginBottom: 8 },
  infoDesc: { fontSize: 12.5, color: C.txt2, lineHeight: 18, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  infoK: { color: C.txt3, fontSize: 13 },
  infoV: { color: C.txt, fontSize: 13, fontWeight: '600' },
  secTitle: { fontSize: 16, fontWeight: '700', color: C.txt, marginBottom: 10 },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 15, padding: 12, marginBottom: 8 },
  txnIc: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  txnT: { fontSize: 13.5, fontWeight: '600', color: C.txt },
  txnD: { fontSize: 11, color: C.txt3, marginTop: 2 },
  txnV: { fontSize: 13.5, fontWeight: '700', color: C.txt },
});
