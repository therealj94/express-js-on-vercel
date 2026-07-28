import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { C, G } from '../theme';
import { Header, Button3D, ListRow, Toggle, useToast, useAccount, hap } from '../ui';
import { money, qtyFmt } from '../data';
import { getPrivateKey } from '../api';
import { updateAccount } from '../accounts';

const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');
const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
};

// ================= ACTIVIDAD (historial real de la blockchain) =================
export function Activity({ nav }) {
  const [f, setF] = useState('all');
  const toast = useToast();
  const { account } = useAccount();
  const txns = account?.transfers || [];
  const filters = [['all', 'Todo'], ['in', 'Recibido'], ['out', 'Enviado']];
  const isIn = (t) => t.type === 'recive' || t.type === 'receive' || t.type === 'in';
  const list = f === 'all' ? txns : txns.filter((t) => (f === 'in' ? isIn(t) : !isIn(t)));
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Actividad" sub="Blockchain Orden Global" onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
          {filters.map(([k, l]) => (
            <Pressable key={k} onPress={() => { hap(); setF(k); }} style={[styles.chip, f === k && styles.chipOn]}>
              <Text style={[styles.chipTxt, f === k && { color: C.darkText }]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {list.length === 0 && (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}><Ionicons name="pulse" size={30} color={C.txt3} /></View>
            <Text style={styles.emptyTitle}>Sin movimientos aún</Text>
            <Text style={styles.emptyBody}>Cuando envíes o recibas tokens, tus transacciones reales aparecerán aquí.</Text>
          </View>
        )}
        {list.map((t, i) => {
          const inbound = isIn(t);
          return (
            <Pressable key={t.hash || i} onPress={() => { hap(); toast(t.hash ? 'Tx ' + t.hash.slice(0, 18) + '…' : 'Transacción'); }} style={styles.txn}>
              <View style={styles.txnIc}><Ionicons name={inbound ? 'arrow-down' : 'arrow-up'} size={19} color={inbound ? C.up : C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnT}>{inbound ? 'Recibido' : 'Enviado'} {t.symbol || 'ORIGEN'}</Text>
                <Text style={styles.txnD}>{fmtDate(t.timeStamp)}</Text>
                <Text style={styles.txnD}>{inbound ? 'De' : 'Para'}: {shortAddr(inbound ? t.from : t.to)}</Text>
              </View>
              <Text style={[styles.txnV, inbound && { color: C.up }]}>{inbound ? '+' : '-'}{qtyFmt(Number(t.value) || 0)}</Text>
            </Pressable>
          );
        })}
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
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}><Ionicons name="notifications" size={30} color={C.txt3} /></View>
          <Text style={styles.emptyTitle}>Todo al día</Text>
          <Text style={styles.emptyBody}>Aquí verás avisos de transacciones recibidas y novedades de tu cuenta.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ================= AJUSTES =================
export function Settings({ nav }) {
  const [notif, setNotif] = useState(true);
  const [priv, setPriv] = useState(false);
  const toast = useToast();
  const { account, logout } = useAccount();
  const acc = account || { name: 'Cuenta', email: '', initials: 'VW', addr: '', genesisUid: null };
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Ajustes" onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.prof}>
          <LinearGradient colors={G.gold} style={styles.profAv}><Text style={{ color: C.darkText, fontWeight: '800', fontSize: 19 }}>{acc.initials}</Text></LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.profName} numberOfLines={1}>{acc.name}</Text>
            <Text style={styles.profMail} numberOfLines={1}>{acc.email}</Text>
            <Text style={styles.profMail} numberOfLines={1}>{shortAddr(acc.addr)}</Text>
          </View>
          {acc.genesisUid ? (
            <View style={styles.kycBadge}><Ionicons name="checkmark-circle" size={12} color={C.up} /><Text style={styles.kycTxt}>Genesis</Text></View>
          ) : null}
        </LinearGradient>

        <Text style={styles.grpTitle}>GENESIS ID</Text>
        <View style={styles.group}>
          {acc.genesisUid ? (
            <>
              <ListRow first icon="finger-print" title="Mi pasaporte Genesis ID" sub={acc.genesisUid} onPress={() => nav.go('passport')} />
              <ListRow icon="refresh" title="Reverificar identidad" sub="Vuelve a pasar la verificación" onPress={() => nav.go('kyc')} />
            </>
          ) : (
            <ListRow first icon="finger-print" title="Vincular con Genesis ID" sub="Identidad del ecosistema · opcional, no se requiere para usar la app" onPress={() => nav.go('kyc')} />
          )}
        </View>

        <Text style={styles.grpTitle}>PRIVACIDAD</Text>
        <View style={styles.group}>
          <ListRow first icon="lock-closed" title="Cuenta privada" sub="Solo cuentas aprobadas te ven" onPress={() => {}} right={<Toggle value={priv} onValueChange={(v) => { setPriv(v); toast(v ? 'Cuenta privada activada' : 'Cuenta pública'); }} />} />
          <ListRow icon="create" title="Configurar perfil" sub="Nombre y datos de contacto" onPress={() => nav.go('profile')} />
          <ListRow icon="person-remove" title="Cuentas bloqueadas" onPress={() => nav.go('blocked')} />
        </View>

        <Text style={styles.grpTitle}>CUENTA</Text>
        <View style={styles.group}>
          <ListRow first icon="card" title="Mi tarjeta" onPress={() => nav.go('card')} />
          <ListRow icon="qr-code" title="Mi dirección (recibir)" sub={shortAddr(acc.addr)} onPress={() => nav.go('receive')} />
          <ListRow icon="storefront" title="MyTokenPay" sub="Pagos en comercios con ORIGEN" onPress={() => nav.go('mytokenpay')} />
        </View>

        <Text style={styles.grpTitle}>SEGURIDAD</Text>
        <View style={styles.group}>
          <ListRow first icon="key" title="Frase de recuperación (Seed)" onPress={() => nav.go('seedview')} />
          <ListRow icon="finger-print" title="Llave privada" onPress={() => nav.go('privatekey')} />
          <ListRow icon="notifications" title="Notificaciones" onPress={() => {}} right={<Toggle value={notif} onValueChange={setNotif} />} />
        </View>

        <View style={{ height: 10 }} />
        <Pressable onPress={() => { hap(); logout(); nav.go('auth'); }} style={styles.logout}>
          <Ionicons name="power" size={18} color="#fff" />
          <Text style={styles.logoutTxt}>Cerrar sesión</Text>
        </Pressable>
        <Text style={styles.foot}>Veta Wallet · Orden Global{'\n'}Conectada a la blockchain Orden Global (8532)</Text>
      </ScrollView>
    </View>
  );
}

// ================= PASAPORTE GENESIS ID =================
export function Passport({ nav }) {
  const { account } = useAccount();
  const toast = useToast();
  const acc = account || { name: 'Cuenta', initials: 'VW', genesisUid: null, since: '' };
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Pasaporte Genesis ID" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        {acc.genesisUid ? (
          <>
            <LinearGradient colors={['#0f5f55', '#0a3a3d', '#06282b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.passCard}>
              <View style={styles.passTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="finger-print" size={18} color={C.gold} />
                  <Text style={styles.passBrand}>GENESIS ID</Text>
                </View>
                <View style={styles.passVerified}><Ionicons name="shield-checkmark" size={12} color={C.up} /><Text style={styles.passVerTxt}>Verificado</Text></View>
              </View>
              <View style={styles.passBody}>
                <LinearGradient colors={G.gold} style={styles.passPhoto}><Text style={{ color: C.darkText, fontWeight: '800', fontSize: 26 }}>{acc.initials}</Text></LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.passLabel}>Titular</Text>
                  <Text style={styles.passName} numberOfLines={1}>{acc.name}</Text>
                  <Text style={styles.passLabel2}>UID Genesis</Text>
                  <Text style={styles.passUid}>{acc.genesisUid}</Text>
                </View>
              </View>
              <View style={styles.passFoot}>
                <View><Text style={styles.passLabel}>Tipo</Text><Text style={styles.passMeta}>Identidad personal</Text></View>
                <View><Text style={styles.passLabel}>Emitido</Text><Text style={styles.passMeta}>{acc.since || '2026'}</Text></View>
                <View><Text style={styles.passLabel}>Ecosistema</Text><Text style={styles.passMeta}>Orden Global</Text></View>
              </View>
            </LinearGradient>
            <Text style={styles.passNote}>Credencial válida en Veta Wallet, MyTokenPay y todas las apps de Orden Global.</Text>
            <Button3D variant="ghost" title="Compartir credencial" icon="share-social" onPress={() => { hap(); toast('Compartiendo credencial…'); }} />
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}><Ionicons name="finger-print" size={30} color={C.gold} /></View>
            <Text style={styles.emptyTitle}>Aún no vinculas tu Genesis ID</Text>
            <Text style={styles.emptyBody}>Verifícate una sola vez y tu identidad queda válida en todo el ecosistema Orden Global. No es obligatorio para usar la billetera.</Text>
            <Button3D title="Vincular ahora" icon="finger-print" onPress={() => nav.go('kyc')} style={{ alignSelf: 'stretch', marginTop: 18 }} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ================= PERFIL (datos reales de la cuenta) =================
export function Profile({ nav }) {
  const toast = useToast();
  const { account, login } = useAccount();
  const acc = account || { name: '', email: '', phone: '', country: '', address2: '' };
  const [name, setName] = useState(acc.name || '');
  const [phone, setPhone] = useState(acc.phone || '');
  const [country, setCountry] = useState(acc.country || '');
  const [addr2, setAddr2] = useState(acc.address2 || '');

  async function save() {
    if (!account) return;
    const updated = await updateAccount(account.email, { name: name.trim() || account.name, phone, country, address2: addr2 });
    if (updated) { login(updated); toast('Perfil actualizado'); setTimeout(() => nav.back(), 600); }
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Configurar perfil" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <LinearGradient colors={G.gold} style={styles.profAvBig}><Text style={{ color: C.darkText, fontWeight: '800', fontSize: 26 }}>{acc.initials || 'VW'}</Text></LinearGradient>
        </View>
        <Field label="Nombre completo" value={name} onChangeText={setName} placeholder="Tu nombre" />
        <Field label="Correo (cuenta)" value={acc.email} editable={false} />
        <Field label="Dirección de billetera" value={acc.addr || ''} editable={false} />
        <Field label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+504 …" />
        <Field label="País" value={country} onChangeText={setCountry} placeholder="Tu país" />
        <Field label="Dirección" value={addr2} onChangeText={setAddr2} placeholder="Ciudad, calle…" />
        <View style={{ height: 8 }} />
        <Button3D title="Guardar cambios" icon="checkmark" onPress={save} />
      </ScrollView>
    </View>
  );
}

function Field({ label, editable = true, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#6f938f" editable={editable} style={[styles.input, !editable && { opacity: 0.6 }]} {...props} />
    </View>
  );
}

// ================= MYTOKENPAY =================
export function MyTokenPay({ nav }) {
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="MyTokenPay" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <LinearGradient colors={G.green} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <LinearGradient colors={G.gold} style={styles.heroIc}><Ionicons name="qr-code" size={24} color={C.darkText} /></LinearGradient>
          <Text style={styles.heroT}>Paga con ORIGEN en comercios</Text>
          <Text style={styles.heroP}>MyTokenPay es la app de pagos del ecosistema Orden Global: cobra y paga con ORIGEN mediante QR. Usa el mismo correo de tu Veta Wallet.</Text>
        </LinearGradient>
        <View style={styles.group}>
          <PayFeature icon="storefront" t="Paga en comercios" s="Escanea el QR del negocio y paga con ORIGEN" first />
          <PayFeature icon="cash" t="Cobra ventas" s="Los comercios reciben pagos al instante" />
          <PayFeature icon="finger-print" t="Mismo ecosistema" s="Tu cuenta y tu Genesis ID valen en ambas apps" />
        </View>
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

// ================= CUENTAS BLOQUEADAS =================
export function Blocked({ nav }) {
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Cuentas bloqueadas" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}><Ionicons name="person-remove" size={30} color={C.txt3} /></View>
          <Text style={styles.emptyTitle}>Sin cuentas bloqueadas</Text>
          <Text style={styles.emptyBody}>Cuando bloquees a alguien aparecerá aquí. No podrá verte ni enviarte solicitudes.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ================= LLAVE PRIVADA =================
export function PrivateKey({ nav }) {
  const [state, setState] = useState('hidden'); // hidden | loading | shown | unavailable
  const [pk, setPk] = useState(null);
  const { account } = useAccount();
  const toast = useToast();
  const acc = account || { addr: '' };

  async function reveal() {
    hap();
    setState('loading');
    const key = await getPrivateKey();
    if (key) { setPk(key); setState('shown'); }
    else setState('unavailable');
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title="Llave privada" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={styles.warnBox}>
          <Ionicons name="warning" size={22} color="#E05A5A" />
          <Text style={styles.warnTxt}>Nunca compartas tu llave privada ni tu frase semilla. Quien las tenga controla tus fondos.</Text>
        </View>

        <Text style={styles.label}>Dirección pública</Text>
        <View style={styles.pkBox}>
          <Text style={styles.pkTxt} numberOfLines={1}>{acc.addr || '—'}</Text>
          <Pressable onPress={async () => { hap(); try { await Clipboard.setStringAsync(acc.addr || ''); toast('Dirección copiada'); } catch (e) {} }}>
            <Ionicons name="copy" size={20} color={C.gold} />
          </Pressable>
        </View>

        <Text style={[styles.label, { marginTop: 18 }]}>Llave privada</Text>
        <View style={styles.pkReveal}>
          {state === 'shown' ? (
            <Text style={{ color: C.txt, fontSize: 13, lineHeight: 20 }} selectable>{pk}</Text>
          ) : state === 'unavailable' ? (
            <Text style={{ color: C.txt2, fontSize: 13, lineHeight: 20 }}>
              Tu llave está custodiada por Orden Global y por seguridad no se puede exportar desde la app todavía. Puedes verla en la billetera web (vetawallet.com → Settings → Private Key).
            </Text>
          ) : (
            <Text style={{ color: C.txt3, fontSize: 13 }}>{state === 'loading' ? 'Consultando de forma segura…' : '•••• •••• •••• •••• •••• •••• •••• ••••'}</Text>
          )}
        </View>
        {state !== 'shown' && (
          <Button3D title={state === 'loading' ? 'Consultando…' : 'Revelar llave'} icon="eye" onPress={state === 'loading' ? () => {} : reveal} style={{ marginTop: 14 }} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },

  chip: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 10 },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipTxt: { color: C.txt2, fontWeight: '600', fontSize: 12.5 },

  txn: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 13, marginBottom: 9 },
  txnIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  txnT: { fontSize: 14, fontWeight: '600', color: C.txt },
  txnD: { fontSize: 11.5, color: C.txt3, marginTop: 2 },
  txnV: { fontSize: 14, fontWeight: '700', color: C.txt },

  emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: 10 },
  emptyIcon: { width: 78, height: 78, borderRadius: 39, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  emptyTitle: { color: C.txt, fontWeight: '700', fontSize: 16, marginTop: 16 },
  emptyBody: { color: C.txt3, fontSize: 12.5, marginTop: 6, textAlign: 'center', lineHeight: 18 },

  prof: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line, marginBottom: 8 },
  profAv: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  profAvBig: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  profName: { fontSize: 16.5, fontWeight: '700', color: C.txt },
  profMail: { fontSize: 12, color: C.txt2, marginTop: 2 },
  kycBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(62,217,160,0.13)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  kycTxt: { color: C.up, fontSize: 11, fontWeight: '700' },

  grpTitle: { fontSize: 11, letterSpacing: 2, color: C.txt3, fontWeight: '700', marginTop: 20, marginBottom: 9, paddingHorizontal: 2 },
  group: { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 18, overflow: 'hidden' },

  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#8E1F2F', borderRadius: 16, paddingVertical: 15, marginTop: 8 },
  logoutTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  foot: { textAlign: 'center', color: C.txt3, fontSize: 11, lineHeight: 16, marginTop: 18 },

  passCard: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: 'rgba(62,217,160,0.25)' },
  passTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  passBrand: { color: C.txt, fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  passVerified: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(62,217,160,0.13)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  passVerTxt: { color: C.up, fontSize: 10.5, fontWeight: '700' },
  passBody: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  passPhoto: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  passLabel: { color: C.txt3, fontSize: 9.5, letterSpacing: 1.4 },
  passLabel2: { color: C.txt3, fontSize: 9.5, letterSpacing: 1.4, marginTop: 8 },
  passName: { color: C.txt, fontWeight: '700', fontSize: 16.5, marginTop: 2 },
  passUid: { color: C.gold, fontWeight: '800', fontSize: 15, letterSpacing: 1, marginTop: 2 },
  passFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  passMeta: { color: C.txt, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  passNote: { color: C.txt3, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginVertical: 14 },

  hero: { borderRadius: 22, padding: 20, borderWidth: 1, borderColor: C.line, marginBottom: 16, alignItems: 'center' },
  heroIc: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroT: { fontSize: 17, fontWeight: '800', color: C.txt, textAlign: 'center' },
  heroP: { fontSize: 12.5, color: C.txt2, textAlign: 'center', lineHeight: 18, marginTop: 6 },
  payFeat: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  notifIc: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },

  warnBox: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(224,90,90,0.12)', borderWidth: 1, borderColor: 'rgba(224,90,90,0.4)', borderRadius: 16, padding: 15, marginBottom: 18 },
  warnTxt: { flex: 1, color: '#f3c9c9', fontSize: 12.5, lineHeight: 18 },
  pkBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 14, padding: 15 },
  pkTxt: { flex: 1, color: C.txt, fontSize: 13 },
  pkReveal: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 14, padding: 16, minHeight: 64 },
});
