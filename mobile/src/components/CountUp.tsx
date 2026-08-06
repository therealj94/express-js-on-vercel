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
//
// POR QUÉ EL FORMATO ESTÁ ESCRITO A MANO
//
// Este componente tumbó la app en producción: la pantalla del pago aparecía un
// instante y se ponía NEGRA, en el teléfono del cliente y en el del comercio.
// La causa era `toLocaleString` dentro del worklet. Un worklet corre en el hilo
// de la interfaz, donde no existen las funciones del hilo de JavaScript ni las
// tablas de idioma; al llegar el primer cuadro de la animación, reventaba.
//
// Y ese fallo NO lo atrapa un error boundary de React —ocurre fuera de React—,
// así que no había pantalla de error que mostrar: solo negro, justo en el
// momento en que alguien acababa de pagar.
//
// De ahí la regla: dentro del worklet solo aritmética y concatenación. Nada de
// funciones de fuera, ni siquiera las que parecen inofensivas.
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
  prefijo?: string
  sufijo?: string
  /** Cuántos decimales mostrar mientras cuenta. */
  decimales?: number
  style?: TextStyle | TextStyle[]
  /** Milisegundos antes de arrancar, para coreografiar con otras cosas. */
  retraso?: number
}

/** El mismo formato que el worklet, para el valor inicial y el de respaldo. */
function formatear(n: number, decimales: number): string {
  const negativo = n < 0
  const abs = n < 0 ? -n : n
  const factor = Math.pow(10, decimales)
  let entero = Math.floor(abs)
  let dec = Math.round((abs - entero) * factor)
  if (dec >= factor) {
    entero += 1
    dec = 0
  }

  const crudo = String(entero)
  let miles = ''
  let cuenta = 0
  for (let i = crudo.length - 1; i >= 0; i--) {
    miles = crudo[i] + miles
    cuenta += 1
    if (cuenta % 3 === 0 && i > 0) miles = ',' + miles
  }

  if (decimales <= 0) return (negativo ? '-' : '') + miles
  let decTexto = String(dec)
  while (decTexto.length < decimales) decTexto = '0' + decTexto
  return (negativo ? '-' : '') + miles + '.' + decTexto
}

export function CountUp({ hasta, prefijo = '', sufijo = '', decimales = 2, style, retraso = 0 }: Props) {
  const valor = useSharedValue(0)

  useEffect(() => {
    valor.value = 0
    const t = setTimeout(() => {
      valor.value = withTiming(hasta, lento)
    }, retraso)
    return () => clearTimeout(t)
  }, [hasta, retraso, valor])

  const props = useAnimatedProps(() => {
    'worklet'
    // Todo lo de aquí dentro corre en el hilo de la interfaz: solo aritmética
    // y texto. Leé el comentario de arriba antes de meter cualquier llamada.
    const n = valor.value
    const negativo = n < 0
    const abs = n < 0 ? -n : n
    const factor = Math.pow(10, decimales)
    let entero = Math.floor(abs)
    let dec = Math.round((abs - entero) * factor)
    if (dec >= factor) {
      entero += 1
      dec = 0
    }

    const crudo = String(entero)
    let miles = ''
    let cuenta = 0
    for (let i = crudo.length - 1; i >= 0; i--) {
      miles = crudo[i] + miles
      cuenta += 1
      if (cuenta % 3 === 0 && i > 0) miles = ',' + miles
    }

    let texto = (negativo ? '-' : '') + miles
    if (decimales > 0) {
      let decTexto = String(dec)
      while (decTexto.length < decimales) decTexto = '0' + decTexto
      texto = texto + '.' + decTexto
    }

    const completo = prefijo + texto + sufijo
    return { text: completo, defaultValue: completo } as any
  })

  const final = `${prefijo}${formatear(hasta, decimales)}${sufijo}`

  return (
    <AnimatedTextInput
      editable={false}
      style={[styles.base, style]}
      animatedProps={props}
      value={final}
      defaultValue={final}
      pointerEvents="none"
    />
  )
}

const styles = StyleSheet.create({
  base: { padding: 0, margin: 0 },
})

export type { SharedValue }
