import { StyleSheet, View } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { useRouter } from 'expo-router'
import type { Company } from '../lib/types'
import { radius } from '../lib/theme'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { MapPin } from './MapPin'

interface Props {
  companies: Company[]
  center: { latitude: number; longitude: number }
  zoomDelta?: number
}

export function CompanyMap({ companies, center, zoomDelta = 4 }: Props) {
  const { colors } = useTheme()
  const styles = createStyles(colors)
  const router = useRouter()

  return (
    <View style={styles.wrap}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: zoomDelta,
          longitudeDelta: zoomDelta,
        }}
      >
        {companies.map((company) => (
          <Marker
            key={company.id}
            coordinate={{ latitude: company.lat, longitude: company.lng }}
            title={company.tradeName}
            onCalloutPress={() => router.push(`/negocio/${company.id}`)}
          >
            <MapPin />
          </Marker>
        ))}
      </MapView>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { height: 420, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  })
}
