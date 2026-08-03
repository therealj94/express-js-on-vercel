// components/Button.tsx
import React, { useState } from 'react';
import { Text, StyleSheet, Pressable, ActivityIndicator, ViewStyle, StyleProp, LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';
import { colors, font, neon, themedSheet, type Palette } from '@/theme/tokens';
import { chamferPoints } from '@/utils/chamfer';
import { press } from '@/utils/haptics';

type Variant = 'primary' | 'success' | 'danger' | 'gold' | 'ghost';

// se calculan por render (no a nivel de módulo) para que sigan al tema activo
const getBG = (): Record<Variant, string> => ({
  primary: colors.blue, success: colors.profit, danger: colors.loss, gold: colors.gold, ghost: 'transparent',
});
const getFG = (): Record<Variant, string> => ({
  primary: '#001018', success: '#012410', danger: '#1A0006', gold: '#14000F', ghost: colors.text,
});

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const solid = variant !== 'ghost';
  const BG = getBG();
  const FG = getFG();

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  return (
    <Animated.View style={[aStyle, style, solid && !disabled && neon(BG[variant], 'sm')]}>
      <Pressable
        onLayout={onLayout}
        onPress={() => { if (!disabled && !loading) { press(); onPress(); } }}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
        style={[styles.btn, variant === 'ghost' && styles.ghostBorder, disabled && { opacity: 0.4 }]}
      >
        {size.w > 0 && size.h > 0 && solid && (
          <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Polygon points={chamferPoints(size.w, size.h, 9)} fill={BG[variant]} />
          </Svg>
        )}
        {loading ? (
          <ActivityIndicator color={FG[variant]} />
        ) : (
          <Text style={[styles.label, { color: FG[variant] }]}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  btn: { height: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  ghostBorder: { borderWidth: 1, borderColor: colors.borderStrong },
  label: { fontSize: font.size.md, fontWeight: '800', fontFamily: font.family.bodyBold, textTransform: 'uppercase', letterSpacing: 1.5 },
}));
