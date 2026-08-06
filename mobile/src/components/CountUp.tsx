// ─────────────────────────────────────────────────────────────────────────────
// Un número que cuenta hasta su valor en vez de aparecer de golpe.
//
// Ver «L 0 → L 450» subir en medio segundo hace dos cosas: le da peso al monto
// (el ojo lo sigue, el cerebro lo registra) y convierte un dato en un pequeño
// acontecimiento. Es el truco más barato que existe para que una cifra se
// sienta importante.
//
// Se anima con un TextInput y useAnimatedProps para no re-renderizar React en
// cada cuadro — el número cambia sesenta veces por segundo y hacerlo por estado
// haría trabajar al hilo de JS hasta ahogarlo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { StyleSheet, TextInput, type TextStyle } from 'react-native'
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { lento } from '../lib/anim'

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

interface Props {
  hasta: number
  /** Cómo formatear el número en cada paso. Por defecto, dos decimales. */
  formato?: (n: number) => string
  prefijo?: string
  sufijo?: string
  style?: TextStyle | TextStyle[]
  /** Milisegundos antes de arrancar, para coreografiar con otras cosas. */
  retraso?: number
}

const dosDecimales = (n: number) =>
  n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function CountUp({ hasta, formato = dosDecimales, prefijo = '', sufijo = '', style, retraso = 0 }: Props) {
  const valor = useSharedValue(0)

  useEffect(() => {
    valor.value = 0
    const t = setTimeout(() => {
      valor.value = withTiming(hasta, lento)
    }, retraso)
    return () => clearTimeout(t)
  }, [hasta, retraso, valor])

  const props = useAnimatedProps(() => {
    return { text: `${prefijo}${formato(valor.value)}${sufijo}`, defaultValue: `${prefijo}${formato(0)}${sufijo}` } as any
  })

  return (
    <AnimatedTextInput
      editable={false}
      // eslint-disable-next-line react-native/no-inline-styles
      style={[styles.base, style]}
      animatedProps={props}
      value={`${prefijo}${formato(hasta)}${sufijo}`}
      pointerEvents="none"
    />
  )
}

const styles = StyleSheet.create({
  base: { padding: 0, margin: 0 },
})

/** Acceso a un shared value externo, por si se quiere sincronizar con otra cosa. */
export type { SharedValue }
