// ─────────────────────────────────────────────────────────────────────────────
// El estado de «procesando pago».
//
// Entre que el usuario firma y el pago se confirma pasan uno o dos segundos.
// Un spinner gris en ese hueco dice «esperá»; esto dice «está pasando algo
// importante y bajo control». La diferencia es toda la confianza del mundo
// cuando lo que está en juego es tu dinero.
//
// Una moneda de oro que gira lento, un anillo que pulsa, y un texto que respira.
// Nada frenético — la prisa transmite nervios, y nadie quiere que su app de
// pagos parezca nerviosa.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  FadeIn,
} from 'react-native-reanimated'
import { fonts } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'

const ORO = '#E8B84B'

export function Procesando({ texto = 'Confirmando tu pago…' }: { texto?: string }) {
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  const giro = useSharedValue(0)
  const pulso = useSharedValue(0)

  useEffect(() => {
    giro.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.linear }), -1, false)
    pulso.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [giro, pulso])

  const estiloMoneda = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${giro.value * 360}deg` }],
  }))
  const estiloAnillo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulso.value * 0.25 }],
    opacity: 0.5 - pulso.value * 0.4,
  }))
  const estiloTexto = useAnimatedStyle(() => ({ opacity: 0.6 + pulso.value * 0.4 }))

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.envoltura}>
      <View style={styles.escena}>
        <Animated.View style={[styles.anillo, estiloAnillo]} />
        <Animated.View style={[styles.moneda, estiloMoneda]}>
          <Text style={styles.simbolo}>O</Text>
        </Animated.View>
      </View>
      <Animated.Text style={[styles.texto, estiloTexto]}>{texto}</Animated.Text>
      <Text style={styles.pie}>No cierres la app</Text>
    </Animated.View>
  )
}

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    envoltura: { alignItems: 'center', justifyContent: 'center', gap: 6 },
    escena: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    anillo: {
      position: 'absolute',
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 2,
      borderColor: ORO,
    },
    moneda: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: ORO,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: ORO,
      shadowOpacity: 0.5,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 4 },
    },
    simbolo: { fontFamily: fonts.displayBold, fontSize: 34, color: '#1A1206' },
    texto: { fontFamily: fonts.display, fontSize: 16, color: colors.text, marginTop: 6 },
    pie: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  })
}
