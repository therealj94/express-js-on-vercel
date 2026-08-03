// app/index.tsx
// Ruta índice explícita ('/'): expo-router 6 (SDK 54) ya no deja que el guard
// del layout "rescate" la raíz sin ruta — sin esto, la app abría en
// "Unmatched Route". Redirige según el estado del flujo de alta.
import React from 'react';
import { Redirect } from 'expo-router';
import { useStore } from '@/store/useStore';

export default function Index() {
  const hydrated = useStore((s) => s.hydrated);
  const registered = useStore((s) => s.registered);
  const onboarded = useStore((s) => s.onboarded);
  const riskAccepted = useStore((s) => s.riskAccepted);

  if (!hydrated) return null; // el layout raíz muestra la intro mientras tanto
  if (!registered) return <Redirect href="/register" />;
  if (!onboarded) return <Redirect href="/onboarding" />;
  if (!riskAccepted) return <Redirect href="/risk" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
