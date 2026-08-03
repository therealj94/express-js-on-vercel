// components/Panel.tsx
// Panel HUD con esquinas achaflanadas — reemplaza las cards redondeadas por el
// look "blueprint técnico" del sistema cyberpunk. El fondo/borde se dibuja en SVG
// midiendo el propio layout, así funciona con cualquier tamaño de contenido.
import React, { useState } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, LayoutChangeEvent } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { colors, neon } from '@/theme/tokens';
import { chamferPoints } from '@/utils/chamfer';

interface Props {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fill?: string;
  borderColor?: string;
  borderWidth?: number;
  cut?: number;
  glow?: boolean;
}

export function Panel({
  children, style, fill = colors.bgCard, borderColor = colors.border, borderWidth = 1, cut = 10, glow = false,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  return (
    <View onLayout={onLayout} style={[styles.wrap, glow && neon(borderColor, 'sm'), style]}>
      {size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polygon points={chamferPoints(size.w, size.h, cut)} fill={fill} stroke={borderColor} strokeWidth={borderWidth} />
        </Svg>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
});
