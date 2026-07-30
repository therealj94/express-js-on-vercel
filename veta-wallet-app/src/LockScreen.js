import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Icon } from './icons';
import { C } from './theme';
import { Logo, hap } from './ui';
import { useT } from './i18n';

// Candado biométrico. Se monta encima de todo cuando la app queda
// desbloqueada; se muestra al arrancar y cuando la app vuelve del segundo
// plano tras estar más de RE_LOCK_MS milisegundos afuera. Si el teléfono
// no tiene biometría configurada, hay un botón "Continuar" — la app no
// puede exigir biometría que el dispositivo no ofrece.
const RE_LOCK_MS = 2 * 60 * 1000; // 2 minutos

export function useAppLock() {
  const [locked, setLocked] = useState(true);
  const [available, setAvailable] = useState(true);
  const lastActive = useRef(Date.now());
  const state = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enr = await LocalAuthentication.isEnrolledAsync();
      setAvailable(hw && enr);
      // Si no hay biometría, la app arranca desbloqueada — mejor pedirle al
      // usuario que configure algo, que bloquearlo fuera.
      if (!(hw && enr)) setLocked(false);
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = state.current;
      state.current = next;
      if (prev === 'active' && next.match(/inactive|background/)) {
        lastActive.current = Date.now();
      }
      if (prev.match(/inactive|background/) && next === 'active') {
        if (available && Date.now() - lastActive.current > RE_LOCK_MS) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [available]);

  return { locked, setLocked, available };
}

export default function LockScreen({ onUnlock, available }) {
  const t = useT();
  const [error, setError] = useState(null);
  const [trying, setTrying] = useState(false);

  const authenticate = async () => {
    if (!available) { onUnlock(); return; }
    setTrying(true); setError(null); hap();
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: t('lock.prompt'),
        cancelLabel: t('lock.cancel'),
        disableDeviceFallback: false,
      });
      if (r.success) { onUnlock(); return; }
      setError(t('lock.failed'));
    } catch (e) {
      setError(t('lock.failed'));
    } finally { setTrying(false); }
  };

  useEffect(() => { authenticate(); /* eslint-disable-next-line */ }, []);

  return (
    <View style={st.bg}>
      <View style={st.wrap}>
        <Logo size={96} />
        <View style={st.iconBox}>
          <Icon name={available ? 'finger-print' : 'lock-closed'} size={44} color={C.gold} />
        </View>
        <Text style={st.title}>{available ? t('lock.title') : t('lock.noBiometrics')}</Text>
        <Text style={st.p}>{available ? t('lock.p') : t('lock.noBiometricsP')}</Text>
        {error ? <Text style={st.err}>{error}</Text> : null}
        <Pressable onPress={authenticate} disabled={trying} style={[st.btn, trying && { opacity: 0.6 }]}>
          <Icon name={available ? 'finger-print' : 'arrow-forward'} size={18} color={C.darkText} />
          <Text style={st.btnTxt}>{available ? t('lock.cta') : t('lock.continue')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  wrap: { alignItems: 'center', paddingHorizontal: 32, maxWidth: 360 },
  iconBox: {
    width: 92, height: 92, borderRadius: 30,
    backgroundColor: 'rgba(201,169,97,0.12)',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 28, marginBottom: 22,
  },
  title: { color: C.txt, fontWeight: '800', fontSize: 22, textAlign: 'center', marginBottom: 8 },
  p: { color: C.txt2, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginBottom: 22 },
  err: { color: C.down, fontSize: 12.5, textAlign: 'center', marginBottom: 12 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.gold, paddingHorizontal: 26, paddingVertical: 14,
    borderRadius: 14,
  },
  btnTxt: { color: C.darkText, fontWeight: '800', fontSize: 14.5 },
});
