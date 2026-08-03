// components/BallRefresh.tsx
// Pull-to-refresh unificado: al deslizar hacia abajo se muestra el spinner
// nativo tintado con el tema Y la pelota de fútbol global (BusyBall) mientras
// dura el refresco. Cada pantalla puede pasar una acción extra (ej. recargar
// datos reales); si no, es un refresco visual de ~1s.
import React, { useCallback, useState } from 'react';
import { Platform, RefreshControl, type RefreshControlProps } from 'react-native';
import { useStore } from '@/store/useStore';
import { colors } from '@/theme/tokens';

export function useBallRefresh(extra?: () => Promise<void> | void) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    useStore.getState().setBusy(true); // muestra la pelota ⚽ global
    try {
      await extra?.();
      await new Promise((r) => setTimeout(r, 900));
    } finally {
      useStore.getState().setBusy(false);
      setRefreshing(false);
    }
  }, [extra]);

  return { refreshing, onRefresh };
}

/**
 * Devuelve el RefreshControl temático para pasar a `refreshControl`.
 * En web devuelve undefined: react-native-web no soporta RefreshControl y
 * al pasarlo se traga el contenido del ScrollView (pantalla en blanco).
 */
export function ballRefreshControl(r: { refreshing: boolean; onRefresh: () => void }): React.ReactElement<RefreshControlProps> | undefined {
  if (Platform.OS === 'web') return undefined;
  return (
    <RefreshControl
      refreshing={r.refreshing}
      onRefresh={r.onRefresh}
      tintColor={colors.gold}
      colors={[colors.gold]}
      progressBackgroundColor={colors.bgCard}
    />
  );
}
