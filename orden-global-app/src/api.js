// El puente con los servidores de verdad. Nada simulado: la sesión es la
// misma de Veta Wallet (mismo backend, mismas credenciales), el estado del
// Genesis ID sale del puente /genesis que ya existe, y el chat habla con el
// relevo de mensajes del cerebro.
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const extra = Constants.expoConfig?.extra || {};
export const WALLET_API = (extra.walletApi || '').replace(/\/$/, '');
export const MENSAJES_API = (extra.mensajesApi || '').replace(/\/$/, '');
export const WEBS = {
  veta: extra.webVeta, pay: extra.webPay, scan: extra.webScan,
  cerebro: extra.webCerebro, genesis: extra.genesisUrl,
};

let token = null;
let cuenta = null; // { email, nombre, addr }

async function pedir(base, path, { method = 'GET', body, conToken = true, timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(base + path, {
      method,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(conToken && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || `Error ${res.status}`);
      err.code = res.status === 401 || res.status === 403 ? 'auth'
        : res.status >= 500 ? 'servidor' : 'http';
      throw err;
    }
    return data;
  } catch (e) {
    if (e?.name === 'AbortError') { const err = new Error('timeout'); err.code = 'red'; throw err; }
    if (!e?.code && (e instanceof TypeError || /network|fetch/i.test(e?.message || ''))) {
      const err = new Error('red'); err.code = 'red'; throw err;
    }
    throw e;
  } finally { clearTimeout(t); }
}

// El mismo contrato que veta-wallet-app/src/api.js: distintas versiones del
// backend nombran el token y el usuario de formas distintas, y aquí se
// aceptan todas para no romper con un despliegue.
const pickToken = (d) => d?.token || d?.accessToken || d?.access_token || d?.jwt || d?.data?.token || null;
const pickUser = (d) => (d?.user || d?.data?.user || d?.profile || null);

export async function entrar(email, password) {
  const d = await pedir(WALLET_API, '/auth/login', { method: 'POST', body: { email, password }, conToken: false });
  token = pickToken(d);
  const u = pickUser(d) || {};
  cuenta = {
    email: (u.email || email || '').toLowerCase(),
    nombre: u.name || u.nombre || u.fullName || (email || '').split('@')[0],
    addr: u.address || u.walletAddress || u.addr || '',
  };
  if (!token) { const e = new Error('sin token'); e.code = 'auth'; throw e; }
  await SecureStore.setItemAsync('og.sesion', JSON.stringify({ token, cuenta }));
  return cuenta;
}

export async function sesionGuardada() {
  const g = await SecureStore.getItemAsync('og.sesion').catch(() => null);
  if (!g) return null;
  try { const d = JSON.parse(g); token = d.token; cuenta = d.cuenta; return cuenta; }
  catch { return null; }
}

export async function salir() {
  token = null; cuenta = null;
  await SecureStore.deleteItemAsync('og.sesion').catch(() => {});
}

export const quienSoy = () => cuenta;
export const tokenSesion = () => token;

// ── Genesis ID ────────────────────────────────────────────────────────
// El puente /genesis/estado del backend de la wallet dice en qué va el
// trámite. "Completo" = aprobado. Si el puente no contesta, NO se bloquea a
// la persona por una falla de red: se deja pasar y se anota — la app
// embebida volverá a comprobar por su cuenta.
export async function genesisCompleto() {
  try {
    const d = await pedir(WALLET_API, '/genesis/estado');
    const est = String(d?.identidad?.estado || d?.estado || d?.status || '').toLowerCase();
    return { sabe: true, completo: /aprobad|complet|verificad|approved|verified/.test(est), estado: est };
  } catch (e) {
    return { sabe: false, completo: e.code !== 'auth', estado: 'sin datos (' + e.code + ')' };
  }
}

// ── El chat ───────────────────────────────────────────────────────────
// Relevo de mensajes del cerebro (infra/mensajes). Identidad = el correo de
// la sesión; el alta devuelve una llave que firma cada petición siguiente.
let llaveChat = null;
export async function chatAlta() {
  if (!MENSAJES_API || !cuenta) return null;
  const g = await SecureStore.getItemAsync('og.llaveChat').catch(() => null);
  if (g) { llaveChat = g; return g; }
  const d = await pedir(MENSAJES_API, '/alta', {
    method: 'POST', conToken: false,
    body: { correo: cuenta.email, nombre: cuenta.nombre, addr: cuenta.addr },
  });
  llaveChat = d.llave;
  await SecureStore.setItemAsync('og.llaveChat', llaveChat).catch(() => {});
  return llaveChat;
}
const conLlave = (body) => ({ ...body, correo: cuenta?.email, llave: llaveChat });

export async function chatEnviar(para, texto) {
  return pedir(MENSAJES_API, '/enviar', { method: 'POST', conToken: false, body: conLlave({ para, texto }) });
}
export async function chatBandeja(desde) {
  return pedir(MENSAJES_API, '/bandeja', { method: 'POST', conToken: false, body: conLlave({ desde }) });
}
export async function chatFicha(correo) {
  return pedir(MENSAJES_API, '/ficha', { method: 'POST', conToken: false, body: conLlave({ de: correo }) });
}

// ── La libreta (local) ────────────────────────────────────────────────
export async function listaContactos() {
  const g = await SecureStore.getItemAsync('og.contactos').catch(() => null);
  try { return g ? JSON.parse(g) : []; } catch { return []; }
}
export async function guardarContacto(c) {
  const lista = await listaContactos();
  const sin = lista.filter((x) => x.correo !== c.correo);
  sin.unshift({ nombre: c.nombre, correo: (c.correo || '').toLowerCase(), addr: c.addr || '' });
  await SecureStore.setItemAsync('og.contactos', JSON.stringify(sin.slice(0, 200)));
  return sin;
}
