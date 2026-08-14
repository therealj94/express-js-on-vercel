// Piezas pequeñas que se repiten. Nada listo-de-catálogo: vidrio oscuro y
// oro, como el resto de la casa.
import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from './theme';

export function BotonOro({ children, onPress, sec, style }) {
  const esc = useRef(new Animated.Value(1)).current;
  const apretar = (a) => Animated.spring(esc, { toValue: a ? 0.96 : 1, useNativeDriver: true, speed: 40 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={() => apretar(1)} onPressOut={() => apretar(0)}>
      <Animated.View style={{ transform: [{ scale: esc }] }}>
        {sec ? (
          <View style={[s.btn, s.btnSec, style]}><Text style={s.btnSecTxt}>{children}</Text></View>
        ) : (
          <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btn, style]}>
            <Text style={s.btnTxt}>{children}</Text>
          </LinearGradient>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function Tarjeta({ children, style }) {
  return <View style={[s.tarjeta, style]}>{children}</View>;
}

export function Etiqueta({ children, style }) {
  return <Text style={[s.eti, style]}>{children}</Text>;
}

// Aparece flotando desde abajo, una sola vez al montar. Es LA transición de
// la app: barata (useNativeDriver) y suficiente para que nada "salte" seco.
export function Entra({ children, delay = 0, style }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 420, delay, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[{
      opacity: a,
      transform: [
        { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
        { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
      ],
    }, style]}>
      {children}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  btn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  btnTxt: { color: C.darkText, fontWeight: '800', fontSize: 12, letterSpacing: 2 },
  btnSec: { borderWidth: 1, borderColor: C.line, backgroundColor: 'transparent' },
  btnSecTxt: { color: C.txt2, fontWeight: '700', fontSize: 12, letterSpacing: 2 },
  tarjeta: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 16 },
  eti: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 3, marginBottom: 8 },
});
