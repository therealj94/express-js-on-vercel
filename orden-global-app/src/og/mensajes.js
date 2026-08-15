// El cliente del relevo de mensajes (infra/mensajes, en el nodo del cerebro).
// Identidad = el correo de la cuenta de la wallet; el alta devuelve una llave
// que firma cada petición. Sin E2E en v1 — no se promete en ningún texto.
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const BASE = ((Constants.expoConfig?.extra || {}).mensajesApi || 'https://cerebro.ordenscan.com/mensajes').replace(/\/$/, '');
let llave = null;
let yo = null; // {correo, nombre, addr}

async function pedir(ruta, body, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
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
  // El GID viaja en el alta cuando la cuenta ya lo tiene: con él /buscar
  // encuentra a la persona por su Genesis ID y /ficha lo devuelve para
  // pintarlo bajo el nombre. Sin GID la clave ni aparece (JSON.stringify se
  // come los undefined) y el relevo no toca la que ya tuviera guardada.
  if (cuenta.genesisUid) yo.gid = cuenta.genesisUid;
  const g = await SecureStore.getItemAsync('og.llaveChat').catch(() => null);
  if (g) { llave = g; pedir('/alta', { ...yo, llave }).catch(() => {}); return; }
  const d = await pedir('/alta', yo);
  llave = d.llave;
  await SecureStore.setItemAsync('og.llaveChat', llave).catch(() => {});
}
const firmado = (b) => ({ ...b, correo: yo?.correo, llave });

// `extra` lleva el adjunto opcional {tipo, archivo, nombre}: el binario ya
// subió por /subir y aquí solo viaja su id — el mensaje sigue siendo ligero.
export const enviar = (para, texto, extra) => pedir('/enviar', firmado({ para, texto, ...(extra || {}) }));
// Subir un adjunto (base64, ≤8MB). Timeout largo: 8MB en datos móviles no
// caben en los 15s de una petición normal.
export const subir = (nombre, tipo, mime, datos) =>
  pedir('/subir', firmado({ nombre, tipo, mime, datos }), 120000);
// La URL pública de un adjunto: el id largo ES el permiso (capability URL),
// por eso sirve tal cual para <Image> o para abrir en el navegador.
export const urlArchivo = (id) => BASE + '/archivo/' + id;
export const bandeja = (desde) => pedir('/bandeja', firmado({ desde }));
// /buscar encuentra por nombre, correo o GID (empieza-por, sin distinguir
// mayúsculas) y cada persona del resultado ya trae su gid — se pasa tal cual.
export const buscar = (q) => pedir('/buscar', firmado({ q }));
export const conversaciones = () => pedir('/conversaciones', firmado({}));
export const leido = (de) => pedir('/leido', firmado({ de }));
export const ficha = (de) => pedir('/ficha', firmado({ de }));
// Mi nombre y mi foto — y mi gid, que el relevo también acepta aquí.
// JSON.stringify se come las claves `undefined`, así que perfil({ foto })
// cambia la foto y deja el nombre en paz — es justo lo que el relevo
// entiende: la clave que no viaja es la que no se toca.
export const perfil = (cambios) => pedir('/perfil', firmado({ ...(cambios || {}) }));
// Grupos. `para` de enviar/pago y `desde` de bandeja aceptan el id 'g:…' igual
// que un correo: para el resto del cliente un grupo es un destinatario más.
export const grupoCrear = (nombre, foto, miembros) => pedir('/grupo/crear', firmado({ nombre, foto, miembros: miembros || [] }));
export const grupoInfo = (id) => pedir('/grupo/info', firmado({ id }));
export const grupoEditar = (id, cambios) => pedir('/grupo/editar', firmado({ id, ...(cambios || {}) }));
export const grupoInvitar = (id, correos) => pedir('/grupo/invitar', firmado({ id, correos }));
export const grupoUnirse = (invitacion) => pedir('/grupo/unirse', firmado({ invitacion }));
export const grupoSalir = (id) => pedir('/grupo/salir', firmado({ id }));
// El comprobante se manda DESPUÉS de que la cadena confirmó: NEXUS no
// transmite y el hilo no debe enseñar un pago que todavía puede fallar.
export const pago = (para, monto, extra) => pedir('/pago', firmado({ para, monto, ...(extra || {}) }));
// Un id de grupo se distingue de un correo por la forma, sin preguntar nada.
export const esGrupo = (x) => /^g:[0-9a-f]{16}$/.test(String(x || ''));
export const quien = () => yo;
