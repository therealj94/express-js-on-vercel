// utils/cloudSync.ts
// Respaldo en la nube (Firebase Auth + Firestore). Defensivo en todo: si
// Firebase no está configurado o falla una llamada, nunca lanza — la app
// sigue funcionando con los datos locales (mismo criterio que footballApi.ts).
import { AppState } from 'react-native';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, sendPasswordResetEmail, deleteUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebase, isFirebaseConfigured } from './firebase';
import { useStore } from '@/store/useStore';

let lastLogAt = 0;
function logOnce(msg: string) {
  const now = Date.now();
  if (now - lastLogAt > 30000) { lastLogAt = now; console.warn(`[cloudSync] ${msg}`); }
}

export { isFirebaseConfigured };

export interface AuthResult {
  ok: boolean;
  uid?: string;
  msg?: string;
}

const FRIENDLY_ERRORS: Record<string, string> = {
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión en vez de crear una nueva.',
  'auth/invalid-email': 'El correo electrónico no es válido.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  'auth/network-request-failed': 'Sin conexión a internet. Revisa tu red e inténtalo de nuevo.',
};

function friendlyError(err: any): string {
  const code = err?.code as string | undefined;
  if (code && FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code];
  return 'No se pudo conectar con el servidor. Inténtalo de nuevo.';
}

export async function signUpCloud(email: string, password: string): Promise<AuthResult> {
  const { auth } = getFirebase();
  if (!auth) return { ok: false, msg: 'Cloud no configurado.' };
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return { ok: true, uid: cred.user.uid };
  } catch (err) {
    logOnce(`signUp falló: ${err}`);
    return { ok: false, msg: friendlyError(err) };
  }
}

export async function signInCloud(email: string, password: string): Promise<AuthResult> {
  const { auth } = getFirebase();
  if (!auth) return { ok: false, msg: 'Cloud no configurado.' };
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, uid: cred.user.uid };
  } catch (err) {
    logOnce(`signIn falló: ${err}`);
    return { ok: false, msg: friendlyError(err) };
  }
}

export async function signOutCloud(): Promise<void> {
  const { auth } = getFirebase();
  if (!auth) return;
  try { await fbSignOut(auth); } catch (err) { logOnce(`signOut falló: ${err}`); }
}

/**
 * Eliminación DEFINITIVA de la cuenta en la nube (requisito de Google Play
 * para apps con registro de usuarios): borra el documento del usuario en
 * Firestore y luego la cuenta de Firebase Auth. Se re-autentica primero con
 * la contraseña que el usuario escribe, porque Firebase exige un login
 * reciente para operaciones destructivas.
 */
export async function deleteAccountCloud(email: string, password: string): Promise<AuthResult> {
  const { auth, db } = getFirebase();
  if (!auth) return { ok: true }; // cuenta solo local: no hay nada que borrar en la nube
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uidVal = cred.user.uid;
    if (db) {
      try { await deleteDoc(doc(db, 'users', uidVal)); } catch (err) { logOnce(`deleteDoc falló: ${err}`); }
    }
    await deleteUser(cred.user);
    return { ok: true };
  } catch (err) {
    logOnce(`deleteAccount falló: ${err}`);
    return { ok: false, msg: friendlyError(err) };
  }
}

export async function resetPasswordCloud(email: string): Promise<AuthResult> {
  const { auth } = getFirebase();
  if (!auth) return { ok: false, msg: 'Cloud no configurado.' };
  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true };
  } catch (err) {
    logOnce(`resetPassword falló: ${err}`);
    return { ok: false, msg: friendlyError(err) };
  }
}

const SYNCED_KEYS = [
  'user', 'alias', 'onboarded', 'riskAccepted', 'riskAcceptedAt', 'tutorialsSeen',
  'balance', 'realizedTotal', 'positions', 'transactions', 'walletTxs',
] as const;

type SyncedSlice = Pick<ReturnType<typeof useStore.getState>, typeof SYNCED_KEYS[number]>;

function pickSynced(s: ReturnType<typeof useStore.getState>): SyncedSlice {
  const out = {} as SyncedSlice;
  for (const k of SYNCED_KEYS) (out as any)[k] = s[k];
  // A la nube va SIEMPRE la cuenta REAL: si el usuario está en modo práctica,
  // el libro real vive en otherLedger (se intercambian al cambiar de modo).
  if (s.accountMode === 'PRACTICE') {
    (out as any).balance = s.otherLedger.balance;
    (out as any).realizedTotal = s.otherLedger.realizedTotal;
    (out as any).positions = s.otherLedger.positions;
    (out as any).transactions = s.otherLedger.transactions;
  }
  return out;
}

export async function pushSnapshot(uidVal: string, slice: SyncedSlice): Promise<void> {
  const { db } = getFirebase();
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', uidVal), { ...slice, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    logOnce(`push falló: ${err}`);
  }
}

export async function pullSnapshot(uidVal: string): Promise<Partial<SyncedSlice> | null> {
  const { db } = getFirebase();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uidVal));
    if (!snap.exists()) return null;
    const data = snap.data();
    delete (data as any).updatedAt;
    return data as Partial<SyncedSlice>;
  } catch (err) {
    logOnce(`pull falló: ${err}`);
    return null;
  }
}

const PUSH_DEBOUNCE_MS = 2500;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUid: string | null = null;
let pendingSlice: SyncedSlice | null = null;
let lastSig = '';

/**
 * Envía inmediatamente cualquier cambio pendiente que todavía esté esperando
 * el debounce. Hay que llamarla ANTES de cerrar sesión (o al pasar la app a
 * segundo plano): si no, un cambio reciente (ej. reclamar el bono, aceptar el
 * riesgo) puede quedarse sin respaldar — cada paso del onboarding reinicia el
 * temporizador de 2.5s, así que un usuario que avanza rápido y cierra sesión
 * enseguida puede cerrar la sesión de Firebase antes de que el debounce
 * llegue a disparar, y ese último estado nunca se guarda.
 */
export async function flushCloudSync(): Promise<void> {
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  if (pendingUid && pendingSlice) {
    const uidToFlush = pendingUid;
    const sliceToFlush = pendingSlice;
    pendingUid = null;
    pendingSlice = null;
    lastSig = JSON.stringify(sliceToFlush);
    await pushSnapshot(uidToFlush, sliceToFlush);
  }
}

/**
 * Escucha cambios del store y respalda en Firestore los campos relevantes
 * (no las velas/partidos/noticias, que se regeneran solas). Se llama una vez
 * desde el root layout; devuelve una función de limpieza. También respalda
 * de inmediato si la app pasa a segundo plano, para no perder el último
 * cambio si el usuario cierra la app antes de que venza el debounce.
 */
export function startCloudSync(): () => void {
  if (!isFirebaseConfigured()) return () => {};

  const unsub = useStore.subscribe((state) => {
    if (!state.uid) return;
    const slice = pickSynced(state);
    const sig = JSON.stringify(slice);
    if (sig === lastSig) return;
    pendingUid = state.uid;
    pendingSlice = slice;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      flushCloudSync();
    }, PUSH_DEBOUNCE_MS);
  });

  const appStateSub = AppState.addEventListener('change', (next) => {
    if (next === 'background' || next === 'inactive') flushCloudSync();
  });

  return () => {
    unsub();
    appStateSub.remove();
    if (pendingTimer) clearTimeout(pendingTimer);
  };
}
