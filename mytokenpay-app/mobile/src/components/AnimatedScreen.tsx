import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native'

interface Props {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Bump this to replay the entrance animation (e.g. a step index). */
  animKey?: string | number
  distance?: number
  fill?: boolean
}

export function AnimatedScreen({ children, style, animKey, distance = 16, fill = true }: Props) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(distance)).current

  useEffect(() => {
    opacity.setValue(0)
    translateY.setValue(distance)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey])

  return (
    <Animated.View style={[fill && { flex: 1 }, { opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  )
}
