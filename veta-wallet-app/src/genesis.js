import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE, getToken } from './api';

// ============================================================
// Genesis ID — identidad digital de Orden Global.
//
// QUE CAMBIO Y POR QUE
//
// Antes esto abría el portal externo genesisid.online y esperaba que volviera
// con un "pasaporte". Ese puente nunca llegó a funcionar, y el endpoint que lo
// recibía dejaba inyectar un pasaporte —nombre legal, documento, foto— a
// cualquier correo sin autenticación alguna. Se retiró.
//
// Ahora la verificación la hace Genesis ID, y la decide una persona del equipo
// de cumplimiento. La app solo APORTA datos:
//
//   1. la persona declara nombre y fecha de nacimiento
//   2. captura la MRZ de su documento (las líneas de abajo del pasaporte)
//   3. se toma la foto de rostro
//   4. queda en revisión hasta que un operador aprueba o rechaza
//
// La app NO decide si alguien está verificado, y ya no puede: el GID lo emite
// el servidor y solo existe después de esa decisión.
//
// POR QUE PASA POR EL BACKEND DE VETA WALLET
//
// Genesis ID exige una clave de API. Esa clave no puede vivir aquí: un APK se
// descomprime con una orden y cualquiera la sacaría. Así que la app habla con
// su propio backend, que ya la autentica con su JWT, y ese servidor es el que
// llama a Genesis ID con la clave.
//
//   app ──JWT──▶ backend de Veta Wallet (/genesis/*) ──X-API-Key──▶ Genesis ID
//
// El router del backend está en infra/genesis-proxy/genesis.router.js.
// ============================================================

const KEY = 'genesis-id-local-v5';

/** Copia local del estado, solo para pintar la pantalla sin esperar la red. */
async function readLocal() {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
async function writeLocal(rec) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {}
  return rec;
}

/**
 * Llamada al puente del backend, con el token de sesión de la wallet.
 *
 * Devuelve `{ ok, datos, error, code }` en vez de lanzar: estas pantallas
 * tienen que poder explicar qué pasó, y una excepción sin código obliga a
 * enseñar un mensaje genérico.
 */
