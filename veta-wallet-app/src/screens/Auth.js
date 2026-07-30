import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Icon } from '../icons';
import { C } from '../theme';
import { Logo, Button3D, hap, useAccount, useToast, AppBackground } from '../ui';
import { upsertApiAccount, saveSession } from '../accounts';
import { apiLogin, apiRegister, apiPortfolio, saveCreds, clearCreds } from '../api';
import { versionLabel } from '../version';
import { useT } from '../i18n';

export default function Auth({ nav }) {
  const [tab, setTab] = useState('login');
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [regName, setRegName] = useState('');
  // Apagado por defecto: guardar la contraseña, aunque sea en el llavero
  // seguro del sistema, es una decisión del usuario, no del producto.
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { login: setAccount } = useAccount();
  const toast = useToast();
  const t = useT();
  const login = tab === 'login';

  async function enter(kind) {
    const mail = email.trim().toLowerCase();
    if (!mail.includes('@')) { setErr(t('auth.errEmail')); return; }
    if (!pw || pw.length < 4) { setErr(t('auth.errPw')); return; }
    if (kind === 'register' && !regName.trim()) { setErr(t('auth.errName')); return; }
    setBusy(true); setErr(null);
    try {
      const { user, address } = kind === 'register'
        ? await apiRegister({ name: regName.trim(), email: mail, password: pw })
        : await apiLogin(mail, pw);
      if (kind === 'register') user.name = regName.trim();

      // Sin dirección de billetera no es una cuenta usable: el backend no la
      // creó en la blockchain. Se avisa aquí en vez de seguir y toparse con
      // errores más adelante cuando el usuario intente recibir o enviar.
      if (kind === 'register' && !address) {
        setErr(t('auth.errNoWallet'));
        setBusy(false);
        return;
      }

      if (remember) await saveCreds(mail, pw); else await clearCreds();

      // Portafolio real (saldos on-chain + historial). Si falla, entra igual
      // con lo cacheado y se refresca en Inicio.
      let portfolio = { balances: [], transfers: [] };
      try { portfolio = await apiPortfolio(); } catch (e) {}

      const acc = await upsertApiAccount(user, address, portfolio);
      await saveSession(acc.email);
      setAccount(acc);
      // Cuenta nueva: ofrece emparejar Genesis ID de una vez (opcional).
      nav.go(kind === 'register' ? 'genesisOffer' : 'home');
      toast(`${t('auth.welcome')}, ${acc.name.split(' ')[0]}`);
    } catch (e) {
      const msg = e?.code === 'no-register' ? t('auth.errNoSignup')
        : e?.status === 404 ? t('auth.err404')
        : e?.status === 409 || /exist|registrad|duplicate|ya\s*existe/i.test(e?.message || '') ? t('auth.errExists')
        : e?.message === 'API no configurada' ? t('auth.errServer')
        : (e?.message || t('auth.errGeneric'));
      setErr(msg);
    } finally { setBusy(false); }
  }

  return (
    <AppBackground intensity="hero">
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Logo size={92} />
          <Text style={styles.brand}>veta <Text style={styles.italic}>wallet</Text></Text>
          <Text style={styles.tag}>ORDEN GLOBAL</Text>
        </View>

        <BlurView intensity={55} tint="dark" style={styles.glass}>
          <View style={styles.glassInner}>
            <View style={styles.seg}>
              {['login', 'register'].map((k) => (
                <Pressable key={k} onPress={() => { hap(); setTab(k); setErr(null); }} style={[styles.segBtn, tab === k && styles.segOn]}>
                  <Text style={[styles.segTxt, tab === k && styles.segTxtOn]}>{k === 'login' ? t('auth.login') : t('auth.register')}</Text>
                </Pressable>
              ))}
            </View>

            {!login && <Input label={t('auth.name')} placeholder={t('auth.namePh')} value={regName} onChangeText={setRegName} />}
            <Input label={t('auth.email')} placeholder="tu@correo.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.label}>{t('auth.password')}</Text>
              <View>
                <TextInput placeholderTextColor="#6f938f" secureTextEntry={!showPw} value={pw} onChangeText={setPw} placeholder="••••••••" autoCapitalize="none" style={[styles.input, { paddingRight: 44 }]} />
                <Pressable onPress={() => setShowPw(!showPw)} style={styles.eye}>
                  <Icon name={showPw ? 'eye-off' : 'eye'} size={20} color={C.txt2} />
                </Pressable>
              </View>
            </View>

            <Pressable onPress={() => { hap(); setRemember(!remember); }} style={styles.rememberRow}>
              <View style={[styles.checkbox, remember && { backgroundColor: C.gold, borderColor: C.gold }]}>
                {remember && <Icon name="checkmark" size={13} color={C.darkText} />}
              </View>
              <Text style={styles.rememberTxt}>{t('auth.remember')}</Text>
            </Pressable>

            {err && <Text style={styles.err}>{err}</Text>}

            {!login && <Text style={styles.terms}>{t('auth.terms')}</Text>}

            <Button3D
              title={busy ? (login ? t('auth.entering') : t('auth.creating')) : (login ? t('auth.enter') : t('auth.create'))}
              onPress={busy ? () => {} : () => enter(login ? 'login' : 'register')}
              style={{ marginTop: 8 }}
            />
            {busy && <ActivityIndicator color={C.gold} style={{ marginTop: 14 }} />}

            {login && <Text style={styles.forgot}>{t('auth.forgot')}</Text>}
          </View>
        </BlurView>
        <Text style={styles.foot}>{t('auth.foot')}</Text>
        <Text style={styles.ver}>{versionLabel()}</Text>
      </ScrollView>
    </AppBackground>
  );
}

function Input({ label, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#6f938f" style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 22, paddingTop: 80 },
  brand: { fontSize: 26, fontWeight: '800', color: '#EAD79C', letterSpacing: 1, marginTop: 6 },
  italic: { fontWeight: '300', fontStyle: 'italic', color: '#C9A961' },
  tag: { color: 'rgba(243,236,217,0.7)', fontSize: 11, letterSpacing: 4, marginTop: 4 },
  glass: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,169,97,0.45)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  glassInner: { padding: 22, backgroundColor: 'rgba(5,38,40,0.74)' },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(6,34,35,0.6)', borderRadius: 14, padding: 4, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(46,116,119,0.4)' },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  segOn: { backgroundColor: C.gold },
  segTxt: { color: C.txt2, fontWeight: '600', fontSize: 13.5 },
  segTxtOn: { color: C.darkText },
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: { backgroundColor: 'rgba(8,44,46,0.85)', borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },
  eye: { position: 'absolute', right: 12, top: 12, padding: 2 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12, marginBottom: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(201,169,97,0.5)', alignItems: 'center', justifyContent: 'center' },
  rememberTxt: { color: C.txt2, fontSize: 12.5 },
  err: { color: '#F0776B', fontSize: 12.5, marginTop: 8 },
  forgot: { color: 'rgba(243,236,217,0.65)', fontSize: 12, textAlign: 'center', marginTop: 16 },
  terms: { color: C.txt2, fontSize: 12, marginVertical: 12, lineHeight: 17 },
  foot: { color: 'rgba(243,236,217,0.7)', fontSize: 12, textAlign: 'center', marginTop: 18 },
  ver: { color: 'rgba(243,236,217,0.45)', fontSize: 10.5, textAlign: 'center', marginTop: 6 },
});
