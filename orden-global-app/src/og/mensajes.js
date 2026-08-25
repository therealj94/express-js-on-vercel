// El cliente del relevo de mensajes (infra/mensajes, en el nodo del cerebro).
// Identidad = el correo de la cuenta de la wallet; el alta devuelve una llave
// que firma cada petición.
//
// Y CIFRA DE PUNTA A PUNTA, con el MISMO sobre que la web (src/og/candado.js).
// Hasta hoy esta cabecera decía «sin E2E en v1», y era verdad: por eso el
// planeta del chat abría la versión web dentro de una vista de navegador, que
// no recibe avisos ni suena con la app cerrada.
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
// El JWT de la wallet. Es la ÚNICA prueba de identidad que el relevo sabe
// comprobar por su cuenta, y con ella devuelve la llave de un correo que ya
// tiene dueño en vez de dar el portazo del 409.
import { getToken } from '../api';
import * as CANDADO from './candado';

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
  /* EL RESCATE DE LA LLAVE.
     El relevo acuña UNA llave por correo y se la queda el primer dispositivo.
     Reinstalar la app borra el almacén seguro y con él la llave: el correo
     sigue reclamado, el relevo contesta 409, y la persona veía «este chat
     quedó en tu instalación anterior» sin forma de salir de ahí — con sus
     conversaciones intactas del otro lado del cristal.

     La salida es probar QUIÉN SOY: la sesión de la wallet ya lo demuestra. El
     relevo se la lleva al backend, le pregunta de quién es ese token, y si el
     correo verificado coincide devuelve la llave que YA existe. Nunca acuña
     una nueva: eso mataría al primer dispositivo, que es el fallo contrario.

     Va siempre que haya sesión, también con llave local: no molesta, y cubre
     el caso de una llave vieja que el relevo ya no reconoce. */
  const cuerpo = { ...yo };
  if (g) cuerpo.llave = g;
  const sesion = cuenta.sesion || getToken();
  if (sesion) cuerpo.sesion = sesion;
  const d = await pedir('/alta', cuerpo);
  llave = (d && d.llave) || g;
  if (llave) await SecureStore.setItemAsync(donde, llave).catch(() => {});
  /* La pública de este teléfono se publica AL ENTRAR, no al mandar el primer
     mensaje. Si esperara al primero, quien acaba de instalar no podría RECIBIR
     nada cifrado hasta escribir él, y su primera conversación entera llegaría
     en claro. */
  publicarMiLlave().catch(() => null);
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

/* ══ EL CANDADO, TAMBIÉN AQUÍ ══════════════════════════════════════════════
 *
 * La web cifra de punta a punta desde hace tiempo y esta pantalla no sabía, y
 * por eso el planeta del chat abría la versión web dentro de una vista de
 * navegador — que no recibe avisos ni suena con la app cerrada. Con el candado
 * portado (src/og/candado.js), el teléfono cierra y abre los MISMOS sobres.
 *
 * `pruebas/probar-candado.cjs` carga las dos implementaciones de verdad y se
 * las cruza en los dos sentidos. Si esa prueba se pone roja, el fallo está aquí
 * o en el candado, nunca en la web: la web es la que ya tiene conversaciones. */
let publicada = false;

async function publicarMiLlave() {
  if (publicada) return;
  const mia = await CANDADO.miLlave();
  if (!mia) return;
  try {
    await pedir('/llaves/publicar', firmado({ id: mia.id, pub: mia.pub }));
    publicada = true;
  } catch { /* se reintenta en el siguiente envío */ }
}

/* Las llaves públicas ajenas se piden una vez y se guardan cinco minutos.
   Pedirlas en cada mensaje sería una vuelta al servidor por tecla enviada; no
   guardarlas nunca haría el chat lento en datos móviles. */
const VIDA_LLAVES = 5 * 60 * 1000;
const llavero = new Map();

/* Trae al llavero lo que falte y devuelve el mapa correo → aparatos. */
async function llaveroDe(correos) {
  const ahora = Date.now();
  const faltan = correos.filter((c) => {
    const g = llavero.get(c);
    return !g || ahora - g.en > VIDA_LLAVES;
  });
  if (faltan.length) {
    const r = await pedir('/llaves/de', firmado({ correos: faltan }));
    for (const c of faltan) llavero.set(c, { aparatos: r.llaves?.[c] || [], en: ahora });
  }
  const mapa = {};
  for (const c of correos) mapa[c] = llavero.get(c)?.aparatos || [];
  return mapa;
}

/* ══ DOS FORMAS, PORQUE SON DOS PREGUNTAS ══════════════════════════════════
 * CERRAR necesita TODOS los aparatos juntos: se le hace un sobre a cada uno y
 * da igual de quién sea cada cual.
 * VERIFICAR necesita saber DE QUIÉN es cada llave: la firma vale si está entre
 * las que publicó QUIEN ESCRIBIÓ, no entre las de cualquiera del hilo.
 * En la web había una sola función y se leía como diccionario: a `abrir()` le
 * llegaba siempre la lista vacía y todos los mensajes salían «no verificado».
 * Aquí no se repite. */
async function llavesDe(correos) {
  const mapa = await llaveroDe(correos);
  return correos.flatMap((c) => mapa[c] || []);
}

async function destinatarios(para) {
  if (!esGrupo(para)) return [para];
  const info = await grupoInfo(para).catch(() => null);
  return (info?.miembros || []).map((m) => m.correo).filter(Boolean);
}

