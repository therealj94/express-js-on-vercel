import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, RadialGradient, Stop, Defs } from 'react-native-svg';
import { Audio } from 'expo-av';
import { C } from '../theme';
import { Logo } from '../ui';

export default function Splash({ nav }) {
  const scale = useRef(new Animated.Value(0.55)).current;
  const op = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(16)).current;
  const textOp = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let sound;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: s } = await Audio.Sound.createAsync(require('../../assets/click.wav'), { volume: 0.9 });
        sound = s;
        setTimeout(() => { s.replayAsync().catch(() => {}); }, 560);
      } catch (e) {}
    })();

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
    Animated.timing(prog, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();

    const t = setTimeout(() => nav.go('auth'), 3300);
    return () => { clearTimeout(t); if (sound) sound.unloadAsync().catch(() => {}); };
  }, []);

  const spin = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spinBack = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });
  const popScale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const popOp = pop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] });
  const width = prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <LinearGradient colors={['#0A2F31', '#031517', '#010B0C']} style={styles.wrap}>
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
            <Logo size={176} />
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: textOp, transform: [{ translateY: textY }], alignItems: 'center', marginTop: 10 }}>
          <Text style={styles.brand}>veta <Text style={styles.brandItalic}>wallet</Text></Text>
          <Text style={styles.tag}>ORDEN GLOBAL</Text>
        </Animated.View>

        <View style={styles.progTrack}>
          <Animated.View style={{ width }}>
            <LinearGradient colors={['#F8EFCF', '#C9A961']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.progFill} />
          </Animated.View>
        </View>
        <Text style={styles.loading}>Cargando tu billetera…</Text>
      </View>
    </LinearGradient>
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
});
