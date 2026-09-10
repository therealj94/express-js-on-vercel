import AsyncStorage from '@react-native-async-storage/async-storage';

// Cuentas REALES de Veta Wallet. No hay cuentas demo: cada registro viene del
// backend oficial de Orden Global. Aquí solo se cachea la cuenta en el
// dispositivo para abrir la app al instante y sobrevivir sin conexión.

let CACHE = [];
const CACHE_KEY = 'veta-accounts-cache-v2';

export async function initAccounts() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    CACHE = raw ? JSON.parse(raw) : [];
  } catch (e) { CACHE = []; }
  return CACHE;
}

async function persist() {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(CACHE)); } catch (e) {}
}

function initialsFrom(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  // Respaldo de marca actual: 'OG' de Orden Global (el 'VW' era del fork).
  if (parts.length === 0) return 'OG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function accountByEmail(email) {
  const e = (email || '').toLowerCase().trim();
  return CACHE.find((a) => a.email === e) || null;
}

// Crea/actualiza la cuenta local a partir del login real + portafolio on-chain.
// Conserva los datos de perfil ya guardados (nombre, teléfono, etc.).
export async function upsertApiAccount(user, address, portfolio) {
  const email = (user?.email || '').toLowerCase().trim();
  const prev = accountByEmail(email) || {};
  const balances = Array.isArray(portfolio?.balances) ? portfolio.balances : [];
  const transfers = Array.isArray(portfolio?.transfers) ? portfolio.transfers : [];
  const name = prev.name && prev.name !== emailName(email)
    ? prev.name
    : (user?.name || user?.fullName || prev.name || emailName(email));

  const acc = {
    ...prev,
    email,
    name,
    initials: initialsFrom(name),
    addr: address || user?.address || prev.addr || null,
    userId: user?.userId || prev.userId || null,
    role: user?.role || prev.role || 'user',
    verify: user?.verify ?? prev.verify ?? false,
    genesisUid: prev.genesisUid || null,
    balances,
    transfers,
    since: prev.since || new Date().toLocaleDateString('es-HN', { month: 'short', year: 'numeric' }),
    fromApi: true,
    updatedAt: Date.now(),
  };
  CACHE = CACHE.filter((a) => a.email !== email);
  CACHE.push(acc);
  await persist();
  return acc;
}

function emailName(email) {
  const base = (email || '').split('@')[0] || 'Mi cuenta';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// Actualiza campos de perfil (nombre, teléfono, país...) en la cuenta local.
export async function updateAccount(email, patch) {
  const e = (email || '').toLowerCase().trim();
  const acc = accountByEmail(e);
  if (!acc) return null;
  Object.assign(acc, patch);
  if (patch.name) acc.initials = initialsFrom(patch.name);
  await persist();
  return acc;
}

// Vincula el pasaporte Genesis ID (opcional) a la cuenta, con toda su
// información: UID, nombre legal, documento, nacionalidad, foto, estado…
export async function setPassport(email, passport) {
  if (!passport) return null;
  const acc = accountByEmail((email || '').toLowerCase().trim());
  // El pasaporte rellena el perfil: lo que Genesis verifica no hay que volver
  // a escribirlo a mano (era lo que se sentía "duplicado" en Ajustes).
  const auto = {};
  if (passport.nationality && !acc?.country) auto.country = passport.nationality;
  if (passport.phone && !acc?.phone) auto.phone = passport.phone;
  if (passport.address && !acc?.address2) auto.address2 = passport.address;
  return updateAccount(email, {
    genesisUid: passport.genesisUid || null,
    passport,
    // Si Genesis trae el nombre legal verificado, prevalece sobre el escrito.
    ...(passport.fullName ? { name: passport.fullName } : {}),
    ...auto,
  });
}

// ---- sesión persistida ----
const SESSION_KEY = 'veta-session-email';
export async function saveSession(email) {
  try { await AsyncStorage.setItem(SESSION_KEY, (email || '').toLowerCase().trim()); } catch (e) {}
}
export async function loadSession() {
  try {
    const e = await AsyncStorage.getItem(SESSION_KEY);
    return e ? accountByEmail(e) : null;
  } catch (e) { return null; }
}
export async function clearSession() {
  try { await AsyncStorage.removeItem(SESSION_KEY); } catch (e) {}
}