/** Devuelve el bulto cerrado, o null si no hay a quién cerrárselo. */
async function cerrarPara(para, texto) {
  try {
    await publicarMiLlave();
    const aparatos = await llavesDe(await destinatarios(para));
    if (!aparatos.length) return null;
    return await CANDADO.cerrar(texto, aparatos);
  } catch { return null; }
}

/* `extra` lleva el adjunto opcional {tipo, archivo, nombre}: el binario ya
   subió por /subir y aquí solo viaja su id — el mensaje sigue siendo ligero.

   Se intenta cerrar SIEMPRE. Si no se puede —porque quien recibe todavía no
   tiene ninguna llave publicada— se manda en claro y se devuelve `e2e:false`,
   para que la pantalla lo diga EN ESE MENSAJE. Mandarlo en claro sin decirlo
   sería exactamente la mentira que este trabajo vino a quitar. */
export async function enviar(para, texto, extra) {
  const base = { para, ...(extra || {}) };
  const cerrado = await cerrarPara(para, texto);
  if (cerrado) {
    await pedir('/enviar', firmado({ ...base, cif: cerrado }));
    return { ok: true, e2e: true };
  }
  await pedir('/enviar', firmado({ ...base, texto }));
  return { ok: true, e2e: false };
}
// Subir un adjunto (base64, ≤8MB). Timeout largo: 8MB en datos móviles no
// caben en los 15s de una petición normal.
export const subir = (nombre, tipo, mime, datos) =>
  pedir('/subir', firmado({ nombre, tipo, mime, datos }), 120000);
// La URL pública de un adjunto: el id largo ES el permiso (capability URL),
// por eso sirve tal cual para <Image> o para abrir en el navegador.
export const urlArchivo = (id) => BASE + '/archivo/' + id;
/* La bandeja llega con los sobres cerrados y se abren AQUÍ, antes de que la
   pantalla los vea: así ninguna vista tiene que saber de criptografía.

   Un mensaje que este teléfono no puede abrir NO se esconde ni se convierte en
   un renglón vacío: se marca `cerrado` y la pantalla lo dice —«llegó cifrado
   para otro de tus aparatos»—. Un hueco mudo haría pensar que el chat perdió
   mensajes, que es lo contrario de lo que pasa. */
export async function bandeja(desde) {
  const d = await pedir('/bandeja', firmado({ desde }));
  const crudos = d.mensajes || [];

  /* SE PIDEN LAS LLAVES DE TODOS LOS REMITENTES ANTES DE ABRIR NADA. No es una
     optimización: es lo que hace POSIBLE verificar la firma. Sin las llaves
     publicadas de quien escribió, lo único que se puede hacer es creerle al
     bulto — que es exactamente el agujero que la firma cierra. Va en una sola
     petición para todos, con la caché de cinco minutos. */
  const deQuienes = [...new Set(crudos.filter((m) => m.cif && m.de).map((m) => m.de))];
  let llaves = {};
  if (deQuienes.length) {
    try { llaves = (await llaveroDe(deQuienes)) || {}; } catch { llaves = {}; }
  }

  const msgs = await Promise.all(crudos.map(async (m) => {
    if (!m.cif) return m;
    const r = await CANDADO.abrir(m.cif, llaves[m.de] || []);
    if (r == null) return { ...m, texto: '', cerrado: true, e2e: true };
    const claro = r.texto;
    /* El texto puede traer pegada la llave de un adjunto: viaja DENTRO del
       cifrado, nunca al lado, que es lo que hace que el relevo guarde un
       archivo que no puede abrir. */
    let texto = claro;
    let extra = null;
    if (claro.startsWith('{')) {
      try {
        const j = JSON.parse(claro.slice(1));
        texto = j.t || '';
        extra = { llaveArchivo: j.k, ivArchivo: j.iv };
      } catch { /* si no parsea es texto normal que empieza raro */ }
    }
    /* `verificado` viaja hasta la burbuja. Un mensaje que no se pudo verificar
       NO se esconde: se enseña con su marca, porque esconderlo sería perder
       información y enseñarlo callado sería mentir. */
    return { ...m, texto, e2e: true, verificado: r.verificado, motivoFirma: r.motivo,
             ...(extra || {}) };
  }));
  return { ...d, mensajes: msgs };
}
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

/* ══ APUNTAR ESTE TELÉFONO PARA QUE SUENE ═════════════════════════════════
 *
 * El relevo sabía avisar a los NAVEGADORES —push VAPID, un obrero de servicio
 * que despierta— y eso no llega aquí. PULSE2CHAT vive en la app dentro de una
 * vista de navegador incrustada, y una vista incrustada no recibe push: no hay
 * obrero que despertar ni permiso que dar. O sea que en la app, que es donde
 * la gente lo usa, los mensajes llegaban en silencio y las llamadas no
 * sonaban: se veían al abrir, y nada más.
 *
 * Un teléfono se avisa por su propia red. `testigo` es el de Expo, que es la
 * que esta app ya habla. Va a la misma lista que las suscripciones del
 * navegador —un aparato, un aviso— y el relevo elige el camino por sí solo.
 * Ver infra/mensajes/servidor.py, `_empujar_expo`. */
export const apuntarTelefono = (testigo) => pedir('/suscribir', firmado({ expo: testigo }));
export const olvidarTelefono = (testigo) => pedir('/desuscribir', firmado({ expo: testigo }));

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
