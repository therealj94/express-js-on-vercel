// components/BrandIntro.tsx
// Intro de arranque, corta y silenciosa: el logo entra con un leve glow, aparece
// el wordmark SPORT KAPITAL y el slogan "Ya no se apuesta. Se invierte." se revela
// palabra por palabra. SIN música ni sonido — la música de fondo arranca ya dentro
// de la app, no aquí. Es la única pantalla con el efecto glitch (en el wordmark).
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, ZoomIn,
  useAnimatedStyle, useSharedValue, withTiming, Easing,
} from 'react-native-reanimated';
import { colors, font, themedSheet, type Palette } from '@/theme/tokens';
import { Logo } from '@/components/Logo';
import { CyberBackground } from '@/components/CyberBackground';
import { GlitchText } from '@/components/GlitchText';
import { t } from '@/utils/i18n';

// el slogan sale del diccionario (es/en) y se parte en palabras para revelarse
const LINE_1 = () => t('intro.slogan1').split(' ');
const LINE_2 = () => t('intro.slogan2').split(' ');

const WORD_STEP = 95;
const LINE1_START = 620;
const LINE2_START = () => LINE1_START + LINE_1().length * WORD_STEP + 180;

export function BrandIntro() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.cubic) });
  }, []);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={styles.container}>
      <CyberBackground />

      <View style={styles.center}>
        <Animated.View entering={ZoomIn.springify().damping(14).delay(60)}>
          <Logo size={92} glow />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(520).delay(240)} style={styles.wordmarkWrap}>
          <GlitchText glitch animated style={styles.wordmark}>SPORT KAPITAL</GlitchText>
        </Animated.View>

        <View style={styles.slogan}>
          <View style={styles.sloganLine}>
            {LINE_1().map((w, i) => (
              <Animated.Text key={w + i} entering={FadeInUp.duration(420).delay(LINE1_START + i * WORD_STEP)} style={styles.sloganMuted}>
                {w}{' '}
              </Animated.Text>
            ))}
          </View>
          <View style={styles.sloganLine}>
            {LINE_2().map((w, i) => (
              <Animated.Text key={w + i} entering={FadeInUp.duration(460).delay(LINE2_START() + i * WORD_STEP)} style={styles.sloganStrong}>
                {w}{' '}
              </Animated.Text>
            ))}
          </View>
        </View>
      </View>

      <Animated.View entering={FadeIn.duration(600).delay(400)} style={styles.barTrack}>
        <Animated.View style={[styles.barFill, barStyle]} />
      </Animated.View>
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingHorizontal: 32 },
  wordmarkWrap: { marginTop: 22 },
  wordmark: { color: colors.text, fontSize: font.size.xl, letterSpacing: 4, textAlign: 'center' },
  slogan: { marginTop: 26, alignItems: 'center' },
  sloganLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  sloganMuted: { color: colors.textSecondary, fontSize: font.size.md, fontFamily: font.family.bodyMedium, letterSpacing: 0.5 },
  sloganStrong: { color: colors.profit, fontSize: font.size.lg, fontFamily: font.family.headingBold, letterSpacing: 1 },
  barTrack: { position: 'absolute', bottom: 72, width: 148, height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: colors.gold },
}));
