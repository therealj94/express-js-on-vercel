import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C, G } from '../theme';
import { Header, Logo, TokenIcon, Button3D, Card, ListRow, Toggle, SectionHead, useToast, hap } from '../ui';
import { TXNS, NOTIFS, TOKENS, money } from '../data';

// ================= REMESAS =================
export function Remit({ nav }) {
  const [tab, setTab] = useState('in');
  const [target, setTarget] = useState('origen');
  const toast = useToast();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Remesas" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <LinearGradient colors={G.gold} style={styles.heroIc}><Ionicons name="globe" size={24} color={C.darkText} /></LinearGradient>
          <Text style={styles.heroT}>Remesas sin fronteras</Text>
          <Text style={styles.heroP}>Recibe dinero del exterior y conviértelo a ORIGEN o directo a tu tarjeta débito, al instante.</Text>
          <View style={styles.flow}>
            <FlowNode icon="cash" label="USD" />
            <Ionicons name="arrow-forward" size={18} color={C.gold} />
            <FlowNode logo label="ORIGEN" />
            <Ionicons name="arrow-forward" size={18} color={C.gold} />
            <FlowNode icon="card" label="Tarjeta" />
          </View>
        </LinearGradient>

        <View style={styles.seg}>
          {[['in', 'Recibir remesa'], ['out', 'Enviar remesa']].map(([k, l]) => (
            <Pressable key={k} onPress={() => { hap(); setTab(k); }} style={[styles.segBtn, tab === k && styles.segOn]}>
              <Text style={[styles.segTxt, tab === k && { color: C.darkText }]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'in' ? (
          <>
            <View style={styles.bigInput}><TextInput defaultValue="250" keyboardType="decimal-pad" style={styles.amtIn} /><Text style={styles.cur}>USD a recibir</Text></View>
            <View style={{ flexDirection: 'row', gap: 11, marginBottom: 14 }}>
              <Mcc active={target === 'origen'} onPress={() => { hap(); setTarget('origen'); }} logo title="A ORIGEN" sub="+106.4 ORIGEN" />
              <Mcc active={target === 'card'} onPress={() => { hap(); setTarget('card'); }} icon="card" title="A tarjeta" sub="Gasta al instante" />
            </View>
            <Text style={styles.label}>Remitente</Text>
            <TextInput placeholder="Nombre de quien envía" placeholderTextColor="#6f938f" style={styles.input} />
            <Card style={{ padding: 14, marginVertical: 14 }}>
              {[['Tasa', '1 USD = 0.4255 ORIGEN'], ['Comisión Veta', '$0.99'], ['Recibes', '106.42 ORIGEN']].map((r, i) => (
                <View key={i} style={styles.rr}><Text style={styles.rrK}>{r[0]}</Text><Text style={styles.rrV}>{r[1]}</Text></View>
              ))}
            </Card>
            <Button3D title="Generar orden de cobro" onPress={() => toast('Orden de cobro generada')} />
          </>
        ) : (
          <>
            <View style={styles.bigInput}><TextInput defaultValue="40" keyboardType="decimal-pad" style={styles.amtIn} /><Text style={styles.cur}>≈ $94.00 USD</Text></View>
            <Text style={styles.label}>Destinatario</Text>
            <TextInput placeholder="Teléfono, correo o @usuario" placeholderTextColor="#6f938f" style={styles.input} />
            <Card style={{ padding: 14, marginVertical: 14 }}>
              {[['Recibe destinatario', '$93.60 USD'], ['Comisión', '$0.40']].map((r, i) => (
                <View key={i} style={styles.rr}><Text style={styles.rrK}>{r[0]}</Text><Text style={styles.rrV}>{r[1]}</Text></View>
              ))}
            </Card>
            <Button3D title="Enviar remesa" onPress={() => toast('Remesa enviada')} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
function FlowNode({ icon, logo, label }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={styles.flowCc}>{logo ? <Logo size={30} /> : <Ionicons name={icon} size={22} color={C.gold} />}</View>
      <Text style={styles.flowLbl}>{label}</Text>
    </View>
  );
}
function Mcc({ active, onPress, icon, logo, title, sub }) {
  return (
    <Pressable onPress={onPress} style={[styles.mcc, active && { borderColor: C.gold }]}>
      <LinearGradient colors={G.gold} style={styles.mccIc}>{logo ? <Logo size={26} /> : <Ionicons name={icon} size={20} color={C.darkText} />}</LinearGradient>
      <Text style={styles.mccT}>{title}</Text>
      <Text style={styles.mccS}>{sub}</Text>
    </Pressable>
  );
}

// ================= ACTIVIDAD =================
export function Activity({ nav }) {
  const [f, setF] = useState('all');
  const toast = useToast();
  const filters = [['all', 'Todo'], ['in', 'Recibido'], ['out', 'Enviado'], ['swap', 'Swaps'], ['card', 'Tarjeta']];
  const list = f === 'all' ? TXNS : TXNS.filter((x) => x.kind === f);
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Actividad" onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
          {filters.map(([k, l]) => (
            <Pressable key={k} onPress={() => { hap(); setF(k); }} style={[styles.chip, f === k && styles.chipOn]}>
              <Text style={[styles.chipTxt, f === k && { color: C.darkText }]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {list.map((x, i) => (
          <Pressable key={i} onPress={() => { hap(); toast('Detalle: ' + x.t); }} style={styles.txn}>
            <View style={styles.txnIc}><Ionicons name={x.ic} size={19} color={C.gold} /></View>
            <View style={{ flex: 1 }}><Text style={styles.txnT}>{x.t}</Text><Text style={styles.txnD}>{x.d}</Text></View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.txnV, x.pos && { color: C.up }]}>{x.v}</Text>
              <Text style={styles.txnKind}>{x.kind === 'card' ? 'Tarjeta' : x.kind === 'swap' ? 'Swap' : x.pos ? 'Recibido' : 'Enviado'}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ================= NOTIFICACIONES =================
export function Notifications({ nav }) {
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Notificaciones" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        {NOTIFS.map((n, i) => (
          <View key={i} style={[styles.notif, n.u && styles.notifUnread]}>
            <View style={styles.notifIc}><Ionicons name={n.ic} size={19} color={C.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifT}>{n.t}</Text>
              <Text style={styles.notifP}>{n.p}</Text>
              <Text style={styles.notifS}>{n.s}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ================= CRECER (Earn) =================
export function Earn({ nav }) {
  const toast = useToast();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Crecer" sub="Earn & Staking" onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.earnCard}>
          <Text style={styles.earnLbl}>GANANCIAS ACUMULADAS</Text>
          <Text style={styles.earnAmt}>+$142.87</Text>
          <Text style={styles.earnSub}>Rendimiento promedio  <Text style={{ color: C.up }}>8.4% APY</Text></Text>
        </LinearGradient>
        <SectionHead title="Staking ORIGEN" />
        <EarnRow t={TOKENS[0]} name="ORIGEN Staking" sub="Bloqueo flexible" apy="12.5% APY" pos="Stake: 50" onPress={() => toast('Stake ORIGEN')} />
        <SectionHead title="Ahorro estable" />
        <EarnRow t={TOKENS[7]} name="USDC Earn" sub="Sin bloqueo" apy="6.2% APY" pos="$300.00" onPress={() => toast('Earn USDC')} />
        <EarnRow t={TOKENS[6]} name="USDT Earn" sub="Sin bloqueo" apy="5.8% APY" pos="$500.00" onPress={() => toast('Earn USDT')} />
      </ScrollView>
    </View>
  );
}
function EarnRow({ t, name, sub, apy, pos, onPress }) {
  return (
    <Pressable onPress={() => { hap(); onPress(); }} style={styles.earnRow}>
      <TokenIcon t={t} />
      <View style={{ flex: 1, marginLeft: 13 }}><Text style={styles.txnT}>{name}</Text><Text style={styles.txnD}>{sub}</Text></View>
      <View style={{ alignItems: 'flex-end' }}><Text style={{ color: C.up, fontWeight: '700' }}>{apy}</Text><Text style={styles.txnD}>{pos}</Text></View>
    </Pressable>
  );
}

// ================= AJUSTES =================
export function Settings({ nav }) {
  const [bio, setBio] = useState(true);
  const [notif, setNotif] = useState(true);
  const toast = useToast();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Ajustes" onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.prof}>
          <LinearGradient colors={G.gold} style={styles.profAv}><Text style={{ color: C.darkText, fontWeight: '800', fontSize: 19 }}>JE</Text></LinearGradient>
          <View>
            <Text style={styles.profName}>José Enamorado</Text>
            <Text style={styles.profMail}>jose@ordenglobal.com</Text>
            <View style={styles.kycBadge}><Ionicons name="checkmark-circle" size={12} color={C.up} /><Text style={styles.kycTxt}>KYC Verificado</Text></View>
          </View>
        </LinearGradient>

        <Text style={styles.grpTitle}>CUENTA</Text>
        <View style={styles.group}>
          <ListRow first icon="person" title="Información personal" onPress={() => nav.go('profile')} />
          <ListRow icon="card" title="Mi tarjeta débito" onPress={() => nav.go('card')} />
          <ListRow icon="qr-code" title="Conectar MyTokenPay" sub="Pagos con ORIGEN" onPress={() => nav.go('mytokenpay')} />
          <ListRow icon="grid" title="Mis direcciones" onPress={() => toast('Libreta de direcciones')} />
        </View>

        <Text style={styles.grpTitle}>SEGURIDAD</Text>
        <View style={styles.group}>
          <ListRow first icon="finger-print" title="Face ID / Biometría" onPress={() => {}} right={<Toggle value={bio} onValueChange={setBio} />} />
          <ListRow icon="shield-checkmark" title="Autenticación 2FA" sub="Authenticator activo" onPress={() => toast('2FA activo')} />
          <ListRow icon="key" title="Frase de recuperación" sub="Ver tus 12 palabras" onPress={() => nav.go('seedview')} />
          <ListRow icon="notifications" title="Notificaciones" onPress={() => {}} right={<Toggle value={notif} onValueChange={setNotif} />} />
        </View>

        <Text style={styles.grpTitle}>PREFERENCIAS</Text>
        <View style={styles.group}>
          <ListRow first icon="globe" title="Idioma" onPress={() => toast('Español')} right={<Text style={styles.rv}>Español</Text>} />
          <ListRow icon="cash" title="Moneda" onPress={() => toast('USD')} right={<Text style={styles.rv}>USD</Text>} />
          <ListRow icon="help-circle" title="Ayuda y soporte" onPress={() => toast('Soporte: roa.corphn@gmail.com')} />
        </View>

        <Button3D variant="ghost" title="Cerrar sesión" onPress={() => nav.go('auth')} />
        <Text style={styles.foot}>Veta Wallet v1.0 · Orden Global{'\n'}Diseño por Monark Brand Labs</Text>
      </ScrollView>
    </View>
  );
}

// ================= INFORMACIÓN PERSONAL (editable) =================
export function Profile({ nav }) {
  const toast = useToast();
  const v = useRef({ name: 'José Enamorado', email: 'jose@ordenglobal.com', phone: '+504 3346 7760', country: 'Honduras', address: 'Roatán, Islas de la Bahía', dni: '0801-1994-00000' }).current;
  const fields = [
    { k: 'name', label: 'Nombre completo' },
    { k: 'email', label: 'Correo electrónico', keyboardType: 'email-address', autoCapitalize: 'none' },
    { k: 'phone', label: 'Teléfono', keyboardType: 'phone-pad' },
    { k: 'country', label: 'País' },
    { k: 'address', label: 'Dirección' },
    { k: 'dni', label: 'Identidad / DNI' },
  ];
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Información personal" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <LinearGradient colors={G.gold} style={styles.profAvBig}><Text style={{ color: C.darkText, fontWeight: '800', fontSize: 26 }}>JE</Text></LinearGradient>
          <Pressable onPress={() => { hap(); toast('Cambiar foto de perfil'); }}><Text style={{ color: C.gold, fontWeight: '600', marginTop: 10 }}>Cambiar foto</Text></Pressable>
        </View>
        {fields.map((f) => (
          <View key={f.k} style={{ marginBottom: 14 }}>
            <Text style={styles.label}>{f.label}</Text>
            <TextInput defaultValue={v[f.k]} onChangeText={(t) => { v[f.k] = t; }} placeholderTextColor="#6f938f" style={styles.input} keyboardType={f.keyboardType} autoCapitalize={f.autoCapitalize} />
          </View>
        ))}
        <View style={{ height: 8 }} />
        <Button3D title="Guardar cambios" icon="checkmark" onPress={() => { toast('Perfil actualizado'); setTimeout(() => nav.back(), 700); }} />
      </ScrollView>
    </View>
  );
}

// ================= CONECTAR MYTOKENPAY =================
export function MyTokenPay({ nav }) {
  const [connected, setConnected] = useState(false);
  const toast = useToast();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="MyTokenPay" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <LinearGradient colors={G.gold} style={styles.heroIc}><Ionicons name="qr-code" size={24} color={C.darkText} /></LinearGradient>
          <Text style={styles.heroT}>Conecta MyTokenPay</Text>
          <Text style={styles.heroP}>Vincula tu cuenta MyTokenPay para pagar y cobrar con ORIGEN en comercios afiliados a Orden Global, con QR y en segundos.</Text>
          {connected && (
            <View style={styles.connBadge}><Ionicons name="checkmark-circle" size={14} color={C.up} /><Text style={styles.connTxt}>Cuenta vinculada</Text></View>
          )}
        </LinearGradient>

        <View style={styles.group}>
          <PayFeature icon="storefront" t="Paga en comercios" s="Escanea y paga con ORIGEN" first />
          <PayFeature icon="cash" t="Cobra ventas" s="Recibe pagos al instante" />
          <PayFeature icon="shield-checkmark" t="Seguro" s="Autorización con biometría" />
        </View>

        <Button3D title={connected ? 'Desconectar' : 'Conectar MyTokenPay'} variant={connected ? 'ghost' : 'gold'} icon={connected ? 'unlink' : 'link'} onPress={() => { setConnected(!connected); toast(connected ? 'MyTokenPay desconectado' : 'MyTokenPay conectado'); }} />
      </ScrollView>
    </View>
  );
}
function PayFeature({ icon, t, s, first }) {
  return (
    <View style={[styles.payFeat, first && { borderTopWidth: 0 }]}>
      <View style={styles.notifIc}><Ionicons name={icon} size={19} color={C.gold} /></View>
      <View style={{ flex: 1 }}><Text style={{ color: C.txt, fontWeight: '600', fontSize: 14 }}>{t}</Text><Text style={{ color: C.txt3, fontSize: 11.5, marginTop: 2 }}>{s}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  profAvBig: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  connBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(62,217,160,0.14)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 12, alignSelf: 'flex-start' },
  connTxt: { color: C.up, fontSize: 12, fontWeight: '600' },
  payFeat: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },
  hero: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: C.line, marginBottom: 16 },
  heroIc: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroT: { fontSize: 18, fontWeight: '800', color: C.txt },
  heroP: { fontSize: 12.5, color: C.txt2, marginTop: 6, lineHeight: 18 },
  flow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  flowCc: { width: 50, height: 50, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  flowLbl: { fontSize: 10.5, color: C.txt3, fontWeight: '600' },
  seg: { flexDirection: 'row', backgroundColor: C.input, borderRadius: 14, padding: 4, marginBottom: 18 },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  segOn: { backgroundColor: C.gold },
  segTxt: { color: C.txt2, fontWeight: '600', fontSize: 13.5 },
  bigInput: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 14 },
  amtIn: { color: C.txt, fontWeight: '800', fontSize: 40, textAlign: 'center', minWidth: 120, padding: 0 },
  cur: { color: C.gold, fontWeight: '600', fontSize: 14, marginTop: 4 },
  mcc: { flex: 1, backgroundColor: C.panel, borderWidth: 1.5, borderColor: C.line2, borderRadius: 16, padding: 15 },
  mccIc: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  mccT: { fontSize: 14, fontWeight: '700', color: C.txt },
  mccS: { fontSize: 11, color: C.txt3, marginTop: 2 },
  rr: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rrK: { color: C.txt2, fontSize: 12.5 }, rrV: { color: C.txt, fontSize: 12.5, fontWeight: '600' },
  chip: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 15, marginRight: 8, height: 36 },
  chipOn: { backgroundColor: C.gold, borderColor: 'transparent' },
  chipTxt: { color: C.txt2, fontWeight: '600', fontSize: 12.5 },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11 },
  txnIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  txnT: { fontSize: 14, fontWeight: '600', color: C.txt },
  txnD: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  txnV: { fontSize: 14, fontWeight: '600', color: C.txt },
  txnKind: { fontSize: 11, color: C.txt3, marginTop: 2 },
  notif: { flexDirection: 'row', gap: 13, padding: 14, backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 16, marginBottom: 10 },
  notifUnread: { borderColor: C.line, backgroundColor: '#0D3B3D' },
  notifIc: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  notifT: { fontSize: 14, fontWeight: '600', color: C.txt },
  notifP: { fontSize: 12, color: C.txt2, marginTop: 2, lineHeight: 16 },
  notifS: { fontSize: 11, color: C.txt3, marginTop: 4 },
  earnCard: { borderRadius: 24, padding: 22, borderWidth: 1, borderColor: C.line, marginBottom: 4 },
  earnLbl: { fontSize: 11, letterSpacing: 2, color: C.gold, fontWeight: '600', textAlign: 'center' },
  earnAmt: { fontSize: 37, fontWeight: '800', color: C.goldHi, textAlign: 'center', marginVertical: 6 },
  earnSub: { fontSize: 13, color: C.txt2, textAlign: 'center', fontWeight: '600' },
  earnRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 18, padding: 13, marginBottom: 10 },
  prof: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 17, borderWidth: 1, borderColor: C.line, marginBottom: 16 },
  profAv: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  profName: { fontSize: 16.5, fontWeight: '700', color: C.txt },
  profMail: { fontSize: 12, color: C.txt2 },
  kycBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(62,217,160,0.14)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2, marginTop: 5, alignSelf: 'flex-start' },
  kycTxt: { color: C.up, fontSize: 10.5, fontWeight: '600' },
  grpTitle: { fontSize: 11.5, letterSpacing: 1, color: C.txt3, fontWeight: '600', marginBottom: 9, marginLeft: 4, marginTop: 4 },
  group: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  rv: { color: C.gold, fontWeight: '600', fontSize: 13 },
  foot: { textAlign: 'center', color: C.txt3, fontSize: 11, marginTop: 18, lineHeight: 16 },
});
