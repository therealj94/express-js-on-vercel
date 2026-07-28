import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { Header, TokenIcon, Button3D, Card, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt, tokensFromBalances } from '../data';
import { apiSend, NETWORK_FEE_ORIGEN } from '../api';

function useTokens() {
  const { account } = useAccount();
  return tokensFromBalances(account?.balances || []);
}

// -------- selector de activo --------
function TokenPicker({ visible, tokens, onClose, onPick }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <Text style={styles.sheetTitle}>Selecciona un activo</Text>
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
  return (
    <Pressable onPress={() => { hap(); onPress(); }} style={styles.selector}>
      <TokenIcon t={token} size={38} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.selName}>{label || token.n}</Text>
        <Text style={styles.selSub}>Disponible: {qtyFmt(token.qty)} {token.s}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.txt3} />
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

  const amount = parseFloat(amt) || 0;
  const usd = amount * (tok.price || 0);
  const isNative = tok.s === 'ORIGEN';
  const insufficient = isNative && amount > 0 && amount + NETWORK_FEE_ORIGEN > tok.qty;

  async function doSend() {
    if (!isNative) { toast(`El envío de ${tok.s} llegará pronto a la app. Por ahora úsalo desde vetawallet.com`); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(to.trim())) { toast('Ingresa una dirección válida (0x…)'); return; }
    if (!(amount > 0)) { toast('Ingresa un monto válido'); return; }
    if (insufficient) { toast('Saldo insuficiente (incluye la comisión de red)'); return; }
    if (!pw) { toast('Ingresa tu contraseña para firmar'); return; }
    setSending(true);
    try {
      const r = await apiSend({ to: to.trim(), amount, password: pw });
      if (r.ok) {
        toast(r.hash ? `Enviado ✓ ${String(r.hash).slice(0, 12)}…` : 'Transacción enviada');
        setTimeout(() => nav.go('home'), 900);
      } else {
        toast('La transacción no se confirmó. Revisa en Actividad.');
      }
    } catch (e) {
      toast(e.message || 'No se pudo enviar');
    } finally { setSending(false); }
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Enviar" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <Selector token={tok} onPress={() => setPick(true)} />

        {!isNative && (
          <View style={styles.notice}>
            <Ionicons name="information-circle" size={18} color={C.gold} />
            <Text style={styles.noticeTxt}>El envío de {tok.s} desde la app estará disponible próximamente. Hoy puedes enviarlo desde la billetera web.</Text>
          </View>
        )}

        <View style={styles.bigInput}>
          <TextInput value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#3a5c58" style={styles.amtIn} />
          <Text style={styles.cur}>≈ {money(usd)} USD</Text>
        </View>

        <Text style={styles.label}>Dirección de destino</Text>
        <TextInput value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} placeholder="0x…" placeholderTextColor="#6f938f" style={styles.input} />

        <View style={{ height: 14 }} />
        <Text style={styles.label}>Contraseña (firma la transacción)</Text>
        <TextInput value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" placeholder="••••••••" placeholderTextColor="#6f938f" style={styles.input} />

        <View style={{ height: 14 }} />
        <Card style={{ padding: 14, marginBottom: 16 }}>
          <Row k="Comisión de red" v={`${NETWORK_FEE_ORIGEN} ORIGEN`} />
          <Row k="Red" v="Orden Global · 8532" />
          <Row k="Total a debitar" v={`${amount ? (amount + (isNative ? NETWORK_FEE_ORIGEN : 0)).toFixed(4) : '—'} ${tok.s}`} />
        </Card>
        {insufficient && <Text style={styles.errTxt}>Saldo insuficiente: tienes {qtyFmt(tok.qty)} {tok.s}.</Text>}

        <Button3D title={sending ? 'Enviando…' : 'Revisar y enviar'} disabled={sending || !isNative} onPress={sending ? () => {} : doSend} />
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
  const { account } = useAccount();
  const address = account?.addr || '';
  const copy = async () => {
    hap();
    try { await Clipboard.setStringAsync(address); toast('Dirección copiada'); }
    catch (e) { toast('No se pudo copiar'); }
  };
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Recibir" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, alignItems: 'center' }}>
        <View style={styles.qrBox}>
          {address ? <QRCode value={address} size={224} color="#04211d" backgroundColor="#ffffff" ecl="M" /> : <Text style={{ color: '#04211d' }}>Sin dirección</Text>}
        </View>
        <Text style={{ color: C.txt2, fontSize: 12.5, marginBottom: 14, textAlign: 'center' }}>
          Escanea para recibir ORIGEN y tokens de la red Orden Global (8532)
        </Text>
        <View style={styles.addrBox}>
          <Text style={styles.addr} numberOfLines={1}>{address || '—'}</Text>
          <Pressable onPress={copy}><Ionicons name="copy" size={22} color={C.gold} /></Pressable>
        </View>
        <Button3D title="Copiar dirección" icon="copy" onPress={copy} style={{ alignSelf: 'stretch' }} />
      </ScrollView>
    </View>
  );
}

