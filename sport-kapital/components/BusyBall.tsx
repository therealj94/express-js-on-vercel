// components/BusyBall.tsx
// Indicador global de "procesando": pelota de fútbol girando en la esquina inferior,
// con una capa transparente que absorbe taps para evitar doble envío del usuario.
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/store/useStore';
import { colors, themedSheet, type Palette } from '@/theme/tokens';

export function BusyBall() {
  const busy = useStore((s) => s.busy);
  const insets = useSafeAreaInsets();
  const rot = useSharedValue(0);

  useEffect(() => {
    if (busy) {
      rot.value = 0;
      rot.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1);
    }
  }, [busy]);

  // WATCHDOG: si por cualquier motivo el estado busy queda trabado (una acción
  // que nunca terminó), se libera solo a los 8 s. Esta capa absorbe TODOS los
  // taps de la app, así que un busy colgado dejaba la pantalla "muerta".
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => useStore.getState().setBusy(false), 8000);
    return () => clearTimeout(t);
  }, [busy]);

  const ballStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  if (!busy) return null;

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={() => {}}>
      <View pointerEvents="none" style={[styles.ball, { bottom: insets.bottom + 18 }]}>
        <Animated.Text style={[styles.emoji, ballStyle]}>⚽</Animated.Text>
      </View>
    </Pressable>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  ball: {
    position: 'absolute',
    right: 18,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  emoji: { fontSize: 24 },
}));
