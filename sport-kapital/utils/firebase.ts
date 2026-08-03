// utils/firebase.ts
// Inicialización opcional de Firebase (Auth + Firestore) para respaldar la
// cuenta y los datos del usuario en la nube. Si no hay claves configuradas
// en .env, la app sigue funcionando 100% local (igual que footballApi.ts):
// nunca lanza, nunca bloquea el registro/login local.
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAuth, type Auth } from 'firebase/auth';
// getReactNativePersistence sí existe en tiempo de ejecución (el build "react-native"
// de @firebase/auth que Metro resuelve), pero los tipos estáticos de "firebase/auth"
// no lo reflejan para tsc — es una limitación conocida del paquete, no un bug real.
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function init() {
  if (app || !isFirebaseConfigured()) return;
  try {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

    // en el build nativo (Android/iOS), getReactNativePersistence existe y guarda
    // la sesión en AsyncStorage para que sobreviva a cerrar la app. Si por algún
    // motivo no está disponible en la plataforma que está bundleando (ej. una
    // build web), degradamos a la persistencia por defecto en vez de crashear.
    let persistence: unknown;
    try {
      persistence = typeof getReactNativePersistence === 'function' ? getReactNativePersistence(AsyncStorage) : undefined;
    } catch {
      persistence = undefined;
    }
    auth = persistence ? initializeAuth(app, { persistence: persistence as any }) : initializeAuth(app);
    db = getFirestore(app);
  } catch {
    // ya inicializado (fast refresh) o config inválida: no rompemos la app por esto
    if (getApps().length) {
      app = getApps()[0];
      try { db = getFirestore(app); } catch {}
    }
  }
}

init();

export function getFirebase(): { auth: Auth | null; db: Firestore | null } {
  return { auth, db };
}
