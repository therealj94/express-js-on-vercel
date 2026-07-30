import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// ============================================================
// Veta Wallet — capa de conexión con el backend oficial de
// Orden Global (Heroku) y la blockchain (nodo RPC, chain 8532).
// Nada simulado: login, saldos, historial y envíos son reales.
//
// SECRETOS EN EL DISPOSITIVO
// El token JWT y las credenciales "recordarme" viven en el
// Keychain (iOS) y Keystore (Android) mediante expo-secure-store,
// no en AsyncStorage. Un backup del teléfono ya no expone
// contraseñas. La migración desde AsyncStorage se hace la
// primera vez que se lee cada llave (ver secureGet).
// ============================================================

// ---------- almacenamiento seguro (llavero del sistema) ----------
async function secureGet(key) {
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v != null) return v;
    // Migración: si aún queda en AsyncStorage (versión vieja),
    // lo movemos al llavero y limpiamos el rastro anterior.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy != null) {
      try { await SecureStore.setItemAsync(key, legacy); } catch (e) {}
      try { await AsyncStorage.removeItem(key); } catch (e) {}
      return legacy;
    }
    return null;
  } catch (e) { return null; }
}
async function secureSet(key, value) {
  try { await SecureStore.setItemAsync(key, String(value)); } catch (e) {}
}
async function secureDel(key) {
  try { await SecureStore.deleteItemAsync(key); } catch (e) {}
  // Por si quedó copia vieja en AsyncStorage tras una actualización.
  try { await AsyncStorage.removeItem(key); } catch (e) {}
}

export const API_BASE = (process.env.EXPO_PUBLIC_WALLET_API_URL || 'https://vetawallet-1a2e38ac52b1.herokuapp.com').replace(/\/$/, '') || null;
export const USE_REAL_API = !!API_BASE;
export const RPC_FALLBACK = 'https://rpc.ordenglobal-rpc.com/';

const PATHS = {
  login: process.env.EXPO_PUBLIC_WALLET_PATH_LOGIN || '/auth/login',
  register: process.env.EXPO_PUBLIC_WALLET_PATH_REGISTER || '/auth/register',
  send: process.env.EXPO_PUBLIC_WALLET_PATH_SEND || '/transaction/send',
};

// ---------- token + credenciales recordadas (en el llavero) ----------
let token = null;
const TOKEN_KEY = 'veta-api-token';

export async function loadToken() {
  token = await secureGet(TOKEN_KEY);
  return token;
}
export async function setToken(t) {
  token = t || null;
  if (t) await secureSet(TOKEN_KEY, t);
  else await secureDel(TOKEN_KEY);
}
export function getToken() { return token; }

