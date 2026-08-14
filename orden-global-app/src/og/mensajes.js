// El cliente del relevo de mensajes (infra/mensajes, en el nodo del cerebro).
// Identidad = el correo de la cuenta de la wallet; el alta devuelve una llave
// que firma cada petición. Sin E2E en v1 — no se promete en ningún texto.
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const BASE = ((Constants.expoConfig?.extra || {}).mensajesApi || 'https://cerebro.ordenscan.com/mensajes').replace(/\/$/, '');
let llave = null;
let yo = null; // {correo, nombre, addr}

async function pedir(ruta, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(BASE + ruta, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(d.error || 'http ' + res.status); e.code = res.status; throw e; }
    return d;
  } finally { clearTimeout(t); }
}

export async function alta(cuenta) {
  yo = { correo: (cuenta.email || '').toLowerCase(), nombre: cuenta.name || cuenta.nombre || '', addr: cuenta.addr || '' };
  const g = await SecureStore.getItemAsync('og.llaveChat').catch(() => null);
  if (g) { llave = g; pedir('/alta', { ...yo, llave }).catch(() => {}); return; }
  const d = await pedir('/alta', yo);
  llave = d.llave;
  await SecureStore.setItemAsync('og.llaveChat', llave).catch(() => {});
}
const firmado = (b) => ({ ...b, correo: yo?.correo, llave });

export const enviar = (para, texto) => pedir('/enviar', firmado({ para, texto }));
export const bandeja = (desde) => pedir('/bandeja', firmado({ desde }));
export const buscar = (q) => pedir('/buscar', firmado({ q }));
export const conversaciones = () => pedir('/conversaciones', firmado({}));
export const leido = (de) => pedir('/leido', firmado({ de }));
export const ficha = (de) => pedir('/ficha', firmado({ de }));
export const quien = () => yo;
