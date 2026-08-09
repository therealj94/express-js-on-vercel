import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import snapshot from './catalog-snapshot.json'

// Where the app looks for the marina office, in order:
//   1. whatever was typed into Settings on this phone
//   2. EXPO_PUBLIC_API_URL, baked in per EAS build profile
//   3. extra.apiUrl from app.json
//
// The setting exists so one APK survives the server moving. Nobody should have
// to rebuild and redistribute an app because a domain changed.
const BUILT_IN =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  ''

const KEY = 'roatan.apiUrl'
let override = null

export const builtInUrl = () => BUILT_IN
export const apiUrl = () => (override || BUILT_IN || '').replace(/\/+$/, '')

export async function loadApiUrl() {
  override = (await AsyncStorage.getItem(KEY)) || null
  return apiUrl()
}

export async function setApiUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '')
  override = clean || null
  if (clean) await AsyncStorage.setItem(KEY, clean)
  else await AsyncStorage.removeItem(KEY)
  return apiUrl()
}

/** Never leave the guest staring at a spinner because a tower is busy. */
async function call(path, options = {}, timeoutMs = 8000) {
  const base = apiUrl()
  if (!base) throw Object.assign(new Error('No server configured yet.'), { offline: true })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      // An HTML error page from a proxy, a parked domain, a captive portal —
      // all of it arrives here, and none of it is the marina office.
      throw Object.assign(new Error('That address did not answer like our booking server.'), {
        offline: true,
      })
    }
    if (!data.ok) throw Object.assign(new Error(data.error || 'Request failed'), { field: data.field })
    return data
  } catch (err) {
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('The server took too long to answer.'), { offline: true })
    }
    if (err instanceof TypeError) {
      throw Object.assign(new Error('No connection to the booking server.'), { offline: true })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The catalog always resolves. Live when the server answers, the copy that
 * shipped in the APK when it does not, so the fleet is never a blank screen.
 */
export async function getCatalog() {
  try {
    const live = await call('/api/catalog', {}, 6000)
    return { ...live, source: 'live' }
    } catch (err) {
    return { ...snapshot, source: 'bundled', reason: err.message }
  }
}

export const getAvailability = (vesselId) => call(`/api/availability?vesselId=${vesselId}`)
export const getQuote = (cart) => call('/api/quote', { method: 'POST', body: cart })
export const createBooking = (body) => call('/api/bookings', { method: 'POST', body })
export const getBooking = (ref) => call(`/api/bookings/${encodeURIComponent(ref)}`)

/** Used by Settings to tell a working address from a typo. */
export async function testConnection(url) {
  const clean = (url || '').trim().replace(/\/+$/, '')
  if (!clean) return { ok: false, message: 'Enter an address first.' }
  try {
    const res = await fetch(`${clean}/api/health`, { headers: { Accept: 'application/json' } })
    const data = await res.json()
    if (!data.ok || data.service !== 'roatan-yacht-getaways') {
      return { ok: false, message: 'Something answered, but it is not the booking server.' }
    }
    return { ok: true, message: `Connected. Payments: ${data.paymentMode}, storage: ${data.backend}.` }
  } catch {
    return { ok: false, message: 'Nothing answered at that address.' }
  }
}
