// Cliente del panel de Genesis ID.
//
// La sesión es un token Bearer que emite POST /api/sesion/entrar. Se guarda
// en SecureStore —no en AsyncStorage— porque abre la puerta a decidir sobre
// identidades de personas: quien consiga ese token puede aprobar y rechazar.
//
// Toda respuesta de error se normaliza a { error: 'texto' } para que las
// pantallas nunca tengan que adivinar la forma del fallo.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE_TOKEN = 'genesis.sesion';
const CLAVE_URL = 'genesis.url';

// La URL del servidor viene compilada (eas.json), pero se puede cambiar desde
// Ajustes sin recompilar — sirve para apuntar a un servidor de pruebas.
const URL_DEFECTO = process.env.EXPO_PUBLIC_GENESIS_URL || 'https://genesis-id.onrender.com';

let urlBase = URL_DEFECTO;
let token = null;
// La app registra acá qué hacer cuando una llamada devuelve 401: volver al
// login. Sin esto, una sesión vencida dejaba al operador en una pantalla
// donde todo falla con avisos, en vez de llevarlo a entrar de nuevo.
let alVencerSesion = null;
export const enSesionVencida = (cb) => { alVencerSesion = cb; };

export async function cargarSesion() {
  try {
    const guardada = await AsyncStorage.getItem(CLAVE_URL);
    if (guardada) urlBase = guardada;
  } catch (e) {}
  try {
    token = await SecureStore.getItemAsync(CLAVE_TOKEN);
  } catch (e) { token = null; }
  return Boolean(token);
}

export const servidor = () => urlBase;

export async function cambiarServidor(nueva) {
  const limpia = String(nueva || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/.test(limpia)) return { error: 'La URL debe empezar con https://' };
  urlBase = limpia;
  try { await AsyncStorage.setItem(CLAVE_URL, limpia); } catch (e) {}
  return { ok: true };
}

