import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { Header, TokenIcon, ActionBtn, Button3D, Card, useToast, useAccount, hap } from '../ui';
import { COIN_INFO, money, qtyFmt } from '../data';
import { fetchCandles, tieneVelas, TIMEFRAMES } from '../api';
import { CandleChart, TimeframeBar } from '../chart';
import { useT, useLang } from '../i18n';

const shortHash = (h) => (h && h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h || '');

export default function TokenDetail({ nav, params }) {
  const t = params.token || { s: 'ORIGEN', n: 'Origen', qty: 0, price: 0, logo: true };
  const info = COIN_INFO[t.s] || { title: t.n, desc: '', rows: [] };
  const toast = useToast();
  const tr = useT();
  const { lang } = useLang();
  const { account } = useAccount();
  const up = (t.chg ?? 0) >= 0;

  // ---- velas japonesas reales ----
  const conVelas = tieneVelas(t.s);
  const [tf, setTf] = useState('1D');
  const [velas, setVelas] = useState([]);
  const [cargando, setCargando] = useState(conVelas);
  const dias = (TIMEFRAMES.find((x) => x.k === tf) || TIMEFRAMES[0]).days;

  useEffect(() => {
    if (!conVelas) return;
    let vivo = true;
    setCargando(true);
    fetchCandles(t.s, dias)
      .then((v) => { if (vivo) { setVelas(v); setCargando(false); } })
      .catch(() => { if (vivo) setCargando(false); });
    // Precio en vivo: en 1D se refresca solo cada minuto.
    const id = dias <= 1 ? setInterval(() => fetchCandles(t.s, dias).then((v) => vivo && v.length && setVelas(v)).catch(() => {}), 60000) : null;
    return () => { vivo = false; if (id) clearInterval(id); };
  }, [t.s, dias, conVelas]);

  // Variación del periodo mostrado (no solo 24 h).
  const varPeriodo = velas.length > 1 ? ((velas[velas.length - 1].c - velas[0].o) / velas[0].o) * 100 : null;

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
          <Text style={styles.usd}>≈ {t.hasPrice ? money(t.qty * t.price) : '—'} USD</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceTxt}>{tr('tok.price')}: {t.hasPrice ? money(t.price) : '—'}</Text>
            {t.hasPrice && t.chg != null && (
              <Text style={[styles.chg, { color: up ? C.up : C.down }]}>{up ? '+' : ''}{t.chg.toFixed(2)}% 24h</Text>
            )}
          </View>
        </View>

        {/* Gráfico de velas: precio real del mercado con temporalidad. */}
        <Card style={{ marginBottom: 16, paddingHorizontal: 14, paddingVertical: 14 }}>
          <View style={styles.chartHead}>
            <Text style={styles.chartT}>{tr('chart.title')}</Text>
            {conVelas && varPeriodo != null ? (
              <Text style={[styles.chartVar, { color: varPeriodo >= 0 ? C.up : C.down }]}>
                {varPeriodo >= 0 ? '+' : ''}{varPeriodo.toFixed(2)}% · {tf}
              </Text>
            ) : null}
          </View>
          {conVelas ? (
            <>
              <CandleChart data={velas} days={dias} lang={lang} loading={cargando} height={236} />
              <TimeframeBar value={tf} options={TIMEFRAMES} onChange={setTf} />
              {!cargando && velas.length === 0 ? <Text style={styles.chartNote}>{tr('chart.offline')}</Text> : null}
              <Text style={styles.chartHint}>{tr('chart.hint')}</Text>
            </>
          ) : (
            <Text style={styles.chartNote}>{tr('chart.noMarket', { s: t.s })}</Text>
          )}
        </Card>

        <View style={styles.mini}>
          <ActionBtn icon="arrow-up" label={tr('home.send')} size={48} onPress={() => nav.go('send')} />
          <ActionBtn icon="arrow-down" label={tr('home.receive')} size={48} onPress={() => nav.go('receive')} />
          <ActionBtn icon="swap-horizontal" label={tr('home.swap')} size={48} onPress={() => nav.go('swap')} />
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
          {/* Contrato: se muestra SIEMPRE para que las 5 monedas tengan la
              misma cantidad de filas. Si es un ERC-20, la dirección se
              copia al tocar; ORIGEN es nativa y aparece como "Token nativo". */}
          <Pressable
            onPress={t.contract ? async () => { hap(); try { await Clipboard.setStringAsync(t.contract); toast(tr('tok.copied')); } catch (e) {} } : undefined}
            style={styles.infoRow}
          >
            <Text style={styles.infoK}>{tr('tok.contract')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.infoV}>{t.contract ? shortHash(t.contract) : tr('tok.native')}</Text>
              {t.contract ? <Icon name="copy" size={13} color={C.gold} /> : null}
            </View>
          </Pressable>
        </Card>

        <Text style={styles.secTitle}>{tr('tok.movs')}</Text>
        {transfers.length === 0 && (
          <Card style={{ padding: 18, alignItems: 'center' }}>
            <Text style={{ color: C.txt3, fontSize: 12.5 }}>{tr('tok.empty', { s: t.s })}</Text>
          </Card>
        )}
        {transfers.slice(0, 15).map((x, i) => {
          const inbound = isIn(x);
          return (
            <Pressable key={x.hash || i} onPress={() => { hap(); toast('Tx ' + shortHash(x.hash)); }} style={styles.txn}>
              <View style={styles.txnIc}><Icon name={inbound ? 'arrow-down' : 'arrow-up'} size={17} color={inbound ? C.up : C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnT}>{inbound ? tr('tok.received') : tr('tok.sent')}</Text>
                <Text style={styles.txnD}>{shortHash(x.hash)}</Text>
              </View>
              <Text style={[styles.txnV, inbound && { color: C.up }]}>{inbound ? '+' : '-'}{qtyFmt(Number(x.value) || 0)}</Text>
            </Pressable>
          );
        })}

        <View style={{ height: 14 }} />
        <Button3D title={tr('tok.viewAll')} icon="pulse" onPress={() => nav.go('activity')} />
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
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  chartT: { fontSize: 14, fontWeight: '700', color: C.txt },
  chartVar: { fontSize: 12.5, fontWeight: '700' },
  chartNote: { color: C.txt3, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 22 },
  chartHint: { color: C.txt3, fontSize: 10.5, textAlign: 'center', marginTop: 9 },
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
