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
  send: process.env.EXPO_PUBLIC_WALLET_PATH_SEND || '/transaction/send',
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

  // Blockchain de Orden Global: config de red + historial por chain_id.
  chain: (chainId) => req(`/chains/getChainsForId/${chainId}`),
  // Lista de chains/tokens del usuario (ajusta la ruta si difiere en tu backend).
  chains: () => req(process.env.EXPO_PUBLIC_WALLET_PATH_CHAINS || '/chains/getChains'),

  // Billetera / blockchain (rutas genéricas, por si tu backend las tiene)
  balances: () => req(PATHS.balances),
  address: () => req(PATHS.address),
  send: (to, symbol, amount, note) => req(PATHS.send, { method: 'POST', body: { to, symbol, amount, note } }),
  transactions: () => req(PATHS.transactions),
  prices: () => req(PATHS.prices),

  raw: req,
  paths: PATHS,
};

// Chain IDs a consultar (configurable). Por defecto la red Orden Global (8532).
export const CHAIN_IDS = (process.env.EXPO_PUBLIC_WALLET_CHAIN_IDS || '8532')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Lee el saldo NATIVO de una blockchain EVM directo del nodo RPC (solo lectura,
// no requiere llaves). Devuelve la cantidad en unidades del token (÷ 1e18).
export async function rpcBalance(provider, address, decimals = 18) {
  try {
    const res = await fetch(provider, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d || !d.result) return 0;
    // hex wei → número. Usamos BigInt para no perder precisión.
    const wei = BigInt(d.result);
    const div = BigInt(10) ** BigInt(decimals);
    const whole = Number(wei / div);
    const frac = Number(wei % div) / Number(div);
    return whole + frac;
  } catch (e) { return 0; }
}

// Lee el saldo de un token ERC-20 (contrato) directo del nodo RPC: balanceOf(addr).
export async function erc20Balance(provider, contract, address, decimals = 18) {
  try {
    // balanceOf(address) = selector 0x70a08231 + address a 32 bytes.
    const data = '0x70a08231' + address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    const res = await fetch(provider, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data }, 'latest'] }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d || !d.result || d.result === '0x') return 0;
    const raw = BigInt(d.result);
    const div = BigInt(10) ** BigInt(decimals);
    return Number(raw / div) + Number(raw % div) / Number(div);
  } catch (e) { return 0; }
}

// Lee los decimales de un token ERC-20 desde el contrato (decimals()).
export async function erc20Decimals(provider, contract) {
  try {
    const res = await fetch(provider, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data: '0x313ce567' }, 'latest'] }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d || !d.result || d.result === '0x') return null;
    return Number(BigInt(d.result));
  } catch (e) { return null; }
}