async function llamar(metodo, ruta, cuerpo) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  let r;
  try {
    r = await fetch(`${urlBase}/api${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch (e) {
    return { error: 'Sin conexión con el servidor. Revisá tu internet o la URL en Ajustes.', red: true };
  }
  let datos = null;
  try { datos = await r.json(); } catch (e) {}
  if (r.status === 401) {
    // Sesión vencida o cerrada en otro lado: se limpia y la app vuelve al login.
    if (ruta !== '/sesion/entrar') {
      await olvidarSesion();
      if (alVencerSesion) alVencerSesion();
    }
    return { error: datos?.error || 'La sesión expiró. Volvé a entrar.', sesionVencida: ruta !== '/sesion/entrar' };
  }
  if (!r.ok) return { error: datos?.error || `Error ${r.status}`, ...datos };
  return datos ?? {};
}

async function olvidarSesion() {
  token = null;
  try { await SecureStore.deleteItemAsync(CLAVE_TOKEN); } catch (e) {}
}

// ── Sesión ──────────────────────────────────────────────────────────────────

export async function entrar(email, contrasena) {
  const r = await llamar('POST', '/sesion/entrar', { email, contrasena });
  if (r.error) return r;
  token = r.token;
  try { await SecureStore.setItemAsync(CLAVE_TOKEN, token); } catch (e) {}
  return r;
}

export async function salir() {
  await llamar('POST', '/sesion/salir', {});
  await olvidarSesion();
}

export const quienSoy = () => llamar('GET', '/sesion/yo');
export const cambiarContrasena = (actual, nueva) => llamar('POST', '/sesion/contrasena', { actual, nueva });

// ── Panel ───────────────────────────────────────────────────────────────────

export const resumen = () => llamar('GET', '/panel/resumen');

export function identidades({ estado, riesgo, texto } = {}) {
  const q = new URLSearchParams();
  if (estado) q.set('estado', estado);
  if (riesgo) q.set('riesgo', riesgo);
  if (texto) q.set('texto', texto);
  const s = q.toString();
  return llamar('GET', `/panel/identidades${s ? '?' + s : ''}`);
}

export const identidad = (id) => llamar('GET', `/panel/identidades/${id}`);
export const aprobar = (id, motivo, anulacion) => llamar('POST', `/panel/identidades/${id}/aprobar`, { motivo, anulacion });
export const rechazar = (id, motivo) => llamar('POST', `/panel/identidades/${id}/rechazar`, { motivo });
export const suspender = (id, motivo) => llamar('POST', `/panel/identidades/${id}/suspender`, { motivo });
export const aRevision = (id, motivo) => llamar('POST', `/panel/identidades/${id}/revision`, { motivo });
export const reiniciar = (id, motivo) => llamar('POST', `/panel/identidades/${id}/reiniciar`, { motivo });
export const biometriaManual = (id, coincide, nota) => llamar('POST', `/panel/identidades/${id}/biometria`, { coincide, nota });
export const marcarPep = (id, pep, nota) => llamar('POST', `/panel/identidades/${id}/pep`, { pep, nota });

export function casos({ estado, gravedad } = {}) {
  const q = new URLSearchParams();
  if (estado) q.set('estado', estado);
  if (gravedad) q.set('gravedad', gravedad);
  const s = q.toString();
  return llamar('GET', `/panel/casos${s ? '?' + s : ''}`);
}
export const caso = (id) => llamar('GET', `/panel/casos/${id}`);
export const asignarCaso = (id, a) => llamar('POST', `/panel/casos/${id}/asignar`, { a });
export const anotarCaso = (id, texto) => llamar('POST', `/panel/casos/${id}/nota`, { texto });
export const cerrarCaso = (id, conReporte, conclusion, referencia) =>
  llamar('POST', `/panel/casos/${id}/cerrar`, { conReporte, conclusion, referencia });

// ── Analítica y directorio ──────────────────────────────────────────────────
//
// Estas rutas ya existían para el panel web (`/analitica` en el navegador).
// La app consume las MISMAS: una segunda fuente de cifras que dijera algo
// distinto sería peor que no tener analítica en el teléfono.

export const analiticaResumen = (dias = 30) => llamar('GET', `/panel/analitica/resumen?dias=${dias}`);
export const analiticaEmbudo = () => llamar('GET', '/panel/analitica/embudo');
export const analiticaApps = (dias = 90) => llamar('GET', `/panel/analitica/apps?dias=${dias}`);

/**
 * Consulta libre sobre los eventos, con las cuentas por dimensión.
 *
 * Los `undefined` se caen solos al construir la query, así que la pantalla
 * puede pasar el objeto de filtros entero sin ir limpiándolo.
 */
export function eventos(filtros = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v === undefined || v === null || v === '' || v === 'todas') continue;
    q.set(k, String(v));
  }
  return llamar('GET', `/panel/analitica/eventos?${q.toString()}`);
}

export const erroresLista = (filtros = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v === undefined || v === null || v === '' || v === 'todas') continue;
    q.set(k, String(v));
  }
  return llamar('GET', `/panel/analitica/errores?${q.toString()}`);
};

export const errorDetalle = (huella) => llamar('GET', `/panel/analitica/errores/${huella}`);
/** Quién sufrió un error concreto — resuelto contra el padrón. */
export const errorAfectados = (huella) => llamar('GET', `/panel/analitica/errores/${huella}/afectados`);
export const marcarError = (huella, estado, nota) =>
  llamar('POST', `/panel/analitica/errores/${huella}/estado`, { estado, nota });

/** Últimos ingresos. `plataforma` separa la app del teléfono de la web. */
export function sesiones({ app, plataforma, pais, limite = 60 } = {}) {
  const q = new URLSearchParams();
  if (app && app !== 'todas') q.set('app', app);
  if (plataforma && plataforma !== 'todas') q.set('plataforma', plataforma);
  if (pais) q.set('pais', pais);
  q.set('limite', String(limite));
  return llamar('GET', `/panel/analitica/sesiones?${q.toString()}`);
}

export const directorioResumen = () => llamar('GET', '/panel/directorio/resumen');

/**
 * El padrón del ecosistema.
 *
 * Acepta los mismos filtros que la web. Los que se dejan sin poner NO se
 * mandan: el servidor distingue «sin filtro» de «filtro en cero», y mandar
 * `conSaldo=0` cuando nadie lo pidió esconde a media lista.
 */
export function directorio({
  texto, app, pais, moneda, conWallet, conGid, conSaldo, nuncaEntro,
  inactivosDias, registradoDias, saldoMin, orden, direccion, limite = 60, desde = 0,
} = {}) {
  const q = new URLSearchParams();
  const bool = (k, v) => { if (v !== undefined && v !== '') q.set(k, v ? '1' : '0'); };
  if (texto) q.set('texto', texto);
  if (app && app !== 'todas') q.set('app', app);
  if (pais) q.set('pais', pais);
  if (moneda) q.set('moneda', moneda);
  bool('conWallet', conWallet);
  bool('conGid', conGid);
  bool('conSaldo', conSaldo);
  bool('nuncaEntro', nuncaEntro);
  if (inactivosDias) q.set('inactivosDias', String(inactivosDias));
  if (registradoDias) q.set('registradoDias', String(registradoDias));
  if (saldoMin) q.set('saldoMin', String(saldoMin));
  if (orden) q.set('orden', orden);
  if (direccion) q.set('direccion', direccion);
  q.set('limite', String(limite));
  if (desde) q.set('desde', String(desde));
  return llamar('GET', `/panel/directorio?${q.toString()}`);
}

export const personaDirectorio = (email) => llamar('GET', `/panel/directorio/persona/${encodeURIComponent(email)}`);
export const movimientosPersona = (email) =>
  llamar('GET', `/panel/directorio/persona/${encodeURIComponent(email)}/movimientos`);
/** Le pide al servidor que vuelva a leer los saldos de la cadena 8532. */
export const refrescarSaldos = () => llamar('POST', '/panel/directorio/saldos', {});

// ── Negocios (KYB) ──────────────────────────────────────────────────────────

export function negocios({ estado } = {}) {
  const q = new URLSearchParams();
  if (estado) q.set('estado', estado);
  return llamar('GET', `/panel/negocios?${q.toString()}`);
}
export const negocio = (id) => llamar('GET', `/panel/negocios/${id}`);
export const recibirDocumento = (id, clave, referencia) =>
  llamar('POST', `/panel/negocios/${id}/documento`, { clave, referencia });
export const aprobarNegocio = (id, motivo, anulacion) =>
  llamar('POST', `/panel/negocios/${id}/aprobar`, { motivo, anulacion });
export const rechazarNegocio = (id, motivo) =>
  llamar('POST', `/panel/negocios/${id}/rechazar`, { motivo });

// ── Operadores y aplicaciones ───────────────────────────────────────────────
//
// Las dos piden permiso '*' en el servidor. La app igual las enseña a todo el
// mundo y deja que el servidor conteste 403: esconder un botón no es un
// control de acceso, y quien tiene el rol necesita verlo desde el teléfono.

export const operadores = () => llamar('GET', '/panel/operadores');
export const crearOperador = (datos) => llamar('POST', '/panel/operadores', datos);
export const activarOperador = (id, activo) =>
  llamar('POST', `/panel/operadores/${id}/activo`, { activo });

export const aplicaciones = () => llamar('GET', '/panel/aplicaciones');
export const crearAplicacion = (clave, nombre, alcances) =>
  llamar('POST', '/panel/aplicaciones', { clave, nombre, alcances });
export const rotarAplicacion = (id) => llamar('POST', `/panel/aplicaciones/${id}/rotar`, {});
export const revocarAplicacion = (id) => llamar('POST', `/panel/aplicaciones/${id}/revocar`, {});

// ── Listas de sanciones ─────────────────────────────────────────────────────

export const listas = () => llamar('GET', '/panel/listas');
export const recargarListas = () => llamar('POST', '/panel/listas/recargar', {});
export const importarOfac = () => llamar('POST', '/panel/listas/ofac', {});
export const traerGafi = () => llamar('POST', '/panel/listas/gafi', {});
export const buscarEnListas = (q) =>
  llamar('GET', `/panel/listas/buscar?q=${encodeURIComponent(q)}`);

export const bitacora = (limite = 100) => llamar('GET', `/panel/bitacora?limite=${limite}`);
