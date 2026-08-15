import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, RadialGradient, Stop, Defs } from 'react-native-svg';
import { C, F } from '../theme';
import { Image } from 'react-native';
import { Logo, useAccount, AppBackground, BG_SPLASH } from '../ui';
import { useT } from '../i18n';
import { useFuenteDisplay } from '../fuentes';
import { versionLabel } from '../version';

export default function Splash({ nav }) {
  // `ready` la pone la raíz cuando loadSession TERMINÓ: la ruta se decide con
  // la sesión en la mano, nunca con un timer que le apueste a que ya cargó.
  const { account, ready } = useAccount();
  const t = useT();
  const fuente = useFuenteDisplay();
  const scale = useRef(new Animated.Value(0.55)).current;
  const op = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(16)).current;
  const textOp = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [esperaLista, setEsperaLista] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 5, bounciness: 11 }),
      Animated.timing(op, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]).start();
    // destello al aparecer (sincronizado con el click)
    Animated.sequence([
      Animated.delay(520),
      Animated.timing(pop, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(pop, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start();
    Animated.loop(Animated.timing(ring, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1500, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ])).start();
    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(textOp, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(textY, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    ]).start();
    // La barra sigue el progreso REAL. Antes era un timer fijo de 3.3s: la
    // barra (2.6s) llegaba al 100% y se quedaba llena ~700ms —se leía como
    // cuelgue—, cada apertura costaba 3.3s aun con sesión, y si loadSession
    // tardaba más que el timer, un usuario CON sesión caía al login. Ahora
    // avanza casi entera durante la espera mínima y, si la sesión aún no
    // está, sigue arrastrándose despacio: movimiento lento dice «trabajando»,
    // barra llena parada dice «colgado».
    Animated.timing(prog, { toValue: 0.82, duration: 1450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (finished) Animated.timing(prog, { toValue: 0.96, duration: 5000, easing: Easing.linear, useNativeDriver: false }).start();
    });
    // Espera mínima de cortesía para que el lockup respire; con la sesión ya
    // cargada no se paga ni un segundo más que esto.
    const tm = setTimeout(() => setEsperaLista(true), 1600);
    return () => clearTimeout(tm);
  }, []);

  // Se navega cuando las DOS cosas están: sesión cargada Y espera mínima
  // (el Promise.all de este arranque, escrito con estados).
  const fue = useRef(false);
  useEffect(() => {
    if (!esperaLista || !ready || fue.current) return;
    fue.current = true;
    prog.stopAnimation(() => {
      Animated.timing(prog, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => {
        nav.go(account ? 'ecosistema' : 'auth');
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperaLista, ready, account]);

  const spin = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spinBack = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });
  const popScale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const popOp = pop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] });
  const width = prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <AppBackground intensity="hero" image={BG_SPLASH} style={styles.wrap}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 250, height: 250, alignItems: 'center', justifyContent: 'center' }}>
          {/* glow radial suave */}
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: glowOp }]} pointerEvents="none">
            <Svg width={250} height={250}>
              <Defs>
                <RadialGradient id="g" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#F3D98C" stopOpacity="0.9" />
                  <Stop offset="0.45" stopColor="#C9A961" stopOpacity="0.35" />
                  <Stop offset="1" stopColor="#C9A961" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={125} cy={125} r={125} fill="url(#g)" />
            </Svg>
          </Animated.View>
          {/* destello del click */}
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: popOp, transform: [{ scale: popScale }] }]} pointerEvents="none">
            <View style={styles.flash} />
          </Animated.View>

          <Animated.View style={[styles.ringBox, { transform: [{ rotate: spin }] }]}>
            <Svg width={244} height={244}><Circle cx={122} cy={122} r={119} stroke="rgba(201,169,97,0.28)" strokeWidth={1} strokeDasharray="4 10" fill="none" /></Svg>
          </Animated.View>
          <Animated.View style={[styles.ringBox, { transform: [{ rotate: spinBack }] }]}>
            <Svg width={200} height={200}><Circle cx={100} cy={100} r={97} stroke="rgba(30,140,116,0.4)" strokeWidth={1} strokeDasharray="2 14" fill="none" /></Svg>
          </Animated.View>

          <Animated.View style={[styles.logoShadow, { opacity: op, transform: [{ scale }] }]}>
            <Image source={require('../../assets/og-logo.png')} style={{ width: 176, height: 121 }} resizeMode="contain" />
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: textOp, transform: [{ translateY: textY }], alignItems: 'center', marginTop: 10 }}>
          {/* El lockup con la fuente de display cuando está lista (Cinzel no
              trae itálica ni pesos sintéticos en Android: se neutralizan).
              El lema y el «cargando» pasan por i18n como el resto de la app:
              la primera pantalla no puede ser la única que mezcle idiomas. */}
          <Text style={[styles.brand, fuente && { fontFamily: F.h, fontWeight: 'normal' }]}>
            ORDEN <Text style={[styles.brandItalic, fuente && { fontFamily: F.h, fontWeight: 'normal', fontStyle: 'normal' }]}>GLOBAL</Text>
          </Text>
          <Text style={styles.tag}>{t('brand.tag')}</Text>
        </Animated.View>

        <View style={styles.progTrack}>
          <Animated.View style={{ width }}>
            <LinearGradient colors={['#F8EFCF', '#C9A961']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.progFill} />
          </Animated.View>
        </View>
        <Text style={styles.loading}>{t('splash.loading')}</Text>
        <Text style={styles.ver}>{versionLabel()}</Text>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  flash: { width: 120, height: 120, borderRadius: 80, backgroundColor: '#FBEFC8' },
  logoShadow: { shadowColor: '#C9A961', shadowOpacity: 0.55, shadowRadius: 26, shadowOffset: { width: 0, height: 0 }, elevation: 20 },
  brand: { fontSize: 34, fontWeight: '800', color: '#EAD79C', letterSpacing: 1.5 },
  brandItalic: { fontWeight: '300', fontStyle: 'italic', color: '#C9A961' },
  tag: { color: C.txt2, fontSize: 11, letterSpacing: 5, marginTop: 6 },
  progTrack: { width: 130, height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 26 },
  progFill: { height: 3, borderRadius: 3 },
  loading: { color: C.txt3, fontSize: 12, marginTop: 12 },
  ver: { color: 'rgba(243,236,217,0.4)', fontSize: 10.5, marginTop: 8, letterSpacing: 0.6 },
});
