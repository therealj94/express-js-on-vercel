// app/register.tsx
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, TextInput as RNTextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { CyberBackground } from '@/components/CyberBackground';
import { GlitchText } from '@/components/GlitchText';
import { success, tap, error as hError } from '@/utils/haptics';
import { runBusyAsync } from '@/utils/busy';
import { signUpCloud, isFirebaseConfigured } from '@/utils/cloudSync';
import { t } from '@/utils/i18n';

export const COUNTRIES: { code: string; name: string; currency: string; symbol: string; rate: number }[] = [
  { code: 'HN', name: 'Honduras', currency: 'HNL', symbol: 'L', rate: 26.35 },
  { code: 'MX', name: 'México', currency: 'MXN', symbol: '$', rate: 18.40 },
  { code: 'GT', name: 'Guatemala', currency: 'GTQ', symbol: 'Q', rate: 7.75 },
  { code: 'SV', name: 'El Salvador', currency: 'USD', symbol: '$', rate: 1 },
  { code: 'CR', name: 'Costa Rica', currency: 'CRC', symbol: '₡', rate: 505 },
  { code: 'NI', name: 'Nicaragua', currency: 'NIO', symbol: 'C$', rate: 36.8 },
  { code: 'PA', name: 'Panamá', currency: 'USD', symbol: '$', rate: 1 },
  { code: 'CO', name: 'Colombia', currency: 'COP', symbol: '$', rate: 4050 },
  { code: 'VE', name: 'Venezuela', currency: 'USD', symbol: '$', rate: 1 },
  { code: 'EC', name: 'Ecuador', currency: 'USD', symbol: '$', rate: 1 },
  { code: 'PE', name: 'Perú', currency: 'PEN', symbol: 'S/', rate: 3.72 },
  { code: 'BO', name: 'Bolivia', currency: 'BOB', symbol: 'Bs', rate: 6.91 },
  { code: 'CL', name: 'Chile', currency: 'CLP', symbol: '$', rate: 935 },
  { code: 'AR', name: 'Argentina', currency: 'ARS', symbol: '$', rate: 1290 },
  { code: 'PY', name: 'Paraguay', currency: 'PYG', symbol: '₲', rate: 7450 },
  { code: 'UY', name: 'Uruguay', currency: 'UYU', symbol: '$U', rate: 42.5 },
  { code: 'BR', name: 'Brasil', currency: 'BRL', symbol: 'R$', rate: 5.35 },
  { code: 'DO', name: 'Rep. Dominicana', currency: 'DOP', symbol: 'RD$', rate: 61.2 },
  { code: 'US', name: 'Estados Unidos', currency: 'USD', symbol: '$', rate: 1 },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_AGE = 18;

function calcAge(day: number, month: number, year: number): number {
  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

function isValidCalendarDate(day: number, month: number, year: number): boolean {
  if (!day || !month || !year) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}

export default function Register() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const register = useStore((s) => s.register);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [country, setCountry] = useState('HN');
  const [ageChecked, setAgeChecked] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const setUid = useStore((s) => s.setUid);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const cloudOn = isFirebaseConfigured();

  const monthRef = useRef<RNTextInput>(null);
  const yearRef = useRef<RNTextInput>(null);

  const clearErr = () => setErr(null);

  const submit = () => {
    if (name.trim().length < 3) { hError(); setErr(t('reg.errName')); return; }
    if (!EMAIL_RE.test(email.trim())) { hError(); setErr(t('reg.errEmail')); return; }
    if (phone.replace(/\D/g, '').length < 7) { hError(); setErr(t('reg.errPhone')); return; }
    if (cloudOn) {
      if (password.length < 6) { hError(); setErr(t('reg.errPass')); return; }
      if (password !== confirmPassword) { hError(); setErr(t('reg.errPassMatch')); return; }
    }

    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (!isValidCalendarDate(d, m, y) || y < 1900 || y > new Date().getFullYear()) {
      hError(); setErr(t('reg.errBirth')); return;
    }
    const age = calcAge(d, m, y);
    if (age < MIN_AGE) {
      hError(); setErr(t('reg.errAge')); return;
    }
    if (!ageChecked) {
      hError(); setErr(t('reg.errAgeCheck')); return;
    }

    const birthDate = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;

    runBusyAsync(async () => {
      if (cloudOn) {
        const res = await signUpCloud(email.trim().toLowerCase(), password);
        if (!res.ok) { hError(); setErr(res.msg ?? t('reg.errCloud')); return; }
        setUid(res.uid ?? null);
      }
      success();
      register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        birthDate,
        ageConfirmed: true,
        country,
      });
      router.replace('/onboarding');
    });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <CyberBackground />

        <View style={styles.brandRow}>
          <Logo size={30} glow />
          <GlitchText style={styles.brand}>SPORT KAPITAL</GlitchText>
        </View>

        {/* idioma: se elige desde el primer momento y aplica a toda la app */}
        <View style={styles.langRow}>
          {(['es', 'en'] as const).map((l) => (
            <Pressable key={l} onPress={() => { tap(); setLanguage(l); }} style={[styles.langChip, language === l && styles.langChipOn]}>
              <Text style={[styles.langTxt, language === l && styles.langTxtOn]}>{l === 'es' ? 'Español' : 'English'}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(400)}>
            <GlitchText style={styles.title}>{t('reg.title')}</GlitchText>
            <Text style={styles.subtitle}>
              {cloudOn ? t('reg.subtitleCloud') : t('reg.subtitleLocal')}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ marginTop: 24 }}>
            <Text style={styles.label}>{t('reg.name')}</Text>
            <View style={styles.inputBox}>
              <Icon name="user" size={17} color={colors.textTertiary} />
              <TextInput value={name} onChangeText={(v) => { setName(v); clearErr(); }} placeholder={t('reg.namePh')} placeholderTextColor={colors.textTertiary} style={styles.input} autoCapitalize="words" />
            </View>

            <Text style={styles.label}>{t('reg.email')}</Text>
            <View style={styles.inputBox}>
              <Icon name="news" size={17} color={colors.textTertiary} />
              <TextInput value={email} onChangeText={(v) => { setEmail(v); clearErr(); }} placeholder={t('reg.emailPh')} placeholderTextColor={colors.textTertiary} style={styles.input} autoCapitalize="none" keyboardType="email-address" />
            </View>

            <Text style={styles.label}>{t('reg.phone')}</Text>
            <View style={styles.inputBox}>
              <Icon name="bolt" size={17} color={colors.textTertiary} />
              <TextInput value={phone} onChangeText={(v) => { setPhone(v); clearErr(); }} placeholder="+504 9999 9999" placeholderTextColor={colors.textTertiary} style={styles.input} keyboardType="phone-pad" />
            </View>

            {cloudOn && (
              <>
                <Text style={styles.label}>{t('reg.password')}</Text>
                <View style={styles.inputBox}>
                  <Icon name="shield" size={17} color={colors.textTertiary} />
                  <TextInput value={password} onChangeText={(v) => { setPassword(v); clearErr(); }} placeholder={t('reg.passwordPh')} placeholderTextColor={colors.textTertiary} style={styles.input} secureTextEntry={!showPassword} autoCapitalize="none" />
                  <Pressable onPress={() => { tap(); setShowPassword((v) => !v); }} hitSlop={8}>
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textTertiary} />
                  </Pressable>
                </View>

                <Text style={styles.label}>{t('reg.confirm')}</Text>
                <View style={styles.inputBox}>
                  <Icon name="shield" size={17} color={colors.textTertiary} />
                  <TextInput value={confirmPassword} onChangeText={(v) => { setConfirmPassword(v); clearErr(); }} placeholder={t('reg.confirmPh')} placeholderTextColor={colors.textTertiary} style={styles.input} secureTextEntry={!showConfirmPassword} autoCapitalize="none" />
                  <Pressable onPress={() => { tap(); setShowConfirmPassword((v) => !v); }} hitSlop={8}>
                    <Icon name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color={colors.textTertiary} />
                  </Pressable>
                </View>
              </>
            )}

            <Text style={styles.label}>{t('reg.birth')}</Text>
            <View style={styles.dobRow}>
              <View style={[styles.inputBox, styles.dobBox]}>
                <TextInput
                  value={day}
                  onChangeText={(v) => { const c = v.replace(/\D/g, '').slice(0, 2); setDay(c); clearErr(); if (c.length === 2) monthRef.current?.focus(); }}
                  placeholder="DD" placeholderTextColor={colors.textTertiary} style={[styles.input, styles.dobInput]} keyboardType="number-pad" maxLength={2}
                />
              </View>
              <Text style={styles.dobSep}>/</Text>
              <View style={[styles.inputBox, styles.dobBox]}>
                <TextInput
                  ref={monthRef}
                  value={month}
                  onChangeText={(v) => { const c = v.replace(/\D/g, '').slice(0, 2); setMonth(c); clearErr(); if (c.length === 2) yearRef.current?.focus(); }}
                  placeholder="MM" placeholderTextColor={colors.textTertiary} style={[styles.input, styles.dobInput]} keyboardType="number-pad" maxLength={2}
                />
              </View>
              <Text style={styles.dobSep}>/</Text>
              <View style={[styles.inputBox, styles.dobBoxYear]}>
                <TextInput
                  ref={yearRef}
                  value={year}
                  onChangeText={(v) => { setYear(v.replace(/\D/g, '').slice(0, 4)); clearErr(); }}
                  placeholder="AAAA" placeholderTextColor={colors.textTertiary} style={[styles.input, styles.dobInput]} keyboardType="number-pad" maxLength={4}
                />
              </View>
            </View>

            <Text style={styles.label}>{t('reg.country')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {COUNTRIES.map((c) => (
                <Pressable key={c.code} onPress={() => { tap(); setCountry(c.code); }} style={[styles.chip, country === c.code && styles.chipOn]}>
                  <Text style={[styles.chipTxt, country === c.code && styles.chipTxtOn]}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable onPress={() => { tap(); setAgeChecked((v) => !v); clearErr(); }} style={styles.ageRow}>
              <View style={[styles.checkbox, ageChecked && styles.checkboxOn]}>
                {ageChecked && <Icon name="check" size={14} color="#03150B" strokeWidth={3} />}
              </View>
              <Text style={styles.ageLabel}>{t('reg.ageCheck')}</Text>
            </Pressable>

            {err && (
              <View style={styles.errRow}>
                <Icon name="alert" size={15} color={colors.loss} />
                <Text style={styles.errTxt}>{err}</Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        <View style={{ marginBottom: insets.bottom + 20 }}>
          <Button label={t('reg.submit')} onPress={submit} variant="gold" style={{ marginTop: 12 }} />
          {cloudOn && (
            <Pressable onPress={() => { tap(); router.push('/login'); }} style={{ marginTop: 14, alignItems: 'center' }}>
              <Text style={styles.loginLink}>{t('reg.haveAccount')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 },
  brand: { color: colors.text, fontSize: font.size.sm, letterSpacing: 3, fontFamily: font.family.headingBold },
  title: { color: colors.text, fontSize: font.size['3xl'], letterSpacing: 1, fontFamily: font.family.heading },
  langRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 },
  langChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  langChipOn: { backgroundColor: colors.goldDim, borderColor: colors.gold },
  langTxt: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700' },
  langTxtOn: { color: colors.gold },
  subtitle: { color: colors.textSecondary, fontSize: font.size.md, lineHeight: 22, marginTop: 8 },
  label: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700', marginBottom: 8, marginTop: 16 },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgCard, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.text, fontSize: font.size.md, height: 52, fontWeight: '600' },
  dobRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dobBox: { flex: 1 },
  dobBoxYear: { flex: 1.4 },
  dobInput: { textAlign: 'center' },
  dobSep: { color: colors.textTertiary, fontSize: font.size.lg, fontWeight: '700' },
  chip: { backgroundColor: colors.bgCard, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.goldDim, borderColor: colors.gold },
  chipTxt: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700' },
  chipTxtOn: { color: colors.gold },
  ageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 22 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  ageLabel: { color: colors.textSecondary, fontSize: font.size.sm, lineHeight: 20, flex: 1, fontWeight: '600' },
  ageBold: { color: colors.text, fontWeight: '800' },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  errTxt: { color: colors.loss, fontSize: font.size.sm, fontWeight: '600' },
  loginLink: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '600' },
  loginLinkBold: { color: colors.gold, fontWeight: '800' },
}));
