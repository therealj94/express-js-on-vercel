import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// Capa de conexión de Veta Wallet con TU backend / blockchain.
// Apunta al MISMO API que usa tu billetera web (Heroku / AWS).
//
//   URL del API:   EXPO_PUBLIC_WALLET_API_URL=https://tu-api.herokuapp.com
//   Si NO está definida, la app usa datos DEMO (mock) como hasta ahora.
//
// Las rutas por defecto siguen el patrón /auth/login, /wallet/balances, etc.
// Si tu backend usa otras rutas, sobre-escríbelas SIN tocar código con:
//   EXPO_PUBLIC_WALLET_PATH_LOGIN=/api/login
//   EXPO_PUBLIC_WALLET_PATH_BALANCES=/api/v1/wallet
//   ...ver PATHS abajo.
// ============================================================

export const API_BASE = (process.env.EXPO_PUBLIC_WALLET_API_URL || '').replace(/\/$/, '') || null;
export const USE_REAL_API = !!API_BASE;

// Rutas del backend (sobre-escribibles por env sin recompilar código).
const PATHS = {
  login: process.env.EXPO_PUBLIC_WALLET_PATH_LOGIN || '/auth/login',
  register: process.env.EXPO_PUBLIC_WALLET_PATH_REGISTER || '/auth/register',
  me: process.env.EXPO_PUBLIC_WALLET_PATH_ME || '/me',
  balances: process.env.EXPO_PUBLIC_WALLET_PATH_BALANCES || '/wallet/balances',
  address: process.env.EXPO_PUBLIC_WALLET_PATH_ADDRESS || '/wallet/address',
  send: process.env.EXPO_PUBLIC_WALLET_PATH_SEND || '/wallet/send',
  transactions: process.env.EXPO_PUBLIC_WALLET_PATH_TXNS || '/wallet/transactions',
  prices: process.env.EXPO_PUBLIC_WALLET_PATH_PRICES || '/prices',
};

let token = null;

export async function loadToken() {
  try { token = await AsyncStorage.getItem('veta-api-token'); } catch (e) {}
  return token;
}
export async function setToken(t) {
  token = t || null;
  try {
    if (t) await AsyncStorage.setItem('veta-api-token', t);
    else await AsyncStorage.removeItem('veta-api-token');
  } catch (e) {}
}
export function getToken() { return token; }

async function req(path, { method = 'GET', body, timeout = 15000 } = {}) {
  if (!API_BASE) throw new Error('API no configurada (define EXPO_PUBLIC_WALLET_API_URL)');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}

// ---- Decodifica el payload de un JWT (base64url) sin librerías externas.
// El backend de Veta Wallet mete userId/address/role/verify dentro del token.
export function decodeJwt(tk) {
  try {
    const part = String(tk).split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    let json;
    if (typeof atob === 'function') {
      json = decodeURIComponent(
        atob(b64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
    } else {
      json = b64Decode(b64);
    }
    return JSON.parse(json);
  } catch (e) { return null; }
}

// Fallback de base64 (por si atob no existe en el runtime).
function b64Decode(input) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = String(input).replace(/=+$/, '');
  let out = '';
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer);
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  try {
    return decodeURIComponent(out.split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  } catch (e) { return out; }
}

// ---- Normalizadores: adaptan respuestas de distintas formas a lo que usa la app.
// Aceptan las variantes más comunes de backends para no depender de un contrato exacto.

// Token en: data.token | data.accessToken | data.jwt | data.data.token
export function pickToken(d) {
  return d?.token || d?.accessToken || d?.access_token || d?.jwt || d?.data?.token || null;
}

// Usuario en: data.user | data.data.user | data (raíz)
export function pickUser(d) {
  return d?.user || d?.data?.user || d?.profile || d || null;
}

// Dirección en: data.address | data.wallet | data.publicKey | user.address
export function pickAddress(d) {
  return d?.address || d?.wallet || d?.walletAddress || d?.publicKey || d?.data?.address || null;
}

// Balances en varias formas → [{ symbol, qty, priceUsd }]
export function pickBalances(d) {
  const raw = d?.tokens || d?.balances || d?.assets || d?.data?.tokens || d?.data || d;
  if (Array.isArray(raw)) {
    return raw.map((b) => ({
      symbol: b.symbol || b.s || b.ticker || b.asset || b.code,
      qty: Number(b.qty ?? b.amount ?? b.balance ?? b.quantity ?? 0),
      priceUsd: Number(b.priceUsd ?? b.price ?? b.usd ?? 0) || undefined,
    })).filter((b) => b.symbol);
  }
  // Forma objeto: { ORIGEN: 21.28, BTC: 0.01 }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([, v]) => typeof v === 'number' || (v && typeof v === 'object'))
      .map(([symbol, v]) => (typeof v === 'number'
        ? { symbol, qty: v }
        : { symbol, qty: Number(v.qty ?? v.amount ?? v.balance ?? 0), priceUsd: Number(v.priceUsd ?? v.price ?? 0) || undefined }));
  }
  return [];
}

export const walletApi = {
  // Autenticación
  login: (email, password) => req(PATHS.login, { method: 'POST', body: { email, password } }),
  register: (payload) => req(PATHS.register, { method: 'POST', body: payload }),
  me: () => req(PATHS.me),

  // Billetera / blockchain
  balances: () => req(PATHS.balances),
  address: () => req(PATHS.address),
  send: (to, symbol, amount, note) => req(PATHS.send, { method: 'POST', body: { to, symbol, amount, note } }),
  transactions: () => req(PATHS.transactions),
  prices: () => req(PATHS.prices),

  raw: req,
  paths: PATHS,
};

// Login de alto nivel: autentica, guarda token y devuelve { token, user, address }
// ya normalizados. El backend de Veta Wallet devuelve solo { token }, con los
// datos del usuario (userId/address/role/verify) DENTRO del JWT.
export async function apiLogin(email, password) {
  const d = await walletApi.login(email, password);
  const tk = pickToken(d);
  if (tk) await setToken(tk);
  const claims = tk ? decodeJwt(tk) : null;
  const apiUser = pickUser(d);
  // Combina lo que venga en el body con lo que trae el token.
  const user = {
    email,
    ...(apiUser && typeof apiUser === 'object' && !apiUser.token ? apiUser : {}),
    ...(claims ? { userId: claims.userId, role: claims.role, verify: claims.verify } : {}),
  };
  const address = pickAddress(d) || claims?.address || pickAddress(apiUser || {}) || null;
  if (address) user.address = address;
  return { token: tk, user, address, claims };
}

// Carga balances normalizados del usuario autenticado.
export async function apiBalances() {
  const d = await walletApi.balances();
  return pickBalances(d);
}
