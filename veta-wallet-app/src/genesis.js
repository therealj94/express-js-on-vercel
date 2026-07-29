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

const esBilletera = (v) => /^0x[a-fA-F0-9]{40}$/.test(String(v || '').trim());

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
  // El portal puede mandar el nombre partido en dos campos.
  const partes = [pick(s, 'firstName', 'first_name', 'givenName', 'given_name', 'nombres'),
    pick(s, 'lastName', 'last_name', 'familyName', 'family_name', 'surname', 'apellidos')].filter(Boolean);
  return {
    genesisUid: String(uid),
    fullName: pick(s, 'fullName', 'name', 'full_name', 'fullname', 'legalName', 'nombre')
      || (partes.length ? partes.join(' ') : null) || fallback.fullName || null,
    email: pick(s, 'email', 'correo', 'mail') || fallback.email || null,
    // 'address' se reparte según su forma: si parece 0x… es la billetera; si
    // no, es el domicilio del titular (abajo). Antes un domicilio acababa
    // guardado como dirección on-chain.
    walletAddress: pick(s, 'walletAddress', 'wallet', 'wallet_address')
      || (esBilletera(s?.address) ? String(s.address).trim() : null)
      || fallback.walletAddress || null,
    documentId: pick(s, 'documentId', 'document', 'documentNumber', 'document_number', 'dni', 'idNumber'),
    nationality: pick(s, 'nationality', 'country', 'nacionalidad', 'pais'),
    birthDate: pick(s, 'birthDate', 'dob', 'dateOfBirth', 'birth_date', 'fechaNacimiento'),
    // Datos generales que también rellenan el perfil de la app.
    phone: pick(s, 'phone', 'phoneNumber', 'phone_number', 'telefono', 'mobile', 'celular'),
    address: pick(s, 'residence', 'homeAddress', 'home_address', 'addressLine', 'address_line', 'direccion', 'domicilio', 'city')
      || (esBilletera(s?.address) ? null : pick(s, 'address')),
    photoUrl: pick(s, 'photoUrl', 'photo', 'photo_url', 'avatar', 'avatarUrl', 'selfieUrl', 'selfie', 'picture', 'image', 'imageUrl', 'foto'),
    status: verified ? 'verified' : statusRaw.includes('review') || statusRaw.includes('pending') ? 'review' : (statusRaw || 'pending'),
    issuedAt: pick(s, 'verifiedAt', 'issuedAt', 'issued_at') || now(),
    raw: s,
  };
}

/**
 * Saca un pasaporte de CUALQUIER texto: el .json que descargas del portal, un
 * código QR, un enlace o un bloque en base64. Es lo que permite importar el
 * pasaporte a mano cuando la consulta automática al portal no lo devuelve.
 */
export function passportFromText(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return null;

  // 1) JSON directo
  try { const p = toPassport(JSON.parse(txt)); if (p) return p; } catch (e) {}

  // 2) JSON dentro del texto (por si trae encabezados o saltos)
  const brace = txt.indexOf('{');
  if (brace >= 0) {
    try { const p = toPassport(JSON.parse(txt.slice(brace, txt.lastIndexOf('}') + 1))); if (p) return p; } catch (e) {}
  }

  // 3) base64 de un JSON
  if (/^[A-Za-z0-9+/=\s]+$/.test(txt) && txt.length > 40) {
    try {
      const limpio = txt.replace(/\s/g, '');
      const dec = typeof atob === 'function'
        ? atob(limpio)
        : typeof Buffer !== 'undefined' ? Buffer.from(limpio, 'base64').toString('utf8') : null;
      if (dec) { const p = toPassport(JSON.parse(dec)); if (p) return p; }
    } catch (e) {}
  }

  // 4) URL o deep link con parámetros (?gid=…&name=…)
  const q = txt.includes('?') ? txt.slice(txt.indexOf('?') + 1) : txt;
  if (q.includes('=')) {
    const obj = {};
    for (const part of q.split('&')) {
      const [k, ...v] = part.split('=');
      if (k) obj[k.trim()] = decodeURIComponent((v.join('=') || '').trim().replace(/\+/g, ' '));
    }
    const p = toPassport(obj);
    if (p) return p;
  }
  return null;
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

  /**
   * Diagnóstico honesto de por qué no llegó el pasaporte. Devuelve un código
   * para que la pantalla explique el problema real en vez de un "en proceso"
   * genérico:
   *   'no-engine'      → no hay internet o el motor está dormido/caído
   *   'no-key'         → el servidor no tiene GENESIS_API_KEY configurada
   *   'not-verified'   → el portal responde, pero aún no te ha verificado
   *   'ok'             → todo listo
   */
  async diagnose(email, walletAddress) {
    let health = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(`${ENGINE}/api/portal/status`, { signal: ctrl.signal });
      clearTimeout(timer);
      health = await res.json();
    } catch (e) {
      return { code: 'no-engine' };
    }
    // El servidor dice POR QUÉ la clave no sirve (abreviada, con espacios…).
    // Se pasa tal cual a la pantalla para no obligar a mirar los registros.
    if (!health?.configured) return { code: 'no-key', portal: health?.portal, detail: health?.problemaConLaClave || null };
    const p = await this.status(email, walletAddress).catch(() => null);
    if (p?.status === 'verified') return { code: 'ok', passport: p };
    return { code: 'not-verified', passport: p };
  },

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
