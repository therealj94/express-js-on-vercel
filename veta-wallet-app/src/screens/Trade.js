import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect } from 'react-native-svg';
import { C, G } from '../theme';
import { Header, TokenIcon, ActionBtn, Button3D, Card, useToast, hap } from '../ui';
import { TOKENS, money, qtyFmt, WALLET_ADDRESS } from '../data';

// -------- token picker modal --------
function TokenPicker({ visible, onClose, onPick }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grab} />
          <Text style={styles.sheetTitle}>Selecciona un activo</Text>
          {TOKENS.map((t) => (
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

// ================= SEND =================
export function Send({ nav }) {
  const [tok, setTok] = useState(TOKENS[0]);
  const [amt, setAmt] = useState('25');
  const [pick, setPick] = useState(false);
  const toast = useToast();
  const usd = (parseFloat(amt) || 0) * tok.price;
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Enviar" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <View style={styles.contacts}>
          {[['+', 'Nuevo'], ['MG', 'María'], ['CL', 'Carlos'], ['AR', 'Ana'], ['LP', 'Luis']].map((c, i) => (
            <Pressable key={i} onPress={() => { hap(); toast(i === 0 ? 'Nuevo contacto' : 'Enviar a ' + c[1]); }} style={styles.contact}>
              <View style={[styles.cav, i === 0 && { borderStyle: 'dashed' }]}>
                {i === 0 ? <Ionicons name="add" size={22} color={C.gold} /> : <Text style={styles.cavTxt}>{c[0]}</Text>}
              </View>
              <Text style={styles.cName}>{c[1]}</Text>
            </Pressable>
          ))}
        </View>
        <Selector token={tok} onPress={() => setPick(true)} />
        <View style={styles.bigInput}>
          <TextInput value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#3a5c58" style={styles.amtIn} />
          <Text style={styles.cur}>≈ {money(usd)} USD</Text>
        </View>
        <Text style={styles.label}>Dirección o usuario</Text>
        <TextInput placeholder="0x… o @usuario" placeholderTextColor="#6f938f" style={styles.input} />
        <View style={{ height: 14 }} />
        <Card style={{ padding: 14, marginBottom: 16 }}>
          {[['Comisión de red', '0.0004 ' + tok.s], ['Tiempo estimado', '~ 3 seg'], ['Total', amt + ' ' + tok.s]].map((r, i) => (
            <View key={i} style={styles.rr}><Text style={styles.rrK}>{r[0]}</Text><Text style={styles.rrV}>{r[1]}</Text></View>
          ))}
        </Card>
        <Button3D title="Revisar y enviar" onPress={() => { toast('Transacción enviada'); setTimeout(() => nav.back(), 700); }} />
      </ScrollView>
      <TokenPicker visible={pick} onClose={() => setPick(false)} onPick={setTok} />
    </View>
  );
}

// ================= RECEIVE =================
export function Receive({ nav }) {
  const toast = useToast();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Recibir" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22, alignItems: 'center' }}>
        <View style={styles.qrBox}>
          <Image source={require('../../assets/qr.png')} style={{ width: 244, height: 244 }} resizeMode="contain" />
        </View>
        <Text style={{ color: C.txt2, fontSize: 12.5, marginBottom: 14, textAlign: 'center' }}>Escanea para enviar ORIGEN a esta billetera</Text>
        <View style={styles.addrBox}>
          <Text style={styles.addr}>{WALLET_ADDRESS}</Text>
          <Pressable onPress={() => { hap(); toast('Dirección copiada'); }}><Ionicons name="copy" size={22} color={C.gold} /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
          <View style={{ flex: 1 }}><Button3D variant="ghost" title="Compartir" icon="share-social" onPress={() => toast('Compartiendo…')} /></View>
          <View style={{ flex: 1 }}><Button3D title="Copiar" icon="copy" onPress={() => toast('Dirección copiada')} /></View>
        </View>
      </ScrollView>
    </View>
  );
}

function QR() {
  const g = 13, cell = 178 / g;
  const rects = [];
  let s = 7;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
    const corner = (x < 4 && y < 4) || (x > g - 5 && y < 4) || (x < 4 && y > g - 5);
    const on = corner ? (x === 0 || x === 3 || y === 0 || y === 3 || (x === 1 && y === 1)) : rnd() > 0.5;
    if (on) rects.push(<Rect key={x + '-' + y} x={x * cell} y={y * cell} width={cell} height={cell} fill="#04211d" />);
  }
  return <Svg width={178} height={178}>{rects}<Rect x={70} y={70} width={38} height={38} rx={6} fill="#0A5A4E" /></Svg>;
}

