// ─────────────────────────────────────────────────────────────────────────────
// La celebración del pago.
//
// Este es el momento por el que existe la app. Todo lo demás es fricción que
// resolvemos; esto es la recompensa. Tiene que sentirse como un pequeño
// aplauso.
//
// La coreografía, cuadro por cuadro:
//
//   0 ms   un anillo dorado estalla desde el centro y se desvanece
//   80 ms  el sello con la palomita entra rebotando (resorte alegre)
//   80 ms  háptico de éxito, sincronizado con el rebote del sello
//   180 ms  veinte partículas de oro salen disparadas en abanico y caen
//   250 ms  el monto cuenta desde cero
//   700 ms  el texto y el botón suben en su sitio
//
// Oro por todas partes a propósito: ORIGEN está anclado al oro, y el color le
// recuerda al usuario —sin una sola palabra— qué acaba de recibir.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Check } from 'lucide-react-native'
import { CountUp } from './CountUp'
import { resorteAlegre, resorteFirme } from '../lib/anim'
import { fonts } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'

const ORO = '#E8B84B'
const ORO_CLARO = '#F4D67E'
const N_PARTICULAS = 22

interface Props {
  montoHnl: number
  origenTexto: string
  titulo?: string
  subtitulo?: string
}

export function PagoExito({ montoHnl, origenTexto, titulo = 'Listo', subtitulo }: Props) {
  const { colors } = useTheme()
  const styles = crearEstilos(colors)

  return (
    <View style={styles.contenedor}>
      <View style={styles.escena}>
        <AnilloEstallido />
        <LluviaDeOro />
        <Sello colors={colors} />
      </View>

      <Animated.View entering={FadeInDown.delay(700).springify().damping(16)}>
        <Text style={styles.titulo}>{titulo}</Text>
      </Animated.View>

      <View style={styles.montoFila}>
        <Text style={styles.moneda}>L</Text>
        <CountUp hasta={montoHnl} retraso={250} style={styles.monto} />
      </View>

      <Animated.Text entering={FadeInDown.delay(820).duration(500)} style={styles.origen}>
        {origenTexto}
      </Animated.Text>

      {subtitulo ? (
        <Animated.Text entering={FadeInDown.delay(920).duration(500)} style={styles.sub}>
          {subtitulo}
        </Animated.Text>
      ) : null}
    </View>
  )
}

// ── El sello con la palomita ─────────────────────────────────────────────────

function Sello({ colors }: { colors: ThemeColors }) {
  const escala = useSharedValue(0)
  const palomita = useSharedValue(0)

  useEffect(() => {
    escala.value = withDelay(80, withSpring(1, resorteAlegre))
    palomita.value = withDelay(240, withSpring(1, resorteFirme))
    const t = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    }, 90)
    return () => clearTimeout(t)
  }, [escala, palomita])

  const estiloSello = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }))
  const estiloPalomita = useAnimatedStyle(() => ({
    transform: [{ scale: palomita.value }],
    opacity: palomita.value,
  }))

  return (
    <Animated.View style={[est.sello, estiloSello]}>
      <Animated.View style={estiloPalomita}>
        <Check size={44} color="#1A1206" strokeWidth={3.5} />
      </Animated.View>
    </Animated.View>
  )
}

// ── El anillo que estalla y se desvanece ─────────────────────────────────────

function AnilloEstallido() {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withDelay(60, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }))
  }, [p])

  const estilo = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + p.value * 1.6 }],
    opacity: (1 - p.value) * 0.7,
  }))
  return <Animated.View style={[est.anillo, estilo]} />
}

// ── Las partículas de oro ────────────────────────────────────────────────────

function LluviaDeOro() {
  // Se fija el destino de cada partícula una sola vez: un abanico hacia arriba
  // con un poco de azar, que luego cae por gravedad.
  const particulas = useMemo(
    () =>
      Array.from({ length: N_PARTICULAS }, (_, i) => {
        const angulo = (-140 + (280 * i) / (N_PARTICULAS - 1)) * (Math.PI / 180)
        const fuerza = 90 + (i % 5) * 26
        return {
          dx: Math.cos(angulo) * fuerza,
          dy: Math.sin(angulo) * fuerza,
          tam: 5 + (i % 4) * 2,
          claro: i % 2 === 0,
          giro: (i % 2 === 0 ? 1 : -1) * (180 + (i % 3) * 120),
        }
      }),
    [],
  )
  return (
    <View style={est.particulasCapa} pointerEvents="none">
      {particulas.map((p, i) => (
        <Particula key={i} {...p} />
      ))}
    </View>
  )
}

function Particula({
  dx,
  dy,
  tam,
  claro,
  giro,
}: {
  dx: number
  dy: number
  tam: number
  claro: boolean
  giro: number
}) {
  const t = useSharedValue(0)
  useEffect(() => {
    t.value = withDelay(180, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }))
  }, [t])

  const estilo = useAnimatedStyle(() => {
    const subida = dy * t.value
    const caida = 120 * t.value * t.value // gravedad: acelera al caer
    return {
      transform: [
        { translateX: dx * t.value },
        { translateY: subida + caida },
        { rotate: `${giro * t.value}deg` },
        { scale: 1 - t.value * 0.3 },
      ],
      opacity: t.value < 0.15 ? t.value / 0.15 : 1 - (t.value - 0.15) / 0.85,
    }
  })

  return (
    <Animated.View
      style={[
        est.particula,
        { width: tam, height: tam, borderRadius: tam / 2, backgroundColor: claro ? ORO_CLARO : ORO },
        estilo,
      ]}
    />
  )
}

const est = StyleSheet.create({
  anillo: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: ORO,
  },
  sello: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: ORO,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ORO,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
  },

  particulasCapa: { position: 'absolute', width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  particula: { position: 'absolute' },
})

function crearEstilos(colors: ThemeColors) {
  return StyleSheet.create({
    contenedor: { alignItems: 'center', justifyContent: 'center' },
    escena: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
    titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 10 },
    montoFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
    moneda: { fontFamily: fonts.displayBold, fontSize: 22, color: ORO, marginTop: 8 },
    monto: {
      fontFamily: fonts.displayBold,
      fontSize: 48,
      color: colors.text,
      letterSpacing: -1.5,
      textAlign: 'center',
      minWidth: 120,
    },
    origen: { fontFamily: fonts.bodyMedium, fontSize: 14, color: ORO, marginTop: 2 },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 10, textAlign: 'center' },
  })
}
