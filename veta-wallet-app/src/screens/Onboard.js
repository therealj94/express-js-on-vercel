import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { Header, Button3D, Card, hap, useToast, useAccount } from '../ui';
import { genesis } from '../genesis';
import { setGenesisUid } from '../accounts';
import { getSeed } from '../api';
import { useT } from '../i18n';

const { width: SCREEN_W } = Dimensions.get('window');
const SCAN_SECONDS = 30;
const GENESIS_KEY = 'genesis-id-flow-veta';

// Genesis ID — identidad digital única de Orden Global.
// El progreso se guarda: si el usuario deja su correo y sale,
// al volver continúa exactamente donde quedó.

const DOC_W = Math.min(SCREEN_W - 44, 380);
const DOC_H = Math.round(DOC_W / 1.586);
const FACE_W = Math.min(Math.round(SCREEN_W * 0.88), 380); // marco facial grande
const FACE_H = Math.round(FACE_W * 1.24);

async function loadGenesis() {
  try {
    const raw = await AsyncStorage.getItem(GENESIS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
async function saveGenesis(state) {
  try {
    await AsyncStorage.setItem(GENESIS_KEY, JSON.stringify(state));
  } catch (e) {}
}

// ---------------- GENESIS ID (KYC del ecosistema) ----------------
export function Kyc({ nav, params }) {
  const toast = useToast();
  const t = useT();
  const { account, login: loginAccount } = useAccount();
  // Vinculación opcional: se entra desde Ajustes con la sesión ya iniciada.
  const doneDest = account ? 'passport' : 'auth';
  const backDest = account ? 'settings' : 'auth';
  const [step, setStep] = useState('loading'); // loading|email|doc-front|doc-back|face|processing|review24|done
  const [email, setEmail] = useState(account ? account.email : '');
  const [uid, setUid] = useState(null);
  const [resumed, setResumed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SCAN_SECONDS);
  const [redirectIn, setRedirectIn] = useState(6);

  // cargar progreso guardado
  useEffect(() => {
    loadGenesis().then((saved) => {
      if (saved && saved.step && saved.step !== 'loading') {
        setEmail(saved.email || '');
        setUid(saved.uid || null);
        setStep(saved.step);
        if (saved.step !== 'email' && saved.step !== 'done') setResumed(true);
      } else {
        setStep('email');
      }
    });
  }, []);

  const persist = (next, extra = {}) => {
    setStep(next);
    saveGenesis({ step: next, email, uid, ...extra });
  };

  // animaciones: línea de escaneo + pulso de marco
  const scanY = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l1 = Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanY, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const l2 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: false }),
      ]),
    );
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, []);

  // temporizador 30 s por escaneo → revisión 24 h si expira
  const isScan = step === 'doc-front' || step === 'doc-back' || step === 'face';
  useEffect(() => {
    if (!isScan) return;
    setSecondsLeft(SCAN_SECONDS);
    const iv = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(iv);
          persist('review24');
          toast(t('gen.review24Toast'));
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // procesamiento → verificado
  useEffect(() => {
    if (step !== 'processing') return;
    const timer = setTimeout(async () => {
      // Procesa en el motor Genesis real (backend en la nube): emite el UID
      // oficial y deja EMPAREJADA la Veta Wallet (nombre + address en el admin).
      const rec = await genesis.process(email, {
        fullName: account ? account.name : undefined,
        walletAddress: account ? account.addr : undefined,
      });
      const newUid = (rec && rec.genesisUid) || ('GEN-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000));
      setUid(newUid);
      // Vincula el Genesis ID a la cuenta Veta Wallet actual.
      if (account) {
        const updated = await setGenesisUid(account.email, newUid);
        if (updated) loginAccount(updated);
      }
      saveGenesis({ step: 'done', email, uid: newUid, verifiedAt: new Date().toISOString() });
      setStep('done');
      hap();
    }, 2600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // regreso automático al terminar
  useEffect(() => {
    if (step !== 'done') return;
    setRedirectIn(6);
    const iv = setInterval(() => {
      setRedirectIn((s) => {
        if (s <= 1) { clearInterval(iv); nav.go(doneDest); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const scanDoc = scanY.interpolate({ inputRange: [0, 1], outputRange: [8, DOC_H - 16] });
  const scanFace = scanY.interpolate({ inputRange: [0, 1], outputRange: [8, FACE_H - 16] });
  const frameBorder = pulse.interpolate({ inputRange: [0, 1], outputRange: ['rgba(201,169,97,0.45)', 'rgba(201,169,97,1)'] });

  if (step === 'loading') return <View style={{ flex: 1 }} />;

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header
        title={t('gen.title')}
        sub={t('gen.sub')}
        onBack={() => nav.go(backDest)}
      />

      {/* progreso */}
      <View style={st.steps}>
        {[t('gen.steps.mail'), t('gen.steps.doc'), t('gen.steps.face'), t('gen.steps.done')].map((l, i) => {
          const idx = step === 'email' ? 0 : step === 'doc-front' || step === 'doc-back' || step === 'review24' ? 1 : step === 'face' ? 2 : 3;
          const on = i <= idx;
          return (
            <View key={l} style={st.stepItem}>
              <View style={[st.stepDot, on && { backgroundColor: C.gold }]} />
              <Text style={[st.stepLbl, on && { color: C.txt }]}>{l}</Text>
            </View>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {resumed && step !== 'done' && step !== 'review24' && (
          <View style={st.resume}>
            <Ionicons name="refresh" size={15} color={C.gold} />
            <Text style={st.resumeTxt}>{t('gen.resume')}{email ? ` (${email})` : ''}. {t('gen.resume2')}</Text>
          </View>
        )}

        {step === 'email' && (
          <>
            <View style={st.heroIcon}><Ionicons name="mail" size={28} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.h1')}</Text>
            <Text style={st.body}>{t('gen.body')}</Text>
            <Text style={st.label}>{t('auth.email')}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              placeholderTextColor="#6f938f"
              autoCapitalize="none"
              keyboardType="email-address"
              style={st.input}
            />
            <Button3D
              title={t('gen.start')}
              icon="shield-checkmark"
              disabled={!email.includes('@')}
              onPress={() => {
                genesis.start(email, account ? account.name : undefined, account ? account.addr : undefined);
                saveGenesis({ step: 'doc-front', email, uid });
                setStep('doc-front');
              }}
              style={{ marginTop: 18 }}
            />
          </>
        )}

        {(step === 'doc-front' || step === 'doc-back') && (
          <>
            <Text style={st.h1}>{step === 'doc-front' ? t('gen.docFront') : t('gen.docBack')}</Text>
            <Text style={st.body}>{t('gen.docBody', { n: SCAN_SECONDS })}</Text>
            <View style={{ alignItems: 'center', marginVertical: 14 }}>
              <Animated.View style={[st.docFrame, { borderColor: frameBorder }]}>
                <View style={st.frameInner}>
                  <Ionicons name="card" size={54} color={C.txt3} />
                  <Text style={st.sideLbl}>{step === 'doc-front' ? 'FRENTE' : 'REVERSO'}</Text>
                </View>
                <Animated.View style={[st.scanLine, { transform: [{ translateY: scanDoc }] }]} />
              </Animated.View>
            </View>
            <TimerBar secondsLeft={secondsLeft} />
            <Button3D
              title={step === 'doc-front' ? t('gen.capFront') : t('gen.capBack')}
              icon="camera"
              onPress={() => { hap(); persist(step === 'doc-front' ? 'doc-back' : 'face'); }}
              style={{ marginTop: 16 }}
            />
          </>
        )}

        {step === 'face' && (
          <>
            <Text style={st.h1}>{t('gen.faceT')}</Text>
            <Text style={st.body}>{t('gen.faceP')}</Text>
            <View style={{ alignItems: 'center', marginVertical: 14 }}>
              <Animated.View style={[st.faceFrame, { borderColor: frameBorder }]}>
                <View style={st.frameInner}>
                  <Ionicons name="person" size={100} color={C.txt3} />
                </View>
                <Animated.View style={[st.scanLine, { transform: [{ translateY: scanFace }] }]} />
              </Animated.View>
            </View>
            <TimerBar secondsLeft={secondsLeft} />
            <Button3D title={t('gen.capFace')} icon="scan" onPress={() => { hap(); persist('processing'); }} style={{ marginTop: 16 }} />
          </>
        )}

        {step === 'processing' && (
          <View style={st.center}>
            <Spinner />
            <Text style={[st.h1, { textAlign: 'center', marginTop: 22 }]}>{t('gen.processing')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.processingSub')}</Text>
          </View>
        )}

        {step === 'review24' && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
              <Ionicons name="time" size={30} color="#FBBF24" />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.reviewT')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.reviewP')}</Text>
            <Button3D title={t('gen.back')} icon="arrow-forward" onPress={() => nav.go(backDest)} style={{ alignSelf: 'stretch', marginTop: 20 }} />
            <Pressable onPress={() => { hap(); persist('doc-front'); }} style={st.retry}>
              <Ionicons name="refresh" size={14} color={C.gold} />
              <Text style={st.retryTxt}>{t('gen.retry')}</Text>
            </Pressable>
          </View>
        )}

        {step === 'done' && (
          <View style={st.center}>
            <View style={st.doneBadge}><Ionicons name="checkmark" size={46} color={C.up} /></View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.doneT')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.doneP')}</Text>
            {uid && (
              <View style={st.uidChip}>
                <Ionicons name="finger-print" size={14} color={C.gold} />
                <Text style={st.uidTxt}>{uid}</Text>
              </View>
            )}
            <Button3D title={t('gen.seePass')} icon="arrow-forward" onPress={() => nav.go(doneDest)} style={{ alignSelf: 'stretch', marginTop: 20 }} />
            <Text style={st.redirect}>{t('gen.auto', { n: redirectIn })}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TimerBar({ secondsLeft }) {
  const t = useT();
  const pct = secondsLeft / SCAN_SECONDS;
  const low = secondsLeft <= 10;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: C.txt2, fontSize: 12, fontWeight: '600' }}>{t('gen.timeLeft')}</Text>
        <Text style={{ color: low ? C.down : C.txt, fontWeight: '800', fontSize: 19 }}>{secondsLeft}s</Text>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: C.panel2, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 999, backgroundColor: low ? C.down : C.gold }} />
      </View>
      <Text style={{ color: C.txt3, fontSize: 11 }}>{t('gen.timeHint')}</Text>
    </View>
  );
}

// ---------------- Oferta de emparejamiento tras crear la cuenta ----------------
export function GenesisOffer({ nav }) {
  const t = useT();
  const { account } = useAccount();
  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('gen.title')} sub={t('gen.sub')} onBack={() => nav.go('home')} />
      <ScrollView contentContainerStyle={{ padding: 22, flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center' }}>
          <View style={st.doneBadge}><Ionicons name="checkmark" size={46} color={C.up} /></View>
          <Text style={[st.h1, { textAlign: 'center' }]}>{t('offer.title')}</Text>
          <Text style={[st.body, { textAlign: 'center' }]}>{t('offer.p')}</Text>
          {account?.addr ? (
            <View style={st.uidChip}>
              <Ionicons name="wallet" size={14} color={C.gold} />
              <Text style={st.uidTxt}>{account.addr.slice(0, 8)}…{account.addr.slice(-6)}</Text>
            </View>
          ) : null}
          <Button3D title={t('offer.now')} icon="finger-print" onPress={() => nav.go('kyc')} style={{ alignSelf: 'stretch', marginTop: 22 }} />
          <Pressable onPress={() => { hap(); nav.go('home'); }} style={st.retry}>
            <Text style={st.retryTxt}>{t('offer.later')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Spinner() {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(rot, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      style={{
        width: 80, height: 80, borderRadius: 40, borderWidth: 5,
        borderColor: 'rgba(201,169,97,0.18)', borderTopColor: C.gold,
        transform: [{ rotate: spin }],
      }}
    />
  );
}

// ---------------- Frase semilla (REAL, desde el backend) ----------------
export function SeedView({ nav }) {
  const t = useT();
  const [state, setState] = useState('hidden'); // hidden | loading | shown | unavailable
  const [words, setWords] = useState([]);

  async function reveal() {
    hap();
    setState('loading');
    const phrase = await getSeed();
    if (phrase) { setWords(phrase.split(/\s+/)); setState('shown'); }
    else setState('unavailable');
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('seed.title')} onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ padding: 22 }}>
        <View style={st.warn}>
          <Ionicons name="warning" size={20} color={C.down} />
          <Text style={st.warnTxt}>{t('seed.warn')}</Text>
        </View>

        {state === 'shown' ? (
          <View style={[st.grid, { marginTop: 16, marginBottom: 18 }]}>
            {words.map((w, i) => (
              <View key={i} style={st.cell}>
                <Text style={st.cellNo}>{i + 1}</Text>
                <Text style={st.cellWord}>{w}</Text>
              </View>
            ))}
          </View>
        ) : state === 'unavailable' ? (
          <Card style={{ padding: 18, marginVertical: 16 }}>
            <Text style={{ color: C.txt, fontWeight: '700', fontSize: 15, marginBottom: 8 }}>{t('seed.webT')}</Text>
            <Text style={{ color: C.txt2, fontSize: 12.5, lineHeight: 19 }}>{t('seed.webP')}</Text>
          </Card>
        ) : (
          <View style={[st.grid, { marginTop: 16, marginBottom: 18 }]}>
            {Array.from({ length: 12 }).map((_, i) => (
              <View key={i} style={st.cell}>
                <Text style={st.cellNo}>{i + 1}</Text>
                <Text style={st.cellWord}>••••••</Text>
              </View>
            ))}
          </View>
        )}

        {state !== 'shown' && (
          <Button3D
            title={state === 'loading' ? t('pk.loading') : t('seed.reveal')}
            icon="eye"
            onPress={state === 'loading' ? () => {} : reveal}
          />
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  steps: { flexDirection: 'row', paddingHorizontal: 22, paddingTop: 6, gap: 8 },
  stepItem: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: { height: 4, alignSelf: 'stretch', borderRadius: 3, backgroundColor: C.panel2 },
  stepLbl: { color: C.txt3, fontSize: 10, fontWeight: '600' },

  resume: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.35)', backgroundColor: 'rgba(201,169,97,0.1)',
    borderRadius: 14, padding: 12, marginBottom: 18,
  },
  resumeTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 17, flex: 1 },

  heroIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.12)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  h1: { color: C.txt, fontWeight: '800', fontSize: 22, lineHeight: 28, marginBottom: 8 },
  body: { color: C.txt2, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  label: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },
  input: {
    backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)',
    borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15,
  },

  docFrame: {
    width: DOC_W, height: DOC_H, borderRadius: 20, borderWidth: 2,
    backgroundColor: C.panel, overflow: 'hidden',
  },
  faceFrame: {
    width: FACE_W, height: FACE_H, borderRadius: FACE_W / 2, borderWidth: 3,
    backgroundColor: C.panel, overflow: 'hidden',
  },
  frameInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  sideLbl: { color: C.txt3, fontWeight: '800', fontSize: 12, letterSpacing: 3 },
  scanLine: { position: 'absolute', left: 12, right: 12, height: 3, borderRadius: 2, backgroundColor: C.gold, opacity: 0.85 },

  center: { alignItems: 'center', paddingVertical: 24 },
  doneBadge: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(62,217,160,0.12)',
    borderWidth: 2, borderColor: C.up, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  uidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', backgroundColor: 'rgba(201,169,97,0.1)',
    borderRadius: 999, paddingHorizontal: 15, paddingVertical: 8, marginTop: 14,
  },
  uidTxt: { color: C.txt, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  redirect: { color: C.txt3, fontSize: 12, marginTop: 12 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 12, marginTop: 6 },
  retryTxt: { color: C.gold, fontWeight: '600', fontSize: 13 },

  warn: {
    flexDirection: 'row', gap: 12, backgroundColor: 'rgba(240,119,107,0.08)',
    borderWidth: 1, borderColor: 'rgba(240,119,107,0.3)', borderRadius: 16, padding: 14,
    marginTop: 14, alignItems: 'center',
  },
  warnTxt: { color: '#f4b4ac', fontSize: 12.5, flex: 1, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: {
    width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.line2,
    borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
  },
  cellNo: { color: C.gold, fontSize: 12, opacity: 0.7, width: 16, textAlign: 'right' },
  cellWord: { color: C.txt, fontSize: 14, fontWeight: '500' },
  revealOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(4,26,27,0.55)', borderRadius: 14,
  },
  ackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.line2,
    alignItems: 'center', justifyContent: 'center',
  },
});
