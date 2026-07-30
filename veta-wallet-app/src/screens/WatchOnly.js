import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, Skeleton, TokenIcon, hap, useToast } from '../ui';
import { listWatched, addWatched, removeWatched, isAddress } from '../watchList';
import { apiPortfolio, ONCHAIN_TOKENS, rpcBalance, erc20Balance, RPC_FALLBACK, walletApi, CHAIN_ID } from '../api';
import { money, qtyFmt, tokensFromBalances } from '../data';
import { ScanModal } from './Scan';
import { useT } from '../i18n';

const short = (a) => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

// Consulta on-chain igual que apiPortfolio pero SIN JWT: solo lecturas RPC
// para la dirección que estamos observando. No mueve fondos, no firma nada.
async function readAddress(address) {
  let provider = RPC_FALLBACK;
  try {
    const raw = await walletApi.chain(CHAIN_ID);
    const chain = Array.isArray(raw) ? raw[0] : raw?.chain || raw?.data || raw;
    provider = chain?.provider || RPC_FALLBACK;
  } catch (e) {}
  const balances = await Promise.all(ONCHAIN_TOKENS.map(async (t) => {
    let qty = 0;
    try {
      if (t.native) qty = await rpcBalance(provider, address, 18);
      else qty = await erc20Balance(provider, t.contract, address, 18);
    } catch (e) {}
    return { symbol: t.symbol, qty, priceUsd: null, contract: t.contract || null };
  }));
  return balances;
}

