import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// ============================================================
// Genesis ID — identidad digital de Orden Global.
//
// La verificación REAL ocurre en el portal oficial genesisid.online.
// La app NUNCA lleva la API key (gid_live_…): un APK se descomprime y
// cualquiera la extraería. La app habla con el motor Genesis (Render), y
// ESE servidor es quien llama al portal con la clave.
//
//   App  ──▶  motor Genesis (/api/portal/*)  ──X-API-Key──▶  genesisid.online
//
// Flujo:
//   1. La app registra al usuario y abre el portal con sus datos.
//   2. El usuario completa allá la verificación.
//   3. Al volver: si el portal devuelve un token, se valida en el servidor;
//      si no, se consulta el estado por correo. En ambos casos la app
//      obtiene el pasaporte completo.
// ============================================================

const KEY = 'genesis-id-local-v4';

export const PORTAL = (process.env.EXPO_PUBLIC_GENESIS_PORTAL || 'https://www.genesisid.online').replace(/\/$/, '');
export const ENGINE = (process.env.EXPO_PUBLIC_GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '');
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

// ---------- motor Genesis (nuestro servidor) ----------
async function engine(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${ENGINE}/api${path}`, {
      method: body ? 'POST' : 'GET',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}

// Primer valor no vacío entre varios nombres posibles de campo.
const pick = (o, ...keys) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
};

/**
 * Normaliza un pasaporte venga del servidor, del portal o del deep link.
 * Acepta el objeto plano o anidado y los nombres de campo más habituales
 * (gid/uid/genesisUid, name/fullName, photo/avatar/picture…).
 */
export function toPassport(src, fallback = {}) {
  if (!src || typeof src !== 'object') return null;
  const s = src.user || src.identity || src.data || src.passport || src;
  const uid = pick(s, 'genesisUid', 'gid', 'uid', 'genesis_uid', 'genesisId', 'genesis_id', 'GID');
  if (!uid) return null;
  const statusRaw = String(pick(s, 'status', 'step', 'state', 'kycStatus') || '').toLowerCase();
  const verified = statusRaw.includes('verif') || statusRaw.includes('approve')
    || statusRaw === 'active' || statusRaw === 'complete' || statusRaw === 'completed'
    || s.verified === true || s.isVerified === true;
  return {
    genesisUid: String(uid),
    fullName: pick(s, 'fullName', 'name', 'full_name', 'fullname', 'legalName', 'nombre') || fallback.fullName || null,
    email: pick(s, 'email', 'correo', 'mail') || fallback.email || null,
    walletAddress: pick(s, 'walletAddress', 'wallet', 'wallet_address', 'address') || fallback.walletAddress || null,
    documentId: pick(s, 'documentId', 'document', 'documentNumber', 'document_number', 'dni', 'idNumber'),
    nationality: pick(s, 'nationality', 'country', 'nacionalidad', 'pais'),
    birthDate: pick(s, 'birthDate', 'dob', 'dateOfBirth', 'birth_date', 'fechaNacimiento'),
    photoUrl: pick(s, 'photoUrl', 'photo', 'photo_url', 'avatar', 'avatarUrl', 'selfieUrl', 'selfie', 'picture', 'image', 'imageUrl', 'foto'),
    status: verified ? 'verified' : statusRaw.includes('review') || statusRaw.includes('pending') ? 'review' : (statusRaw || 'pending'),
    issuedAt: pick(s, 'verifiedAt', 'issuedAt', 'issued_at') || now(),
    raw: s,
  };
}

/** Combina dos pasaportes sin perder datos (el nuevo manda, el viejo rellena). */
export function mergePassport(base, extra) {
  if (!base) return extra || null;
  if (!extra) return base;
  const out = { ...base };
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v !== undefined && v !== null && String(v).trim?.() !== '') out[k] = v;
  }
  return out;
}

/** Lee el token o el pasaporte del deep link de retorno. */
export function readReturnUrl(url) {
  try {
    const { queryParams } = Linking.parse(url);
    if (!queryParams) return {};
    const token = queryParams.token || queryParams.code || queryParams.access_token || null;
    const passport = toPassport(queryParams);
    return { token: token ? String(token) : null, passport };
  } catch (e) { return {}; }
}
// Compatibilidad con el manejador de deep links de App.js
export const passportFromUrl = (url) => readReturnUrl(url).passport;

/** URL del portal con los datos de la cuenta y el retorno a la app. */
export function portalUrl({ email, fullName, walletAddress }) {
  const q = new URLSearchParams();
  if (email) q.set('email', email);
  if (fullName) q.set('name', fullName);
  if (walletAddress) { q.set('wallet', walletAddress); q.set('address', walletAddress); }
  q.set('app', 'veta-wallet');
  q.set('source', 'veta-wallet');
  q.set('return_url', RETURN_URL);
  q.set('redirect_uri', RETURN_URL);
  return `${PORTAL}/?${q.toString()}`;
}

export const genesis = {
  PORTAL, ENGINE, RETURN_URL,
  local: readLocal,
  save: writeLocal,

  /** Registra/vincula al usuario en el portal antes de verificar. */
  register: ({ email, fullName, walletAddress }) =>
    engine('/portal/register', { email, fullName, walletAddress }),

  /** Consulta el estado de verificación y trae el pasaporte si ya existe. */
  async status(email, walletAddress) {
    const d = await engine('/portal/user-status', { email, walletAddress });
    return d?.passport ? toPassport(d.passport, { email, walletAddress }) : null;
  },

  /** Valida en el servidor el token que devolvió el portal. */
  async validateToken(token, { email, walletAddress } = {}) {
    const d = await engine('/portal/token-validate', { token, email, walletAddress });
    return d?.passport ? toPassport(d.passport, { email, walletAddress }) : null;
  },

  /**
   * Abre el portal oficial y espera el regreso.
   * Devuelve { passport } | { pending } | { cancelled }.
   */
  async verify({ email, fullName, walletAddress }) {
    await this.register({ email, fullName, walletAddress });

    const url = portalUrl({ email, fullName, walletAddress });
    let result;
    try {
      result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL, { showInRecents: true });
    } catch (e) {
      try { await WebBrowser.openBrowserAsync(url); } catch (e2) {}
      result = { type: 'dismiss' };
    }

    const fb = { email, fullName, walletAddress };
    if (result?.type === 'success' && result.url) {
      const { token, passport: fromUrl } = readReturnUrl(result.url);
      let p = fromUrl;
      // 1) Si trae token, se valida en el servidor (allí vive la API key) y
      //    lo que devuelva se COMBINA con lo que venía en la URL: así no se
      //    pierde ni el GID, ni el nombre, ni la foto, venga de donde venga.
      if (token) {
        const validated = await this.validateToken(token, { email, walletAddress });
        p = mergePassport(p, validated);
      }
      // 2) Completa lo que falte consultando el estado por correo.
      if (p && (!p.photoUrl || !p.fullName || !p.documentId)) {
        const status = await this.status(email, walletAddress).catch(() => null);
        p = mergePassport(p, status);
      }
      if (p) {
        p = mergePassport(p, null);
        p.email = p.email || email;
        p.fullName = p.fullName || fullName;
        p.walletAddress = p.walletAddress || walletAddress;
        await writeLocal(p);
        return { passport: p };
      }
    }

    // 3) Sin datos en el retorno: consulta el estado por correo.
    const p = await this.status(email, walletAddress);
    if (p?.status === 'verified') {
      p.fullName = p.fullName || fullName;
      await writeLocal(p);
      return { passport: p };
    }
    if (p) return { pending: p };
    return result?.type === 'cancel' ? { cancelled: true } : { pending: null };
  },

  /** Botón "Ya me verifiqué": vuelve a consultar el estado. */
  async refresh(email, fallback = {}) {
    const p = await this.status(email, fallback.walletAddress);
    if (p?.status === 'verified') { await writeLocal(p); return p; }
    return p ? { ...p, _notVerified: true } : null;
  },
};
