import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// ============================================================
// Genesis ID — identidad digital de Orden Global.
//
// La verificación REAL ocurre en el portal oficial:
//     https://www.genesisid.online
//
// Flujo:
//   1. La app abre el portal con los datos de la cuenta (correo, nombre y
//      dirección de la Veta Wallet) + una URL de retorno (deep link).
//   2. El usuario completa allá TODO el proceso (documento, rostro, datos).
//   3. Al terminar, el portal regresa a la app por el deep link con el UID.
//   4. Si el portal aún no soporta el retorno, la app consulta el motor
//      Genesis por correo y trae el pasaporte igual.
// ============================================================

const KEY = 'genesis-id-local-v4';

// Portal público de Genesis ID (donde el usuario llena su información).
export const PORTAL = (process.env.EXPO_PUBLIC_GENESIS_PORTAL || 'https://www.genesisid.online').replace(/\/$/, '');
// Motor/backend de Genesis ID (emite y consulta identidades).
export const ENGINE = (process.env.EXPO_PUBLIC_GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '');
// Deep link de retorno a la app.
export const RETURN_URL = 'vetawallet://genesis';

const now = () => new Date().toISOString();

async function readLocal() {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
async function writeLocal(rec) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {}
  return rec;
}

// ---------- motor Genesis (backend) ----------
async function engine(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(`${ENGINE}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

/** Consulta el pasaporte en el motor por correo. */
export async function fetchIdentity(email) {
  const d = await engine(`/identities/by-email/${encodeURIComponent((email || '').toLowerCase().trim())}`);
  return d?.identity || null;
}

/** Registra/actualiza la identidad con la Veta Wallet emparejada. */
export async function pairWallet({ email, fullName, walletAddress }) {
  const d = await engine('/identities', { method: 'POST', body: { email, fullName, walletAddress } });
  return d?.identity || null;
}

// Construye la URL del portal con los datos de la cuenta y el retorno.
export function portalUrl({ email, fullName, walletAddress }) {
  const q = new URLSearchParams();
  if (email) q.set('email', email);
  if (fullName) q.set('name', fullName);
  if (walletAddress) { q.set('wallet', walletAddress); q.set('address', walletAddress); }
  q.set('source', 'veta-wallet');
  q.set('return_url', RETURN_URL);
  q.set('redirect_uri', RETURN_URL);
  return `${PORTAL}/?${q.toString()}`;
}

// Normaliza lo que devuelva el portal o el motor a un pasaporte de la app.
export function toPassport(src, fallback = {}) {
  if (!src) return null;
  const uid = src.genesisUid || src.uid || src.genesis_uid || src.id || null;
  if (!uid) return null;
  return {
    genesisUid: String(uid),
    fullName: src.fullName || src.name || src.full_name || fallback.fullName || null,
    email: src.email || fallback.email || null,
    walletAddress: src.walletAddress || src.wallet || fallback.walletAddress || null,
    documentId: src.documentId || src.document || src.dni || src.doc || null,
    nationality: src.nationality || src.country || src.pais || null,
    birthDate: src.birthDate || src.dob || src.fechaNacimiento || null,
    status: src.step === 'verified' || src.status === 'verified' ? 'verified'
      : src.step === 'review24' || src.status === 'review' ? 'review' : (src.status || src.step || 'pending'),
    issuedAt: src.verifiedAt || src.issuedAt || now(),
    photoUrl: src.photoUrl || src.photo || src.avatar || null,
    raw: src,
  };
}

// Lee el pasaporte de un deep link de retorno: vetawallet://genesis?uid=…
export function passportFromUrl(url) {
  try {
    const { queryParams } = Linking.parse(url);
    if (!queryParams) return null;
    const p = toPassport(queryParams);
    if (p) return p;
    // Algunos portales devuelven el objeto completo codificado en JSON.
    const blob = queryParams.data || queryParams.passport || queryParams.identity;
    if (blob) {
      try { return toPassport(JSON.parse(decodeURIComponent(String(blob)))); } catch (e) {}
    }
    return null;
  } catch (e) { return null; }
}

export const genesis = {
  PORTAL, ENGINE, RETURN_URL,

  /** Pasaporte guardado en el dispositivo. */
  local: readLocal,
  save: writeLocal,

  /**
   * Abre el portal oficial y espera el regreso.
   * Devuelve { passport } si se obtuvo, o { cancelled } / { pending }.
   */
  async verify({ email, fullName, walletAddress }) {
    // Deja la identidad creada y la billetera emparejada antes de salir.
    await pairWallet({ email, fullName, walletAddress });

    const url = portalUrl({ email, fullName, walletAddress });
    let result;
    try {
      result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL, {
        showInRecents: true,
        preferEphemeralSession: false,
      });
    } catch (e) {
      // Si no se puede abrir la sesión con retorno, abre el navegador normal.
      try { await WebBrowser.openBrowserAsync(url); } catch (e2) {}
      result = { type: 'dismiss' };
    }

    // 1) El portal regresó por el deep link con los datos.
    if (result?.type === 'success' && result.url) {
      const p = passportFromUrl(result.url);
      if (p) {
        p.walletAddress = p.walletAddress || walletAddress;
        p.email = p.email || email;
        p.fullName = p.fullName || fullName;
        await writeLocal(p);
        return { passport: p };
      }
    }

    // 2) Sin datos en el retorno: consulta el motor por correo (el portal ya
    //    debió emitir la identidad allá).
    const idn = await fetchIdentity(email);
    const p = toPassport(idn, { email, fullName, walletAddress });
    if (p && p.status === 'verified') {
      await writeLocal(p);
      return { passport: p };
    }
    if (p) return { pending: p };
    return result?.type === 'cancel' ? { cancelled: true } : { pending: null };
  },

  /** Reintenta traer el pasaporte del motor (para el botón "Ya me verifiqué"). */
  async refresh(email, fallback) {
    const idn = await fetchIdentity(email);
    const p = toPassport(idn, fallback);
    if (p && p.status === 'verified') { await writeLocal(p); return p; }
    return p ? { ...p, _notVerified: true } : null;
  },
};
