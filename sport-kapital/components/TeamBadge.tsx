// components/TeamBadge.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export function TeamBadge({ short, color, color2, size = 44 }: { short: string; color: string; color2: string; size?: number }) {
  const c1 = color === '#FFFFFF' ? '#8B95A5' : color;
  const c2 = color2 === '#FFFFFF' ? '#5C6470' : color2;
  return (
    <View style={{ width: size, height: size * 1.08, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size * 1.08} viewBox="0 0 44 48">
        <Defs>
          <LinearGradient id={`g${short}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c1} />
            <Stop offset="1" stopColor={c2} />
          </LinearGradient>
        </Defs>
        <Path d="M22 1 41 7v15c0 12-8 20-19 25C11 42 3 34 3 22V7L22 1z" fill={`url(#g${short})`} stroke="rgba(255,255,255,0.25)" strokeWidth="1.4" />
      </Svg>
      <Text style={[styles.short, { fontSize: size * 0.28 }]}>{short}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  short: { position: 'absolute', color: '#FFFFFF', fontWeight: '900', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
});
