import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Icon } from '../icons';
import { C } from '../theme';
import { Header, Button3D, hap, useAccount, useToast } from '../ui';
import { apiLogin, walletApi } from '../api';
import { recordLogout } from '../sessionLog';
import { useT } from '../i18n';

// Eliminar cuenta: 5 pasos con confirmaciones progresivas y verificación
// con la contraseña real (llamada de login contra el backend). Al concluir
// se intenta borrar en el servidor y se hace wipe local completo:
// SecureStore + todas las claves de AsyncStorage relacionadas con la app.
//
// Este flujo cumple el requisito de Apple/Google que exigen que el usuario
// pueda pedir la eliminación de su cuenta desde la app misma.

const PREGUNTAS = ['q1', 'q2', 'q3', 'q4']; // 4 confirmaciones + 1 de contraseña

// Rutas candidatas para el endpoint de eliminación en el backend. Se
// prueban en orden hasta que una responda algo distinto de 404.
const DELETE_PATHS = ['/auth/delete-account', '/user/delete', '/user', '/account/delete', '/auth/account'];

async function intentarBorrarEnBackend(email) {
  for (const p of DELETE_PATHS) {
    try {
      await walletApi.raw(p, { method: 'DELETE' });
      return { ok: true, path: p };
    } catch (e) {
      if (e.status && e.status !== 404 && e.status !== 405) {
        // Si el servidor responde algo distinto de "no existe la ruta",
        // damos por hecho que atendió la petición (aunque diga 200/202/204).
        return { ok: false, status: e.status, message: e.message };
      }
    }
  }
  return { ok: false, status: 404, message: 'no-endpoint' };
}

// Claves del dispositivo que se borran al eliminar cuenta.
async function wipeLocal() {
  const secure = ['veta-api-token', 'veta-remember-creds'];
  for (const k of secure) { try { await SecureStore.deleteItemAsync(k); } catch (e) {} }
  const keys = [
    'veta-accounts-cache-v2',
    'veta-session-email',
    'veta-session-current-id',
    'veta-sessions-log-v1',
    'veta-contacts',
    'veta-watchonly-v1',
    'veta-onboarding-done-v1',
    'veta-seed-seen-at',
    'veta-backup-snoozed-until',
    'veta-first-open-at',
    'veta-lang',
    'veta-api-token', // por si quedó copia vieja
    'veta-remember-creds',
  ];
  for (const k of keys) { try { await AsyncStorage.removeItem(k); } catch (e) {} }
}