// ================= COMPRAR =================
export function Buy({ nav }) {
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Comprar" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.soonWrap}>
          <View style={styles.soonIcon}><Ionicons name="card" size={34} color={C.gold} /></View>
          <Text style={styles.soonTitle}>Compra con tarjeta y banco</Text>
          <Text style={styles.soonBody}>
            La compra de ORIGEN con tarjeta o transferencia estará disponible muy pronto en la app.
            Mientras tanto puedes recibir tokens de otra billetera con tu código QR.
          </Text>
          <Button3D title="Recibir con mi QR" icon="qr-code" onPress={() => nav.go('receive')} style={{ alignSelf: 'stretch', marginTop: 18 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// ================= SWAP =================
export function Swap({ nav }) {
  const tokens = useTokens();
  const toast = useToast();
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
      <Header title="Intercambiar" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <SwapBox label="Envías" balance={qtyFmt(from.qty)} token={from} value={amt} onChange={setAmt} onPickToken={() => setPick('from')} />
        <Pressable onPress={flip} style={styles.flip}><Ionicons name="swap-vertical" size={22} color={C.gold} /></Pressable>
        <SwapBox label="Recibes" balance={qtyFmt(to.qty)} token={to} value={out ? out.toFixed(4) : ''} readOnly onPickToken={() => setPick('to')} />
        <Card style={{ padding: 14, marginTop: 16 }}>
          <Row k="Tasa en vivo" v={rate ? `1 ${from.s} = ${rate.toFixed(4)} ${to.s}` : '—'} />
          <Row k={`Precio ${from.s}`} v={money(from.price)} />
          <Row k={`Precio ${to.s}`} v={money(to.price)} />
        </Card>
        <View style={styles.notice}>
          <Ionicons name="information-circle" size={18} color={C.gold} />
          <Text style={styles.noticeTxt}>El intercambio dentro de la app estará disponible próximamente. Las tasas mostradas son precios reales del mercado.</Text>
        </View>
        <Button3D title="Intercambiar" icon="swap-horizontal" disabled onPress={() => toast('Disponible próximamente')} />
      </ScrollView>
      <TokenPicker visible={!!pick} tokens={tokens} onClose={() => setPick(null)} onPick={(t) => { pick === 'from' ? setFrom(t) : setTo(t); }} />
    </View>
  );
}

function SwapBox({ label, balance, token, value, onChange, readOnly, onPickToken }) {
  return (
    <Card style={{ padding: 17 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: C.txt3, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: C.txt3, fontSize: 12 }}>Balance: {balance}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TextInput value={value} onChangeText={onChange} editable={!readOnly} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#3a5c58" style={styles.swapIn} />
        <Pressable onPress={() => { hap(); onPickToken(); }} style={styles.swapTok}>
          <TokenIcon t={token} size={28} />
          <Text style={{ color: C.txt, fontWeight: '700', marginLeft: 7 }}>{token.s}</Text>
          <Ionicons name="chevron-down" size={16} color={C.txt2} style={{ marginLeft: 3 }} />
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
