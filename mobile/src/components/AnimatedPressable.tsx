import { useMemo, useRef } from 'react'
import { Animated, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { repartirEstilo } from './layoutSplit'

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>
  scaleTo?: number
  children: React.ReactNode
}

export function AnimatedPressable({ style, scaleTo = 0.96, onPressIn, onPressOut, children, ...props }: Props) {
  const scale = useRef(new Animated.Value(1)).current

  function handlePressIn(e: GestureResponderEvent) {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
    onPressIn?.(e)
  }

  function handlePressOut(e: GestureResponderEvent) {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start()
    onPressOut?.(e)
  }

  // El layout (ancho, flex, márgenes) tiene que vivir en el Pressable externo:
  // si viviera solo en la vista interna, un `width: '48%'` se resolvería
  // contra un contenedor de ancho automático y la tarjeta colapsaría en una
  // tira ilegible — pasó con el teclado de la caja y el panel.
  const { externo, interno } = useMemo(() => repartirEstilo(style), [style])

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} style={externo} {...props}>
      <Animated.View style={[interno, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}
