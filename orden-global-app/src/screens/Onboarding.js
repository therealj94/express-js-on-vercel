import React, { useState, useRef } from 'react';
import { View, Text, Pressable, Dimensions, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from '../icons';
import { C, G } from '../theme';
import { AppBackground, Logo, Button3D, hap } from '../ui';
import { useT } from '../i18n';

// Onboarding de 3 pantallas para primer uso. Se muestra UNA sola vez por
// dispositivo (bandera en AsyncStorage). App.js decide si entrar aquí en
// lugar de Home después de un registro/login exitoso.
export const ONBOARDING_KEY = 'veta-onboarding-done-v1';

export async function seenOnboarding() {
  try { return (await AsyncStorage.getItem(ONBOARDING_KEY)) === '1'; } catch (e) { return false; }
}
export async function markOnboardingDone() {
  try { await AsyncStorage.setItem(ONBOARDING_KEY, '1'); } catch (e) {}
}

const W = Dimensions.get('window').width;

const SLIDES = (t) => [
  { icon: 'shield-checkmark', title: t('ob.s1t'), body: t('ob.s1p') },
  { icon: 'flash',             title: t('ob.s2t'), body: t('ob.s2p') },
  { icon: 'finger-print',      title: t('ob.s3t'), body: t('ob.s3p') },
];

export default function Onboarding({ nav }) {
  const t = useT();
  const [i, setI] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const slides = SLIDES(t);

  const goTo = async (n) => {
    hap();
    if (n >= slides.length) {
      await markOnboardingDone();
      nav.go('home');
      return;
    }
    setI(n);
    Animated.spring(x, { toValue: -n * W, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  };

  const skip = async () => { await markOnboardingDone(); nav.go('home'); };
  const current = slides[i];

  return (
    <AppBackground intensity="hero">
      <View style={st.wrap}>
        <View style={st.top}>
          <Logo size={64} />
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel={t('ob.skip')}
            hitSlop={12}>
            <Text style={st.skip}>{t('ob.skip')}</Text>
          </Pressable>
        </View>

        <View style={st.bodyCol}>
          <View style={st.iconBox}>
            <LinearGradient colors={G.gold} style={st.iconInner}>
              <Icon name={current.icon} size={44} color={C.darkText} />
            </LinearGradient>
          </View>
          <Text style={st.title}>{current.title}</Text>
          <Text style={st.body}>{current.body}</Text>
        </View>

        <View style={st.dots}>
          {slides.map((_, k) => (
            <View key={k} style={[st.dot, k === i && st.dotOn]} />
          ))}
        </View>

        <Button3D
          title={i === slides.length - 1 ? t('ob.start') : t('ob.next')}
          icon={i === slides.length - 1 ? 'checkmark' : 'arrow-forward'}
          onPress={() => goTo(i + 1)}
          style={st.cta}
        />
      </View>
    </AppBackground>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 30, paddingTop: 40, paddingBottom: 34 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { color: C.txt3, fontSize: 13, fontWeight: '600' },
  bodyCol: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  iconBox: {
    width: 116, height: 116, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  iconInner: {
    width: 116, height: 116, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.gold, shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  title: { color: C.txt, fontWeight: '800', fontSize: 26, textAlign: 'center', paddingHorizontal: 12, lineHeight: 32 },
  body: { color: C.txt2, fontSize: 14.5, lineHeight: 21, textAlign: 'center', paddingHorizontal: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(201,169,97,0.28)' },
  dotOn: { width: 22, backgroundColor: C.gold },
  cta: { alignSelf: 'stretch' },
});
