// El aviso de que hay una versión nueva lista.
//
// Aparece abajo, sin tapar nada, y espera. Nunca reinicia la app por su cuenta:
// a un mesero a mitad de un cobro, un reinicio sorpresa le cuesta la venta.
// Se puede posponer con un toque y vuelve en el próximo arranque.

import { useCallback, useEffect, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RefreshCw, X } from 'lucide-react-native'
import { AnimatedPressable } from './AnimatedPressable'
import { aplicarActualizacion, buscarActualizacion, puedeActualizar } from '../lib/updates'
import { fonts, radius } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'

export function AvisoActualizacion() {
  const { colors } = useTheme()
  const styles = crearEstilos(colors)
  const [lista, setLista] = useState(false)
  const [pospuesta, setPospuesta] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const revisar = useCallback(async () => {
    if (!puedeActualizar()) return
    const hay = await buscarActualizacion()
    if (hay) setLista(true)
  }, [])

  useEffect(() => {
    revisar()
    // Y cada vez que la app vuelve del segundo plano: es cuando el usuario
    // tiene la cabeza en otra cosa y un reinicio molesta menos.
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') revisar()
    })
    return () => sub.remove()
  }, [revisar])

  const insets = useSafeAreaInsets()
  if (!lista || pospuesta) return null

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16)}
      exiting={FadeOutDown}
      style={[styles.wrap, { bottom: insets.bottom + 14 }]}
      pointerEvents="box-none"
    >
      <View style={styles.tarjeta}>
        <RefreshCw size={15} color={colors.violet} />
        <Text style={styles.texto}>Hay una versión nueva lista</Text>
        <AnimatedPressable
          onPress={async () => {
            setAplicando(true)
            await aplicarActualizacion()
          }}
          style={styles.aplicar}
        >
          <Text style={styles.aplicarTexto}>{aplicando ? 'Aplicando…' : 'Aplicar'}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => setPospuesta(true)} style={styles.cerrar}>
          <X size={14} color={colors.muted} />
        </AnimatedPressable>
      </View>
    </Animated.View>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { position: 'absolute', left: 14, right: 14, zIndex: 50 },
    tarjeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surfaceHi,
      borderWidth: 1,
      borderColor: colors.violet + '55',
      borderRadius: radius.lg,
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    texto: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13, flex: 1 },
    aplicar: {
      backgroundColor: colors.violet,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    aplicarTexto: { color: '#fff', fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
    cerrar: { padding: 4 },
  })
}
