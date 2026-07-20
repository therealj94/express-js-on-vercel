import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, type LatLng, type MapPressEvent } from 'react-native-maps'
import * as Location from 'expo-location'
import { LinearGradient } from 'expo-linear-gradient'
import { LocateFixed, MapPin as MapPinIcon } from 'lucide-react-native'
import { fonts, radius } from '../lib/theme'
import { MAPS_ENABLED } from '../lib/config'
import { useTheme, type ThemeColors } from '../hooks/useTheme'
import { MapPin } from './MapPin'
import { AnimatedPressable } from './AnimatedPressable'

interface Props {
  lat: number
  lng: number
  zoomDelta?: number
  onChange: (lat: number, lng: number) => void
}

export function MapPicker({ lat, lng, zoomDelta = 0.08, onChange }: Props) {
  const { colors, gradient } = useTheme()
  const styles = createStyles(colors)
  const mapRef = useRef<MapView>(null)
  const [locating, setLocating] = useState(false)

  function handlePress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate
    onChange(latitude, longitude)
  }

  function handleDragEnd(coord: LatLng) {
    onChange(coord.latitude, coord.longitude)
  }

  async function useMyLocation() {
    setLocating(true)
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Ubicación no disponible',
          canAskAgain
            ? 'Necesitamos permiso de ubicación para marcar el pin automáticamente. Puedes tocar el mapa para ubicarlo manualmente.'
            : 'El permiso de ubicación está bloqueado. Actívalo desde los ajustes del sistema o toca el mapa para ubicar tu negocio manualmente.',
          canAskAgain
            ? [{ text: 'Entendido' }]
            : [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
              ],
        )
        return
      }
      const enabled = await Location.hasServicesEnabledAsync()
      if (!enabled) {
        Alert.alert('Activa el GPS', 'El servicio de ubicación del dispositivo está apagado. Actívalo para usar tu ubicación actual.')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
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
    } catch {
      Alert.alert('No pudimos obtener tu ubicación', 'Intenta de nuevo o toca el mapa para ubicar tu negocio manualmente.')
    } finally {
      setLocating(false)
    }
  }

  if (!MAPS_ENABLED) {
    // No Google Maps API key in this build → no native map. Users still set
    // their location via GPS, and we show the current coordinates clearly.
    return (
      <View style={styles.wrap}>
        <LinearGradient colors={[colors.bgSoft, colors.surface]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={styles.fallbackCenter}>
          <LinearGradient colors={gradient as unknown as string[]} style={styles.fallbackPin}>
            <MapPinIcon size={20} color={colors.bg} />
          </LinearGradient>
          <Text style={styles.fallbackCoords}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
        </View>

        <AnimatedPressable style={styles.locateBtn} onPress={useMyLocation} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <LocateFixed size={14} color={colors.text} />
          )}
          <Text style={styles.locateText}>Usar mi ubicación</Text>
        </AnimatedPressable>

        <View style={styles.hint}>
          <Text style={styles.hintText}>Toca "Usar mi ubicación" para fijar el punto con tu GPS.</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: zoomDelta, longitudeDelta: zoomDelta }}
        onPress={handlePress}
        showsUserLocation
        showsMyLocationButton={false}
      >
        <Marker
          coordinate={{ latitude: lat, longitude: lng }}
          draggable
          onDragEnd={(e) => handleDragEnd(e.nativeEvent.coordinate)}
        >
          <MapPin />
        </Marker>
      </MapView>

      <AnimatedPressable style={styles.locateBtn} onPress={useMyLocation} disabled={locating}>
        {locating ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <LocateFixed size={14} color={colors.text} />
        )}
        <Text style={styles.locateText}>Usar mi ubicación</Text>
      </AnimatedPressable>

      <View style={styles.hint}>
        <Text style={styles.hintText}>Toca el mapa o arrastra el pin para ajustar la ubicación</Text>
      </View>
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { height: 260, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    fallbackCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },
    fallbackPin: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    fallbackCoords: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
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
}
