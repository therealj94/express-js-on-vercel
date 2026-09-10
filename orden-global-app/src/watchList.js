import AsyncStorage from '@react-native-async-storage/async-storage';

// Direcciones que el usuario "observa" sin tener la llave: útil para ver
// la wallet de un familiar o de la empresa, para monitorear la tesorería
// de un negocio, etc. Se guardan por dispositivo (misma lógica que
// contactos: sobreviven cambios de sesión).
const KEY = 'veta-watchonly-v1';

export function isAddress(a) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(a || '').trim());
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

async function writeAll(arr) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  return arr;
}

export async function listWatched() {
  const arr = await readAll();
  return arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export async function addWatched({ name, address }) {
  const addr = String(address || '').trim();
  if (!isAddress(addr)) throw new Error('invalid-address');
  const arr = await readAll();
  const i = arr.findIndex((x) => x.address.toLowerCase() === addr.toLowerCase());
  const rec = {
    id: i >= 0 ? arr[i].id : `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: (name || '').trim() || `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    address: addr,
    addedAt: i >= 0 ? arr[i].addedAt : Date.now(),
  };
  if (i >= 0) arr[i] = rec; else arr.push(rec);
  await writeAll(arr);
  return rec;
}

export async function removeWatched(id) {
  const arr = (await readAll()).filter((x) => x.id !== id);
  return writeAll(arr);
}
