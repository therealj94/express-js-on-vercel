// components/BiometricGate.tsx
// Bloqueo con Face ID / huella al abrir la app (si el usuario lo activó en su
// perfil). Se pide UNA sola vez por arranque en frío.
//
// Reglas duras aprendidas en pruebas reales:
//   - Nunca puede quedar la pantalla "pegada": si el módulo nativo no responde,
//     un tiempo límite libera el botón para reintentar.
//   - Nunca puede pedirse dos veces seguidas: un candado evita lanzar un segundo
//     prompt mientras hay uno abierto (el efecto puede reejecutarse al hidratar).
//   - Nunca puede dejar a nadie afuera de su propia cuenta: ante cualquier error
//     del módulo, o si el teléfono no tiene biometría, se entra igual.
//   - No se vuelve a bloquear al pasar por segundo plano: eso hacía que la app
//     pidiera la huella una y otra vez al cambiar de app.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';

/** Si el prompt nativo no contesta en este tiempo, se desbloquea el botón. */
const AUTH_TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const enabled = useStore((s) => s.biometricEnabled);
  const hydrated = useStore((s) => s.hydrated);
  const riskAccepted = useStore((s) => s.riskAccepted);
  // solo tiene sentido bloquear una vez que sabemos de verdad el ajuste guardado
  const active = hydrated && enabled && riskAccepted;

  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const running = useRef(false);   // candado: un solo prompt a la vez
  const asked = useRef(false);     // ya se pidió en este arranque

  const tryUnlock = async (manual = false) => {
    if (running.current) return;          // ya hay un prompt abierto
    if (!manual && asked.current) return; // el automático corre una única vez
    running.current = true;
    asked.current = true;
    setChecking(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
      // sin biometría configurada en el teléfono: no bloquear a nadie
      if (!hasHardware || !enrolled) { setUnlocked(true); return; }

      const res = await withTimeout(
        LocalAuthentication.authenticateAsync({
          promptMessage: t('bio.promptMessage'),
          cancelLabel: t('bio.cancel'),
          disableDeviceFallback: false,
        }),
        AUTH_TIMEOUT_MS,
      );
      if (res !== 'timeout' && res.success) setUnlocked(true);
    } catch {
      setUnlocked(true); // ante cualquier fallo del módulo nativo, dejar entrar
    } finally {
      running.current = false;
      setChecking(false); // pase lo que pase, el botón vuelve a quedar usable
    }
  };

  useEffect(() => {
    if (active && !unlocked) tryUnlock(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active || unlocked) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <Logo size={64} glow />
      <Text style={styles.title}>SPORT KAPITAL</Text>
      <Text style={styles.sub}>{t('bio.lockedSub')}</Text>

      <Pressable onPress={() => { tap(); tryUnlock(true); }} style={styles.btn}>
        <Icon name="shield" size={20} color="#14000F" />
        <Text style={styles.btnTxt}>{checking ? t('bio.checking') : t('bio.unlock')}</Text>
      </Pressable>

      {/* salida de emergencia: si la biometría del teléfono falla, que nadie
          quede encerrado fuera de su propia cuenta. */}
      <Pressable onPress={() => { tap(); setUnlocked(true); }} hitSlop={8} style={styles.skip}>
        <Text style={styles.skipTxt}>{t('bio.skip')}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: spacing.xl, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 },
  title: { color: colors.text, fontSize: font.size.xl, fontFamily: font.family.heading, letterSpacing: 1.5, marginTop: 8 },
  sub: { color: colors.textSecondary, fontSize: font.size.sm, textAlign: 'center', marginBottom: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.gold, borderRadius: radius.full, paddingHorizontal: 26, paddingVertical: 14 },
  btnTxt: { color: '#14000F', fontSize: font.size.md, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  skip: { marginTop: 6, paddingVertical: 8, paddingHorizontal: 12 },
  skipTxt: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '700', textDecorationLine: 'underline' },
}));
