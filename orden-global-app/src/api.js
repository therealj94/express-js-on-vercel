import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// ============================================================
// Veta Wallet — capa de conexión con el backend oficial de
// Orden Global (Heroku) y la blockchain (nodo RPC, cadena 5550).
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
  sendToken: process.env.EXPO_PUBLIC_WALLET_PATH_SEND_TOKEN || '/transaction/sendToken',
  refresh: process.env.EXPO_PUBLIC_WALLET_PATH_REFRESH || '/auth/refresh',
  social: process.env.EXPO_PUBLIC_WALLET_PATH_SOCIAL || '/auth/social',
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

// Token de refresco (30 días, lo emite el backend junto al JWT en login).
// Vive en el mismo llavero seguro que el JWT y no depende de "Recordarme":
// permite renovar la sesión sin volver a pedir la contraseña.
let refreshToken = null;
const REFRESH_TOKEN_KEY = 'veta-refresh-token';

export async function loadRefreshToken() {
  refreshToken = await secureGet(REFRESH_TOKEN_KEY);
  return refreshToken;
}
export async function setRefreshToken(t) {
  refreshToken = t || null;
  if (t) await secureSet(REFRESH_TOKEN_KEY, t);
  else await secureDel(REFRESH_TOKEN_KEY);
}

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

