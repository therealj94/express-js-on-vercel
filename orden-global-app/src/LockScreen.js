import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState, Animated, Easing, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import { Icon } from './icons';
import { C } from './theme';
import { Image } from 'react-native';
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

  // El anillo late mientras el sistema espera la cara o el dedo: da señal de
  // que la app está pidiendo algo, no colgada.
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trying) { pulso.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [trying, pulso]);
  const anilloEscala = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const anilloOpaco = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={st.bg}>
      <LinearGradient
        colors={['rgba(201,169,97,0.10)', 'rgba(2,27,28,0)']}
        style={st.brillo}
        pointerEvents="none"
      />
      <View style={st.wrap}>
        <Image source={require('../assets/og-logo.png')} style={{ width: 132, height: 91 }} resizeMode="contain" />

        <View style={st.anilloZona}>
          {trying && <Animated.View style={[st.anillo, { transform: [{ scale: anilloEscala }], opacity: anilloOpaco }]} />}
          <View style={st.iconBox}>
            {trying
              ? <ActivityIndicator size="large" color={C.gold} />
              : <Icon name={available ? 'finger-print' : 'lock-closed'} size={44} color={C.gold} />}
          </View>
        </View>

        <Text style={st.title}>{available ? t('lock.title') : t('lock.noBiometrics')}</Text>
        <Text style={st.p}>{available ? t('lock.p') : t('lock.noBiometricsP')}</Text>
        {error ? (
          <View style={st.errBox}>
            <Icon name="alert-circle" size={15} color={C.down} />
            <Text style={st.err}>{error}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={authenticate}
          disabled={trying}
          style={({ pressed }) => [st.btn, trying && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.97 }] }]}
          accessibilityRole="button"
          accessibilityLabel={available ? t('lock.cta') : t('lock.continue')}
        >
          <Icon name={available ? 'finger-print' : 'arrow-forward'} size={18} color={C.darkText} />
          <Text style={st.btnTxt}>{available ? t('lock.cta') : t('lock.continue')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  // Halo dorado tenue detrás del contenido: da profundidad sin competir.
  brillo: { position: 'absolute', top: '12%', width: 460, height: 460, borderRadius: 230 },
  wrap: { alignItems: 'center', paddingHorizontal: 32, maxWidth: 360 },
  anilloZona: { alignItems: 'center', justifyContent: 'center', marginTop: 28, marginBottom: 22 },
  anillo: {
    position: 'absolute', width: 92, height: 92, borderRadius: 30,
    borderWidth: 1.5, borderColor: C.gold,
  },
  iconBox: {
    width: 92, height: 92, borderRadius: 30,
    backgroundColor: 'rgba(201,169,97,0.12)',
    borderWidth: 1, borderColor: 'rgba(201,169,97,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: C.txt, fontWeight: '800', fontSize: 22, textAlign: 'center', marginBottom: 8 },
  p: { color: C.txt2, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginBottom: 22 },
  errBox: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(240,119,107,0.10)', borderWidth: 1, borderColor: 'rgba(240,119,107,0.28)',
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 16,
  },
  err: { color: C.down, fontSize: 12.5, textAlign: 'center' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.gold, paddingHorizontal: 30, paddingVertical: 15,
    borderRadius: 15,
    shadowColor: '#C9A961', shadowOpacity: 0.45, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 7,
  },
  btnTxt: { color: C.darkText, fontWeight: '800', fontSize: 14.5 },
});
