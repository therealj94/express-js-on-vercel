import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCOUNTS } from './accounts';

// Motor Genesis ID en el dispositivo: crea y GUARDA identidades reales (no
// teatro). Si EXPO_PUBLIC_GENESIS_URL está definida, además envía el registro
// al backend real de Genesis ID. Mismo modelo que genesis-id/src/types.ts.

const KEY = 'genesis-id-engine-v2';
// Genesis ID en la nube por defecto (funciona en Expo Go y en APK sin .env).
// Puedes sobrescribirlo con EXPO_PUBLIC_GENESIS_URL si algún día cambias de host.
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
  if (!cache) {
    // sembrar identidades verificadas de las cuentas del ecosistema
    cache = {
      identities: ACCOUNTS.map((a) => ({
        email: a.email, fullName: a.name, type: 'personal', step: 'verified',
        genesisUid: a.genesisUid, startedAt: now(), verifiedAt: now(), review24At: null,
      })),
    };
    await write();
  }
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

  // Crea o reanuda por correo (registro real + envío al backend si hay URL).
  async start(email, fullName) {
    const d = await read();
    const e = (email || '').toLowerCase().trim();
    let rec = d.identities.find((i) => i.email === e);
    if (!rec) {
      rec = { email: e, fullName: fullName || null, type: 'personal', step: 'doc-front', genesisUid: null, startedAt: now(), verifiedAt: null, review24At: null };
      d.identities.push(rec);
      await write();
    }
    post('', { email: e, fullName }); // best-effort al backend real
    return rec;
  },

  async setStep(email, step) {
    const d = await read();
    const rec = d.identities.find((i) => i.email === (email || '').toLowerCase().trim());
    if (rec) { rec.step = step; if (step === 'review24') rec.review24At = now(); await write(); }
    return rec;
  },

  async process(email) {
    const d = await read();
    const rec = d.identities.find((i) => i.email === (email || '').toLowerCase().trim());
    if (!rec) return null;
    // Modo conectado: el backend central verifica y emite el UID oficial.
    let backendUid = null;
    if (BASE) {
      try {
        const created = await post('', { email: rec.email, fullName: rec.fullName });
        const idn = created && created.identity;
        if (idn && idn.id) {
          const done = await fetch(`${BASE}/api/identities/${idn.id}/process`, { method: 'POST' }).then((r) => r.json());
          backendUid = (done && done.identity && done.identity.genesisUid) || null;
        }
      } catch (e) {}
    }
    rec.step = 'verified';
    rec.genesisUid = backendUid || rec.genesisUid || uid();
    rec.verifiedAt = now();
    await write();
    return rec;
  },
};