// Garantiza sesión viva: si el token expiró, primero intenta renovarlo con
// el refreshToken (no pide contraseña, funciona aunque "Recordarme" esté
// apagado) y, si eso falla o no hay refreshToken guardado, cae al relogin
// con credenciales guardadas. Devuelve true si hay sesión utilizable.
export async function ensureSession() {
  if (tokenValid()) return true;
  // La tarea en segundo plano arranca el módulo de cero, así que el token en
  // memoria está vacío aunque haya uno guardado. Sin esto, con la app cerrada
  // no había sesión y los avisos de dinero recibido nunca salían.
  if (!token) { await loadToken(); if (tokenValid()) return true; }

  if (!refreshToken) await loadRefreshToken();
  if (refreshToken) {
    try {
      const d = await rawReq(PATHS.refresh, { method: 'POST', body: { refreshToken } });
      const tk = pickToken(d);
      if (tk) {
        await setToken(tk);
        const rt = pickRefreshToken(d);
        await setRefreshToken(rt || refreshToken);
        return true;
      }
    } catch (e) {}
  }

  const creds = await loadCreds();
  if (!creds) return false;
  try {
    const d = await rawReq(PATHS.login, { method: 'POST', body: { email: creds.email, password: creds.password } });
    const tk = pickToken(d);
    if (tk) {
      await setToken(tk);
      const rt = pickRefreshToken(d);
      if (rt) await setRefreshToken(rt);
      return true;
    }
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
//
// `opts.noRetry` desactiva ese reintento. Se usa en las operaciones que mueven
// dinero: repetir un POST que quizá ya se ejecutó del otro lado es peor que
// mostrar el error y dejar que el usuario verifique.
async function req(path, opts = {}) {
  if (path !== PATHS.login && !tokenValid()) await ensureSession();
  try {
    return await rawReq(path, opts);
  } catch (e) {
    const expired = e.status === 401 || e.status === 403 || /jwt|expired|unauthorized/i.test(e.message || '');
    if (!opts.noRetry && path !== PATHS.login && expired && (await ensureSession())) {
      return await rawReq(path, opts);
    }
    throw e;
  }
}

// ---------- normalizadores ----------
export function pickToken(d) {
  return d?.token || d?.accessToken || d?.access_token || d?.jwt || d?.data?.token || null;
}
export function pickRefreshToken(d) {
  return d?.refreshToken || d?.refresh_token || d?.data?.refreshToken || null;
}
export function pickUser(d) {
  const u = d?.user || d?.data?.user || d?.profile || null;
  return u && typeof u === 'object' ? u : null;
}

export const walletApi = {
  login: (email, password) => req(PATHS.login, { method: 'POST', body: { email, password } }),
  /* Cerrar sesión EN EL SERVIDOR. `logout` de App.js sólo borraba el llavero:
     el refresco de 30 días seguía vivo. /auth/logout sube tokenVersion y mata
     token y refresco de golpe. Se llama con el token que todavía está en
     memoria, antes de borrarlo. */
  logout: () => req('/auth/logout', { method: 'POST' }),
  register: (payload) => req(PATHS.register, { method: 'POST', body: payload }),
  chain: (chainId) => req(`/chains/getChainsForId/${chainId}`),
  raw: req,
  paths: PATHS,
};

// ---------- pasarela de entrada: depositar USDT y recibir ORIGEN ----------
//
// El usuario deposita USDT en Polygon a su PROPIA dirección — es la misma que
// ya tiene en la wallet, porque una clave privada sirve en las dos cadenas —
// y el backend le acredita ORIGEN.
//
// Ese ORIGEN es un saldo interno del backend y NO es el ORIGEN nativo de la
// cadena 5550 que la app lee por RPC en apiPortfolio(). Son dos saldos
// distintos a propósito y no hay que sumarlos como si fueran uno: el on-chain
// se puede firmar y enviar, este todavía no. Más adelante se conectan.
//
// No hay watcher del lado del backend: cada llamada compara el saldo USDT de
// la cadena contra lo ya acreditado. Por eso `deposit-info` y `check` pueden
// tardar — están leyendo Polygon — y por eso llamarlos de más no acredita de
// más.
export const depositApi = {
  // Dirección, red, mínimo y saldo. De paso revisa si entró algo.
  info: () => req('/wallet/deposit-info', { timeout: 30000 }),

  // Fuerza una revisión. Es lo que sondea la pantalla mientras espera.
  check: () => req('/wallet/deposit/check', { method: 'POST', timeout: 30000 }),

  // Solo el saldo interno. Barato: no toca la cadena.
  balance: () => req('/wallet/origen-balance', { timeout: 20000 }),

  // Historial de acreditaciones.
  list: (limit = 25) => req(`/wallet/deposits?limit=${encodeURIComponent(limit)}`, { timeout: 20000 }),
};

// ---------- tarjeta Visa (CryptoMate, vía nuestro backend) ----------
//
// La tarjeta es un producto REAL: el backend la emite contra CryptoMate y
// expone el estado, el saldo, los movimientos y los controles de seguridad.
// Todo pasa por el backend — la app nunca habla con CryptoMate directamente
// ni ve la API key.
//
// Dos reglas que vienen del backend y conviene respetar en la UI:
//   · Los montos se muestran en ORIGEN, nunca en USD/USDT. El backend ya
//     hace la conversión y devuelve `origenAmount` / `availableOrigen`.
//   · Los datos sensibles (número completo, CVV, PIN) exigen la contraseña
//     en cada consulta y no se cachean nunca en el dispositivo.
//
// `sinTarjeta` distingue "este usuario todavía no tiene tarjeta" (404, que
// es un estado normal y esperado) de un error de verdad, para que la
// pantalla muestre el flujo de solicitud en vez de un mensaje de fallo.
export function sinTarjeta(e) {
  return e?.status === 404;
}

export const cardApi = {
  // Estado de la tarjeta: last4, status, saldo en ORIGEN, límites.
  mine: () => req('/cards/my-card'),

  // Emitir. El backend exige KYC aprobado y aceptación de términos.
  request: ({ acceptedTerms, phoneCountryCode, phoneNumber }) =>
    req('/cards/request', {
      method: 'POST',
      body: {
        acceptedTerms: !!acceptedTerms,
        ...(phoneCountryCode ? { phone_country_code: Number(phoneCountryCode) } : {}),
        ...(phoneNumber ? { phone_number: String(phoneNumber) } : {}),
      },
      timeout: 45000,   // emitir una tarjeta pasa por CryptoMate: es lento
    }),

  // Congelar / descongelar. Control de seguridad real, no cosmético.
  setFrozen: (frozen) => req('/cards/freeze', { method: 'POST', body: { frozen: !!frozen } }),

  // Número completo + vencimiento + CVV. Requiere contraseña.
  // Puede devolver { pan, cvv, expiry } ya parseados o solo { panUrl } si
  // CryptoMate cambió el HTML — la pantalla contempla los dos casos.
  pan: (password) => req('/cards/pan', { method: 'POST', body: { password }, timeout: 30000 }),

  // PIN. Requiere contraseña. Igual que arriba: { pin } o { pinUrl }.
  // Responde 409 con code PIN_NOT_SET si la tarjeta todavía no tiene uno.
  pin: (password) => req('/cards/pin', { method: 'POST', body: { password }, timeout: 30000 }),

  // Crear o cambiar el PIN. Entre 4 y 12 dígitos.
  setPin: ({ pin, password }) =>
    req('/cards/pin', { method: 'PUT', body: { pin: String(pin), password }, timeout: 30000 }),

  // Movimientos. El backend ya devuelve los montos convertidos a ORIGEN.
  transactions: ({ page = 1, from, to } = {}) => {
    const q = new URLSearchParams({ page: String(page) });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return req(`/cards/transactions?${q.toString()}`, { timeout: 30000 });
  },

  // Direcciones para fondear la tarjeta desde fuera (USDT/USDC en Polygon).
  topUpWallets: () => req('/cards/top-up-wallets', { timeout: 30000 }),

  // Recargar la tarjeta con ORIGEN del propio saldo.
  //
  // Son dos transferencias en cadenas distintas: el usuario paga ORIGEN y el
  // treasury libera el equivalente en USDT a la tarjeta. El backend confirma
  // el pago antes de liberar nada, así que esta llamada puede volver con
  // `listo: false` y estado 'pending' — no es un error, es que la
  // confirmación todavía no llegó. En ese caso se consulta `fundStatus`.
  fund: ({ amountOrigen, password }) =>
    req('/cards/fund', {
      method: 'POST',
      body: { amount: String(amountOrigen), password },
      timeout: 60000,
    }),

  // Retoma la recarga en curso. Cada llamada intenta avanzarla.
  fundStatus: () => req('/cards/fund/status', { timeout: 45000 }),

  // Cuánto llevás gastado contra cada límite, en ORIGEN.
  spending: () => req('/cards/accumulated-spending', { timeout: 30000 }),

  // Estado de cuenta. Este endpoint responde CSV, no JSON, así que no puede
  // pasar por `req()` — se lee como texto plano.
  statementCsv: async ({ from, to } = {}) => {
    if (!API_BASE) { const e = new Error('API no configurada'); e.code = 'config'; throw e; }
    await ensureSession();
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const sufijo = q.toString() ? `?${q.toString()}` : '';
    const res = await fetch(`${API_BASE}/cards/statement${sufijo}`, {
      headers: { Accept: 'text/csv', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const err = new Error(`Error ${res.status}`);
      err.status = res.status;
      err.code = res.status === 401 ? 'auth' : res.status >= 500 ? 'servidor' : 'http';
      throw err;
    }
    // El backend antepone un BOM para que Excel respete los acentos; sobra
    // al compartir el texto por otras vías.
    return (await res.text()).replace(/^﻿/, '');
  },

  // Detalle de un movimiento: comercio, divisa original, tipo de cambio,
  // saldo antes y después.
  transaction: (txId) => req(`/cards/transactions/${encodeURIComponent(txId)}`, { timeout: 30000 }),

  // Teléfono donde llegan los códigos de las compras online (3D Secure).
  setOtpPhone: ({ countryCode, phone }) =>
    req('/cards/otp-phone', {
      method: 'PUT',
      body: { phone_country_code: Number(countryCode), phone: String(phone) },
    }),

  // Reemitir con número nuevo. El anterior deja de servir: pide contraseña.
  reissue: (password) => req('/cards/reissue', { method: 'PUT', body: { password }, timeout: 45000 }),

  // Quitar el bloqueo que aplica el emisor. Distinto de descongelar.
  unblock: () => req('/cards/unblock', { method: 'PATCH', timeout: 30000 }),

  // Autenticación de compras online. Hoy solo SMS.
  set3ds: (type = 'SMS') => req('/cards/3ds', { method: 'POST', body: { type } }),

  // Disputar un cargo.
  dispute: ({ transactionId, reason, merchant, amount, date }) =>
    req('/cards/dispute', {
      method: 'POST',
      body: { transaction_id: transactionId, reason, merchant, amount, date },
      timeout: 30000,
    }),

  limits: ({ daily, weekly, monthly }) =>
    req('/cards/limits', {
      method: 'PATCH',
      body: {
        ...(daily != null ? { daily_limit: Number(daily) } : {}),
        ...(weekly != null ? { weekly_limit: Number(weekly) } : {}),
        ...(monthly != null ? { monthly_limit: Number(monthly) } : {}),
      },
    }),

  cancel: (password) => req('/cards/cancel', { method: 'POST', body: { password } }),

  notifications: () => req('/cards/notifications'),
  markNotificationsRead: () => req('/cards/notifications/read', { method: 'POST' }),
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
  const rt = pickRefreshToken(d);
  if (rt) await setRefreshToken(rt);
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

// Entrar con Google o con Apple.
//
// El teléfono no manda datos de la persona: manda el token que firmó el
// proveedor, y el servidor comprueba esa firma contra las llaves públicas de
// Google o Apple. Desde acá el flujo termina igual que apiLogin —misma sesión,
// mismo refresco, misma forma de usuario— para que el resto de la aplicación
// no tenga que saber por dónde entró nadie.
export async function apiSocialLogin(provider, idToken) {
  if (!idToken) throw new Error('No se recibió la identidad del proveedor');
  const d = await req(PATHS.social, { method: 'POST', body: { provider, idToken } });
  const tk = pickToken(d);
  if (!tk) throw new Error('El servidor no devolvió una sesión válida');
  await setToken(tk);
  const rt = pickRefreshToken(d);
  if (rt) await setRefreshToken(rt);
  const claims = decodeJwt(tk) || {};
  const apiUser = pickUser(d) || {};
  const user = {
    email: (apiUser?.email || claims.email || '').trim(),
    ...apiUser,
    userId: claims.userId || apiUser.userId,
    role: claims.role,
    verify: claims.verify,
  };
  const address = claims.address || d?.address || apiUser.address || null;
  if (address) user.address = address;
  return { token: tk, user, address, claims, creada: !!d?.creada };
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
// Con tiempo de espera propio: sin esto, un nodo colgado dejaba el "tirar para
// refrescar" de Inicio girando hasta el timeout de la plataforma (60 s en iOS),
// porque apiPortfolio lanza cinco de estas en paralelo y espera a todas.
export async function rpcCall(provider, method, params, timeout = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(provider, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const d = await res.json().catch(() => ({}));
    return d?.result ?? null;
  } finally { clearTimeout(id); }
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

// Precios fijos de referencia para los tokens de sector que no cotizan en
// ningún mercado público (no están en CoinGecko ni tienen un feed propio como
// ONDK). Son los mismos valores que usa la billetera web — se confirmaron
// leyendo su propio bundle compilado (vetawallet.com), donde aparecen como
// una serie plana: el mismo número repetido en cada punto del histórico, lo
// que confirma que son fijos y no un precio de mercado real.
const FIXED_PRICES = {
  AGRO: 13.13, AIT: 5.32, SOL: 0.75, REST: 8.57, LOVE: 0.1,
  POLITICAL: 0.33, ASL: 2.328, AUBEX: 10, HARV: 0.75, IBS: 1.2,
};
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

// ---------- registro de tokens on-chain (red Orden Global 5550) ----------
// La red oficial de Orden Global es la 5550 desde el corte del 15-ago-2026:
// Layer 1 propia sobre Hyperledger Besu con consenso QBFT y EVM Shanghai.
// La variable sigue existiendo para poder apuntar a otra red sin recompilar.
export const CHAIN_ID = process.env.EXPO_PUBLIC_WALLET_CHAIN_ID || '5550';
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
  // Resto de los tokens reales de la red (contratos confirmados contra la
  // cadena: se les llamó symbol()/name()/decimals() a cada uno; los 16 usan
  // 18 decimales, se fija el valor para no gastar una llamada RPC extra por
  // token en cada carga del portafolio — el RPC de producción hoy es un
  // solo nodo). Se dejaron fuera TKNB y TXT — contratos de prueba, no
  // activos del ecosistema (confirmado por José).
  { symbol: 'IBS', contract: '0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62', decimals: 18 },
  { symbol: 'HARV', contract: '0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923', decimals: 18 },
  { symbol: 'AUBEX', contract: '0xF1498640B27A66C0DC505093D70911C060e04fb0', decimals: 18 },
  { symbol: 'ASL', contract: '0x69846aC960D45F9946C613DFCe1b761D37Faf098', decimals: 18 },
  { symbol: 'LOVE', contract: '0x638F2ba0e3E1083D1ba570b449BD266F3860D164', decimals: 18 },
  { symbol: 'REST', contract: '0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD', decimals: 18 },
  { symbol: 'SOL', contract: '0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66', decimals: 18 },
  { symbol: 'AIT', contract: '0xAE14Db486872AC07d74Ad69cC09590239b21BA2e', decimals: 18 },
  { symbol: 'AGRO', contract: '0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe', decimals: 18 },
  { symbol: 'POLITICAL', contract: '0x92496E1848e001428A3495409a9A9f616bB6dD3B', decimals: 18 },
];

// Caché del último precio "bueno" de ONDK que devolvió el endpoint de
// chain. Vive en memoria + en AsyncStorage para sobrevivir a reinicios
// de la app. Sirve de respaldo cuando el server no incluye el precio en
// una respuesta (pasa intermitentemente en cuentas nuevas). TTL 30 min.
const ONDK_CACHE = { price: null, at: 0 };
const ONDK_TTL = 30 * 60 * 1000;
const ONDK_CACHE_KEY = 'veta-ondk-price-cache';
// NO hay precio de respaldo horneado en el código. Antes existía una
// constante (2.10) que se usaba cuando el server no mandaba precio y el
// teléfono nunca lo había cacheado: ese número entraba al patrimonio total
// como si fuera precio de mercado, sin ninguna marca, y el usuario no tenía
// forma de saber que era inventado. Es exactamente lo que la política de
// precios de este archivo prohíbe seis líneas más arriba. Sin precio real
// se manda null y la UI muestra "—".

async function loadOndkCache() {
  try {
    const raw = await AsyncStorage.getItem(ONDK_CACHE_KEY);
    if (!raw) return;
    const { price, at } = JSON.parse(raw);
    if (price && at && Date.now() - at < ONDK_TTL) {
      ONDK_CACHE.price = Number(price);
      ONDK_CACHE.at = Number(at);
    }
  } catch (e) {}
}
async function saveOndkCache() {
  try { await AsyncStorage.setItem(ONDK_CACHE_KEY, JSON.stringify(ONDK_CACHE)); } catch (e) {}
}
// Se hidrata en cuanto el módulo carga.
loadOndkCache();

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

  // Precio de ONDK: primero lo intentamos del endpoint del chain. Si no
  // vino, usamos el último cacheado (mientras siga dentro del TTL). Si
  // el endpoint sí trajo precio nuevo, refrescamos el caché para el resto.
  // Precio de ONDK con 3 niveles de respaldo:
  //   1. El que trae el server ahora (mejor caso)
  //   2. El último cacheado en el teléfono (30 min TTL)
  //   3. Un valor estático de referencia (evita "—" en cuentas nuevas
  //      cuyo backend nunca les devolvió precio; el server real siempre
  //      gana en la siguiente carga que sí lo mande).
  let ondkPrice = Number(chain?.price) || null;
  if (ondkPrice && ondkPrice > 0) {
    ONDK_CACHE.price = ondkPrice;
    ONDK_CACHE.at = Date.now();
    saveOndkCache();
  } else if (ONDK_CACHE.price && Date.now() - ONDK_CACHE.at < ONDK_TTL) {
    ondkPrice = ONDK_CACHE.price;
  } else {
    ondkPrice = null;   // sin precio real: "—", nunca un número inventado
  }

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
    if (priceUsd == null && FIXED_PRICES[t.symbol] != null) priceUsd = FIXED_PRICES[t.symbol];
    // Sin precio real: se envía null (la UI lo pinta como "—"). Nunca un
    // valor cocinado — el usuario podría tomar decisiones a partir de él.
    return {
      symbol: t.symbol,
      qty: Number.isFinite(qty) ? qty : 0,
      priceUsd: priceUsd != null && priceUsd > 0 ? priceUsd : null,
      // Un precio fijo no tiene variación 24h real que reportar — null en vez
      // de un 0% que se leería como "no se movió hoy" cuando en realidad
      // nunca se mueve.
      changePct: FIXED_PRICES[t.symbol] != null ? null : (changes[t.symbol] ?? null),
      contract: t.contract || null,
    };
  }));

  return { balances, transfers };
}

// ---------- envíos (el backend firma con tu contraseña) ----------
// Body real de la billetera web: { chain_id, recipientAddress, password, amount }.
// Nota: este endpoint transfiere la moneda NATIVA (ORIGEN).
export async function apiSend({ to, amount, password, idem }) {
  const body = {
    chain_id: String(CHAIN_ID),
    recipientAddress: to,
    password,
    amount: String(amount),
    // Sello de idempotencia: mismo envío reintentado = mismo sello. El backend
    // debe descartar un segundo POST con un sello ya visto en vez de volver a
    // transferir. Mientras el backend no lo honre, la app igual evita el doble
    // envío por su lado (candado de reentrada + no ofrecer reintento cuando el
    // resultado quedó en duda), pero el respaldo real es este campo.
    ...(idem ? { idempotencyKey: idem } : {}),
  };
  // Minar y confirmar un bloque puede pasar de 20 s: con el tiempo de espera
  // por defecto el envío se cortaba a media transacción y salía "Aborted"
  // aunque la transacción se hubiera mandado.
  // `noRetry`: si este POST falla con 401/403, NO se reintenta solo. Reintentar
  // una transferencia que quizá ya se ejecutó es exactamente lo que no se debe
  // hacer; es preferible pedirle al usuario que verifique.
  const r = await req(PATHS.send, { method: 'POST', body, timeout: 90000, noRetry: true });
  const hash = r?.hash || r?.transactionHash || r?.txId || null;
  const ok = r?.status === 1 || r?.status === '1' || r?.status === true || !!hash;
  return { hash, ok, receipt: r };
}

// Comisión de red por defecto (gasPrice 400 gwei × 21000 gas). Sirve de
// respaldo si la lectura de gasPrice del RPC falla. En condiciones normales
// la app llama a estimateNetworkFee() y usa el valor real de la chain.
// Envío de un token ERC-20. El backend ya lo sabía hacer desde siempre
// —`POST /transaction/sendToken`, con el contrato como parámetro— pero la app
// nunca lo llamaba: la pantalla de enviar cortaba con un aviso de
// "próximamente" en cuanto el activo no era ORIGEN. Una billetera cuyo
// ecosistema entero son tokens no podía mover ni uno.
//
// La comisión se paga en ORIGEN, no en el token: mover ONDK gasta ORIGEN.
export async function apiSendToken({ to, amount, password, contract, idem }) {
  if (!contract) throw new Error('falta la dirección del contrato del token');
  const body = {
    chain_id: String(CHAIN_ID),
    recipientAddress: to,
    tokenContractAddress: contract,
    password,
    amount: String(amount),
    ...(idem ? { idempotencyKey: idem } : {}),
  };
  const r = await req(PATHS.sendToken, { method: 'POST', body, timeout: 90000, noRetry: true });
  const hash = r?.hash || r?.transactionHash || r?.txId || null;
  const ok = r?.status === 1 || r?.status === '1' || r?.status === true || !!hash;
  return { hash, ok, receipt: r };
}

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
// 401 se relanza de una: la clave existe y la contraseña estuvo mal, no
// tiene sentido seguir probando otras rutas con la misma contraseña.
async function tryPaths(cands, opts) {
  for (const p of cands) {
    try {
      const d = await req(p, opts);
      if (d && typeof d === 'object') return d;
    } catch (e) {
      if (e?.status === 401) throw e;
    }
  }
  return null;
}

export async function getSeed(password) {
  const extra = process.env.EXPO_PUBLIC_WALLET_PATH_SEED;
  const opts = { method: 'POST', body: { password }, timeout: 30000 };
  // La ruta real del backend es /users/decriptSeed (plural "users", y sí,
  // "decript" está mal escrito — así está en el servidor). Las tres viejas
  // (/user/seed, /auth/seed, /wallet/seed) nunca existieron: por eso esto
  // devolvía "no disponible" siempre y la app mandaba a la versión web. Se
  // dejan como respaldo por si algún día cambian de nombre otra vez.
  const d = await tryPaths([extra, '/users/decriptSeed', '/user/seed', '/auth/seed', '/wallet/seed'].filter(Boolean), opts);
  const phrase = d?.seed || d?.mnemonic || d?.phrase || d?.data?.seed || null;
  return typeof phrase === 'string' && phrase.trim().split(/\s+/).length >= 12 ? phrase.trim() : null;
}

export async function getPrivateKey(password) {
  const extra = process.env.EXPO_PUBLIC_WALLET_PATH_PRIVATE_KEY;
  const opts = { method: 'POST', body: { password }, timeout: 30000 };
  // Misma historia que getSeed(): la ruta real es /users/decriptPrivate.
  const d = await tryPaths([extra, '/users/decriptPrivate', '/user/privateKey', '/auth/privateKey', '/wallet/privateKey'].filter(Boolean), opts);
  const pk = d?.privateKey || d?.private_key || d?.key || d?.data?.privateKey || null;
  return typeof pk === 'string' && pk.length >= 32 ? pk : null;
}
