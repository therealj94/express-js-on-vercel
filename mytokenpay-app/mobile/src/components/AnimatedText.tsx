import { useCallback, useRef } from 'react'
import { Animated, Easing, type TextProps } from 'react-native'
import { useFocusEffect } from 'expo-router'

interface Props extends TextProps {
  delay?: number
  /** Replay the entrance every time the screen regains focus (tab switches, back nav). Default true. */
  onFocus?: boolean
}

export function AnimatedText({ style, children, delay = 0, onFocus = true, ...props }: Props) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(10)).current

  const animate = useCallback(() => {
    opacity.setValue(0)
    translateY.setValue(10)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay])

  useFocusEffect(
    useCallback(() => {
      if (onFocus) animate()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onFocus]),
  )

  return (
    <Animated.Text style={[style, { opacity, transform: [{ translateY }] }]} {...props}>
      {children}
    </Animated.Text>
  )
}
