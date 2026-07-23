import { useEffect, useRef } from 'react'
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native'
import { radius } from '../../lib/theme'
import { useTheme } from '../../hooks/useTheme'

interface Props {
  width?: number | `${number}%`
  height?: number
  round?: keyof typeof radius
  style?: StyleProp<ViewStyle>
}

export function Skeleton({ width = '100%', height = 16, round = 'sm', style }: Props) {
  const { colors } = useTheme()
  const opacity = useRef(new Animated.Value(0.55)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius[round], backgroundColor: colors.surfaceHi, opacity },
        style,
      ]}
    />
  )
}
