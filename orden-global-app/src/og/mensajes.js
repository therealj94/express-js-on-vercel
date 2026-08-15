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
  // La llave se guarda ATADA AL CORREO. Antes vivía en una sola etiqueta
  // global, y eso rompía a quien cambiaba de cuenta: la app le presentaba al
  // relevo la llave de la cuenta anterior, el relevo no la reconocía, y todo
  // —conversaciones, mensajes que llegan, buscar gente— respondía 401 para
  // siempre. La persona veía «sin conexión» con el wifi perfecto.
  const donde = 'og.llaveChat.' + yo.correo;
  let g = await SecureStore.getItemAsync(donde).catch(() => null);
  if (!g) {
    // Migración de la etiqueta vieja: se hereda SOLO si el relevo la valida
    // (abajo), nunca a ciegas — heredarla a ciegas es justo el fallo de antes.
    g = await SecureStore.getItemAsync('og.llaveChat').catch(() => null);
  }
  // El alta SIEMPRE se espera y SIEMPRE se lee la respuesta. El relevo, cuando
  // el correo es nuevo, ignora la llave que le mandes y acuña la suya: si no
  // se lee lo que devuelve, la app se queda usando una llave que el servidor
  // jamás aceptó. Ese era el fallo.
  const d = await pedir('/alta', g ? { ...yo, llave: g } : yo);
  llave = (d && d.llave) || g;
  if (llave) await SecureStore.setItemAsync(donde, llave).catch(() => {});
}

/**
 * Vuelve a darse de alta desde cero cuando la llave guardada ya no sirve.
 *
 * Se usa al recibir un 401: la llave local no la reconoce el relevo. Si el
 * correo no tiene dueño, esto lo deja funcionando solo, sin que nadie tenga
 * que tocar nada. Si YA tiene dueño (otra instalación se lo quedó), el relevo
 * responde 409 y entonces sí hace falta recuperar la cuenta — la pantalla lo
 * dice con todas las letras en vez de culpar a la red.
 */
export async function rehacerAlta(cuenta) {
  const correo = (cuenta.email || '').toLowerCase();
  await SecureStore.deleteItemAsync('og.llaveChat.' + correo).catch(() => {});
  await SecureStore.deleteItemAsync('og.llaveChat').catch(() => {});
  llave = null;
  await alta(cuenta);
  return !!llave;
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

/* Vaciar un hilo, o quitarlo de la lista. Y hay que decirlo con todas las
   letras porque la pantalla lo dice: esto NO borra los mensajes. El hilo es de
   dos y solo se decide sobre la vista propia — el relevo guarda una fecha de
   corte y de ahí para atrás esta cuenta deja de verlo. La otra persona
   conserva su copia. Prometer otra cosa sería mentir justo donde la gente
   cree que borró algo.

   `quitar` además saca la fila de la lista hasta que llegue algo nuevo: esa es
   toda la diferencia entre «vaciar los mensajes» y «borrar la conversación». */
export const olvidar = (con, quitar = false) => pedir('/olvidar', firmado({ con, quitar }));

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
// El comprobante se manda DESPUÉS de que la cadena confirmó: AU-RA no
// transmite y el hilo no debe enseñar un pago que todavía puede fallar.
export const pago = (para, monto, extra) => pedir('/pago', firmado({ para, monto, ...(extra || {}) }));
// Un id de grupo se distingue de un correo por la forma, sin preguntar nada.
export const esGrupo = (x) => /^g:[0-9a-f]{16}$/.test(String(x || ''));
export const quien = () => yo;
