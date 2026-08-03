// components/GlitchText.tsx
// Titular de marca. Por defecto se dibuja limpio (una sola capa, tipografía
// Orbitron) — el look "pro" que pidió el usuario. El efecto de aberración
// cromática (RGB split) quedó reservado SOLO para la intro de la app, y se
// activa pasando glitch=true. Así todos los títulos de las pantallas se ven
// limpios sin tener que tocar cada archivo.
import React, { useEffect } from 'react';
import { Text, View, StyleSheet, TextStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors, font } from '@/theme/tokens';

interface Props {
  children: string;
  style?: StyleProp<TextStyle>;
  color?: string;
  /** Reservado para la intro: activa el split RGB magenta/cian detrás del texto. */
  glitch?: boolean;
  /** Solo tiene efecto junto con glitch: hace que el split "titile" cada pocos segundos. */
  animated?: boolean;
}

export function GlitchText({ children, style, color = colors.text, glitch = false, animated = false }: Props) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!glitch || !animated) return;
    const fire = () => { pulse.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 130 })); };
    fire();
    const id = setInterval(fire, 3200 + Math.random() * 1800);
    return () => clearInterval(id);
  }, [glitch, animated]);

  const magentaStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.4,
    transform: [{ translateX: -1.4 - pulse.value * 2.4 }],
  }));
  const cyanStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.4,
    transform: [{ translateX: 1.4 + pulse.value * 2.4 }],
  }));

  // camino limpio (por defecto): un solo Text, sin capas de color detrás.
  if (!glitch) {
    return <Text style={[styles.base, { color }, style]}>{children}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Animated.Text style={[styles.base, styles.layer, { color: colors.gold }, style, magentaStyle]}>{children}</Animated.Text>
      <Animated.Text style={[styles.base, styles.layer, { color: colors.blue }, style, cyanStyle]}>{children}</Animated.Text>
      <Text style={[styles.base, { color }, style]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  base: { fontFamily: font.family.heading },
  layer: { position: 'absolute', top: 0, left: 0, right: 0 },
});
