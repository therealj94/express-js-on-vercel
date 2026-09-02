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
import { getToken, ensureSession } from '../api';
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
    if (!res.ok) {
      const e = new Error(d.error || 'http ' + res.status);
      e.code = res.status;
      /* EL MOTIVO VIAJA CON EL ERROR. El relevo distingue TRES causas del 409
         —«sesion-no-vale», «sin-sesion» y «otra-cuenta»— porque llevan a
         sitios opuestos: una se arregla volviendo a entrar, otra buscando el
         teléfono anterior, y la tercera no hay que arreglarla a mano en
         absoluto. Sin esto se perdía en el camino y la pantalla enseñaba el
         mismo texto para todas. */
      if (d.motivo) e.motivo = d.motivo;
      /* Y con «otra-cuenta» viaja el correo que la sesión SÍ prueba, que es
         lo que deja que el alta se corrija sola ahí abajo. */
      if (d.correoReal) e.correoReal = String(d.correoReal).toLowerCase();
      throw e;
    }
    return d;
  } finally { clearTimeout(t); }
}

/* ══ EL NOMBRE DEL CAJÓN NO PUEDE LLEVAR ARROBA ═══════════════════════════
 *
 * El almacén seguro sólo acepta nombres de `[A-Za-z0-9._-]`. Cualquier otra
 * cosa —y la arroba de un correo es «cualquier otra cosa»— hace que TIRE:
 * «Invalid key provided to SecureStore».
 *
 * O sea que `og.llaveChat.` + un correo es un nombre inválido SIEMPRE, para
 * todo el mundo. Y como guardar y leer se hacen con `.catch()` —para que un
 * llavero que se niegue no tumbe el chat— el error no se veía en ninguna
 * parte: la llave sencillamente no se guardaba nunca. Cada arranque volvía a
 * pedirla. Funcionaba de casualidad, porque el alta la rescata con la sesión.
 *
 * La arroba se escribe como `-40`, su código en hexadecimal. Escapar TAMBIÉN
 * el guion (`-` → `-2d`) es lo que hace que dos correos distintos no puedan
 * caer nunca en el mismo cajón: sin eso, el correo `a-40b` y el correo `a@b`
 * darían el mismo nombre, y una persona abriría el chat de la otra. */
