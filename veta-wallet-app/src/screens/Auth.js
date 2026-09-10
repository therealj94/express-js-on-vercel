import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Icon } from '../icons';
import { C } from '../theme';
import { Logo, Button3D, hap, useAccount, useToast, AppBackground } from '../ui';
import { upsertApiAccount, saveSession } from '../accounts';
import { apiLogin, apiRegister, apiPortfolio, saveCreds, clearCreds, apiSocialLogin } from '../api';
import { useGoogle, idTokenDeGoogle, entrarConApple, googleDisponible, appleDisponible } from '../social';
import { recordLogin } from '../sessionLog';
import { versionLabel } from '../version';
import { useT } from '../i18n';
import { seenOnboarding } from './Onboarding';

// Fuerza de contraseña sin depender de zxcvbn (agregaría un paquete pesado
// para muy poco). Puntúa por longitud, mezcla de tipos y ausencia de patrones
// triviales. Devuelve { score: 0..4, label, color }.
function passwordStrength(pw, t) {
  const s = String(pw || '');
  if (!s) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (s.length >= 8) score++;
  if (s.length >= 12) score++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
  if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) score++;
  // Restas por patrones comunes / repeticiones evidentes.
  if (/^(?:password|123456|qwerty|abc123|origen|veta)$/i.test(s)) score = 0;
  if (/^(.)\1+$/.test(s)) score = 0;
  const clamp = Math.max(0, Math.min(4, score));
  const key = ['weakEmpty', 'weak', 'ok', 'good', 'strong'][clamp];
  const colors = ['#5A6A66', '#E27060', '#E1B354', '#8FCFA3', '#3ED9A0'];
  return { score: clamp, label: t(`auth.pw.${key}`), color: colors[clamp] };
}

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

  // ---- entrar con Google / Apple -------------------------------------
  const [social, setSocial] = useState(null);      // 'google' | 'apple' | null
  const [hayApple, setHayApple] = useState(false);
  const google = useGoogle();

  useEffect(() => { appleDisponible().then(setHayApple); }, []);

  // Termina el ingreso con el token que devolvió el proveedor. Se comparte
  // entre Google y Apple porque desde aquí para adelante son idénticos.
  async function terminarSocial(proveedor, idToken) {
    if (!idToken) { setSocial(null); return; }
    setErr(null);
    try {
      const r = await apiSocialLogin(proveedor, idToken);
      const acc = await upsertApiAccount(r);
      try { await apiPortfolio(acc); } catch (e) {}
      await saveSession(acc);
      await recordLogin(acc);
      await clearCreds();
      setAccount(acc);
      toast(r.creada ? t('auth.welcomeNew') : t('auth.welcome'));
      nav(seenOnboarding() ? 'home' : 'onboarding');
    } catch (e) {
      // Un fallo aquí casi siempre es de configuración (el identificador de
      // cliente no coincide con el que espera el servidor), y eso no lo puede
      // resolver quien está intentando entrar: se le ofrece el correo.
      setErr(e?.status === 401 ? t('auth.errSocial') : (e?.message || t('auth.errGeneric')));
    } finally { setSocial(null); }
  }

  // Google devuelve por un camino distinto: la respuesta llega después.
  useEffect(() => {
    const tk = idTokenDeGoogle(google.response);
    if (tk) terminarSocial('google', tk);
    else if (google.response && google.response.type !== 'success') setSocial(null);
  }, [google.response]);

  async function conGoogle() {
    setSocial('google'); setErr(null);
    try { await google.promptAsync(); }
    catch (e) { setSocial(null); setErr(t('auth.errSocial')); }
  }

  async function conApple() {
    setSocial('apple'); setErr(null);
    try {
      const r = await entrarConApple();
      if (!r) { setSocial(null); return; }   // canceló: no es un error
      await terminarSocial('apple', r.idToken);
    } catch (e) { setSocial(null); setErr(e?.message || t('auth.errSocial')); }
  }

  async function enter(kind) {
    // No forzamos minúsculas: algunos backends (el nuestro entre ellos)
    // guardan el correo respetando la caja original. apiLogin ya reintenta
    // con la versión minúscula si el primer intento da 401, así que
    // cubrimos ambos casos sin depender de la caja tipeada.
    const mail = email.trim();
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
      await recordLogin(acc.email);
      setAccount(acc);
      // Primera vez en el teléfono: tour de 3 pantallas antes de entrar.
      // Después, cuenta nueva → oferta Genesis ID; sesión ya conocida → home.
      const done = await seenOnboarding();
      if (!done) nav.go('onboarding');
      else nav.go(kind === 'register' ? 'genesisOffer' : 'home');
      toast(`${t('auth.welcome')}, ${acc.name.split(' ')[0]}`);
    } catch (e) {
      // Prioridad: casos conocidos con mensaje amigable. Si no coinciden,
      // mostramos el mensaje del servidor (útil para diagnosticar cuando
      // el back devuelve algo específico como "wrong email or password").
      const raw = e?.message || '';
      const msg = e?.code === 'no-register' ? t('auth.errNoSignup')
        : e?.status === 404 && !/wrong|invalid|incorrect|credential|password|correo/i.test(raw) ? t('auth.err404')
        : e?.status === 409 || /exist|registrad|duplicate|ya\s*existe/i.test(raw) ? t('auth.errExists')
        : e?.status === 401 || e?.status === 403 || /wrong|invalid|incorrect|credential|password|contraseñ|correo/i.test(raw) ? t('auth.errBadCreds')
        : e?.message === 'API no configurada' ? t('auth.errServer')
        : e?.code === 'red' || e?.code === 'timeout' ? t('auth.errNet')
        : (raw || t('auth.errGeneric'));
      setErr(msg);
    } finally { setBusy(false); }
  }

  return (
    <AppBackground intensity="hero">
      {/* Sin esto, al escribir la contraseña el teclado tapaba el campo y el
          botón de entrar, y no había forma de ver lo que se estaba tecleando. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
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
            <Input label={t('auth.email')} placeholder={t('auth.emailPh')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.label}>{t('auth.password')}</Text>
              <View>
                <TextInput placeholderTextColor="#6f938f" secureTextEntry={!showPw} value={pw} onChangeText={setPw} placeholder="••••••••" autoCapitalize="none" style={[styles.input, { paddingRight: 44 }]} />
                <Pressable onPress={() => setShowPw(!showPw)} style={styles.eye}>
                  <Icon name={showPw ? 'eye-off' : 'eye'} size={20} color={C.txt2} />
                </Pressable>
              </View>
              {!login && pw.length > 0 && (() => {
                const s = passwordStrength(pw, t);
                return (
                  <View style={{ marginTop: 8 }}>
                    <View style={styles.meter}>
                      {[0, 1, 2, 3].map((i) => (
                        <View
                          key={i}
                          style={[
                            styles.meterSeg,
                            { backgroundColor: i < s.score ? s.color : 'rgba(255,255,255,0.08)' },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[styles.meterLbl, { color: s.color }]}>{s.label}</Text>
                  </View>
                );
              })()}
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

            {(googleDisponible() || hayApple) && (
              <>
                <View style={styles.sepWrap}>
                  <View style={styles.sepLine} />
                  <Text style={styles.sepTxt}>{t('auth.or')}</Text>
                  <View style={styles.sepLine} />
                </View>

                {googleDisponible() && (
                  <Pressable
                    onPress={() => { if (!social && !busy) { hap(); conGoogle(); } }}
                    disabled={!!social || busy || !google.listo}
                    style={({ pressed }) => [styles.social, styles.socialGoogle, (pressed || social === 'google') && styles.socialOn]}
                  >
                    {social === 'google'
                      ? <ActivityIndicator color="#1f1f1f" />
                      : <><GoogleG /><Text style={styles.socialTxtG}>{t('auth.withGoogle')}</Text></>}
                  </Pressable>
                )}

                {hayApple && (
                  <Pressable
                    onPress={() => { if (!social && !busy) { hap(); conApple(); } }}
                    disabled={!!social || busy}
                    style={({ pressed }) => [styles.social, styles.socialApple, (pressed || social === 'apple') && styles.socialOn]}
                  >
                    {social === 'apple'
                      ? <ActivityIndicator color="#fff" />
                      : <><Icon name="logo-apple" size={19} color="#fff" /><Text style={styles.socialTxtA}>{t('auth.withApple')}</Text></>}
                  </Pressable>
                )}
              </>
            )}
          </View>
        </BlurView>
        <Text style={styles.foot}>{t('auth.foot')}</Text>
        <Text style={styles.ver}>{versionLabel()}</Text>
      </ScrollView>
      </KeyboardAvoidingView>
    </AppBackground>
  );
}

// La G de Google en sus cuatro colores. Se dibuja con vistas para no cargar
// una imagen: las normas de marca exigen estos colores exactos y este trazo.
function GoogleG() {
  return (
    <View style={styles.gWrap}>
      <Text style={styles.gTxt}>
        <Text style={{ color: '#4285F4' }}>G</Text>
      </Text>
    </View>
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
  // --- entrar con Google / Apple ---
  sepWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 14 },
  sepLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  sepTxt: { color: '#6f938f', fontSize: 12, marginHorizontal: 12, letterSpacing: 0.6 },
  social: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 50, borderRadius: 12, marginBottom: 10, gap: 10,
  },
  socialOn: { opacity: 0.75 },
  // Blanco con borde: es como Google pide que se vea su botón.
  socialGoogle: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DADCE0' },
  socialApple: { backgroundColor: '#000000' },
  socialTxtG: { color: '#1F1F1F', fontSize: 15.5, fontWeight: '600' },
  socialTxtA: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '600' },
  gWrap: { width: 20, alignItems: 'center' },
  gTxt: { fontSize: 19, fontWeight: '700' },

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
  meter: { flexDirection: 'row', gap: 5, marginTop: 2 },
  meterSeg: { flex: 1, height: 4, borderRadius: 2 },
  meterLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 6 },
  forgot: { color: 'rgba(243,236,217,0.65)', fontSize: 12, textAlign: 'center', marginTop: 16 },
  terms: { color: C.txt2, fontSize: 12, marginVertical: 12, lineHeight: 17 },
  foot: { color: 'rgba(243,236,217,0.7)', fontSize: 12, textAlign: 'center', marginTop: 18 },
  ver: { color: 'rgba(243,236,217,0.45)', fontSize: 10.5, textAlign: 'center', marginTop: 6 },
});
