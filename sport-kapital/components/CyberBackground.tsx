// components/CyberBackground.tsx
// Fondo cyberpunk: vacío digital + grilla de circuito + nebulosas de neón (verde/magenta)
// + partículas de datos parpadeando. Reemplaza el fondo "espacial" anterior.
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg';
import { colors, getPalette, themedSheet, type Palette } from '@/theme/tokens';

interface DotSpec { x: number; y: number; size: number; baseOpacity: number; animate: boolean; delay: number; duration: number }

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function Dot({ spec }: { spec: DotSpec }) {
  const opacity = useSharedValue(spec.baseOpacity);

  useEffect(() => {
    if (!spec.animate) return;
    opacity.value = withDelay(
      spec.delay,
      withRepeat(
        withSequence(
          withTiming(spec.baseOpacity * 0.15, { duration: spec.duration }),
          withTiming(spec.baseOpacity, { duration: spec.duration })
        ),
        -1,
        true
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: spec.animate ? opacity.value : spec.baseOpacity }));

  return (
    <Animated.View
      style={[
        styles.dot,
        style,
        { left: `${spec.x}%`, top: `${spec.y}%`, width: spec.size, height: spec.size, borderRadius: spec.size },
      ]}
    />
  );
}

function DataParticles({ count = 34, animatedCount = 12 }: { count?: number; animatedCount?: number }) {
  const dots = useMemo<DotSpec[]>(() => {
    const rnd = seeded(count * 7919 + animatedCount);
    return Array.from({ length: count }).map((_, i) => ({
      x: rnd() * 100,
      y: rnd() * 100,
      size: 1 + rnd() * 2,
      baseOpacity: 0.15 + rnd() * 0.35,
      animate: i < animatedCount,
      delay: rnd() * 2400,
      duration: 1400 + rnd() * 1800,
    }));
  }, [count, animatedCount]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dots.map((d, i) => <Dot key={i} spec={d} />)}
    </View>
  );
}

/** Grilla tipo PCB/blueprint, muy tenue. */
function CircuitGrid({ width, height, opacity = 0.05 }: { width: number; height: number; opacity?: number }) {
  const step = 34;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="circuit" width={step} height={step} patternUnits="userSpaceOnUse">
          <Path d={`M ${step} 0 L 0 0 0 ${step}`} stroke={colors.profit} strokeWidth={1} fill="none" opacity={opacity} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#circuit)" />
    </Svg>
  );
}

/** Convierte #RRGGBB a rgba con la opacidad dada (para halos por tema). */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function CyberBackground({ variant = 'default' }: { variant?: 'default' | 'subtle' }) {
  const { width, height } = useWindowDimensions();
  const subtle = variant === 'subtle';
  const p = getPalette();

  // Fondo ambiental por tema: gradiente, grilla, halos y partículas salen de
  // la paleta activa. En el tema claro la decoración se reduce casi a cero.
  const gridOpacity = p.dark ? (subtle ? 0.02 : 0.032) : 0.05;
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <LinearGradient colors={p.bgGradient} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />

      <CircuitGrid width={width} height={height} opacity={gridOpacity} />

      {p.dark && (
        <>
          <LinearGradient
            colors={[withAlpha(p.profit, subtle ? 0.05 : 0.08), withAlpha(p.profit, 0)]}
            style={[styles.orb, { width: width * 0.9, height: width * 0.9, borderRadius: width * 0.45, top: -width * 0.4, right: -width * 0.35 }]}
          />
          <LinearGradient
            colors={[withAlpha(p.gold, subtle ? 0.04 : 0.07), withAlpha(p.gold, 0)]}
            style={[styles.orb, { width, height: width, borderRadius: width * 0.5, bottom: -width * 0.5, left: -width * 0.4 }]}
          />
          <DataParticles count={subtle ? 8 : 14} animatedCount={subtle ? 3 : 5} />
        </>
      )}
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  clip: { overflow: 'hidden' },
  dot: { position: 'absolute', backgroundColor: colors.profit },
  orb: { position: 'absolute' },
}));