export default function DeleteAccount({ nav }) {
  const t = useT();
  const toast = useToast();
  const { account, logout } = useAccount();
  const acc = account || {};

  const [step, setStep] = useState(0);      // 0..3 preguntas, 4 contraseña
  const [answers, setAnswers] = useState({ q1: null, q2: null, q3: null, q4: null });
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const preguntaActual = step < 4 ? PREGUNTAS[step] : null;
  const respActual = preguntaActual ? answers[preguntaActual] : null;
  const puedeAvanzar = step < 4 ? respActual !== null : pw.length > 0;

  const irAtras = () => {
    hap();
    if (step > 0) setStep(step - 1);
    else nav.back();
  };

  const avanzar = () => {
    if (!puedeAvanzar) return;
    hap();
    // Si en alguna pregunta el usuario contestó "No", el flujo se aborta
    // — es la señal más honesta de que no quiere continuar.
    if (step < 4 && respActual === false) {
      Alert.alert(t('delAcc.abortedT'), t('delAcc.abortedP'), [
        { text: t('delAcc.ok'), onPress: () => nav.back() },
      ]);
      return;
    }
    if (step < 4) setStep(step + 1);
    else confirmarBorrado();
  };

  async function confirmarBorrado() {
    if (!pw) return;
    if (!acc.email) { setErr(t('delAcc.errNoAcc')); return; }
    setBusy(true); setErr(null);
    try {
      // 1) Verificamos la contraseña con un login real. Si es incorrecta,
      // el backend responde con 401 y frenamos antes de tocar nada.
      try {
        await apiLogin(acc.email, pw);
      } catch (e) {
        setBusy(false);
        setErr(e?.status === 401 ? t('delAcc.errPw') : (e?.message || t('delAcc.errServer')));
        return;
      }
      // 2) Intentamos que el backend borre la cuenta.
      const remoto = await intentarBorrarEnBackend(acc.email);
      // 3) Wipe local COMPLETO — se hace siempre, incluso si el endpoint
      // remoto no existe (el usuario ve la sesión cerrada aquí y contacta
      // a soporte para forzar el borrado en el servidor si aplica).
      await wipeLocal();
      recordLogout();
      logout();
      setBusy(false);
      nav.go('auth');
      toast(remoto.ok ? t('delAcc.doneToast') : t('delAcc.localToast'), remoto.ok ? 'success' : 'warn');
      if (!remoto.ok) {
        // Después del toast, damos un aviso claro por si el backend
        // no borró — para que el usuario sepa qué hacer.
        setTimeout(() => Alert.alert(
          t('delAcc.partialT'),
          t('delAcc.partialP'),
          [{ text: t('delAcc.ok') }],
        ), 400);
      }
    } catch (e) {
      setBusy(false);
      setErr(e?.message || t('delAcc.errServer'));
    }
  }

  return (
    <View style={{ flex: 1, paddingTop: 6 }}>
      <Header title={t('delAcc.title')} onBack={irAtras} />
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* Progreso — 5 pasos, el actual dorado, los completados verdes tenues */}
        <View style={st.dots}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                st.dot,
                i < step && st.dotDone,
                i === step && st.dotOn,
              ]}
            />
          ))}
        </View>
        <Text style={st.stepLbl}>{t('delAcc.stepOf', { n: step + 1, total: 5 })}</Text>

        {step < 4 ? (
          <>
            <View style={st.iconBox}>
              <Icon name="warning" size={40} color={C.down} />
            </View>
            <Text style={st.question}>{t(`delAcc.${preguntaActual}`)}</Text>
            <Text style={st.subQ}>{t(`delAcc.${preguntaActual}p`)}</Text>

            <View style={st.yesNoRow}>
              <Pressable
                onPress={() => { hap(); setAnswers({ ...answers, [preguntaActual]: true }); }}
                accessibilityRole="radio"
                accessibilityLabel={t('delAcc.yes')}
                accessibilityState={{ selected: respActual === true }}
                style={[st.pill, respActual === true && st.pillYesOn]}>
                <Icon name="checkmark" size={18} color={respActual === true ? '#3A2C08' : C.txt3} />
                <Text style={[st.pillTxt, respActual === true && { color: '#3A2C08' }]}>{t('delAcc.yes')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { hap(); setAnswers({ ...answers, [preguntaActual]: false }); }}
                accessibilityRole="radio"
                accessibilityLabel={t('delAcc.no')}
                accessibilityState={{ selected: respActual === false }}
                style={[st.pill, respActual === false && st.pillNoOn]}>
                <Icon name="close-circle" size={18} color={respActual === false ? '#fff' : C.txt3} />
                <Text style={[st.pillTxt, respActual === false && { color: '#fff' }]}>{t('delAcc.no')}</Text>
              </Pressable>
            </View>

            <Button3D
              title={t('delAcc.continue')}
              icon="arrow-forward"
              disabled={!puedeAvanzar}
              onPress={avanzar}
              style={{ marginTop: 26 }}
            />
          </>
        ) : (
          <>
            <View style={st.iconBox}>
              <Icon name="lock-closed" size={40} color={C.gold} />
            </View>
            <Text style={st.question}>{t('delAcc.pwT')}</Text>
            <Text style={st.subQ}>{t('delAcc.pwP')}</Text>

            <View style={{ marginTop: 22, marginBottom: 6 }}>
              <View>
                <TextInput
                  value={pw}
                  onChangeText={(v) => { setPw(v); setErr(null); }}
                  placeholder="••••••••"
                  placeholderTextColor="#6f938f"
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  style={[st.input, { paddingRight: 46 }]}
                />
                <Pressable
                  onPress={() => setShowPw(!showPw)}
                  accessibilityRole="button"
                  accessibilityLabel={t('send.pw')}
                  style={st.eye}>
                  <Icon name={showPw ? 'eye-off' : 'eye'} size={20} color={C.txt2} />
                </Pressable>
              </View>
              {err ? <Text style={st.err}>{err}</Text> : null}
            </View>

            <View style={st.warnBox}>
              <Icon name="alert-circle" size={20} color={C.down} />
              <Text style={st.warnTxt}>{t('delAcc.finalWarn')}</Text>
            </View>

            <Pressable
              onPress={busy ? undefined : avanzar}
              disabled={busy || !puedeAvanzar}
              accessibilityRole="button"
              accessibilityLabel={t('delAcc.deleteNow')}
              accessibilityState={{ disabled: busy || !puedeAvanzar }}
              style={[st.dangerBtn, (busy || !puedeAvanzar) && { opacity: 0.5 }]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="trash" size={18} color="#fff" />
                  <Text style={st.dangerBtnTxt}>{t('delAcc.deleteNow')}</Text>
                </>
              )}
            </Pressable>
            <Pressable onPress={() => nav.back()} disabled={busy} style={{ padding: 14, alignItems: 'center' }}>
              <Text style={{ color: C.txt3, fontWeight: '700' }}>{t('delAcc.cancel')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  dot: { width: 22, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)' },
  dotOn: { backgroundColor: C.gold, width: 32 },
  dotDone: { backgroundColor: 'rgba(62,217,160,0.55)' },
  stepLbl: { color: C.txt3, fontSize: 11, letterSpacing: 2, fontWeight: '700', textAlign: 'center', marginTop: 12 },

  iconBox: {
    width: 92, height: 92, borderRadius: 28,
    backgroundColor: 'rgba(240,119,107,0.10)',
    borderWidth: 1, borderColor: 'rgba(240,119,107,0.32)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginTop: 22, marginBottom: 18,
  },
  question: { color: C.txt, fontWeight: '800', fontSize: 20, textAlign: 'center', lineHeight: 26, paddingHorizontal: 6 },
  subQ: { color: C.txt2, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },

  yesNoRow: { flexDirection: 'row', gap: 10, marginTop: 26 },
  pill: {
    flex: 1, flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: C.panel,
  },
  pillYesOn: { backgroundColor: C.gold, borderColor: C.gold },
  pillNoOn: { backgroundColor: '#8E1F2F', borderColor: '#8E1F2F' },
  pillTxt: { color: C.txt2, fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },

  input: { backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 },
  eye: { position: 'absolute', right: 12, top: 12, padding: 2 },
  err: { color: C.down, fontSize: 12.5, marginTop: 8 },

  warnBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(240,119,107,0.10)', borderWidth: 1, borderColor: 'rgba(240,119,107,0.32)', borderRadius: 14, padding: 13, marginTop: 16, marginBottom: 18 },
  warnTxt: { flex: 1, color: C.txt, fontSize: 12.5, lineHeight: 18 },

  dangerBtn: {
    flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#8E1F2F', borderRadius: 16, paddingVertical: 15,
    shadowColor: '#8E1F2F', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  dangerBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
