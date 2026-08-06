// ─────────────────────────────────────────────────────────────────────────────
// La pantalla que tapa la app cuando está bloqueada.
//
// Cubre todo lo demás mientras el usuario no se identifique. Se muestra al abrir
// la app y cada vez que vuelve de segundo plano, que es cuando un teléfono
// prestado o perdido puede caer en otras manos.
//
// El botón de desbloquear se dispara solo al aparecer: en el 99 % de los casos
// el usuario abre su propia app y no debería tener que tocar nada. El botón
// queda por si cancela el diálogo del sistema sin querer.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { Fingerprint, ScanFace } from 'lucide-react-native'
import { useLockStore } from '../store/lock'
import { AnimatedPressable } from './AnimatedPressable'
import { Logo } from './Logo'
import { fonts, radius } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'

export function LockGate() {
  const { bloqueada, activado, disponible, bloquear, desbloquear } = useLockStore()
  const { colors } = useTheme()
  const styles = crearEstilos(colors)
  const pidiendo = useRef(false)

  // Bloquear al pasar a segundo plano, para que al volver pida identidad.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'background' || estado === 'inactive') bloquear()
    })
    return () => sub.remove()
  }, [bloquear])

  // Al aparecer la pantalla de bloqueo, pedir la biometría de una vez.
  useEffect(() => {
    if (bloqueada && !pidiendo.current) {
      pidiendo.current = true
      desbloquear().finally(() => {
        pidiendo.current = false
      })
    }
  }, [bloqueada, desbloquear])

  if (!activado || !bloqueada) return null

  const Icono = disponible === 'rostro' ? ScanFace : Fingerprint

  return (
    <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill}>
      <View style={styles.centro}>
        <Logo size="lg" />
        <Text style={styles.titulo}>MyTokenPay</Text>
        <Text style={styles.sub}>Está bloqueada por tu seguridad</Text>

        <AnimatedPressable onPress={desbloquear} style={styles.boton}>
          <Icono size={26} color={colors.violet} />
          <Text style={styles.botonTexto}>
            {disponible === 'rostro' ? 'Desbloquear con rostro' : 'Desbloquear con huella'}
          </Text>
        </AnimatedPressable>
      </View>
    </BlurView>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    titulo: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.text, marginTop: 6 },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginBottom: 24 },
    boton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      paddingHorizontal: 22,
      paddingVertical: 14,
    },
    botonTexto: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  })
}
