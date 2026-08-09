import AsyncStorage from '@react-native-async-storage/async-storage'

// Who is holding the phone. There is no accounts server yet, so this is a
// local profile: it remembers a name, an email and a phone so the guest never
// types them twice, and it is what the checkout form is pre-filled from.
//
// Nothing here is a security boundary and it does not pretend to be. When the
// real accounts endpoint exists, `signIn` and `register` are the two functions
// that change, and no screen has to.

const KEY = 'roatan.account'
const SEEN_INTRO = 'roatan.seenIntro'

export async function loadAccount() {
  const raw = await AsyncStorage.getItem(KEY)
  return raw ? JSON.parse(raw) : null
}

export async function saveAccount(account) {
  await AsyncStorage.setItem(KEY, JSON.stringify(account))
  return account
}

export async function signOut() {
  await AsyncStorage.removeItem(KEY)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Returns the account, or throws a message a human can act on. */
export async function register({ name, email, phone }) {
  if (!String(name || '').trim()) throw new Error('We need a name for the boarding pass.')
  if (!EMAIL.test(String(email || '').trim())) {
    throw new Error('That email does not look right — we send the boarding pass there.')
  }
  return saveAccount({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: String(phone || '').trim(),
    joinedAt: new Date().toISOString().slice(0, 10),
    guest: false,
  })
}

export async function signIn({ email }) {
  if (!EMAIL.test(String(email || '').trim())) throw new Error('Enter the email you booked with.')
  const known = await loadAccount()
  const clean = email.trim().toLowerCase()
  // Offline, the only account we can recognise is the one on this phone.
  if (known && known.email === clean) return saveAccount({ ...known, guest: false })
  return saveAccount({ name: '', email: clean, phone: '', guest: false })
}

export async function continueAsGuest() {
  return saveAccount({ name: '', email: '', phone: '', guest: true })
}

export async function hasSeenIntro() {
  return (await AsyncStorage.getItem(SEEN_INTRO)) === 'yes'
}

export async function markIntroSeen() {
  await AsyncStorage.setItem(SEEN_INTRO, 'yes')
}
