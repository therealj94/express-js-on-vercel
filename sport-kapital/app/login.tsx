// app/login.tsx
// Inicio de sesión para cuentas ya respaldadas en la nube (Firebase). Trae
// de vuelta el saldo, posiciones e historial guardados, sin repetir el KYC.
//
// Diseño: foto hero a pantalla completa (jugador con la camiseta SPORT
// KAPITAL) con degradado oscuro para legibilidad, la "burbuja" de inicio de
// sesión flotando abajo en vidrio esmerilado, y el CTA de crear cuenta al pie.
// Esta pantalla usa colores fijos (no del tema) porque la foto es la misma en
// todos los temas y el contraste debe estar garantizado.
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform,
  ImageBackground, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { font, radius, spacing } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { success, tap, error as hError } from '@/utils/haptics';
import { runBusyAsync } from '@/utils/busy';
import { signInCloud, pullSnapshot, resetPasswordCloud } from '@/utils/cloudSync';
import { t } from '@/utils/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// paleta fija de esta pantalla (sobre la foto siempre se ve igual)
const GOLD = '#F5C542';
const INK = '#0A0A0F';

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setUid = useStore((s) => s.setUid);
  const hydrateFromCloud = useStore((s) => s.hydrateFromCloud);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const clearErr = () => { setErr(null); setResetMsg(null); };

  const submit = () => {
    if (!EMAIL_RE.test(email.trim())) { hError(); setErr(t('reg.errEmail')); return; }
    if (password.length < 1) { hError(); setErr(t('login.errNoPass')); return; }

    runBusyAsync(async () => {
      const res = await signInCloud(email.trim().toLowerCase(), password);
      if (!res.ok || !res.uid) { hError(); setErr(res.msg ?? t('login.errSignIn')); return; }

      const snapshot = await pullSnapshot(res.uid);
      if (!snapshot || !snapshot.user) {
        hError();
        setErr(t('login.errNoData'));
        return;
      }

      setUid(res.uid);
      hydrateFromCloud(snapshot);
      success();
      router.replace('/(tabs)/dashboard');
    });
  };

  const forgotPassword = () => {
    tap();
    if (!EMAIL_RE.test(email.trim())) { hError(); setErr(t('login.forgotFirst')); return; }
    runBusyAsync(async () => {
      const res = await resetPasswordCloud(email.trim().toLowerCase());
      if (!res.ok) { hError(); setErr(res.msg ?? t('login.errReset')); return; }
      success();
      setErr(null);
      setResetMsg(t('login.resetSent', { email: email.trim() }));
    });
  };

  return (
    <View style={styles.root}>
      {/* foto hero a pantalla completa */}
      <ImageBackground
        source={require('@/assets/images/login-hero.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      {/* degradado: sutil arriba (marca legible), profundo abajo (burbuja) */}
      <LinearGradient
        colors={['rgba(6,6,12,0.62)', 'rgba(6,6,12,0.10)', 'rgba(6,6,12,0.42)', 'rgba(6,6,12,0.96)']}
        locations={[0, 0.26, 0.55, 0.86]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* marca arriba, sobre el estadio */}
          <Animated.View entering={FadeInDown.duration(500)} style={styles.brandRow}>
            <Logo size={30} glow />
            <Text style={styles.brand}>SPORT KAPITAL</Text>
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(120).duration(500)} style={styles.slogan}>
            {t('login.heroSlogan')}
          </Animated.Text>

          <View style={{ flex: 1 }} />

          {/* burbuja de inicio de sesión (vidrio esmerilado) */}
          <Animated.View entering={FadeInUp.delay(150).duration(500)} style={styles.bubble}>
            <Text style={styles.title}>{t('login.title')}</Text>
            <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

            <View style={styles.inputBox}>
              <Icon name="news" size={17} color="rgba(255,255,255,0.45)" />
              <TextInput
                value={email}
                onChangeText={(v) => { setEmail(v); clearErr(); }}
                placeholder={t('reg.emailPh')}
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputBox}>
              <Icon name="shield" size={17} color="rgba(255,255,255,0.45)" />
              <TextInput
                value={password}
                onChangeText={(v) => { setPassword(v); clearErr(); }}
                placeholder={t('login.passwordPh')}
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.input}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable onPress={() => { tap(); setShowPassword((v) => !v); }} hitSlop={8}>
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color="rgba(255,255,255,0.45)" />
              </Pressable>
            </View>

            <Pressable onPress={forgotPassword} style={{ alignSelf: 'flex-end', marginTop: 10 }} hitSlop={8}>
              <Text style={styles.forgotTxt}>{t('login.forgot')}</Text>
            </Pressable>

            {err && (
              <View style={styles.msgRow}>
                <Icon name="alert" size={15} color="#FF5C7A" />
                <Text style={styles.errTxt}>{err}</Text>
              </View>
            )}
            {resetMsg && (
              <View style={styles.msgRow}>
                <Icon name="check-circle" size={15} color="#3BFF9E" />
                <Text style={styles.resetTxt}>{resetMsg}</Text>
              </View>
            )}

            <Pressable onPress={() => { tap(); submit(); }} style={styles.submitBtn}>
              <Text style={styles.submitTxt}>{t('login.submit')}</Text>
            </Pressable>
          </Animated.View>

          {/* CTA de registro, abajo de la burbuja */}
          <Animated.View entering={FadeInUp.delay(260).duration(500)} style={styles.noAccRow}>
            <Text style={styles.noAccTxt}>{t('login.noAccQ')}</Text>
            <Pressable onPress={() => { tap(); router.back(); }} style={styles.createBtn} hitSlop={6}>
              <Text style={styles.createTxt}>{t('login.createBtn')}</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  brand: { color: '#FFFFFF', fontSize: font.size.sm, letterSpacing: 3, fontFamily: font.family.headingBold },
  slogan: {
    color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginTop: 10,
    fontSize: font.size.md, fontWeight: '700', letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
  bubble: {
    backgroundColor: 'rgba(12,12,20,0.86)', borderRadius: 26, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  title: { color: '#FFFFFF', fontSize: font.size['2xl'], fontFamily: font.family.heading, letterSpacing: 1 },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: font.size.sm, lineHeight: 20, marginTop: 6, marginBottom: 14 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: radius.md, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)',
  },
  input: { flex: 1, color: '#FFFFFF', fontSize: font.size.md, height: 52, fontWeight: '600' },
  forgotTxt: { color: GOLD, fontSize: font.size.sm, fontWeight: '700' },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  errTxt: { color: '#FF5C7A', fontSize: font.size.sm, fontWeight: '600', flex: 1 },
  resetTxt: { color: '#3BFF9E', fontSize: font.size.sm, fontWeight: '600', flex: 1 },
  submitBtn: {
    backgroundColor: GOLD, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 16,
    shadowColor: GOLD, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  submitTxt: { color: '#1A1400', fontSize: font.size.md, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  noAccRow: { alignItems: 'center', marginTop: 16 },
  noAccTxt: { color: 'rgba(255,255,255,0.6)', fontSize: font.size.sm, fontWeight: '600' },
  createBtn: {
    marginTop: 9, borderWidth: 1.5, borderColor: GOLD, borderRadius: 999,
    paddingHorizontal: 22, paddingVertical: 10, backgroundColor: 'rgba(245,197,66,0.12)',
  },
  createTxt: { color: GOLD, fontSize: font.size.sm, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
});
