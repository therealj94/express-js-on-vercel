import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { colors } from '../lib/theme'
import { AnimatedScreen } from './AnimatedScreen'

interface Props {
  children: React.ReactNode
  scroll?: boolean
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  edges?: Edge[]
}

export function Screen({ children, scroll = true, style, contentStyle, edges = ['top'] }: Props) {
  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, contentStyle]} showsVerticalScrollIndicator={false}>
          <AnimatedScreen fill={false}>{children}</AnimatedScreen>
        </ScrollView>
      ) : (
        <AnimatedScreen style={contentStyle}>{children}</AnimatedScreen>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingBottom: 48 },
})