// "Recordarme": guarda credenciales para renovar la sesión sola cuando el
// JWT expira (el backend lo vence a los 40 min). Así la app no te saca.
// Van al Keychain/Keystore, no a AsyncStorage.
const CREDS_KEY = 'veta-remember-creds';
export async function saveCreds(email, password) {
  await secureSet(CREDS_KEY, JSON.stringify({ email, password }));
}
export async function loadCreds() {
  const raw = await secureGet(CREDS_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
export async function clearCreds() {
  await secureDel(CREDS_KEY);
}

// ---------- JWT ----------
export function decodeJwt(tk) {
  try {
    const part = String(tk).split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    let json;
    if (typeof atob === 'function') {
      json = decodeURIComponent(atob(b64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    } else {
      json = b64Fallback(b64);
    }
    return JSON.parse(json);
  } catch (e) { return null; }
}
function b64Fallback(input) {
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

export function tokenValid() {
  const c = token ? decodeJwt(token) : null;
  return !!(c && c.exp && c.exp * 1000 > Date.now() + 30000);
}

// Garantiza sesión viva: si el token expiró y hay credenciales guardadas,
// renueva el login en silencio. Devuelve true si hay sesión utilizable.
export async function ensureSession() {
  if (tokenValid()) return true;
  // La tarea en segundo plano arranca el módulo de cero, así que el token en
  // memoria está vacío aunque haya uno guardado. Sin esto, con la app cerrada
  // no había sesión y los avisos de dinero recibido nunca salían.
  if (!token) { await loadToken(); if (tokenValid()) return true; }
  const creds = await loadCreds();
  if (!creds) return false;
  try {
    const d = await rawReq(PATHS.login, { method: 'POST', body: { email: creds.email, password: creds.password } });
    const tk = pickToken(d);
    if (tk) { await setToken(tk); return true; }
  } catch (e) {}
  return false;
}

// ---------- HTTP ----------
async function rawReq(path, { method = 'GET', body, timeout = 20000 } = {}) {
  if (!API_BASE) { const e = new Error('API no configurada'); e.code = 'config'; throw e; }
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
    if (!res.ok) {
      const err = new Error(data.message || data.error || `Error ${res.status}`);
      err.status = res.status;
      // Un código propio para que la pantalla sepa qué decir sin leer textos.
      err.code = res.status === 401 || res.status === 403 ? 'auth'
        : res.status === 400 || res.status === 422 ? 'rechazado'
          : res.status >= 500 ? 'servidor' : 'http';
      throw err;
    }
    return data;
  } catch (e) {
    // Sin esto, al vencer el tiempo de espera la pantalla mostraba el mensaje
    // crudo de la excepción: un "Aborted" que no le dice nada a nadie.
    if (e?.name === 'AbortError') { const err = new Error('timeout'); err.code = 'timeout'; throw err; }
    if (!e?.code && (e instanceof TypeError || /network|fetch/i.test(e?.message || ''))) {
      const err = new Error('network'); err.code = 'red'; throw err;
    }
    throw e;
  } finally { clearTimeout(t); }
}

// req con renovación automática: si el token venció (401 / jwt expired),
// re-inicia sesión con las credenciales guardadas y reintenta una vez.
async function req(path, opts = {}) {
  if (path !== PATHS.login && !tokenValid()) await ensureSession();
  try {
    return await rawReq(path, opts);
  } catch (e) {
    const expired = e.status === 401 || e.status === 403 || /jwt|expired|unauthorized/i.test(e.message || '');
    if (path !== PATHS.login && expired && (await ensureSession())) {
      return await rawReq(path, opts);
    }
    throw e;
  }
}

// ---------- normalizadores ----------
export function pickToken(d) {
  return d?.token || d?.accessToken || d?.access_token || d?.jwt || d?.data?.token || null;
}
export function pickUser(d) {
  const u = d?.user || d?.data?.user || d?.profile || null;
  return u && typeof u === 'object' ? u : null;
}

export const walletApi = {
  login: (email, password) => req(PATHS.login, { method: 'POST', body: { email, password } }),
  register: (payload) => req(PATHS.register, { method: 'POST', body: payload }),
  chain: (chainId) => req(`/chains/getChainsForId/${chainId}`),
  raw: req,
  paths: PATHS,
};

// Login de alto nivel. El backend devuelve { token } con los datos del usuario
// (userId/address/role/verify) dentro del JWT.
//
// El correo se envía TAL COMO lo escribió el usuario. Algunos servidores
// respetan mayúsculas y minúsculas (Proton, por ejemplo), así que forzar
// minúsculas hacía que cuentas como "Canadian-8th@proton.me" entraran a
// la web pero no a la app. Si el intento con la caja original falla con
// CUALQUIER error de credenciales (401, 403, 400/422 con mensaje típico
// de "wrong password"), se reintenta UNA vez con la versión en minúsculas.
// Cubrimos así servidores case-sensitive y los que normalizan.
const AUTH_ERR_RE = /wrong|invalid|incorrect|credential|password|contraseñ|correo|no\s*encontrad|not\s*found|no\s*existe/i;
function esErrorDeCredenciales(e) {
  const s = e?.status;
  if (s === 401 || s === 403) return true;
  if ((s === 400 || s === 404 || s === 422) && AUTH_ERR_RE.test(e?.message || '')) return true;
  return false;
}

export async function apiLogin(emailRaw, password) {
  const email = String(emailRaw || '').trim();
  const lower = email.toLowerCase();
  let d;
  try {
    d = await walletApi.login(email, password);
  } catch (e) {
    // Si el primer intento falla por credenciales y el correo tiene
    // mayúsculas, probamos también con la versión en minúsculas.
    if (lower !== email && esErrorDeCredenciales(e)) {
      try {
        d = await walletApi.login(lower, password);
      } catch (e2) {
        // Se re-lanza el error del segundo intento (más específico).
        throw e2;
      }
    } else {
      throw e;
    }
  }
  const tk = pickToken(d);
  if (!tk) throw new Error('El servidor no devolvió una sesión válida');
  await setToken(tk);
  const claims = decodeJwt(tk) || {};
  const apiUser = pickUser(d) || {};
  const user = {
    email: (apiUser?.email || email).trim(),
    ...apiUser,
    userId: claims.userId || apiUser.userId,
    role: claims.role,
    verify: claims.verify,
  };
  const address = claims.address || apiUser.address || apiUser.wallet || null;
  if (address) user.address = address;
  return { token: tk, user, address, claims };
}

// Registro contra el backend oficial. Tras crear la cuenta inicia sesión.
//
// El backend puede publicar la ruta con otro nombre. Se prueba la configurada
// primero y, si responde 404 (no existe), otras variantes comunes: si alguna
// devuelve algo distinto de 404, ya es la buena. Si TODAS dan 404, el
// mensaje dice qué probamos, en vez de un genérico.
export async function apiRegister({ name, email, password }) {
  const body = { name, email, password, fullName: name };
  const rutas = [PATHS.register, '/auth/signup', '/register', '/signup', '/users/register', '/api/auth/register', '/api/register'];
  const probadas = [];
  let usada = null;
  let ultimo404 = null;

  for (const ruta of rutas) {
    if (probadas.includes(ruta)) continue;
    probadas.push(ruta);
    try {
      await rawReq(ruta, { method: 'POST', body });
      usada = ruta;
      break;
    } catch (e) {
      // 404 → seguimos probando; ya-existe → login directo; otro → se lanza.
      if (e.status === 404) { ultimo404 = e; continue; }
      if (/exist|registrad|duplicate|ya\s*existe/i.test(e.message || '') || e.status === 409) {
        usada = ruta; break;
      }
      throw e;
    }
  }

  if (!usada && ultimo404) {
    const err = new Error(`El servidor no tiene endpoint de registro. Se probaron: ${probadas.join(', ')}. Puede que las cuentas se creen desde la web.`);
    err.code = 'no-register';
    throw err;
  }
  // Login inmediato con las credenciales recién creadas.
  return apiLogin(email, password);
}

// ---------- blockchain (RPC, solo lectura) ----------
export async function rpcCall(provider, method, params) {
  const res = await fetch(provider, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const d = await res.json().catch(() => ({}));
  return d?.result ?? null;
}

function fromUnits(hex, decimals = 18) {
  try {
    if (!hex || hex === '0x') return 0;
    const raw = BigInt(hex);
    const div = BigInt(10) ** BigInt(decimals);
    return Number(raw / div) + Number(raw % div) / Number(div);
  } catch (e) { return 0; }
}

export async function rpcBalance(provider, address, decimals = 18) {
  try { return fromUnits(await rpcCall(provider, 'eth_getBalance', [address, 'latest']), decimals); }
  catch (e) { return 0; }
}

export async function erc20Balance(provider, contract, address, decimals = 18) {
  try {
    const data = '0x70a08231' + address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    return fromUnits(await rpcCall(provider, 'eth_call', [{ to: contract, data }, 'latest']), decimals);
  } catch (e) { return 0; }
}

export async function erc20Decimals(provider, contract) {
  try {
    const r = await rpcCall(provider, 'eth_call', [{ to: contract, data: '0x313ce567' }, 'latest']);
    if (!r || r === '0x') return null;
    return Number(BigInt(r));
  } catch (e) { return null; }
}

// ---------- precios (CoinGecko, igual que la web) ----------
// AUKA sigue el oro (PAXG = 1 oz oro) y AGKA la plata (KAG = 1 oz plata).
// ORIGEN = 1/55 de un gramo de oro. Fallback: gold-api.com.
const COINGECKO = (process.env.EXPO_PUBLIC_PRICES_API || 'https://api.coingecko.com/api/v3').replace(/\/$/, '');
const OZ_GRAMS = 31.1035;

export async function fetchMetalPrices() {
  // 1) CoinGecko (la misma fuente que usa la billetera web)
  try {
    const r = await fetch(`${COINGECKO}/simple/price?ids=pax-gold,kinesis-silver&vs_currencies=usd&include_24hr_change=true`);
    const d = await r.json();
    const gold = Number(d?.['pax-gold']?.usd);
    const silver = Number(d?.['kinesis-silver']?.usd);
    if (gold > 0) {
      return {
        goldOz: gold,
        silverOz: silver > 0 ? silver : null,
        goldChg: Number(d?.['pax-gold']?.usd_24h_change) || null,
        silverChg: Number(d?.['kinesis-silver']?.usd_24h_change) || null,
      };
    }
  } catch (e) {}
  // 2) Respaldo: gold-api.com (sin API key)
  const one = async (sym) => {
    try {
      const r = await fetch(`https://api.gold-api.com/price/${sym}`);
      const d = await r.json().catch(() => ({}));
      const p = Number(d?.price);
      return p > 0 ? p : null;
    } catch (e) { return null; }
  };
  const [goldOz, silverOz] = await Promise.all([one('XAU'), one('XAG')]);
  return { goldOz, silverOz, goldChg: null, silverChg: null };
}

// ---------- velas japonesas (histórico OHLC real) ----------
//
// CoinGecko devuelve [[ms, open, high, low, close], …]. El intervalo lo elige
// la propia API según los días pedidos: 1 día → velas de 30 min; hasta 30 días
// → 4 h; más → 4 días. AUKA sigue el oro y AGKA la plata, así que se leen de
// pax-gold y kinesis-silver; ORIGEN es la misma serie del oro escalada a
// 1/55 de gramo. ONDK y MNKA no cotizan en un mercado público: para ellos no
// se inventan velas, se avisa en pantalla.
const CG_ID = { AUKA: 'pax-gold', ORIGEN: 'pax-gold', AGKA: 'kinesis-silver' };
const CG_FACTOR = { ORIGEN: 1 / OZ_GRAMS / 55 };

// Temporalidades que se ofrecen en la ficha del token.
export const TIMEFRAMES = [
  { k: '1D', days: 1 },
  { k: '1W', days: 7 },
  { k: '1M', days: 30 },
  { k: '3M', days: 90 },
  { k: '1Y', days: 365 },
];

const ohlcCache = new Map(); // symbol|days → { at, velas }

/** Velas reales del token. Devuelve [] si ese token no cotiza. */
export async function fetchCandles(symbol, days = 1) {
  const sym = String(symbol || '').toUpperCase();
  const id = CG_ID[sym];
  if (!id) return [];
  const key = `${sym}|${days}`;
  const hit = ohlcCache.get(key);
  // Las velas de un día se refrescan cada 2 min; las largas, cada 30.
  const ttl = days <= 1 ? 120000 : 1800000;
  if (hit && Date.now() - hit.at < ttl) return hit.velas;
  try {
    const r = await fetch(`${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=${days}`);
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) return hit?.velas || [];
    const f = CG_FACTOR[sym] || 1;
    const velas = d
      .map((v) => ({ t: Number(v[0]), o: Number(v[1]) * f, h: Number(v[2]) * f, l: Number(v[3]) * f, c: Number(v[4]) * f }))
      .filter((v) => Number.isFinite(v.o) && Number.isFinite(v.c) && Number.isFinite(v.h) && Number.isFinite(v.l));
    ohlcCache.set(key, { at: Date.now(), velas });
    return velas;
  } catch (e) {
    return hit?.velas || [];
  }
}

/** ¿Este token tiene mercado público con histórico? */
export const tieneVelas = (symbol) => !!CG_ID[String(symbol || '').toUpperCase()];

export async function livePrices() {
  const { goldOz, silverOz, goldChg, silverChg } = await fetchMetalPrices();
  const prices = {}, changes = {};
  if (goldOz) {
    prices.AUKA = goldOz;
    prices.ORIGEN = goldOz / OZ_GRAMS / 55;
    if (goldChg != null) { changes.AUKA = goldChg; changes.ORIGEN = goldChg; }
  }
  if (silverOz) {
    prices.AGKA = silverOz;
    if (silverChg != null) changes.AGKA = silverChg;
  }
  return { prices, changes };
}

// ---------- registro de tokens on-chain (red Orden Global 8532) ----------
export const CHAIN_ID = process.env.EXPO_PUBLIC_WALLET_CHAIN_ID || '8532';
// Ya no hay `fallbackPrice`: si CoinGecko y gold-api caen, es preferible
// mostrar "—" que un número congelado que un usuario podría confundir con
// precio de mercado y usar para vender/comprar mal. La app pinta el estado
// "sin precio" en Home y TokenDetail cuando priceUsd viene null.
export const ONCHAIN_TOKENS = [
  { symbol: 'ORIGEN', native: true, decimals: 18 },
  { symbol: 'AUKA', contract: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B' },
  { symbol: 'AGKA', contract: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B' },
  { symbol: 'ONDK', contract: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1' },
  { symbol: 'MNKA', contract: '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead' },
];

// Portafolio real completo: saldo de cada token (RPC), precio en vivo,
// variación 24h e historial de la red. Incluye tokens con saldo 0.
export async function apiPortfolio() {
  const claims = decodeJwt(getToken());
  const address = claims?.address;
  if (!address) return { balances: [], transfers: [] };

  // Config real de la red (provider, precio ONDK, historial)
  let chain = null;
  try {
    const raw = await walletApi.chain(CHAIN_ID);
    chain = Array.isArray(raw) ? raw[0] : raw?.chain || raw?.data || raw;
  } catch (e) {}
  const provider = chain?.provider || RPC_FALLBACK;
  const transfers = Array.isArray(chain?.allTransfers) ? chain.allTransfers : [];
  const ondkPrice = Number(chain?.price) || null;

  const { prices, changes } = await livePrices().catch(() => ({ prices: {}, changes: {} }));

  const balances = await Promise.all(ONCHAIN_TOKENS.map(async (t) => {
    let qty = 0;
    try {
      if (t.native) qty = await rpcBalance(provider, address, t.decimals || 18);
      else {
        const dec = t.decimals || (await erc20Decimals(provider, t.contract)) || 18;
        qty = await erc20Balance(provider, t.contract, address, dec);
      }
    } catch (e) {}
    let priceUsd = prices[t.symbol];
    if (priceUsd == null && t.symbol === 'ONDK' && ondkPrice) priceUsd = ondkPrice;
    // Sin precio real: se envía null (la UI lo pinta como "—"). Nunca un
    // valor cocinado — el usuario podría tomar decisiones a partir de él.
    return {
      symbol: t.symbol,
      qty: Number.isFinite(qty) ? qty : 0,
      priceUsd: priceUsd != null && priceUsd > 0 ? priceUsd : null,
      changePct: changes[t.symbol] ?? null,
      contract: t.contract || null,
    };
  }));

  return { balances, transfers };
}

// ---------- envíos (el backend firma con tu contraseña) ----------
// Body real de la billetera web: { chain_id, recipientAddress, password, amount }.
// Nota: este endpoint transfiere la moneda NATIVA (ORIGEN).
export async function apiSend({ to, amount, password }) {
  const body = {
    chain_id: String(CHAIN_ID),
    recipientAddress: to,
    password,
    amount: String(amount),
  };
  // Minar y confirmar un bloque puede pasar de 20 s: con el tiempo de espera
  // por defecto el envío se cortaba a media transacción y salía "Aborted"
  // aunque la transacción se hubiera mandado.
  const r = await req(PATHS.send, { method: 'POST', body, timeout: 90000 });
  const hash = r?.hash || r?.transactionHash || r?.txId || null;
  const ok = r?.status === 1 || r?.status === '1' || r?.status === true || !!hash;
  return { hash, ok, receipt: r };
}

// Comisión de red por defecto (gasPrice 400 gwei × 21000 gas). Sirve de
// respaldo si la lectura de gasPrice del RPC falla. En condiciones normales
// la app llama a estimateNetworkFee() y usa el valor real de la chain.
export const NETWORK_FEE_ORIGEN = 0.0084;

/**
 * Estima el fee real de una transferencia nativa (ORIGEN) leyendo el
 * gasPrice actual del RPC. Devuelve el fee en ORIGEN. Si el RPC no
 * responde, devuelve NETWORK_FEE_ORIGEN como respaldo.
 *
 *   fee_wei = gasPrice_wei * gasLimit
 *   fee_origen = fee_wei / 10^18
 *
 * gasLimit 21000 para transferencia nativa (por defecto). Para ERC-20
 * pasar 65000 aprox. cuando lo enchufemos.
 */
export async function estimateNetworkFee(gasLimit = 21000) {
  try {
    let provider = RPC_FALLBACK;
    try {
      const raw = await walletApi.chain(CHAIN_ID);
      const chain = Array.isArray(raw) ? raw[0] : raw?.chain || raw?.data || raw;
      provider = chain?.provider || RPC_FALLBACK;
    } catch (e) {}
    const hex = await rpcCall(provider, 'eth_gasPrice', []);
    if (!hex) return NETWORK_FEE_ORIGEN;
    const gasPrice = BigInt(hex);
    const feeWei = gasPrice * BigInt(gasLimit);
    const div = BigInt(10) ** BigInt(18);
    const fee = Number(feeWei / div) + Number(feeWei % div) / Number(div);
    return Number.isFinite(fee) && fee > 0 ? fee : NETWORK_FEE_ORIGEN;
  } catch (e) {
    return NETWORK_FEE_ORIGEN;
  }
}

// ---------- seed / llave privada (si el backend los expone) ----------
async function tryPaths(cands, opts) {
  for (const p of cands) {
    try {
      const d = await req(p, opts);
      if (d && typeof d === 'object') return d;
    } catch (e) {}
  }
  return null;
}

export async function getSeed() {
  const extra = process.env.EXPO_PUBLIC_WALLET_PATH_SEED;
  const d = await tryPaths([extra, '/user/seed', '/auth/seed', '/wallet/seed'].filter(Boolean));
  const phrase = d?.seed || d?.mnemonic || d?.phrase || d?.data?.seed || null;
  return typeof phrase === 'string' && phrase.trim().split(/\s+/).length >= 12 ? phrase.trim() : null;
}

export async function getPrivateKey() {
  const extra = process.env.EXPO_PUBLIC_WALLET_PATH_PRIVATE_KEY;
  const d = await tryPaths([extra, '/user/privateKey', '/auth/privateKey', '/wallet/privateKey'].filter(Boolean));
  const pk = d?.privateKey || d?.private_key || d?.key || d?.data?.privateKey || null;
  return typeof pk === 'string' && pk.length >= 32 ? pk : null;
}
