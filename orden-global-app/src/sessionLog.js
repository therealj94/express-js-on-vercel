import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Registro local de sesiones. Cada vez que se hace login exitoso se guarda
// {loggedAt, device, platform, os}. Al cerrar sesión, se marca closedAt.
// Al abrir Ajustes → Seguridad → Sesiones se listan las últimas para que
// el usuario vea "desde cuándo estás dentro" y pueda cerrar sesión desde
// el mismo lugar.
//
// Nota: por ahora es LOCAL del dispositivo. Cuando esté enchufado el
// backend, se sumará el detalle de sesiones remotas (IP, ciudad, etc).
const KEY = 'veta-sessions-log-v1';
const MAX = 20;

function deviceLabel() {
  const os = Platform.OS === 'ios' ? 'iPhone / iPad' : Platform.OS === 'android' ? 'Android' : 'Web';
  const ver = Platform.Version ? ` · ${os === 'Android' ? 'Android' : 'iOS'} ${Platform.Version}` : '';
  return `${os}${ver}`;
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
async function writeAll(arr) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
}

/** Registra un login exitoso. Devuelve el id de la sesión creada. */
export async function recordLogin(email) {
  const arr = await readAll();
  const rec = {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    email: (email || '').toLowerCase().trim(),
    device: deviceLabel(),
    loggedAt: Date.now(),
    closedAt: null,
  };
  arr.push(rec);
  // Mantenemos solo las últimas MAX sesiones para no crecer sin control.
  const trimmed = arr.slice(-MAX);
  await writeAll(trimmed);
  await AsyncStorage.setItem('veta-session-current-id', rec.id);
  return rec.id;
}

export async function currentSessionId() {
  try { return await AsyncStorage.getItem('veta-session-current-id'); } catch (e) { return null; }
}

/** Marca la sesión actual como cerrada. */
export async function recordLogout() {
  const id = await currentSessionId();
  if (!id) return;
  const arr = await readAll();
  const s = arr.find((x) => x.id === id);
  if (s) { s.closedAt = Date.now(); await writeAll(arr); }
  try { await AsyncStorage.removeItem('veta-session-current-id'); } catch (e) {}
}

/** Últimas sesiones asociadas al correo, más reciente primero. */
export async function listSessions(email) {
  const arr = await readAll();
  const cur = await currentSessionId();
  const mail = (email || '').toLowerCase().trim();
  return arr
    .filter((s) => s.email === mail)
    .sort((a, b) => (b.loggedAt || 0) - (a.loggedAt || 0))
    .map((s) => ({ ...s, isCurrent: s.id === cur }));
}