export default function WatchOnly({ nav }) {
  const t = useT();
  const toast = useToast();
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null); // { name, address } cuando el modal está abierto
  const [scan, setScan] = useState(false);
  const [open, setOpen] = useState(null); // wallet actualmente abierta (con balances)
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => { listWatched().then(setList); }, []);
  useEffect(load, [load]);

  const abrir = async (w) => {
    hap(); setOpen(w); setBalances(null); setLoading(true);
    try { setBalances(await readAddress(w.address)); } catch (e) {}
    finally { setLoading(false); }
  };

  const guardar = async () => {
    if (!isAddress(edit.address)) { toast(t('watch.errAddr')); return; }
    try {
      await addWatched({ name: edit.name, address: edit.address });
      setEdit(null); load(); toast(t('watch.saved'));
    } catch (e) { toast(t('watch.errAddr')); }
  };

  const pedirBorrar = (w) => {
    hap();
    Alert.alert(t('watch.delT'), t('watch.delQ', { name: w.name }), [
      { text: t('con.cancel'), style: 'cancel' },
      { text: t('con.delOk'), style: 'destructive', onPress: async () => {
        await removeWatched(w.id); load(); if (open?.id === w.id) { setOpen(null); setBalances(null); }
        toast(t('watch.removed'));
      } },
    ]);
  };

  const tokens = balances ? tokensFromBalances(balances) : [];

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header
        title={t('watch.title')}
        onBack={() => nav.back()}
        right={
          <Pressable
            onPress={() => { hap(); setEdit({ name: '', address: '' }); }}
            accessibilityRole="button"
            accessibilityLabel={t('watch.add')}
            style={st.addBtn}>
            <Icon name="add" size={22} color={C.darkText} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110 }}>
        <View style={st.hero}>
          <Icon name="eye" size={22} color={C.gold} />
          <Text style={st.heroTxt}>{t('watch.hint')}</Text>
        </View>

        {list.length === 0 && (
          <View style={st.empty}>
            <View style={st.emptyIc}><Icon name="eye" size={30} color={C.txt3} /></View>
            <Text style={st.emptyT}>{t('watch.emptyT')}</Text>
            <Text style={st.emptyP}>{t('watch.emptyP')}</Text>
            <Button3D title={t('watch.add')} icon="add" onPress={() => setEdit({ name: '', address: '' })} style={{ alignSelf: 'stretch', marginTop: 18 }} />
          </View>
        )}

        {list.map((w) => (
          <View key={w.id} style={st.card}>
            <Pressable onPress={() => abrir(w)} style={st.row}>
              <View style={st.avatar}><Icon name="eye" size={18} color={C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.name} numberOfLines={1}>{w.name}</Text>
                <Text style={st.addr} numberOfLines={1}>{short(w.address)}</Text>
              </View>
              <Icon name={open?.id === w.id ? 'chevron-up' : 'chevron-down'} size={20} color={C.txt3} />
              <Pressable onPress={() => pedirBorrar(w)} style={st.delBtn} hitSlop={10}>
                <Icon name="trash" size={16} color={C.down} />
              </Pressable>
            </Pressable>

            {open?.id === w.id && (
              <View style={st.balances}>
                {loading && [0, 1, 2, 3].map((i) => (
                  <View key={i} style={st.tokenRow}>
                    <Skeleton width={36} height={36} radius={18} />
                    <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                      <Skeleton width={70} height={11} />
                      <Skeleton width={110} height={9} />
                    </View>
                  </View>
                ))}
                {!loading && tokens.map((tk) => (
                  <View key={tk.s} style={st.tokenRow}>
                    <TokenIcon t={tk} size={36} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={st.tokName}>{tk.n}</Text>
                    </View>
                    <Text style={st.tokQty}>{qtyFmt(tk.qty)} {tk.s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={st.sheetBg} onPress={() => setEdit(null)}>
            <Pressable style={st.sheet} onPress={() => {}}>
              <View style={st.grab} />
              <Text style={st.sheetT}>{t('watch.new')}</Text>

              <Text style={st.label}>{t('con.name')}</Text>
              <TextInput
                value={edit?.name}
                onChangeText={(v) => setEdit((e) => ({ ...e, name: v }))}
                placeholder={t('watch.namePh')}
                placeholderTextColor="#6f938f"
                style={st.input}
              />

              <Text style={[st.label, { marginTop: 14 }]}>{t('send.to')}</Text>
              <View style={{ flexDirection: 'row', gap: 9 }}>
                <TextInput
                  value={edit?.address}
                  onChangeText={(v) => setEdit((e) => ({ ...e, address: v }))}
                  placeholder="0x…"
                  placeholderTextColor="#6f938f"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[st.input, { flex: 1 }]}
                />
                <Pressable onPress={() => { hap(); setScan(true); }} style={st.scanBtn}>
                  <Icon name="qr-code" size={20} color={C.darkText} />
                </Pressable>
              </View>

              <Button3D title={t('prof.save')} icon="checkmark" onPress={guardar} style={{ marginTop: 16 }} />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <ScanModal
        visible={scan}
        onResult={(a) => setEdit((e) => ({ ...(e || { name: '' }), address: a }))}
        onClose={() => setScan(false)}
      />
    </View>
  );
}

const st = StyleSheet.create({
  addBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'rgba(201,169,97,0.10)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.32)', borderRadius: 14, padding: 14, marginBottom: 14 },
  heroTxt: { flex: 1, color: C.txt2, fontSize: 12, lineHeight: 17 },
  empty: { alignItems: 'center', marginTop: 40, marginBottom: 20 },
  emptyIc: { width: 78, height: 78, borderRadius: 39, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  emptyT: { color: C.txt, fontWeight: '700', fontSize: 16, marginTop: 16 },
  emptyP: { color: C.txt3, fontSize: 12.5, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, marginBottom: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(201,169,97,0.16)', alignItems: 'center', justifyContent: 'center' },
  name: { color: C.txt, fontWeight: '700', fontSize: 14.5 },
  addr: { color: C.txt3, fontSize: 11.5, marginTop: 2 },
  delBtn: { padding: 7, marginLeft: 2, borderRadius: 10, backgroundColor: 'rgba(240,119,107,0.10)', borderWidth: 1, borderColor: 'rgba(240,119,107,0.28)' },
  balances: { paddingHorizontal: 13, paddingBottom: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', gap: 6 },
  tokenRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  tokName: { color: C.txt, fontWeight: '600', fontSize: 13.5 },
  tokQty: { color: C.txt2, fontSize: 13, fontVariant: ['tabular-nums'] },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#062A2C', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line, padding: 22, paddingBottom: 34 },
  grab: { width: 40, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  sheetT: { fontSize: 17, fontWeight: '700', color: C.txt, textAlign: 'center', marginBottom: 18 },
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 15 },
  scanBtn: { width: 52, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
});