export const cajonDe = (correo) =>
  'og.llaveChat.' + String(correo || '').replace(
    /[^\w.]/g, (c) => '-' + c.charCodeAt(0).toString(16).padStart(2, '0'));

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
  const donde = cajonDe(yo.correo);
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
  /* ══ LA SESIÓN, VIVA ══════════════════════════════════════════════════════
   *
   * `getToken()` devuelve lo que haya en memoria, VENCIDO O NO. El JWT de la
   * wallet dura CUARENTA MINUTOS, así que quien abre el chat un rato después
   * de entrar mandaba un token muerto: el relevo se lo lleva al backend, el
   * backend dice 401, y el rescate se cae con `motivo: 'sesion-no-vale'`.
   *
   * De cara a la persona eso salía como «este chat quedó en tu instalación
   * anterior — entrá de nuevo a tu cuenta desde Ajustes», que es pedirle que
   * arregle a mano algo que la app sabe hacer sola: `ensureSession()` renueva
   * con el token de refresco (30 días) sin pedir contraseña.
   *
   * O sea que la máquina tenía la llave en el bolsillo y le pedía a la
   * persona que fuera a buscar la suya.
   *
   * Si no se puede renovar —sin refresco y sin credenciales guardadas— se
   * manda lo que haya: puede seguir sirviendo, y si no, el mensaje de volver
   * a entrar SÍ es el correcto. */
  try { await ensureSession(); } catch (e) { /* se sigue con lo que haya */ }
  const sesion = cuenta.sesion || getToken();
  if (sesion) cuerpo.sesion = sesion;
  /* ══ QUIEN MANDA ES LA SESIÓN, NO EL CORREO GUARDADO ══════════════════════
   *
   * El correo sale de `cuenta.email`, que vive en un cajón (`SESSION_KEY`), y
   * la sesión vive en otro. Nada los ataba, así que se podían desincronizar:
   * la persona dentro como A, pidiendo el chat como B. Pasó de verdad.
   *
   * Lo que se veía no se parecía en nada a la causa. El alta daba 409, y como
   * la llave del aparato se publica DESPUÉS del alta, no se publicaba: todo lo
   * que le mandaban llegaba cerrado para aparatos que ya no eran suyos, y la
   * pantalla —diciendo la verdad, cada mensaje por separado— repetía «cifrado
   * para otro de tus aparatos» conversación por conversación. Se lee como «se
   * me borró todo», y no se había borrado nada.
   *
   * De los dos datos, el que PRUEBA algo es la sesión: el relevo se la lleva
   * al backend y el backend dice de quién es. El correo guardado no prueba
   * nada. Así que cuando discrepan, gana la sesión y se rehace el alta con
   * ese correo.
   *
   * No se puede repetir para siempre: al segundo intento `yo.correo` ya ES el
   * correo probado, la condición no se cumple y el error sale como cualquier
   * otro. */
  let d;
  try {
    d = await pedir('/alta', cuerpo);
  } catch (e) {
    if (e && e.code === 409 && e.motivo === 'otra-cuenta'
        && e.correoReal && e.correoReal !== yo.correo) {
      return await alta({ ...cuenta, email: e.correoReal });
    }
    throw e;
  }
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
  await SecureStore.deleteItemAsync(cajonDe(correo)).catch(() => {});
  // Y el nombre inválido de antes, por si algún llavero llegó a admitirlo.
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
/* SE APUNTA PARA QUÉ CUENTA SE PUBLICÓ, no un simple «ya está».
 *
 * Era un pestillo de una sola vez que nunca se soltaba. Si cambiabas de cuenta
 * sin cerrar la app —o si `rehacerAlta` corría por un 401— la llave de este
 * aparato NO se publicaba bajo la cuenta nueva. El relevo te veía sin ningún
 * aparato y TODO lo que te escribieran llegaba EN CLARO, mientras a quien te
 * escribía le salía «esa persona todavía no abrió el chat en ningún aparato»,
 * que es lo que el servidor creía y no lo que pasaba. Y vos no notabas nada:
 * lo que mandabas seguía saliendo cifrado, porque para eso se usan las llaves
 * del OTRO. Es la misma familia que el cerrojo de reparación de AuroChat: un
 * pestillo que se echa y no se suelta. */
let publicadaPara = null;

