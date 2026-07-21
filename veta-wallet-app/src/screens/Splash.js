import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { C } from '../theme';
import { Logo } from '../ui';

export default function Splash({ nav }) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const op = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(14)).current;
  const textOp = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 6, bounciness: 9 }),
      Animated.timing(op, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();
    Animated.loop(Animated.timing(ring, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: true }),
    ])).start();
    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(textOp, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(textY, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    ]).start();
    Animated.timing(prog, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
    const t = setTimeout(() => nav.go('auth'), 3200);
    return () => clearTimeout(t);
  }, []);

  const spin = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spinBack = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] });
  const width = prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <LinearGradient colors={['#0A2F31', '#031517', '#010B0C']} style={styles.wrap}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 230, height: 230, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: glowOp }]}>
            <View style={styles.glow} />
          </Animated.View>
          <Animated.View style={[styles.ringBox, { transform: [{ rotate: spin }] }]}>
            <Svg width={230} height={230}><Circle cx={115} cy={115} r={112} stroke="rgba(201,169,97,0.22)" strokeWidth={1} strokeDasharray="4 10" fill="none" /></Svg>
          </Animated.View>
          <Animated.View style={[styles.ringBox, { transform: [{ rotate: spinBack }] }]}>
            <Svg width={190} height={190}><Circle cx={95} cy={95} r={92} stroke="rgba(30,140,116,0.35)" strokeWidth={1} strokeDasharray="2 14" fill="none" /></Svg>
          </Animated.View>
          <Animated.View style={{ opacity: op, transform: [{ scale }] }}>
            <Logo size={150} />
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: textOp, transform: [{ translateY: textY }], alignItems: 'center', marginTop: 14 }}>
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
  glow: { width: 150, height: 150, borderRadius: 100, backgroundColor: '#C9A961' },
  brand: { fontSize: 33, fontWeight: '800', color: '#EAD79C', letterSpacing: 1.5 },
  brandItalic: { fontWeight: '300', fontStyle: 'italic', color: '#C9A961' },
  tag: { color: C.txt2, fontSize: 11, letterSpacing: 5, marginTop: 6 },
  progTrack: { width: 130, height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 26 },
  progFill: { height: 3, borderRadius: 3 },
  loading: { color: C.txt3, fontSize: 12, marginTop: 12 },
});
