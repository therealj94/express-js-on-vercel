// components/BiometricGate.tsx
// Bloqueo con Face ID / huella al abrir la app (si el usuario lo activó en su
// perfil). Se pide una sola vez por arranque en frío — no en cada cambio de
// pestaña — para no volverse molesto. Si el dispositivo no tiene biometría
// configurada, deja pasar directo (nunca deja a nadie afuera de su propia app).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const enabled = useStore((s) => s.biometricEnabled);
  const riskAccepted = useStore((s) => s.riskAccepted);
  const active = enabled && riskAccepted;
  const [unlocked, setUnlocked] = useState(!active);
  const [checking, setChecking] = useState(false);

  const tryUnlock = async () => {
    setChecking(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
      if (!hasHardware || !enrolled) { setUnlocked(true); return; } // no hay biometría en el dispositivo: no bloquear
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: t('bio.promptMessage'),
        cancelLabel: t('bio.cancel'),
        disableDeviceFallback: false,
      });
      if (res.success) setUnlocked(true);
    } catch {
      setUnlocked(true); // ante cualquier error del módulo nativo, no dejar a nadie bloqueado afuera
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (active && !unlocked) tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // re-bloquear al volver del segundo plano (backgrounding real, no cambios de pestaña internos)
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setUnlocked(false);
    });
    return () => sub.remove();
  }, [active]);

  if (!active || unlocked) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <Logo size={64} glow />
      <Text style={styles.title}>SPORT KAPITAL</Text>
      <Text style={styles.sub}>{t('bio.lockedSub')}</Text>
      <Pressable
        onPress={() => { tap(); tryUnlock(); }}
        style={styles.btn}
        disabled={checking}
      >
        <Icon name="shield" size={20} color="#14000F" />
        <Text style={styles.btnTxt}>{checking ? t('bio.checking') : t('bio.unlock')}</Text>
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
}));
