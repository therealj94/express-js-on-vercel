import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin, Navigation } from 'lucide-react-native'
import { openInMaps } from '../lib/config'
import { fonts, radius } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { AnimatedPressable } from './AnimatedPressable'

interface Props {
  lat: number
  lng: number
  label?: string
  height?: number
  caption?: string
}

// Shown wherever a native Google map would render but no Maps API key is
// available (e.g. a demo APK). Keeps the app from crashing and still lets the
// user get directions by handing off to their Google Maps app.
export function MapFallback({ lat, lng, label, height = 220, caption }: Props) {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)

  return (
    <View style={[styles.wrap, { height }]}>
      <LinearGradient
        colors={[colors.bgSoft, colors.surface]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.grid} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLine, { top: `${(i + 1) * 14}%` }]} />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 16}%` }]} />
        ))}
      </View>

      <LinearGradient colors={gradient} style={styles.pin}>
        <MapPin size={18} color={colors.bg} />
      </LinearGradient>

      <View style={styles.bottom}>
        <Text style={styles.coords}>
          {caption ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
        </Text>
        <AnimatedPressable onPress={() => openInMaps(lat, lng, label)} style={styles.btn}>
          <Navigation size={13} color={colors.text} />
          <Text style={styles.btnText}>Abrir en Google Maps</Text>
        </AnimatedPressable>
      </View>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      borderRadius: radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    grid: { ...StyleSheet.absoluteFillObject },
    gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border + '80' },
    gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.border + '80' },
    pin: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center', gap: 8 },
    coords: {
      color: colors.muted,
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      backgroundColor: colors.bg + 'cc',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceHi,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    btnText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  })
}