async function publicarMiLlave() {
  if (publicadaPara && publicadaPara === yo?.correo) return;
  const mia = await CANDADO.miLlave();
  if (!mia) return;
  try {
    /* LA DE FIRMA VA TAMBIÉN. El relevo la guarda desde hace tiempo y la
       reparte con la de acuerdo, y es CONTRA ESA LISTA —no contra lo que
       venga dentro del sobre— que el otro lado comprueba quién escribió de
       verdad. La app la tenía y no la mandaba, así que sus aparatos quedaban
       con el hueco: el servidor dice que lo llena «en cuanto ese aparato
       vuelva a publicar», y este aparato volvía a publicar sin ella. */
    await pedir('/llaves/publicar',
      firmado({ id: mia.id, pub: mia.pub, fir: mia.fir || '' }));
    publicadaPara = yo?.correo || null;
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
    for (const c of faltan) {
      const aps = r.llaves?.[c] || [];
      /* EL VACÍO NO SE GUARDA. Y esto no es una optimización al revés: es lo
         que decide si un mensaje sale cifrado o en claro.
         El relevo no entrega las llaves de alguien que todavía no te aceptó.
         Si abriste su hilo demasiado pronto, te llevabas una lista vacía —y
         se guardaba cinco minutos. Te aceptaba, escribías dentro de esos
         cinco minutos, `cerrar` no encontraba a quién hacerle sobre, y el
         mensaje salía EN CLARO. Justo los primeros de una relación que acaba
         de empezar, que suelen ser los que la gente cuida.
         Vaciar el llavero al aceptar no alcanza: lo vacía QUIEN ACEPTA, y el
         que se quedó con la caché mala es quien pidió. Se probó y se vio
         fallar (pruebas/probar-circulo-app.cjs).
         Guardar un vacío ahorra una petición; no guardarlo evita mandar en
         claro sin querer. No hay comparación posible entre las dos cosas. */
      if (aps.length) llavero.set(c, { aparatos: aps, en: ahora });
      else llavero.delete(c);
    }
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

/* ══ NO ALCANZA CON «NO SE PUDO»: HAY QUE SABER POR QUÉ ═══════════════════
 *
 * Esto devolvía `null` y `enviar` mandaba en claro. Un `catch` de una línea
 * juntaba CINCO situaciones muy distintas en el mismo `null`:
 *
 *   1. la persona no tiene ningún aparato publicado — la única en la que el
 *      texto que se enseña («todavía no abrió el chat») es cierto;
 *   2. `/llaves/de` se cayó: red, 401, 500;
 *   3. `grupoInfo()` se cayó → la lista de destinatarios queda vacía → EL
 *      GRUPO ENTERO en claro;
 *   4. este teléfono no pudo con sus propias llaves;
 *   5. el llavero tenía un vacío cacheado.
 *
 * En producción, de 54 mensajes en claro entre personas, 42 fueron a alguien
 * que SÍ tenía aparato publicado. O sea que el texto que se les mostró era
 * falso en la mayoría de los casos. Y uno de esos 54 es el último mensaje de
 * toda la base, mandado ayer.
 *
 * Bajar a texto plano porque se cayó una petición es lo único que no se puede
 * hacer en silencio: la persona cree que va cifrado, y va cifrado casi
 * siempre. Así que ahora se devuelve el MOTIVO y quien llama decide: sólo el
 * caso 1 manda en claro —con su aviso—; los demás fallan como falla la red,
 * con la burbuja roja de «No se envió · Reintentar», que ya existe y es la
 * respuesta honesta.
 *
 * Devuelve `{ cerrado }` o `{ motivo }`. */
async function cerrarPara(para, texto) {
  try { await publicarMiLlave(); } catch { return { motivo: 'sin-llave-propia' }; }
  let quienes;
  try {
    quienes = await destinatarios(para);
  } catch { return { motivo: 'sin-red' }; }
  /* Una lista vacía en un grupo NO es «nadie tiene llaves»: es que no se pudo
     saber quiénes son. Mandar en claro ahí es mandar el grupo entero al aire
     por un fallo de red. */
  if (!quienes.length) return { motivo: 'sin-red' };
  let aparatos;
  try {
    aparatos = await llavesDe(quienes);
  } catch { return { motivo: 'sin-red' }; }
  /* EL SOBRE SÓLO PARA MÍ NO ES UN SOBRE. En un grupo donde el relevo no
     entrega las llaves de los demás, lo único que volvía era la mía propia:
     `aparatos.length` valía 1, pasaba el guardia de antes, y la app daba el
     mensaje por cifrado. Nadie del grupo podía abrirlo. Es peor que el texto
     plano con aviso — es un mensaje que no llega y se dice que salió bien. */
  const mias = await CANDADO.miLlave().catch(() => null);
  const ajenos = aparatos.filter((a) => !mias || a.id !== mias.id);
  if (!ajenos.length) return { motivo: 'sin-aparatos' };
  try {
    return { cerrado: await CANDADO.cerrar(texto, aparatos) };
  } catch { return { motivo: 'sin-llave-propia' }; }
}

/* `extra` lleva el adjunto opcional {tipo, archivo, nombre}: el binario ya
   subió por /subir y aquí solo viaja su id — el mensaje sigue siendo ligero.

   Se intenta cerrar SIEMPRE. Si no se puede —porque quien recibe todavía no
   tiene ninguna llave publicada— se manda en claro y se devuelve `e2e:false`,
   para que la pantalla lo diga EN ESE MENSAJE. Mandarlo en claro sin decirlo
   sería exactamente la mentira que este trabajo vino a quitar. */
/* El mensaje que acompaña a un adjunto va por el MISMO camino: cerrado. Y si
   el archivo se cifró, su llave viaja DENTRO de ese texto — es lo que hace que
   el relevo tenga los bytes y no pueda abrirlos. El tipo, el archivo y el
   nombre van en claro porque son metadatos: la lista los necesita para decir
   «📷 Imagen» sin abrir nada. */
export async function enviarAdjunto(para, adj, texto) {
  const meta = { para, tipo: adj.tipo, archivo: adj.id, nombre: adj.nombre };
  const carga = adj.llave
    ? '{' + JSON.stringify({ t: texto || '', k: adj.llave, iv: adj.iv })
    : (texto || '');
  const r = adj.llave || carga ? await cerrarPara(para, carga) : { motivo: 'sin-aparatos' };
  if (r.cerrado) {
    await pedir('/enviar', firmado({ ...meta, cif: r.cerrado }));
    return { ok: true, e2e: true };
  }
  /* Sólo «sin-aparatos» baja a texto plano. Un fallo de red NO: se levanta
     como cualquier otro error de envío y la pantalla enseña la burbuja roja
     con «Reintentar», que es la verdad. */
  if (r.motivo !== 'sin-aparatos') {
    const e = new Error('no se pudo cifrar: ' + r.motivo);
    e.motivo = r.motivo;
    throw e;
  }
  /* Sin poder cerrar, la llave del archivo NO se manda: iría en claro al lado
     de los bytes cifrados — lo mismo que no cifrar, con más pasos y aparentando
     lo contrario. El archivo queda ilegible y el mensaje sale marcado. */
  await pedir('/enviar', firmado({ ...meta, texto: texto || '' }));
  return { ok: true, e2e: false };
}

export async function enviar(para, texto, extra) {
  const base = { para, ...(extra || {}) };
  const r = await cerrarPara(para, texto);
  if (r.cerrado) {
    await pedir('/enviar', firmado({ ...base, cif: r.cerrado }));
    return { ok: true, e2e: true };
  }
  /* SÓLO «sin-aparatos» BAJA A TEXTO PLANO. Es la única causa en la que
     mandar en claro es lo único que se puede hacer, y en la que el aviso que
     se enseña es cierto.
     Un fallo de red, una lista de miembros que no se pudo traer, o este
     teléfono sin sus llaves, NO bajan a texto plano: se levantan como
     cualquier error de envío y la pantalla enseña la burbuja roja con
     «Reintentar». Degradar en silencio porque se cayó una petición es
     justamente lo que hace falsa la promesa. */
  if (r.motivo !== 'sin-aparatos') {
    const e = new Error('no se pudo cifrar: ' + r.motivo);
    e.motivo = r.motivo;
    throw e;
  }
  await pedir('/enviar', firmado({ ...base, texto }));
  return { ok: true, e2e: false };
}
// Subir un adjunto (base64, ≤8MB). Timeout largo: 8MB en datos móviles no
// caben en los 15s de una petición normal.
/* ══ UN ADJUNTO TAMBIÉN SE CIERRA ═════════════════════════════════════════
 *
 * Hasta hoy no: el texto viajaba cifrado y la FOTO iba en claro. El relevo la
 * guardaba tal cual y la podía abrir quien tuviera acceso al disco. Una app que
 * promete que ni nosotros podemos leer los mensajes no puede tener la mitad de
 * la conversación al aire — y en un chat las fotos suelen ser la mitad que más
 * importa.
 *
 * `datos` entra en base64 (así lo lee el teléfono del archivo) y sale cifrado,
 * también en base64. La llave NO se devuelve al relevo: viaja dentro del texto
 * cifrado del mensaje (ver `enviarAdjunto`), y por eso el relevo termina con
 * unos bytes que no puede abrir. */
export async function subir(nombre, tipo, mime, datos) {
  const crudos = deB64Simple(datos);
  const c = CANDADO.cerrarBytes(crudos);
  const d = await pedir('/subir', firmado({
    nombre, tipo, mime, datos: aB64Simple(c.bytes),
  }), 120000);
  return { ...d, llave: c.llave, iv: c.iv };
}

/* ══ LO QUE ES PÚBLICO SE SUBE EN CLARO, Y SE DICE ═════════════════════════
 *
 * Las fotos de perfil y de grupo NO son parte de una conversación: el relevo
 * las reparte a cualquiera que te vea en una lista, dentro del resumen de la
 * ficha. Cifrarlas no protege nada —quien recibe la foto no recibe la llave—
 * y sí rompe: se subían por `subir()`, que cifra, y las dos pantallas tiraban
 * la llave y se quedaban sólo con el `id`. El resultado era que el relevo
 * servía bytes cifrados con `Content-Type: image/jpeg` y la foto NO SE PODÍA
 * VER NUNCA. No es que se viera mal: no se veía.
 *
 * Así que aquí no hay decisión que tomar sobre privacidad, hay una confusión
 * que deshacer: lo de la conversación va cerrado y lo del directorio va
 * abierto, cada uno por su función y con su nombre puesto.
 *
 * Si algún día una foto de perfil tuviera que ser privada, esto NO es lo que
 * hay que cambiar: habría que cambiar el relevo, que hoy la reparte a quien
 * pregunte. */
export async function subirPublico(nombre, tipo, mime, datos) {
  return await pedir('/subir', firmado({
    nombre, tipo, mime, datos: String(datos || ''),
  }), 120000);
}

/* base64 CLÁSICO —con + / y relleno—, que es el que habla el relevo. NO es el
   base64url del candado: mezclarlos sube un archivo que después no se arma. */
const ALF64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function aB64Simple(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += ALF64[(n >> 18) & 63] + ALF64[(n >> 12) & 63];
    s += i + 1 < bytes.length ? ALF64[(n >> 6) & 63] : '=';
    s += i + 2 < bytes.length ? ALF64[n & 63] : '=';
  }
  return s;
}
function deB64Simple(txt) {
  const s = String(txt || '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let n = 0; let bits = 0; let j = 0;
  for (let i = 0; i < s.length; i++) {
    n = (n << 6) | ALF64.indexOf(s[i]);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[j++] = (n >> bits) & 255; }
  }
  return out.subarray(0, j);
}

/* El archivo, ABIERTO y listo para pintar. Devuelve una dirección `data:` que
   `<Image>` sabe usar, o la del relevo si el adjunto es de los de antes —los
   que están en claro—, o null si no se pudo abrir: eso último se dice, no se
   deja como hueco mudo. */
const adjAbiertos = new Map();
export async function archivoAbierto(id, llaveB64, ivB64, mime) {
  if (!llaveB64 || !ivB64) return urlArchivo(id);
  const ya = adjAbiertos.get(id);
  if (ya) return ya;
  try {
    const r = await fetch(urlArchivo(id));
    if (!r.ok) throw new Error('no está');
    const buf = new Uint8Array(await r.arrayBuffer());
    const claros = CANDADO.abrirBytes(buf, llaveB64, ivB64);
    const uri = `data:${mime || 'application/octet-stream'};base64,${aB64Simple(claros)}`;
    adjAbiertos.set(id, uri);
    return uri;
  } catch {
    return null;
  }
}
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
    /* LA MARCA VIVE EN EL MENSAJE, no en un aviso de tres segundos.
       Antes, un mensaje en claro volvía del relevo sin ningún campo y la única
       señal de que había viajado sin cifrar era un toast que salía UNA vez, a
       quien lo mandaba, y desaparecía. Al recargar el hilo no quedaba rastro;
       mañana tampoco; y QUIEN LO RECIBÍA no se enteraba nunca.
       `!m.cif` se calcula igual en las dos puntas, así que marcarlo aquí hace
       que los dos lados vean lo mismo y que siga siendo verdad mañana. */
    if (!m.cif) return { ...m, e2e: false };
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

/* ══ EL CÍRCULO ═══════════════════════════════════════════════════════════
 *
 * Pedir, aceptar, rechazar, quitar, bloquear y denunciar. Las seis rutas
 * llevaban tiempo escritas y probadas en el relevo, y la app NO LLAMABA A
 * NINGUNA. No es que la pantalla estuviera escondida: la función no existía.
 *
 * Lo que eso hacía, visto desde el teléfono: buscabas a alguien, tocabas
 * «Agregar» —que sólo escribe en la libreta local—, se abría el hilo igual,
 * escribías, y el relevo contestaba 403 «hace falta que te acepte». La app se
 * comía ese error y dejaba una burbuja roja con «Reintentar» que iba a fallar
 * para siempre. Y del otro lado, quien recibía una solicitud no tenía dónde
 * verla: en producción hay seis esperando respuesta desde hace diez días,
 * todas dirigidas a gente que usa el teléfono.
 *
 * La regla de verdad vive en el relevo. Esto es sólo la puerta: quien se
 * saltara la app y hablara directo con el servidor seguiría recibiendo su 403.
 */
export const circulo = () => pedir('/amistad/lista', firmado({}));
export const pedirAmistad = (para, nota) =>
  pedir('/amistad/pedir', firmado({ para, nota: nota || '' }));
export const quitarAmigo = (con) => pedir('/amistad/quitar', firmado({ con }));

/* Aceptar o rechazar. Y AL ACEPTAR SE OLVIDA LO QUE SE SABÍA DE ESA PERSONA.
 *
 * El llavero guarda cinco minutos lo que devuelve `/llaves/de`, y guarda
 * TAMBIÉN el resultado vacío. Antes de aceptarte, tus llaves no se entregan,
 * así que quien te abrió el hilo demasiado pronto se quedó con una lista
 * vacía cacheada. Si escribe dentro de esos cinco minutos, `cerrar` no puede
 * hacer sobre y EL MENSAJE SALE EN CLARO — justo los primeros mensajes de una
 * relación que acaba de empezar, que suelen ser los que la gente cuida.
 *
 * En la web esto se tapó por el lado equivocado: se vacía el llavero dentro
 * de `estados()`, con un comentario que dice que es «para alguien a quien se
 * acaba de aceptar». O sea que el fallo se conocía, y se remendó en la única
 * función que casualmente pasaba por ahí. Aquí se vacía donde ocurre. */
export const responderAmistad = async (de, aceptar) => {
  const r = await pedir('/amistad/responder', firmado({ de, aceptar: !!aceptar }));
  if (aceptar) llavero.delete(String(de || '').toLowerCase());
  return r;
};

/* Bloquear y denunciar. La solicitud protege de quien todavía no entró; esto,
   de quien ya está dentro. Sin la segunda mitad, aceptar a alguien sería una
   puerta que no se puede volver a cerrar — y eso hace que la gente no acepte
   a nadie. Además, una app con chat en la tienda de Apple está obligada a
   ofrecer denunciar contenido de otras personas: hoy la app no lo ofrece. */
export const bloquear = (a, si = true) => pedir('/bloquear', firmado({ a, bloquear: !!si }));
export const bloqueados = () => pedir('/bloqueados', firmado({})).then((d) => d.gente || []);
export const denunciar = (a, motivo, nota = '', id = '') =>
  pedir('/denunciar', firmado({ a, motivo, nota, id }));
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
