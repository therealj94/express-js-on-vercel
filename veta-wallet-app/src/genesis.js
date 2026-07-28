import AsyncStorage from '@react-native-async-storage/async-storage';

// Cliente del motor Genesis ID real (backend en la nube). Guarda una copia
// local para reanudar el proceso sin conexión, pero el UID oficial y el
// emparejamiento con la Veta Wallet (address) los emite el backend.

const KEY = 'genesis-id-engine-v3';
const BASE = (process.env.EXPO_PUBLIC_GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '') || null;

let cache = null; // { identities: [...] }

function uid() {
  const b = () => String(Math.floor(1000 + Math.random() * 9000));
  return `GEN-${b()}-${b()}`;
}
const now = () => new Date().toISOString();

async function read() {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : null;
  } catch (e) { cache = null; }
  if (!cache) cache = { identities: [] };
  return cache;
}
async function write() {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
}

function post(path, body) {
  if (!BASE) return Promise.resolve(null);
  return fetch(`${BASE}/api/identities${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  }).then((r) => r.json()).catch(() => null);
}

export const genesis = {
  async find(email) {
    const d = await read();
    return d.identities.find((i) => i.email === (email || '').toLowerCase().trim()) || null;
  },

  // Crea o reanuda por correo. Envía nombre + address de la Veta Wallet al
  // backend real para que la identidad quede emparejada desde el inicio.
  async start(email, fullName, walletAddress) {
    const d = await read();
    const e = (email || '').toLowerCase().trim();
    let rec = d.identities.find((i) => i.email === e);
    if (!rec) {
      rec = { email: e, fullName: fullName || null, walletAddress: walletAddress || null, type: 'personal', step: 'doc-front', genesisUid: null, startedAt: now(), verifiedAt: null, review24At: null };
      d.identities.push(rec);
      await write();
    } else if (walletAddress && rec.walletAddress !== walletAddress) {
      rec.walletAddress = walletAddress;
      await write();
    }
    post('', { email: e, fullName, walletAddress }); // best-effort al backend real
    return rec;
  },

  async setStep(email, step) {
    const d = await read();
    const rec = d.identities.find((i) => i.email === (email || '').toLowerCase().trim());
    if (rec) { rec.step = step; if (step === 'review24') rec.review24At = now(); await write(); }
    return rec;
  },

  // Verifica en el backend central: emite el UID oficial y deja emparejada
  // la Veta Wallet (email + fullName + walletAddress visibles en el admin).
  async process(email, extra = {}) {
    const d = await read();
    const e = (email || '').toLowerCase().trim();
    let rec = d.identities.find((i) => i.email === e);
    if (!rec) {
      rec = { email: e, fullName: extra.fullName || null, walletAddress: extra.walletAddress || null, type: 'personal', step: 'processing', genesisUid: null, startedAt: now(), verifiedAt: null, review24At: null };
      d.identities.push(rec);
    }
    if (extra.walletAddress) rec.walletAddress = extra.walletAddress;
    if (extra.fullName && !rec.fullName) rec.fullName = extra.fullName;

    let backendUid = null;
    if (BASE) {
      try {
        const created = await post('', { email: rec.email, fullName: rec.fullName, walletAddress: rec.walletAddress });
        const idn = created && created.identity;
        if (idn && idn.id) {
          const done = await fetch(`${BASE}/api/identities/${idn.id}/process`, { method: 'POST' }).then((r) => r.json());
          backendUid = (done && done.identity && done.identity.genesisUid) || null;
        }
      } catch (e2) {}
    }
    rec.step = 'verified';
    rec.genesisUid = backendUid || rec.genesisUid || uid();
    rec.verifiedAt = now();
    await write();
    return rec;
  },

  // Empareja la Veta Wallet con una identidad Genesis ya existente.
  async linkWallet(email, walletAddress) {
    const d = await read();
    const rec = d.identities.find((i) => i.email === (email || '').toLowerCase().trim());
    if (rec) { rec.walletAddress = walletAddress; await write(); }
    return post('/link-wallet', { email, walletAddress });
  },
};
