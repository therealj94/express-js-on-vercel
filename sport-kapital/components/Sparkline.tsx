// components/Sparkline.tsx
import React from 'react';
import Svg, { Polyline, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';
import { colors } from '@/theme/tokens';

export function Sparkline({ data, width = 72, height = 34, up }: { data: number[]; width?: number; height?: number; up: boolean }) {
  if (!data || data.length < 2) return <Svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`);
  const color = up ? colors.profit : colors.loss;
  const areaPts = `${pts.join(' ')} ${width},${height} 0,${height}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`g-${up}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Polygon points={areaPts} fill={`url(#g-${up})`} />
      <Polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