// Registro de tokens ON-CHAIN de Orden Global (red 8532). ORIGEN es el nativo;
// el resto son ERC-20 con su dirección de contrato. `price` = USD por token
// (los que faltan se ajustan cuando tengamos el precio de tu backend).
// AUKA (oro) y AGKA (plata) siguen el precio del metal; se pueden actualizar en
// vivo si tu backend expone un feed de precios (ver fetchPrices más abajo).
export const ONCHAIN_TOKENS = [
  { symbol: 'ORIGEN', native: true, decimals: 18, price: 2.35 },
  { symbol: 'AUKA', contract: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B', price: 4014, tracks: 'gold' },
  { symbol: 'AGKA', contract: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B', price: 57.22, tracks: 'silver' },
  { symbol: 'ONDK', contract: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1', price: 2.10 },
  { symbol: 'MNKA', contract: '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead', price: 1.50 },
];

// Precio de metales en vivo (USD por onza troy). Fuente configurable con
// EXPO_PUBLIC_METALS_API (por defecto gold-api.com, gratis y sin API key).
// Si falla, devuelve null y la app usa los precios fijos de respaldo.
export async function fetchMetalPrices() {
  const src = (process.env.EXPO_PUBLIC_METALS_API || 'https://api.gold-api.com').replace(/\/$/, '');
  const one = async (sym) => {
    try {
      const r = await fetch(`${src}/price/${sym}`);
      const d = await r.json().catch(() => ({}));
      const p = Number(d?.price ?? d?.rate ?? d?.value ?? d?.[sym]);
      return Number.isFinite(p) && p > 0 ? p : null;
    } catch (e) { return null; }
  };
  const [goldOz, silverOz] = await Promise.all([one('XAU'), one('XAG')]);
  return { goldOz, silverOz };
}

// Calcula precios en vivo de los tokens respaldados en metal.
//   AUKA  = 1 onza de oro       ORIGEN = 1/55 de gramo de oro
//   AGKA  = 1 onza de plata     (1 onza troy = 31.1035 g)
export async function livePrices() {
  const { goldOz, silverOz } = await fetchMetalPrices();
  const p = {};
  if (goldOz) {
    p.AUKA = goldOz;
    p.ORIGEN = goldOz / 31.1035 / 55;
  }
  if (silverOz) p.AGKA = silverOz;
  return p;
}

// Lee saldos de TODOS los tokens del registro (nativo + ERC-20) desde el RPC.
export async function apiPortfolioOnchain(providerUrl) {
  const claims = decodeJwt(getToken());
  const address = claims?.address;
  if (!address) return [];
  // Provider: el pasado, o el de la red 8532.
  let provider = providerUrl;
  if (!provider) {
    const chain = pickChain(await walletApi.chain(CHAIN_IDS[0] || '8532').catch(() => null));
    provider = chain?.provider || 'https://rpc.ordenglobal-rpc.com/';
  }
  // Precios en vivo (oro/plata) con respaldo a los fijos del registro.
  const live = await livePrices().catch(() => ({}));
  const out = [];
  for (const t of ONCHAIN_TOKENS) {
    let qty = 0;
    if (t.native) {
      qty = await rpcBalance(provider, address, t.decimals || 18);
    } else if (t.contract) {
      // Lee los decimales reales del contrato (fallback 18) para no equivocar el saldo.
      const dec = t.decimals || (await erc20Decimals(provider, t.contract)) || 18;
      qty = await erc20Balance(provider, t.contract, address, dec);
    } else continue; // token sin contrato aún: se omite
    const price = live[t.symbol] != null ? live[t.symbol] : t.price;
    out.push({ symbol: t.symbol, qty, priceUsd: price || undefined });
  }
  // Historial de la red (allTransfers) → se adjunta al token nativo.
  try {
    const chain = pickChain(await walletApi.chain(CHAIN_IDS[0] || '8532').catch(() => null));
    const transfers = Array.isArray(chain?.allTransfers) ? chain.allTransfers : [];
    const native = out.find((o) => o.symbol === 'ORIGEN') || out[0];
    if (native) native.transfers = transfers;
  } catch (e) {}
  return out;
}

// Extrae el objeto "chain" de la respuesta (viene como objeto, {chain}, o [chain]).
function pickChain(c) {
  if (!c) return null;
  if (Array.isArray(c)) return c[0] || null;
  return c.chain || c.data || c;
}

// Portafolio real: por cada chain, config + precio + saldo (RPC) + historial.
// Devuelve [{ symbol, qty, priceUsd, name, image, transfers }].
export async function apiPortfolio(chainIds = CHAIN_IDS) {
  const claims = decodeJwt(getToken());
  const address = claims?.address;
  const out = [];
  for (const id of chainIds) {
    const raw = await walletApi.chain(id).catch(() => null);
    const chain = pickChain(raw);
    if (!chain) continue;
    // Saldo: usa el campo del backend si viene; si no, léelo del nodo RPC.
    let qty = Number(chain.balance ?? chain.amount ?? chain.value ?? NaN);
    if (!Number.isFinite(qty) && chain.provider && address) {
      qty = await rpcBalance(chain.provider, address, Number(chain.decimals) || 18);
    }
    out.push({
      symbol: chain.symbol,
      qty: Number.isFinite(qty) ? qty : 0,
      priceUsd: Number(chain.price) || undefined,
      name: chain.name,
      image: chain.image,
      chainId: chain.chain_id || id,
      transfers: Array.isArray(chain.allTransfers) ? chain.allTransfers : [],
    });
  }
  return out;
}

// Envía una transacción vía tu backend (él la firma con tu password y la manda
// al RPC). Body exacto: { chain_id, recipientAddress, password, amount }.
// Devuelve el TransactionReceipt de ethers (hash, status, from, to).
export async function apiSend({ to, amount, password, chainId = CHAIN_IDS[0] || '8532' } = {}) {
  const body = {
    chain_id: String(chainId),
    recipientAddress: to,
    password,
    amount: String(amount),
  };
  const r = await walletApi.raw(walletApi.paths.send, { method: 'POST', body });
  const hash = r?.hash || r?.transactionHash || r?.txId || null;
  const ok = r?.status === 1 || r?.status === '1' || r?.status === true || !!hash;
  return { hash, ok, receipt: r };
}

// Normaliza allTransfers → items para la pantalla de Actividad.
export function transfersToActivity(transfers, symbol = '') {
  return (transfers || []).map((t) => {
    const inbound = t.type === 'recive' || t.type === 'receive' || t.type === 'in';
    return {
      hash: t.hash,
      type: inbound ? 'in' : 'out',
      value: Number(t.value) || 0,
      symbol,
      counterparty: inbound ? (t.from || '') : (t.to || ''),
      date: t.timeStamp ? new Date(Number(t.timeStamp) * 1000) : null,
    };
  });
}

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
