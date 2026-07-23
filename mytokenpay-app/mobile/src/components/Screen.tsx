import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { AnimatedScreen } from './AnimatedScreen'

interface Props {
  children: React.ReactNode
  scroll?: boolean
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  edges?: Edge[]
}

export function Screen({ children, scroll = true, style, contentStyle, edges = ['top'] }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    content: { paddingBottom: 48 },
  })
}
