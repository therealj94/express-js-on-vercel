import { useRef } from 'react'
import { Animated, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
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

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} {...props}>
      {(state) => (
        <Animated.View style={[typeof style === 'function' ? style(state) : style, { transform: [{ scale }] }]}>
          {children}
        </Animated.View>
      )}
    </Pressable>
  )
}
