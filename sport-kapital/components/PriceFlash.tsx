// components/PriceFlash.tsx
// El precio destella verde al subir y rojo al bajar, como en un exchange real.
import React, { useEffect, useRef } from 'react';
import { TextStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors } from '@/theme/tokens';

export function PriceFlash({ value, format, style, baseColor = colors.text }: {
  value: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
  baseColor?: string;
}) {
  const prev = useRef(value);
  const flash = useSharedValue(0); // 0 neutro, 1 sube, -1 baja

  useEffect(() => {
    if (value > prev.current) flash.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 650 }));
    else if (value < prev.current) flash.value = withSequence(withTiming(-1, { duration: 80 }), withTiming(0, { duration: 650 }));
    prev.current = value;
  }, [value]);

  // los worklets no pueden leer el Proxy del tema: se copian los colores a
  // valores planos en cada render (cambian junto con el tema).
  const cProfit = colors.profit;
  const cLoss = colors.loss;

  // en reposo vuelve a baseColor explícitamente: dejar `color` en undefined aquí
  // pisa el color del `style` recibido y el texto cae al negro por defecto de RN.
  const aStyle = useAnimatedStyle(() => ({
    color: flash.value > 0.05 ? cProfit : flash.value < -0.05 ? cLoss : baseColor,
  }));

  return (
    <Animated.Text style={[style, aStyle]}>
      {format ? format(value) : value.toFixed(2)}
    </Animated.Text>
  );
}
