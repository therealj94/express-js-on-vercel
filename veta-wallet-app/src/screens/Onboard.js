import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { Header, Button3D, Card, hap, useToast, useAccount } from '../ui';
import { genesis } from '../genesis';
import { setPassport } from '../accounts';
import { getSeed } from '../api';
import { useT } from '../i18n';

// ---------------- GENESIS ID: verificación en el portal oficial ----------------
// La app NO simula el proceso: abre https://www.genesisid.online, el usuario
// llena todo allá y regresa a la app con su pasaporte completo.

export function Kyc({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account, login: loginAccount } = useAccount();
  const [state, setState] = useState('intro'); // intro | opening | pending | done
  const [passport, setPass] = useState(null);

  const email = account?.email || '';
  const fullName = account?.name || '';
  const walletAddress = account?.addr || '';

  async function applyPassport(p) {
    setPass(p);
    if (account) {
      const updated = await setPassport(account.email, p);
      if (updated) loginAccount(updated);
    }
  }

  async function start() {
    hap();
    setState('opening');
    const r = await genesis.verify({ email, fullName, walletAddress });
    if (r.passport) {
      await applyPassport(r.passport);
      setState('done');
      hap();
      return;
    }
    if (r.cancelled) { setState('intro'); return; }
    setState('pending');
  }

  // Botón "Ya completé mi verificación": vuelve a consultar el motor.
  async function recheck() {
    hap();
    setState('opening');
    const p = await genesis.refresh(email, { fullName, walletAddress, email });
    if (p && !p._notVerified) {
      await applyPassport(p);
      setState('done');
      return;
    }
    setState('pending');
    toast(t('gen.stillPending'));
  }

  // Al terminar, continúa al pasaporte.
  useEffect(() => {
    if (state !== 'done') return;
    const timer = setTimeout(() => nav.go('passport'), 2200);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('gen.title')} sub={t('gen.sub')} onBack={() => nav.go(account ? 'settings' : 'auth')} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        {state === 'intro' && (
          <>
            <View style={st.heroIcon}><Icon name="finger-print" size={30} color={C.gold} /></View>
            <Text style={st.h1}>{t('gen.h1')}</Text>
            <Text style={st.body}>{t('gen.portalBody')}</Text>

            <Card style={{ padding: 16, marginBottom: 16 }}>
              <Text style={st.cardTitle}>{t('gen.willSend')}</Text>
              <Row k={t('auth.email')} v={email || '—'} />
              <Row k={t('prof.name')} v={fullName || '—'} />
              <Row k={t('prof.wallet')} v={walletAddress ? `${walletAddress.slice(0, 10)}…${walletAddress.slice(-6)}` : '—'} />
            </Card>

            <View style={st.steps}>
              <Step n="1" txt={t('gen.s1')} />
              <Step n="2" txt={t('gen.s2')} />
              <Step n="3" txt={t('gen.s3')} />
            </View>

            <Button3D title={t('gen.openPortal')} icon="shield-checkmark" onPress={start} style={{ marginTop: 6 }} />
            <Text style={st.foot}>{t('gen.secure')}</Text>
          </>
        )}

        {state === 'opening' && (
          <View style={st.center}>
            <ActivityIndicator size="large" color={C.gold} />
            <Text style={[st.h1, { textAlign: 'center', marginTop: 22 }]}>{t('gen.processing')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.portalOpening')}</Text>
          </View>
        )}

        {state === 'pending' && (
          <View style={st.center}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
              <Icon name="time" size={30} color="#FBBF24" />
            </View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.pendingT')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.pendingP')}</Text>
            <Button3D title={t('gen.recheck')} icon="refresh" onPress={recheck} style={{ alignSelf: 'stretch', marginTop: 16 }} />
            <Pressable onPress={start} style={st.retry}>
              <Icon name="open-outline" size={14} color={C.gold} />
              <Text style={st.retryTxt}>{t('gen.reopen')}</Text>
            </Pressable>
            <Pressable onPress={() => nav.go(account ? 'home' : 'auth')} style={st.retry}>
              <Text style={[st.retryTxt, { color: C.txt3 }]}>{t('gen.back')}</Text>
            </Pressable>
          </View>
        )}

        {state === 'done' && (
          <View style={st.center}>
            <View style={st.doneBadge}><Icon name="checkmark" size={46} color={C.up} /></View>
            <Text style={[st.h1, { textAlign: 'center' }]}>{t('gen.doneT')}</Text>
            <Text style={[st.body, { textAlign: 'center' }]}>{t('gen.doneP')}</Text>
            {passport?.genesisUid && (
              <View style={st.uidChip}>
                <Icon name="finger-print" size={14} color={C.gold} />
                <Text style={st.uidTxt}>{passport.genesisUid}</Text>
              </View>
            )}
            <Button3D title={t('gen.seePass')} icon="arrow-forward" onPress={() => nav.go('passport')} style={{ alignSelf: 'stretch', marginTop: 20 }} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ k, v }) {
  return (
    <View style={st.row}>
      <Text style={st.rowK}>{k}</Text>
      <Text style={st.rowV} numberOfLines={1}>{v}</Text>
    </View>
  );
}
function Step({ n, txt }) {
  return (
    <View style={st.step}>
      <View style={st.stepN}><Text style={st.stepNTxt}>{n}</Text></View>
      <Text style={st.stepTxt}>{txt}</Text>
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
          <LinearGradient colors={G.gold} style={st.offerIcon}>
            <Icon name="checkmark" size={38} color={C.darkText} />
          </LinearGradient>
          <Text style={[st.h1, { textAlign: 'center' }]}>{t('offer.title')}</Text>
          <Text style={[st.body, { textAlign: 'center' }]}>{t('offer.p')}</Text>
          {account?.addr ? (
            <View style={st.uidChip}>
              <Icon name="wallet" size={14} color={C.gold} />
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

// ---------------- Frase semilla (real, desde el backend) ----------------
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
          <Icon name="warning" size={20} color={C.down} />
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
  heroIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.12)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  offerIcon: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  h1: { color: C.txt, fontWeight: '800', fontSize: 22, lineHeight: 28, marginBottom: 8 },
  body: { color: C.txt2, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  cardTitle: { color: C.txt, fontWeight: '700', fontSize: 13.5, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  rowK: { color: C.txt3, fontSize: 12.5 },
  rowV: { color: C.txt, fontSize: 12.5, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  steps: { gap: 12, marginBottom: 22 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepN: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(201,169,97,0.15)', alignItems: 'center', justifyContent: 'center' },
  stepNTxt: { color: C.gold, fontWeight: '800', fontSize: 12.5 },
  stepTxt: { color: C.txt2, fontSize: 12.5, flex: 1, lineHeight: 18 },
  foot: { color: C.txt3, fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 16 },

  center: { alignItems: 'center', paddingVertical: 30 },
  doneBadge: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(62,217,160,0.12)',
    borderWidth: 2, borderColor: C.up, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  uidChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.4)', backgroundColor: 'rgba(201,169,97,0.1)',
    borderRadius: 999, paddingHorizontal: 15, paddingVertical: 8, marginTop: 6,
  },
  uidTxt: { color: C.txt, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 12, marginTop: 4 },
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
});
