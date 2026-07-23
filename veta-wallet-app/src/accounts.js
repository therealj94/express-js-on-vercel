import AsyncStorage from '@react-native-async-storage/async-storage';
import { ORIGEN_PRICE } from './data';

// Cuentas reales del ecosistema (mismas que MyTokenPay y el motor Genesis ID).
// Cada una entra a Veta Wallet con su correo/contraseña y ve SU saldo ORIGEN.
// Los saldos de negocio reflejan los cobros sembrados en MyTokenPay.
export const ACCOUNTS = [
  {
    email: 'cliente@mytokenpay.demo', password: 'Origen2026!', name: 'José Cliente', initials: 'JC',
    business: false, genesisUid: 'GEN-1100-2200', origen: 21.28, addr: '0x7F2a9c4B1eD8f3A05b6C4d2C7e9F1a3B',
    since: 'mar 2026',
  },
  {
    email: 'cafe.veta@mytokenpay.demo', password: 'Cafe2026!', name: 'Carmen Aguilar', initials: 'CV',
    business: true, biz: 'Café Veta Roasters', genesisUid: 'GEN-1101-2201', bizUid: 'GNB-1101-2201',
    origen: 12.34, addr: '0xCAFE7a2290Ef1120Bd8843aa77b6c9014E', since: 'ene 2026',
  },
  {
    email: 'bahia.hotel@mytokenpay.demo', password: 'Hotel2026!', name: 'Diego Martínez', initials: 'BE',
    business: true, biz: 'Bahía Esmeralda Hotel', genesisUid: 'GEN-1102-2202', bizUid: 'GNB-1102-2202',
    origen: 164.6, addr: '0xB4H1a55120Cd7781Ee2290aa4471c9d033', since: 'feb 2026',
  },
  {
    email: 'ironhouse.gym@mytokenpay.demo', password: 'Gym2026!', name: 'Sofía Ramírez', initials: 'IG',
    business: true, biz: 'Ironhouse Gym', genesisUid: 'GEN-1103-2203', bizUid: 'GNB-1103-2203',
    origen: 17.87, addr: '0x1R0N7781Aa2290Bd4471Ee9c0143d8820F', since: 'ene 2026',
  },
  {
    email: 'nova.tech@mytokenpay.demo', password: 'Tech2026!', name: 'Marco Flores', initials: 'NT',
    business: true, biz: 'Nova Tech Center', genesisUid: 'GEN-1104-2204', bizUid: 'GNB-1104-2204',
    origen: 31.49, addr: '0xN0VA2290Bd7781Aa4471Ee9c0143d8299C', since: 'mar 2026',
  },
];

// Cuentas creadas por el usuario vía Genesis ID (persistidas). Se cargan al
// arrancar la app para que el login y la sesión las reconozcan.
let DYNAMIC = [];
const DYN_KEY = 'veta-dynamic-accounts';

export async function initAccounts() {
  try {
    const raw = await AsyncStorage.getItem(DYN_KEY);
    DYNAMIC = raw ? JSON.parse(raw) : [];
  } catch (e) { DYNAMIC = []; }
  return DYNAMIC;
}

function allAccounts() {
  return [...ACCOUNTS, ...DYNAMIC];
}

function initialsFrom(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'VW';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Crea una cuenta real desde el flujo Genesis ID (registro nuevo).
export async function createAccount({ name, email, password, genesisUid }) {
  const e = (email || '').toLowerCase().trim();
  const existing = allAccounts().find((a) => a.email === e);
  if (existing) return existing;
  const acc = {
    email: e,
    password: password || 'origen',
    name: name || 'Nuevo usuario',
    initials: initialsFrom(name),
    business: false,
    genesisUid: genesisUid || null,
    origen: 21.28, // ≈ $50 de bienvenida en ORIGEN para compras
    addr: '0x' + Math.random().toString(16).slice(2, 10).toUpperCase() + '…' + Math.random().toString(16).slice(2, 6).toUpperCase(),
    since: new Date().toLocaleDateString('es-HN', { month: 'short', year: 'numeric' }),
    createdByGenesis: true,
  };
  DYNAMIC.push(acc);
  try { await AsyncStorage.setItem(DYN_KEY, JSON.stringify(DYNAMIC)); } catch (er) {}
  return acc;
}

export function findAccount(email, password) {
  const e = (email || '').toLowerCase().trim();
  return allAccounts().find((a) => a.email === e && a.password === password) || null;
}

export function accountByEmail(email) {
  const e = (email || '').toLowerCase().trim();
  return allAccounts().find((a) => a.email === e) || null;
}

export const usd = (origen) => origen * ORIGEN_PRICE;

// ---- sesión persistida ----
const SESSION_KEY = 'veta-session-email';
export async function saveSession(email) {
  try { await AsyncStorage.setItem(SESSION_KEY, email); } catch (e) {}
}
export async function loadSession() {
  try {
    const e = await AsyncStorage.getItem(SESSION_KEY);
    return e ? accountByEmail(e) : null;
  } catch (e) { return null; }
}
export async function clearSession() {
  try { await AsyncStorage.removeItem(SESSION_KEY); } catch (e) {}
}
