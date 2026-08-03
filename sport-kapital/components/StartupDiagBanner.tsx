// components/StartupDiagBanner.tsx — TEMPORAL, ver utils/startupCheckpoint.ts
// Muestra, en la corrida actual, en qué paso murió el arranque ANTERIOR (si
// murió) y que ese paso quedó DESACTIVADO para que la app abra. Se dibuja
// encima de todo, sin depender de nada nativo, para que sea visible durante el
// intro aunque esta corrida también fallara en el mismo paso.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const STEP_LABEL: Record<string, string> = {
  boot: 'inicio',
  loadMarket: 'cargar el mercado',
  marketEngine: 'motor de mercado (simulado)',
  realEngine: 'partidos reales (api-football)',
  cloudSync: 'respaldo en la nube (Firebase)',
  realData: 'datos reales (calendario)',
  goalSound: 'sonido de gol (audio)',
  goalAlerts: 'alertas de gol',
  music: 'música (audio)',
};

export function StartupDiagBanner({ failure, disabled }: { failure: string | null; disabled: string[] }) {
  if (!failure && disabled.length === 0) return null;
  const failLabel = failure ? (STEP_LABEL[failure] ?? failure) : null;
  const offList = disabled.map((d) => STEP_LABEL[d] ?? d).join(', ');
  return (
    <View style={s.wrap} pointerEvents="none">
      <Text style={s.title}>Diagnóstico de arranque</Text>
      {failLabel && (
        <Text style={s.body}>
          El intento anterior se cerró en: <Text style={s.step}>{failLabel}</Text>
        </Text>
      )}
      {disabled.length > 0 && (
        <Text style={s.body}>
          Se desactivó para que la app abra: <Text style={s.off}>{offList}</Text>
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 48, left: 16, right: 16,
    backgroundColor: 'rgba(20,20,31,0.94)', borderColor: '#FF3B5C', borderWidth: 1,
    borderRadius: 12, padding: 12, zIndex: 9999,
  },
  title: { color: '#FF3B5C', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  body: { color: '#E6E6F0', fontSize: 12, lineHeight: 18 },
  step: { color: '#00FF9C', fontWeight: '800' },
  off: { color: '#FFB800', fontWeight: '800' },
});
