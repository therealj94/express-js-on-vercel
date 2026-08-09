import Constants from 'expo-constants'

// EXPO_PUBLIC_API_URL is baked in per EAS build profile; the value in app.json
// is the fallback so Expo Go and a bare `expo start` still work.
export const API =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://10.0.2.2:3000'

async function call(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({ ok: false, error: 'The server said something we could not read.' }))
  if (!data.ok) throw Object.assign(new Error(data.error || 'Request failed'), { field: data.field })
  return data
}

export const getCatalog = () => call('/api/catalog')
export const getAvailability = (vesselId) => call(`/api/availability?vesselId=${vesselId}`)
export const getQuote = (cart) => call('/api/quote', { method: 'POST', body: cart })
export const createBooking = (body) => call('/api/bookings', { method: 'POST', body })
export const getBooking = (ref) => call(`/api/bookings/${encodeURIComponent(ref)}`)
