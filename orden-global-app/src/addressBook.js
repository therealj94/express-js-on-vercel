import AsyncStorage from '@react-native-async-storage/async-storage';

// Libreta de direcciones: contactos guardados para enviar más rápido.
//
// Se guarda POR DISPOSITIVO (no por correo). Antes era por correo y eso
// hacía que los contactos "desaparecieran" al cambiar de sesión o al bajar
// un update: bastaba que el correo activo cambiara para dejar la lista en
// blanco. Ahora la libreta es única del teléfono y se mantiene aunque
// entres con otro correo, actualices, o reinstales sin borrar datos.
//
// listContacts/addContact/etc. siguen aceptando `email` para no romper a
// quien los llama (Send, Contacts, notificaciones), pero lo ignoran al
// guardar. Al leer, si no hay libreta nueva, se migra automáticamente lo
// que ya tuvieras guardado bajo el correo anterior.

const KEY = 'veta-contacts';
const LEGACY_KEY = (email) => `veta-contacts-${(email || 'anon').toLowerCase()}`;

export const isAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(String(a || '').trim());

/** Extrae una dirección de un texto o de un QR (acepta ethereum:0x…?…). */
export function parseAddress(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (isAddress(s)) return s;
  const m = s.match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : null;
}

const initials = (name) => {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '0x';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
};

async function readList(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

const ordenar = (arr) =>
  arr.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.usedAt || 0) - (a.usedAt || 0));

export async function listContacts(email) {
  let arr = await readList(KEY);
  if (arr.length === 0) {
    // Migración desde la libreta antigua por correo (una sola vez).
    const legacy = await readList(LEGACY_KEY(email));
    if (legacy.length > 0) {
      arr = legacy;
      try { await AsyncStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
    }
  }
  return ordenar(arr);
}

async function save(arr) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  return arr;
}

export async function addContact(email, { name, address, fav }) {
  const addr = parseAddress(address);
  if (!addr) throw new Error('invalid-address');
  const arr = await listContacts(email);
  const i = arr.findIndex((c) => c.address.toLowerCase() === addr.toLowerCase());
  const nombre = (name || '').trim() || (i >= 0 ? arr[i].name : `${addr.slice(0, 6)}…${addr.slice(-4)}`);
  const rec = {
    id: i >= 0 ? arr[i].id : `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: nombre,
    address: addr,
    fav: fav === undefined ? (i >= 0 ? !!arr[i].fav : false) : !!fav,
    initials: initials(nombre),
    usedAt: i >= 0 ? arr[i].usedAt : 0,
  };
  if (i >= 0) arr[i] = { ...arr[i], ...rec }; else arr.push(rec);
  await save(arr);
  return rec;
}

export async function removeContact(email, id) {
  const arr = (await listContacts(email)).filter((c) => c.id !== id);
  return save(arr);
}

export async function toggleFav(email, id) {
  const arr = await listContacts(email);
  const c = arr.find((x) => x.id === id);
  if (c) c.fav = !c.fav;
  await save(arr);
  return arr;
}

/** Marca el contacto como usado (para ordenar por frecuencia). */
export async function touchContact(email, address) {
  const addr = parseAddress(address);
  if (!addr) return;
  const arr = await listContacts(email);
  const c = arr.find((x) => x.address.toLowerCase() === addr.toLowerCase());
  if (c) { c.usedAt = Date.now(); await save(arr); }
}

/** Nombre guardado para una dirección (para mostrarlo en Actividad). */
export function nameFor(contacts, address) {
  const a = String(address || '').toLowerCase();
  const c = (contacts || []).find((x) => x.address.toLowerCase() === a);
  return c ? c.name : null;
}
