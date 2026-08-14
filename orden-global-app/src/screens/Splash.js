// La entrada: el monograma OG respirando sobre el verde de la casa, con dos
// anillos de oro que se abren. Dura lo que tarda en saberse si hay sesión
// guardada — no es un adorno con temporizador, es una espera con cara.
import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';

export default function Splash() {
  const alma = useRef(new Animated.Value(0)).current;
  const anillo1 = useRef(new Animated.Value(0)).current;
  const anillo2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(alma, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const onda = (v, delay) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])).start();
    onda(anillo1, 0); onda(anillo2, 1100);
  }, []);

  const anillo = (v) => ({
    opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.1] }) }],
  });

  return (
    <LinearGradient colors={G.pantalla} style={s.todo}>
      <View style={s.centro}>
        <Animated.View style={[s.anillo, anillo(anillo1)]} />
        <Animated.View style={[s.anillo, anillo(anillo2)]} />
        <Animated.Image
          source={require('../../assets/og.png')}
          style={[s.logo, {
            opacity: alma,
            transform: [{ scale: alma.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }]}
          resizeMode="contain"
        />
      </View>
      <Animated.View style={{ opacity: alma }}>
        <Text style={s.nombre}>ORDEN GLOBAL</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  todo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centro: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  anillo: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1.5, borderColor: C.gold },
  logo: { width: 170, height: 120 },
  nombre: { color: C.txt2, fontSize: 12, letterSpacing: 6, marginTop: 26, fontWeight: '600' },
});
