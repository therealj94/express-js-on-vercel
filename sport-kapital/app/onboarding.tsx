// app/onboarding.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, withDelay, Easing, runOnJS,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useStore, WELCOME_BONUS } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { Icon, IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { CyberBackground } from '@/components/CyberBackground';
import { GlitchText } from '@/components/GlitchText';
import { usdt } from '@/utils/format';
import { success, tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { PALETTES, THEME_KEYS, THEME_LABEL, type ThemeKey } from '@/theme/palettes';
import { ensureNotificationPermission } from '@/utils/notifications';

const SLIDES = (): { icon: IconName; accent: string; title: string; body: string }[] => [
  { icon: 'candle', accent: colors.gold, title: t('onb.s1t'), body: t('onb.s1b') },
  { icon: 'bolt', accent: colors.profit, title: t('onb.s2t'), body: t('onb.s2b') },
  { icon: 'chart', accent: colors.blue, title: t('onb.s3t'), body: t('onb.s3b') },
  { icon: 'shield', accent: colors.purple, title: t('onb.s4t'), body: t('onb.s4b') },
];

const PERSPECTIVE = 1000;

export default function Onboarding() {
  // el paso vive en el store (efímero): elegir un tema remonta toda la app y
  // un useState local volvería al paso 0 — así se retoma donde iba.
  const i = useStore((s) => s.onbStep);
  const setI = useStore((s) => s.setOnbStep);
  const [claiming, setClaiming] = useState(false);
  const router = useRouter();
  const claimBonus = useStore((s) => s.claimBonus);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const setNotifAsked = useStore((s) => s.setNotifAsked);
  const [notifBusy, setNotifBusy] = useState(false);
  const slides = SLIDES();
  const themeStep = slides.length;        // paso de elección de tema
  const notifStep = slides.length + 1;    // paso de activar notificaciones
  const bonusStep = slides.length + 2;    // paso del bono de bienvenida
  const isTheme = i === themeStep;
  const isNotif = i === notifStep;
  const isLast = i === bonusStep;

  const rotY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const goTo = (target: number) => {
    tap();
    rotY.value = withTiming(-55, { duration: 210, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) {
        runOnJS(setI)(target);
        rotY.value = 55;
        rotY.value = withSpring(0, { damping: 15, stiffness: 130 });
      }
    });
    opacity.value = withSequence(withTiming(0, { duration: 190 }), withDelay(60, withTiming(1, { duration: 260 })));
  };

  const slideStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ perspective: PERSPECTIVE }, { rotateY: `${rotY.value}deg` }],
  }));

  const claim = () => {
    setClaiming(true);
    success();
    claimBonus();
    setTimeout(() => { completeOnboarding(); router.replace('/risk'); }, 1500);
  };

  const enableNotifications = async () => {
    tap();
    setNotifBusy(true);
    await ensureNotificationPermission();
    setNotifBusy(false);
    setNotifAsked();
    goTo(bonusStep);
  };
  const skipNotifications = () => { tap(); setNotifAsked(); goTo(bonusStep); };

  return (
    <View style={styles.container}>
      <CyberBackground />

      <View style={styles.brandRow}>
        <Logo size={26} glow />
        <GlitchText style={styles.brand}>SPORT KAPITAL</GlitchText>
      </View>

      <View style={styles.dots}>
        {[...slides, 'theme', 'notif', 'bonus'].map((_, idx) => (
          <View key={idx} style={[styles.dot, idx === i && styles.dotActive]} />
        ))}
      </View>

      {isLast ? (
        <BonusScreen claiming={claiming} />
      ) : isTheme ? (
        <ThemePicker />
      ) : isNotif ? (
        <NotifScreen />
      ) : (
        <Animated.View style={[styles.slide, slideStyle]}>
          <View style={[styles.iconWrap, { borderColor: slides[i].accent, shadowColor: slides[i].accent }]}>
            <Icon name={slides[i].icon} size={42} color={slides[i].accent} />
          </View>
          <GlitchText style={styles.title}>{slides[i].title}</GlitchText>
          <Text style={styles.body}>{slides[i].body}</Text>
        </Animated.View>
      )}

      <View style={styles.footer}>
        {isLast ? (
          <Button label={claiming ? t('onb.claimed') : t('onb.claim', { amount: usdt(WELCOME_BONUS, 0) })} onPress={claim} variant="success" disabled={claiming} />
        ) : isNotif ? (
          <>
            <Button label={notifBusy ? t('common.loading') : t('onb.notifEnable')} onPress={enableNotifications} variant="gold" disabled={notifBusy} />
            <Pressable onPress={skipNotifications} style={styles.skip}>
              <Text style={styles.skipTxt}>{t('onb.notifSkip')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Button label={t('common.continue')} onPress={() => goTo(i + 1)} variant="gold" />
            {!isTheme && (
              <Pressable onPress={() => goTo(themeStep)} style={styles.skip}>
                <Text style={styles.skipTxt}>{t('onb.skipTour')}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function ThemePicker() {
  const themeKey = useStore((s) => s.themeKey);
  const setTheme = useStore((s) => s.setTheme);
  return (
    <Animated.View entering={FadeIn} style={styles.slide}>
      <GlitchText style={styles.title}>{t('onb.themeT')}</GlitchText>
      <Text style={[styles.body, { marginBottom: 22 }]}>{t('onb.themeB')}</Text>
      <View style={styles.themeGrid}>
        {THEME_KEYS.map((k: ThemeKey) => {
          const pal = PALETTES[k];
          const active = themeKey === k;
          return (
            <Pressable
              key={k}
              onPress={() => { tap(); setTheme(k); }}
              style={[styles.themeCard, { backgroundColor: pal.bgCard, borderColor: active ? pal.gold : pal.border }]}
            >
              <View style={styles.themeDots}>
                <View style={[styles.themeDot, { backgroundColor: pal.profit }]} />
                <View style={[styles.themeDot, { backgroundColor: pal.gold }]} />
                <View style={[styles.themeDot, { backgroundColor: pal.blue }]} />
              </View>
              <Text style={[styles.themeName, { color: pal.text }]}>{THEME_LABEL[k][useStore.getState().language]}</Text>
              <Text style={[styles.themePrice, { color: pal.profit }]}>$127.40 ▲</Text>
              {active && <View style={[styles.themeCheck, { backgroundColor: pal.gold }]}><Icon name="check" size={12} color={pal.bgCard} strokeWidth={3} /></View>}
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

function NotifScreen() {
  return (
    <Animated.View entering={FadeIn} style={styles.slide}>
      <View style={[styles.iconWrap, { borderColor: colors.gold, shadowColor: colors.gold }]}>
        <Icon name="bell" size={42} color={colors.gold} />
      </View>
      <GlitchText style={styles.title}>{t('onb.notifT')}</GlitchText>
      <Text style={styles.body}>{t('onb.notifB')}</Text>
    </Animated.View>
  );
}

function BonusScreen({ claiming }: { claiming: boolean }) {
  const scale = useSharedValue(0.8);
  const rot = useSharedValue(40);
  const glow = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 9 });
    rot.value = withSpring(0, { damping: 12 });
    glow.value = withSequence(withTiming(0.7, { duration: 900 }), withDelay(200, withTiming(0.35, { duration: 900 })));
  }, []);
  useEffect(() => {
    if (claiming) scale.value = withSequence(withSpring(1.15, { damping: 6 }), withSpring(1));
  }, [claiming]);

  const coinStyle = useAnimatedStyle(() => ({ transform: [{ perspective: PERSPECTIVE }, { rotateY: `${rot.value}deg` }, { scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <Animated.View entering={FadeIn} style={styles.slide}>
      <Animated.View style={[styles.bonusGlow, glowStyle]} />
      <Animated.View style={[styles.coin, coinStyle]}>
        <Text style={styles.coinTxt}>{WELCOME_BONUS}</Text>
        <Text style={styles.coinSub}>USDT</Text>
      </Animated.View>
      <GlitchText style={styles.title}>{t('onb.bonusT')}</GlitchText>
      <Text style={styles.body}>{t('onb.bonusBody', { amount: usdt(WELCOME_BONUS, 0) })}</Text>
    </Animated.View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl, paddingTop: 72, paddingBottom: 48 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 28 },
  brand: { color: colors.text, fontSize: font.size.sm, letterSpacing: 3, fontFamily: font.family.headingBold },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 30 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bgCardHover },
  dotActive: { backgroundColor: colors.gold, width: 22 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 96, height: 96, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard, marginBottom: 30, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  title: { color: colors.text, fontSize: font.size['2xl'], textAlign: 'center', marginBottom: 16, fontFamily: font.family.heading, textTransform: 'uppercase', letterSpacing: 1 },
  body: { color: colors.textSecondary, fontSize: font.size.lg, textAlign: 'center', lineHeight: 26, paddingHorizontal: 8 },
  footer: { gap: 12 },
  skip: { alignSelf: 'center', padding: 10 },
  skipTxt: { color: colors.textTertiary, fontSize: font.size.md, fontWeight: '600' },
  coin: { width: 160, height: 160, borderRadius: 80, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 32, shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
  coinTxt: { color: '#1A1500', fontSize: 52, fontWeight: '900' },
  coinSub: { color: '#1A1500', fontSize: font.size.lg, fontWeight: '800', marginTop: -6 },
  bonusGlow: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: colors.gold, top: '18%' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  themeCard: { width: '45%', borderRadius: radius.lg, borderWidth: 2, padding: 16, alignItems: 'flex-start', gap: 8 },
  themeDots: { flexDirection: 'row', gap: 5 },
  themeDot: { width: 12, height: 12, borderRadius: 6 },
  themeName: { fontSize: font.size.md, fontWeight: '800' },
  themePrice: { fontSize: font.size.sm, fontWeight: '800' },
  themeCheck: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
}));