async function puente(ruta, cuerpo) {
  if (!API_BASE) return { ok: false, code: 'config', error: 'API no configurada' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/genesis${ruta}`, {
      method: cuerpo ? 'POST' : 'GET',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        datos,
        error: datos?.error || `Error ${res.status}`,
        // 404 en el puente casi siempre significa que el backend todavía no lo
        // tiene montado; conviene distinguirlo de un fallo de red.
        code: res.status === 401 || res.status === 403 ? 'auth'
          : res.status === 404 ? 'sin-puente'
            : res.status === 503 ? 'sin-clave'
              : res.status >= 500 ? 'servidor' : 'http',
      };
    }
    return { ok: true, datos };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'red',
      error: e?.name === 'AbortError' ? 'El servidor no respondió a tiempo' : 'Sin conexión',
    };
  } finally { clearTimeout(timer); }
}

// ---------------------------------------------------------------------------
// MRZ
// ---------------------------------------------------------------------------

/**
 * Deja la MRZ en el formato que espera el servidor: en mayúsculas, sin
 * espacios, una línea por renglón.
 *
 * Los `<` se teclean mal con frecuencia, así que se aceptan también los
 * caracteres con los que la gente los sustituye por error.
 */
export function limpiarMrz(texto) {
  return String(texto || '')
    .toUpperCase()
    .replace(/[«»‹›]/g, '<')
    .split(/[\r\n]+/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length > 0)
    .join('\n');
}

/**
 * Comprobación de forma antes de gastar una llamada al servidor.
 *
 * No valida los dígitos de control —eso lo hace Genesis ID, que es donde debe
 * hacerse— pero sí evita mandar algo que a todas luces no es una MRZ, y le
 * dice a la persona exactamente cuántos caracteres le faltan o le sobran.
 */
export function revisarFormaMrz(texto) {
  const lineas = limpiarMrz(texto).split('\n').filter(Boolean);
  if (!lineas.length) return { ok: false, motivo: 'Escriba o escanee las líneas de la MRZ' };

  const largos = lineas.map((l) => l.length);
  const esperado =
    lineas.length === 2 && largos.every((l) => l === 44) ? 'TD3'
      : lineas.length === 2 && largos.every((l) => l === 36) ? 'TD2'
        : lineas.length === 3 && largos.every((l) => l === 30) ? 'TD1'
          : null;

  if (esperado) return { ok: true, formato: esperado, lineas };

  return {
    ok: false,
    motivo:
      `Se leyeron ${lineas.length} línea(s) de ${largos.join('/')} caracteres. ` +
      'Un pasaporte son 2 líneas de 44; una cédula, 3 de 30 o 2 de 36.',
  };
}

// ---------------------------------------------------------------------------
// Estado que se enseña en pantalla
// ---------------------------------------------------------------------------

const PASOS = {
  iniciada: 'datos',
  datos: 'documento',
  documento: 'rostro',
  biometria: 'revision',
  'en-revision': 'revision',
  verificada: 'listo',
  rechazada: 'rechazada',
  suspendida: 'suspendida',
};

/** Traduce la respuesta del servidor a lo que la pantalla necesita. */
function aVista(identidad) {
  if (!identidad) return null;
  return {
    id: identidad.id,
    email: identidad.email,
    estado: identidad.estado,
    // Un rostro que FALLO vuelve al paso del rostro, no a la sala de espera:
    // repetirlo son veinte segundos y esperar una revision manual son dias.
    paso: identidad.rostroPendiente ? 'rostro' : (PASOS[identidad.estado] || 'datos'),
    rostroPendiente: Boolean(identidad.rostroPendiente),
    genesisUid: identidad.gid || null,
    fullName: identidad.nombreLegal || null,
    documentoAceptable: identidad.documentoAceptable,
    fotoCredencial: identidad.fotoCredencial || null,
    faltanDatos: identidad.faltanDatos || [],
    siguientePaso: identidad.siguientePaso,
    verificada: identidad.estado === 'verificada',
    actualizadaEn: identidad.actualizadaEn,
  };
}

/** Combina dos estados sin perder datos (el nuevo manda, el viejo rellena). */
export function mergePassport(base, extra) {
  if (!base) return extra || null;
  if (!extra) return base;
  const out = { ...base };
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v !== undefined && v !== null && String(v).trim?.() !== '') out[k] = v;
  }
  return out;
}

export const genesis = {
  /** Estado guardado en el teléfono, para pintar sin esperar la red. */
  local: readLocal,
  save: writeLocal,

  /**
   * Estado del trámite. Crea la identidad si aún no existe.
   * Es lo primero que llama la pantalla al entrar.
   */
  async estado() {
    const r = await puente('/estado');
    if (!r.ok) return { error: r.error, code: r.code };
    const vista = aVista(r.datos?.identidad);
    if (vista) await writeLocal(vista);
    return vista;
  },

  /** Lo que la persona declara de sí misma. */
  async declararDatos({ nombreCompleto, fechaNacimiento, paisResidencia, telefono }) {
    const r = await puente('/datos', { nombreCompleto, fechaNacimiento, paisResidencia, telefono });
    if (!r.ok) return { error: r.error, code: r.code };
    const vista = aVista(r.datos?.identidad);
    if (vista) await writeLocal(vista);
    return vista;
  },

  /**
   * Manda la MRZ del documento.
   *
   * Se envía el TEXTO, nunca la fotografía: así la imagen del documento no
   * viaja por la red ni se almacena en ningún servidor. Un dato personal menos
   * en riesgo por cada usuario.
   *
   * Devuelve también qué falla, porque los dígitos de control detectan un
   * error de transcripción al instante y conviene decirlo en el momento.
   */
  async enviarDocumento(mrz, textoAnverso) {
    const forma = revisarFormaMrz(mrz);
    if (!forma.ok) return { aceptable: false, problemas: [forma.motivo] };

    // Del anverso viaja TEXTO, nunca la fotografia.
    const r = await puente('/documento', {
      mrz: limpiarMrz(mrz),
      textoAnverso: textoAnverso ? String(textoAnverso).slice(0, 4000) : undefined,
    });
    if (!r.ok) return { aceptable: false, problemas: [r.error], code: r.code };

    const vista = aVista(r.datos?.identidad);
    if (vista) await writeLocal(vista);
    return {
      estado: vista,
      aceptable: Boolean(r.datos?.documento?.aceptable),
      problemas: r.datos?.documento?.problemas || [],
    };
  },

  /**
   * Pide el reto de vivacidad.
   *
   * Devuelve la secuencia de gestos que hay que ir mostrando en pantalla, uno
   * por uno, grabando un fotograma de cada uno. Vale dos minutos: si la persona
   * se distrae, se pide otro y ya está.
   *
   *   { id, gestos: ['frente','sonreir',...], instrucciones: ['Mire...'], segundos }
   */
  async pedirReto() {
    const r = await puente('/vivacidad', {});
    if (!r.ok) return { error: r.error, code: r.code };
    return r.datos?.reto || null;
  },

  /**
   * Manda los fotogramas del reto.
   *
   * Van en el mismo orden que los gestos. El servidor comprueba gesto a gesto
   * y decide; la app no puntúa nada, solo enseña el resultado.
   */
  async enviarRostro({ reto, fotogramas, fotoDocumento }) {
    // `fotoDocumento` es la foto del anverso, reducida. Viaja SOLO en este
    // momento y solo para el cotejo: Genesis ID compara y la descarta, no la
    // almacena en ningun sitio. Sin ella no hay con que comparar el rostro.
    const r = await puente('/biometria', { reto, fotogramas, fotoDocumento });
    if (!r.ok) return { error: r.error, code: r.code };
    const vista = aVista(r.datos?.identidad);
    if (vista) await writeLocal(vista);
    return { estado: vista, biometria: r.datos?.biometria || null };
  },

  /**
   * Envío de un solo selfie, sin prueba de vida.
   *
   * Se mantiene para las versiones ya publicadas de la app. Nunca aprueba sola:
   * el expediente queda en revisión de un operador.
   */
  async enviarSelfie(selfieBase64) {
    const r = await puente('/biometria', { selfie: selfieBase64 });
    if (!r.ok) return { error: r.error, code: r.code };
    const vista = aVista(r.datos?.identidad);
    if (vista) await writeLocal(vista);
    return vista;
  },

  /**
   * Guarda la foto de la credencial en Genesis ID.
   *
   * Es la unica imagen que se conserva, y va ahi y no solo en el telefono
   * porque el GID vale en todas las apps del ecosistema: una credencial que
   * solo se ve completa en el movil que subio la foto no sirve para eso.
   */
  async guardarFoto(base64) {
    const r = await puente('/foto', { foto: base64 });
    if (!r.ok) return { error: r.error, code: r.code };
    const vista = aVista(r.datos?.identidad);
    if (vista) await writeLocal(vista);
    return vista;
  },

  /** Ata esta cuenta de Veta Wallet al GID, para la sesión única. */
  vincular: () => puente('/vincular', {}),

  /**
   * Pase de sesión única para entrar a MyTokenPay sin repetir el KYC.
   *
   * Lo firma Genesis ID y vence en minutos. Solo existe si la identidad está
   * verificada y esta cuenta está atada al GID — es decir: nadie puede pedir
   * un pase de una identidad que no es suya.
   */
  async paseParaMyTokenPay() {
    const r = await puente('/sso/token', {});
    if (!r.ok) return { error: r.error, code: r.code };
    return { token: r.datos?.token || null, expiraEnSegundos: r.datos?.expiraEnSegundos || 900 };
  },

  /** Token para entrar en otra app del ecosistema sin repetir el KYC. */
  async tokenEcosistema() {
    const r = await puente('/sso/token', {});
    return r.ok ? (r.datos?.token || null) : null;
  },

  /**
   * ¿Está sancionada esta dirección?
   *
   * Conviene consultarlo ANTES de firmar un envío. Devuelve `null` si no se
   * pudo comprobar — y eso NO es lo mismo que "está limpia": la pantalla debe
   * distinguirlo, porque dar por buena una dirección que no se pudo tamizar es
   * exactamente el error que hay que evitar.
   */
  async tamizarDireccion(direccion) {
    const r = await puente(`/tamiz/${encodeURIComponent(direccion)}`);
    if (!r.ok || !r.datos?.tamizado) return null;
    return { sancionada: Boolean(r.datos.sancionada), ficha: r.datos.ficha || null };
  },

  /** Manda movimientos para el monitoreo AML. Nunca bloquea la interfaz. */
  enviarMovimientos: (movimientos) =>
    puente('/movimientos', { movimientos }).catch(() => null),

  /**
   * Vuelve a consultar el estado. Es el botón "ya me verifiqué".
   * Se mantiene el nombre porque lo usan varias pantallas.
   */
  async refresh() {
    return genesis.estado();
  },

  /** Alias histórico; varias pantallas lo llaman así. */
  async status() {
    return genesis.estado();
  },

  /**
   * Por qué no avanza el trámite. Devuelve un código para que la pantalla
   * explique el problema real en vez de un "en proceso" genérico:
   *   'sin-puente' → el backend aún no tiene montado /genesis
   *   'sin-clave'  → el backend no tiene GENESIS_API_KEY configurada
   *   'auth'       → la sesión de la wallet caducó
   *   'red'        → sin conexión
   *   'revision'   → todo enviado, esperando a cumplimiento
   *   'ok'         → verificada
   */
  async diagnose() {
    const e = await genesis.estado();
    if (!e) return { code: 'red' };
    if (e.error) return { code: e.code || 'http', detail: e.error };
    if (e.verificada) return { code: 'ok', estado: e };
    if (e.estado === 'rechazada') return { code: 'rechazada', estado: e };
    if (e.estado === 'suspendida') return { code: 'suspendida', estado: e };
    return { code: e.paso === 'revision' ? 'revision' : 'incompleto', estado: e };
  },
};
