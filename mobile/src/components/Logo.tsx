import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, fonts } from '../lib/theme'

const MARK_RATIO = 282 / 338

interface Props {
  size?: 'sm' | 'md' | 'lg'
  textColor?: string
  shadow?: boolean
  style?: StyleProp<ViewStyle>
}

const MARK_WIDTH = { sm: 24, md: 32, lg: 52 }
const TEXT_SIZE = { sm: 15, md: 19, lg: 28 }
const GAP = { sm: 7, md: 9, lg: 13 }

export function Logo({ size = 'md', textColor = colors.text, shadow, style }: Props) {
  const markWidth = MARK_WIDTH[size]
  return (
    <View style={[styles.row, { gap: GAP[size] }, style]}>
      <Image
        source={require('../../assets/mark.png')}
        style={{ width: markWidth, height: markWidth * MARK_RATIO }}
        resizeMode="contain"
      />
      <Text
        style={[
          styles.word,
          { fontSize: TEXT_SIZE[size], color: textColor },
          shadow && styles.shadow,
        ]}
      >
        MyTokenPay
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  word: { fontFamily: fonts.display, letterSpacing: -0.2 },
  shadow: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
})
