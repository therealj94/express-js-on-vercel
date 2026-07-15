import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, type LatLng, type MapPressEvent } from 'react-native-maps'
import * as Location from 'expo-location'
import { LocateFixed } from 'lucide-react-native'
import { colors, fonts, radius } from '../lib/theme'
import { MapPin } from './MapPin'

interface Props {
  lat: number
  lng: number
  zoomDelta?: number
  onChange: (lat: number, lng: number) => void
}

export function MapPicker({ lat, lng, zoomDelta = 0.08, onChange }: Props) {
  const mapRef = useRef<MapView>(null)

  function handlePress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate
    onChange(latitude, longitude)
  }

  function handleDragEnd(coord: LatLng) {
    onChange(coord.latitude, coord.longitude)
  }

  async function useMyLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return
    const pos = await Location.getCurrentPositionAsync({})
    onChange(pos.coords.latitude, pos.coords.longitude)
    mapRef.current?.animateToRegion(
      {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      800,
    )
  }

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: zoomDelta, longitudeDelta: zoomDelta }}
        onPress={handlePress}
      >
        <Marker
          coordinate={{ latitude: lat, longitude: lng }}
          draggable
          onDragEnd={(e) => handleDragEnd(e.nativeEvent.coordinate)}
        >
          <MapPin />
        </Marker>
      </MapView>

      <Pressable style={styles.locateBtn} onPress={useMyLocation}>
        <LocateFixed size={14} color={colors.text} />
        <Text style={styles.locateText}>Usar mi ubicación</Text>
      </Pressable>

      <View style={styles.hint}>
        <Text style={styles.hintText}>Toca el mapa o arrastra el pin para ajustar la ubicación</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { height: 260, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  locateBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,19,31,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  locateText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 11 },
  hint: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(16,19,31,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  hintText: { color: colors.muted, fontFamily: fonts.body, fontSize: 10.5 },
})
