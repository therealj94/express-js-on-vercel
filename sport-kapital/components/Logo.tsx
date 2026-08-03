// components/Logo.tsx
import React from 'react';
import { Image, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, themedSheet, type Palette } from '@/theme/tokens';

const SRC = require('@/assets/logo-mark.png');

export function Logo({ size = 32, glow = false, style }: { size?: number; glow?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          shadowOpacity: glow ? 0.55 : 0,
          shadowRadius: size * 0.6,
        },
        style,
      ]}
    >
      <Image source={SRC} style={{ width: size, height: size, borderRadius: size * 0.28 }} resizeMode="cover" />
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  wrap: {
    overflow: 'visible',
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
  },
}));