// ================= BUY =================
export function Buy({ nav }) {
  const [mode, setMode] = useState('buy');
  const [amt, setAmt] = useState('100');
  const toast = useToast();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Comprar / Vender" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <View style={styles.seg}>
          {['buy', 'sell'].map((m) => (
            <Pressable key={m} onPress={() => { hap(); setMode(m); }} style={[styles.segBtn, mode === m && styles.segOn]}>
              <Text style={[styles.segTxt, mode === m && { color: C.darkText }]}>{m === 'buy' ? 'Comprar' : 'Vender'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.bigInput}>
          <TextInput value={amt} onChangeText={setAmt} keyboardType="decimal-pad" style={styles.amtIn} />
          <Text style={styles.cur}>USD</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
          {['50', '100', '500'].map((q) => (
            <Pressable key={q} onPress={() => { hap(); setAmt(q); }} style={styles.quick}><Text style={{ color: C.txt, fontWeight: '600' }}>${q}</Text></Pressable>
          ))}
        </View>
        <Selector token={TOKENS[0]} label={'Recibes ' + (parseFloat(amt) / TOKENS[0].price || 0).toFixed(2) + ' ORIGEN'} onPress={() => toast('Selector de activo')} />
        <Text style={[styles.label, { marginTop: 6 }]}>Método de pago</Text>
        <Card style={{ padding: 0, overflow: 'hidden', marginTop: 4 }}>
          <PayRow icon="card" t="Tarjeta Veta •••• 7760" s="Débito Orden Global" first />
          <PayRow icon="business" t="Transferencia bancaria" s="1-2 días hábiles" />
        </Card>
        <View style={{ height: 16 }} />
        <Button3D title={mode === 'buy' ? 'Comprar ORIGEN' : 'Vender ORIGEN'} onPress={() => toast(mode === 'buy' ? 'Compra realizada' : 'Venta realizada')} />
      </ScrollView>
    </View>
  );
}
function PayRow({ icon, t, s, first }) {
  return (
    <View style={[styles.payRow, first && { borderTopWidth: 0 }]}>
      <View style={styles.payIc}><Ionicons name={icon} size={19} color={C.gold} /></View>
      <View style={{ flex: 1 }}><Text style={styles.liTitle}>{t}</Text><Text style={styles.liSub}>{s}</Text></View>
      <Ionicons name="chevron-forward" size={17} color={C.txt3} />
    </View>
  );
}

// ================= SWAP =================
export function Swap({ nav }) {
  const [from, setFrom] = useState(TOKENS[0]);
  const [to, setTo] = useState(TOKENS[6]);
  const [amt, setAmt] = useState('50');
  const [pick, setPick] = useState(null); // 'from' | 'to'
  const toast = useToast();
  const rate = from.price / to.price;
  const out = ((parseFloat(amt) || 0) * rate).toFixed(2);
  const flip = () => { hap(); setFrom(to); setTo(from); };
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Intercambiar" onBack={() => nav.back()} right={<Pressable onPress={() => toast('Ajustes de slippage')}><Ionicons name="settings-outline" size={22} color={C.txt} /></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <SwapBox label="Envías" balance={qtyFmt(from.qty)} token={from} value={amt} onChange={setAmt} onPickToken={() => setPick('from')} />
        <Pressable onPress={flip} style={styles.flip}><Ionicons name="swap-vertical" size={22} color={C.gold} /></Pressable>
        <SwapBox label="Recibes" balance={qtyFmt(to.qty)} token={to} value={out} readOnly onPickToken={() => setPick('to')} />
        <Card style={{ padding: 14, marginTop: 16 }}>
          {[['Tasa', `1 ${from.s} = ${rate.toFixed(4)} ${to.s}`], ['Impacto de precio', '0.02%'], ['Comisión de red', '0.0004 ' + from.s], ['Proveedor', 'Orden DEX']].map((r, i) => (
            <View key={i} style={styles.rr}><Text style={styles.rrK}>{r[0]}</Text><Text style={styles.rrV}>{r[1]}</Text></View>
          ))}
        </Card>
        <View style={{ height: 16 }} />
        <Button3D title="Intercambiar ahora" icon="swap-horizontal" onPress={() => toast('Swap ejecutado')} />
      </ScrollView>
      <TokenPicker visible={!!pick} onClose={() => setPick(null)} onPick={(t) => { pick === 'from' ? setFrom(t) : setTo(t); }} />
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
        <TextInput value={value} onChangeText={onChange} editable={!readOnly} keyboardType="decimal-pad" style={styles.swapIn} />
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
  contacts: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  contact: { alignItems: 'center', gap: 6, width: 56 },
  cav: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.panel3, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  cavTxt: { color: C.gold, fontWeight: '700', fontSize: 15 },
  cName: { fontSize: 11, color: C.txt2 },
  selector: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 12, marginBottom: 13 },
  selName: { fontSize: 14, fontWeight: '600', color: C.txt },
  selSub: { fontSize: 12, color: C.txt3 },
  bigInput: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 14 },
  amtIn: { color: C.txt, fontWeight: '800', fontSize: 42, textAlign: 'center', minWidth: 120, padding: 0 },
  cur: { color: C.gold, fontWeight: '600', fontSize: 14, marginTop: 4 },
  rr: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rrK: { color: C.txt2, fontSize: 12.5 }, rrV: { color: C.txt, fontSize: 12.5, fontWeight: '600' },
  qrBox: { width: 276, height: 276, backgroundColor: '#fff', borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginVertical: 16, padding: 16 },
  addrBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 15, marginBottom: 16, width: '100%' },
  addr: { flex: 1, color: C.txt, fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: C.input, borderRadius: 14, padding: 4, marginBottom: 18 },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  segOn: { backgroundColor: C.gold },
  segTxt: { color: C.txt2, fontWeight: '600', fontSize: 14 },
  quick: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  payIc: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  liTitle: { fontSize: 14, fontWeight: '600', color: C.txt },
  liSub: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  flip: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.panel3, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: -14, zIndex: 3 },
  swapIn: { flex: 1, color: C.txt, fontWeight: '800', fontSize: 28, padding: 0 },
  swapTok: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel2, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  // sheet
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg2, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line2, padding: 22, paddingBottom: 34 },
  grab: { width: 40, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.txt, textAlign: 'center', marginBottom: 14 },
  pick: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 15, padding: 12, marginBottom: 8 },
  pickName: { fontSize: 14, fontWeight: '600', color: C.txt }, pickSub: { fontSize: 11.5, color: C.txt3 },
});
