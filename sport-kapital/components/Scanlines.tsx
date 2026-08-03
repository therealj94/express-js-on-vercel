// components/Scanlines.tsx
// Overlay de líneas de escaneo estilo CRT — se monta una sola vez en la raíz de
// la app y cubre todas las pantallas por igual. No intercepta toques.
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { getPalette } from '@/theme/tokens';

// Antes cubría toda la app con líneas CRT bien marcadas (0.05). El usuario
// pidió bajarlas "al mínimo" — se dejan como una textura casi imperceptible
// (y con líneas más separadas) para que no ensucien la lectura de precios.
export function Scanlines({ opacity = 0.018 }: { opacity?: number }) {
  const { width, height } = useWindowDimensions();
  // en el tema claro las líneas CRT ensucian el blanco: no se dibujan
  if (!getPalette().dark) return null;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="scanlines" width={6} height={6} patternUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={6} height={2} fill="#000000" opacity={opacity} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#scanlines)" />
    </Svg>
  );
}
