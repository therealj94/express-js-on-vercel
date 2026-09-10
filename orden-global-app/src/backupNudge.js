import AsyncStorage from '@react-native-async-storage/async-storage';

// Nudge para que el usuario respalde su seed.
//
// Marca el primer arranque en el dispositivo y también cuándo fue la
// última visita a "Ver mi seed". Si pasaron más de 24 h desde el primer
// arranque sin que el usuario vea la seed, mostramos un aviso amable en
// Home invitando a hacerlo. Si el usuario "salta" el aviso, lo re-mostramos
// una vez a la semana (recordatorio suave, no invasivo).
const FIRST_KEY = 'veta-first-open-at';
const SEED_SEEN_KEY = 'veta-seed-seen-at';
const SNOOZE_KEY = 'veta-backup-snoozed-until';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

async function num(key) {
  try { const v = await AsyncStorage.getItem(key); return v ? Number(v) : null; } catch (e) { return null; }
}
async function setNum(key, v) {
  try { await AsyncStorage.setItem(key, String(v)); } catch (e) {}
}

/** Se llama en el arranque del app. Si no hay marca, la guarda. */
export async function primerArranque() {
  const t = await num(FIRST_KEY);
  if (!t) await setNum(FIRST_KEY, Date.now());
}

/** ¿Debemos mostrar el aviso hoy? */
export async function debeMostrarBackup() {
  const first = await num(FIRST_KEY);
  if (!first) return false; // aún no marcado, no mostramos
  if (Date.now() - first < DAY) return false; // menos de 24 h en la app
  const seen = await num(SEED_SEEN_KEY);
  if (seen) return false; // ya vio la seed alguna vez, no molestamos más
  const snoozed = await num(SNOOZE_KEY);
  if (snoozed && Date.now() < snoozed) return false; // dentro del snooze
  return true;
}

/** Se llama cuando el usuario abre la pantalla de seed (nudge cumplido). */
export async function marcarSeedVista() {
  await setNum(SEED_SEEN_KEY, Date.now());
}

/** El usuario tocó "más tarde": no volver a mostrar por una semana. */
export async function posponer() {
  await setNum(SNOOZE_KEY, Date.now() + WEEK);
}
