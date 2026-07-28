import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, StyleSheet } from 'react-native';
import { Icon } from '../icons';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { Header, TokenIcon, Button3D, Card, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt, tokensFromBalances } from '../data';
import { apiSend, NETWORK_FEE_ORIGEN } from '../api';
import { useT } from '../i18n';

function useTokens() {
  const { account } = useAccount();
  return tokensFromBalances(account?.balances || []);
}

// -------- selector de activo --------
function TokenPicker({ visible, tokens, onClose, onPick }) {
  const tr = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <Text style={styles.sheetTitle}>{tr('picker.title')}</Text>
          {tokens.map((t) => (
            <Pressable key={t.s} onPress={() => { hap(); onPick(t); onClose(); }} style={styles.pick}>
              <TokenIcon t={t} size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.pickName}>{t.n}</Text>
                <Text style={styles.pickSub}>{qtyFmt(t.qty)} {t.s}</Text>
              </View>
              <Text style={{ color: C.gold, fontWeight: '600' }}>{money(t.qty * t.price)}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Selector({ token, label, onPress }) {
  const tr = useT();
  return (
    <Pressable onPress={() => { hap(); onPress(); }} style={styles.selector}>
      <TokenIcon t={token} size={38} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.selName}>{label || token.n}</Text>
        <Text style={styles.selSub}>{tr('send.available')}: {qtyFmt(token.qty)} {token.s}</Text>
      </View>
      <Icon name="chevron-forward" size={20} color={C.txt3} />
    </Pressable>
  );
}

// ================= ENVIAR =================
export function Send({ nav }) {
  const tokens = useTokens();
  const origen = tokens.find((t) => t.s === 'ORIGEN') || tokens[0] || { s: 'ORIGEN', n: 'Origen', qty: 0, price: 0, logo: true };
  const [tok, setTok] = useState(origen);
  const [amt, setAmt] = useState('');
  const [to, setTo] = useState('');
  const [pw, setPw] = useState('');
  const [pick, setPick] = useState(false);
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const t = useT();

  const amount = parseFloat(amt) || 0;
  const usd = amount * (tok.price || 0);
  const isNative = tok.s === 'ORIGEN';
  const insufficient = isNative && amount > 0 && amount + NETWORK_FEE_ORIGEN > tok.qty;

  async function doSend() {
    if (!isNative) { toast(t('send.soon', { s: tok.s })); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(to.trim())) { toast(t('send.errAddr')); return; }
    if (!(amount > 0)) { toast(t('send.errAmt')); return; }
    if (insufficient) { toast(t('send.errBal')); return; }
    if (!pw) { toast(t('send.errPw')); return; }
    setSending(true);
    try {
      const r = await apiSend({ to: to.trim(), amount, password: pw });
      if (r.ok) {
        toast(r.hash ? `✓ ${String(r.hash).slice(0, 12)}…` : t('send.sent'));
        setTimeout(() => nav.go('home'), 900);
      } else {
        toast(t('send.notConfirmed'));
      }
    } catch (e) {
      toast(e.message || t('auth.errGeneric'));
    } finally { setSending(false); }
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('send.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <Selector token={tok} onPress={() => setPick(true)} />

        {!isNative && (
          <View style={styles.notice}>
            <Icon name="information-circle" size={18} color={C.gold} />
            <Text style={styles.noticeTxt}>{t('send.soon', { s: tok.s })}</Text>
          </View>
        )}

        <View style={styles.bigInput}>
          <TextInput value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#3a5c58" style={styles.amtIn} />
          <Text style={styles.cur}>≈ {money(usd)} USD</Text>
        </View>

        <Text style={styles.label}>{t('send.to')}</Text>
        <TextInput value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} placeholder="0x…" placeholderTextColor="#6f938f" style={styles.input} />

        <View style={{ height: 14 }} />
        <Text style={styles.label}>{t('send.pw')}</Text>
        <TextInput value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" placeholder="••••••••" placeholderTextColor="#6f938f" style={styles.input} />

        <View style={{ height: 14 }} />
        <Card style={{ padding: 14, marginBottom: 16 }}>
          <Row k={t('send.fee')} v={`${NETWORK_FEE_ORIGEN} ORIGEN`} />
          <Row k={t('send.network')} v="Orden Global · 8532" />
          <Row k={t('send.total')} v={`${amount ? (amount + (isNative ? NETWORK_FEE_ORIGEN : 0)).toFixed(4) : '—'} ${tok.s}`} />
        </Card>
        {insufficient && <Text style={styles.errTxt}>{t('send.insufficient', { q: qtyFmt(tok.qty), s: tok.s })}</Text>}

        <Button3D title={sending ? t('send.sending') : t('send.review')} disabled={sending || !isNative} onPress={sending ? () => {} : doSend} />
      </ScrollView>
      <TokenPicker visible={pick} tokens={tokens} onClose={() => setPick(false)} onPick={setTok} />
    </View>
  );
}

function Row({ k, v }) {
  return <View style={styles.rr}><Text style={styles.rrK}>{k}</Text><Text style={styles.rrV}>{v}</Text></View>;
}

// ================= RECIBIR =================
export function Receive({ nav }) {
  const toast = useToast();
  const t = useT();
  const { account } = useAccount();
  const address = account?.addr || '';
  const copy = async () => {
    hap();
    try { await Clipboard.setStringAsync(address); toast(t('recv.copied')); }
    catch (e) { toast(t('recv.copyErr')); }
  };
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('recv.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, alignItems: 'center' }}>
        <View style={styles.qrBox}>
          {address ? <QRCode value={address} size={224} color="#04211d" backgroundColor="#ffffff" ecl="M" /> : <Text style={{ color: '#04211d' }}>Sin dirección</Text>}
        </View>
        <Text style={{ color: C.txt2, fontSize: 12.5, marginBottom: 14, textAlign: 'center' }}>
          {t('recv.scan')}
        </Text>
        <View style={styles.addrBox}>
          <Text style={styles.addr} numberOfLines={1}>{address || '—'}</Text>
          <Pressable onPress={copy}><Icon name="copy" size={22} color={C.gold} /></Pressable>
        </View>
        <Button3D title={t('recv.copy')} icon="copy" onPress={copy} style={{ alignSelf: 'stretch' }} />
      </ScrollView>
    </View>
  );
}

// ================= COMPRAR =================
export function Buy({ nav }) {
  const t = useT();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('buy.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.soonWrap}>
          <View style={styles.soonIcon}><Icon name="card" size={34} color={C.gold} /></View>
          <Text style={styles.soonTitle}>{t('buy.h')}</Text>
          <Text style={styles.soonBody}>{t('buy.p')}</Text>
          <Button3D title={t('buy.cta')} icon="qr-code" onPress={() => nav.go('receive')} style={{ alignSelf: 'stretch', marginTop: 18 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// ================= SWAP =================
export function Swap({ nav }) {
  const tokens = useTokens();
  const toast = useToast();
  const t = useT();
  const t0 = tokens[0] || { s: 'ORIGEN', n: 'Origen', qty: 0, price: 0, logo: true };
  const t1 = tokens[3] || tokens[1] || t0;
  const [from, setFrom] = useState(t0);
  const [to, setTo] = useState(t1);
  const [amt, setAmt] = useState('');
  const [pick, setPick] = useState(null);
  const rate = from.price && to.price ? from.price / to.price : 0;
  const out = ((parseFloat(amt) || 0) * rate);
  const flip = () => { hap(); setFrom(to); setTo(from); };
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('swap.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <SwapBox label={t('swap.from')} balance={qtyFmt(from.qty)} token={from} value={amt} onChange={setAmt} onPickToken={() => setPick('from')} />
        <Pressable onPress={flip} style={styles.flip}><Icon name="swap-vertical" size={22} color={C.gold} /></Pressable>
        <SwapBox label={t('swap.toLbl')} balance={qtyFmt(to.qty)} token={to} value={out ? out.toFixed(4) : ''} readOnly onPickToken={() => setPick('to')} />
        <Card style={{ padding: 14, marginTop: 16 }}>
          <Row k={t('swap.rate')} v={rate ? `1 ${from.s} = ${rate.toFixed(4)} ${to.s}` : '—'} />
          <Row k={`${t('swap.price')} ${from.s}`} v={money(from.price)} />
          <Row k={`${t('swap.price')} ${to.s}`} v={money(to.price)} />
        </Card>
        <View style={styles.notice}>
          <Icon name="information-circle" size={18} color={C.gold} />
          <Text style={styles.noticeTxt}>{t('swap.soon')}</Text>
        </View>
        <Button3D title={t('swap.cta')} icon="swap-horizontal" disabled onPress={() => {}} />
      </ScrollView>
      <TokenPicker visible={!!pick} tokens={tokens} onClose={() => setPick(null)} onPick={(t) => { pick === 'from' ? setFrom(t) : setTo(t); }} />
    </View>
  );
}

function SwapBox({ label, balance, token, value, onChange, readOnly, onPickToken }) {
  const tr = useT();
  return (
    <Card style={{ padding: 17 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: C.txt3, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: C.txt3, fontSize: 12 }}>{tr('swap.balance')}: {balance}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TextInput value={value} onChangeText={onChange} editable={!readOnly} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#3a5c58" style={styles.swapIn} />
        <Pressable onPress={() => { hap(); onPickToken(); }} style={styles.swapTok}>
          <TokenIcon t={token} size={28} />
          <Text style={{ color: C.txt, fontWeight: '700', marginLeft: 7 }}>{token.s}</Text>
          <Icon name="chevron-down" size={16} color={C.txt2} style={{ marginLeft: 3 }} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },
  selector: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 12, marginBottom: 13 },
  selName: { fontSize: 14, fontWeight: '600', color: C.txt },
  selSub: { fontSize: 12, color: C.txt3 },
  bigInput: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 14 },
  amtIn: { color: C.txt, fontWeight: '800', fontSize: 42, textAlign: 'center', minWidth: 120, padding: 0 },
  cur: { color: C.gold, fontWeight: '600', fontSize: 14, marginTop: 4 },
  rr: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rrK: { color: C.txt2, fontSize: 12.5 }, rrV: { color: C.txt, fontSize: 12.5, fontWeight: '600' },
  errTxt: { color: C.down, fontSize: 12.5, marginBottom: 12 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'rgba(201,169,97,0.08)', borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)', borderRadius: 14, padding: 12, marginVertical: 14 },
  noticeTxt: { flex: 1, color: C.txt2, fontSize: 12, lineHeight: 17 },
  qrBox: { width: 276, height: 276, backgroundColor: '#fff', borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginVertical: 16, padding: 16 },
  addrBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 15, marginBottom: 16, width: '100%' },
  addr: { flex: 1, color: C.txt, fontSize: 13 },
  soonWrap: { alignItems: 'center', paddingTop: 40 },
  soonIcon: { width: 84, height: 84, borderRadius: 26, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  soonTitle: { color: C.txt, fontWeight: '800', fontSize: 20, marginBottom: 10, textAlign: 'center' },
  soonBody: { color: C.txt2, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  flip: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.panel3, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: -14, zIndex: 3 },
  swapIn: { flex: 1, color: C.txt, fontWeight: '800', fontSize: 28, padding: 0 },
  swapTok: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel2, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line2, padding: 22, paddingBottom: 34 },
  grab: { width: 40, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.txt, textAlign: 'center', marginBottom: 14 },
  pick: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 15, padding: 12, marginBottom: 8 },
  pickName: { fontSize: 14, fontWeight: '600', color: C.txt }, pickSub: { fontSize: 11.5, color: C.txt3 },
});
