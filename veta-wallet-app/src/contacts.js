import AsyncStorage from '@react-native-async-storage/async-storage';

// Libreta de direcciones: contactos guardados para enviar más rápido.
// Se guarda por cuenta (cada correo tiene su propia libreta) en el teléfono.

const KEY = (email) => `veta-contacts-${(email || 'anon').toLowerCase()}`;

export const isAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(String(a || '').trim());

/** Extrae una dirección de un texto o de un QR (acepta ethereum:0x…?…). */
export function parseAddress(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (isAddress(s)) return s;
  // Formatos tipo ethereum:0xABC…@8532?value=1  ó  vetawallet://send?to=0x…
  const m = s.match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : null;
}

const initials = (name) => {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '0x';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
};

export async function listContacts(email) {
  try {
    const raw = await AsyncStorage.getItem(KEY(email));
    const arr = raw ? JSON.parse(raw) : [];
    // Favoritos primero, luego por uso más reciente.
    return arr.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.usedAt || 0) - (a.usedAt || 0));
  } catch (e) { return []; }
}

async function save(email, arr) {
  try { await AsyncStorage.setItem(KEY(email), JSON.stringify(arr)); } catch (e) {}
  return arr;
}

export async function addContact(email, { name, address, fav }) {
  const addr = parseAddress(address);
  if (!addr) throw new Error('invalid-address');
  const arr = await listContacts(email);
  const i = arr.findIndex((c) => c.address.toLowerCase() === addr.toLowerCase());
  const nombre = (name || '').trim() || (i >= 0 ? arr[i].name : `${addr.slice(0, 6)}…${addr.slice(-4)}`);
  const rec = {
    id: i >= 0 ? arr[i].id : `c_${Date.now().toString(36)}`,
    name: nombre,
    address: addr,
    // Si no se indica, se respeta el favorito que ya tuviera.
    fav: fav === undefined ? (i >= 0 ? !!arr[i].fav : false) : !!fav,
    initials: initials(nombre),
    usedAt: i >= 0 ? arr[i].usedAt : 0,
  };
  if (i >= 0) arr[i] = { ...arr[i], ...rec }; else arr.push(rec);
  await save(email, arr);
  return rec;
}

export async function removeContact(email, id) {
  const arr = (await listContacts(email)).filter((c) => c.id !== id);
  return save(email, arr);
}

export async function toggleFav(email, id) {
  const arr = await listContacts(email);
  const c = arr.find((x) => x.id === id);
  if (c) c.fav = !c.fav;
  await save(email, arr);
  return arr;
}

/** Marca el contacto como usado (para ordenar por frecuencia). */
export async function touchContact(email, address) {
  const addr = parseAddress(address);
  if (!addr) return;
  const arr = await listContacts(email);
  const c = arr.find((x) => x.address.toLowerCase() === addr.toLowerCase());
  if (c) { c.usedAt = Date.now(); await save(email, arr); }
}

/** Nombre guardado para una dirección (para mostrarlo en Actividad). */
export function nameFor(contacts, address) {
  const a = String(address || '').toLowerCase();
  const c = (contacts || []).find((x) => x.address.toLowerCase() === a);
  return c ? c.name : null;
}
