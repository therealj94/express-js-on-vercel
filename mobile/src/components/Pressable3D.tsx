import { useRef } from 'react'
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>
  /** Max tilt in degrees toward the touch point. */
  tilt?: number
  /** How much it scales down on press. */
  scaleTo?: number
  children: React.ReactNode
}

// A pressable that reacts in 3D: it scales down and tilts on the X/Y axis
// toward wherever the finger lands, with a perspective transform so the tilt
// reads as real depth. Interruptible springs make it feel physical.
export function Pressable3D({ style, tilt = 8, scaleTo = 0.96, onPressIn, onPressOut, children, ...props }: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const rotateX = useRef(new Animated.Value(0)).current
  const rotateY = useRef(new Animated.Value(0)).current
  const size = useRef({ w: 0, h: 0 })

  function onLayout(e: LayoutChangeEvent) {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }
  }

  function handlePressIn(e: GestureResponderEvent) {
    const { w, h } = size.current
    const { locationX, locationY } = e.nativeEvent
    if (w > 0 && h > 0) {
      // -1..1 offset from center; tilt away on the axis the finger pushes.
      const dx = (locationX / w) * 2 - 1
      const dy = (locationY / h) * 2 - 1
      Animated.spring(rotateY, { toValue: dx * tilt, useNativeDriver: true, speed: 30, bounciness: 0 }).start()
      Animated.spring(rotateX, { toValue: -dy * tilt, useNativeDriver: true, speed: 30, bounciness: 0 }).start()
    }
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 30, bounciness: 0 }).start()
    onPressIn?.(e)
  }

  function handlePressOut(e: GestureResponderEvent) {
    Animated.spring(rotateY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 10 }).start()
    Animated.spring(rotateX, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 10 }).start()
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start()
    onPressOut?.(e)
  }

  const rx = rotateX.interpolate({ inputRange: [-tilt, tilt], outputRange: [`-${tilt}deg`, `${tilt}deg`] })
  const ry = rotateY.interpolate({ inputRange: [-tilt, tilt], outputRange: [`-${tilt}deg`, `${tilt}deg`] })

  return (
    <Pressable onLayout={onLayout} onPressIn={handlePressIn} onPressOut={handlePressOut} {...props}>
      <Animated.View
        style={[style, { transform: [{ perspective: 800 }, { rotateX: rx }, { rotateY: ry }, { scale }] }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  )
}
