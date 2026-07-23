import Constants from 'expo-constants'
import { Linking, Platform } from 'react-native'

// react-native-maps with the Google provider needs a Google Maps API key baked
// into the native build. In a standalone APK/AAB without that key, rendering a
// native <MapView> crashes the app. We only render real maps when a key is
// present; otherwise every map falls back to a branded placeholder + a button
// that opens the location in the phone's Google Maps app (which always works).
const androidKey =
  (Constants.expoConfig?.android as { config?: { googleMaps?: { apiKey?: string } } } | undefined)?.config?.googleMaps
    ?.apiKey ?? null
const iosKey =
  (Constants.expoConfig?.ios as { config?: { googleMapsApiKey?: string } } | undefined)?.config?.googleMapsApiKey ?? null

export const MAPS_ENABLED = Boolean(Platform.OS === 'ios' ? iosKey || androidKey : androidKey)

export function openInMaps(lat: number, lng: number, label?: string) {
  const q = label ? encodeURIComponent(label) : ''
  const url = Platform.select({
    ios: `maps:0,0?q=${q}@${lat},${lng}`,
    android: `geo:0,0?q=${lat},${lng}${label ? `(${q})` : ''}`,
    default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  })
  if (url) Linking.openURL(url).catch(() => {})
}
