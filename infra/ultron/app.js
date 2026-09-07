// ULTRON FP · Conocimiento Full — el asistente de la junta directiva.
//
// Este archivo es el andamio: la puerta, las rutas y el panel. El pensar vive
// en lib/cerebro.js, el saber en lib/saber.js, la memoria en lib/memoria.js.
// Acá no se piensa nada.
//
// ── LA PUERTA ───────────────────────────────────────────────────────────────
//
// Entra la junta y nadie más. La lista de miembros viene de ULTRON_JUNTA —un
// JSON con nombre, correo, WhatsApp, rol, clave y (desde hoy) gid de cada uno—
// y sin esa variable NO ENTRA NADIE: fail-closed, como toda puerta de esta
// casa. Una sesión es una cookie firmada con ULTRON_SECRETO que vence sola en
// doce horas.
//
// DOS FORMAS DE ENTRAR, Y LA LISTA MANDA EN LAS DOS:
//
//   · Correo y clave. La de siempre, rotable desde la variable.
//   · El pase de Genesis. La persona toca «Entrar con mi Veta Wallet», la
//     wallet le pide a Genesis un pase de SSO y la devuelve acá con él;
//     ULTRON se lo da a Genesis a comprobar con SU clave de API y Genesis
//     contesta de QUIÉN es ese pase (un GID). Si ese GID está en ULTRON_JUNTA,
//     entra; si no, no — aunque el pase sea perfectamente válido.
//
// GENESIS NO DECIDE QUIÉN ES DE LA JUNTA. Decide si un pase es de verdad y de
// quién; ser de la junta lo decide la junta, y eso vive en ULTRON_JUNTA. Un
// GID verificado del ecosistema —hay miles— no abre esta puerta. Por eso el
// SSO no es un agujero: es un segundo cerrojo delante del mismo padrón.
//
// Y SUMA, NO REEMPLAZA. Sin GENESIS_API_KEY el botón ni se enseña y todo sigue
// como estaba. Si Genesis se cae un martes, la junta entra con su clave.
//
// ── LO QUE CUESTA DINERO SE FRENA ───────────────────────────────────────────
//
// Cada turno de ULTRON son fichas de modelo, búsquedas y voz. Un bucle o un
// dedo apoyado en «enviar» no puede vaciar la cuenta: /pensar y /voz llevan
// freno por sesión. La junta no manda cien mensajes por minuto; si algo lo
// hace, no es la junta.

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');
const { join } = require('node:path');
const { readFileSync } = require('node:fs');

const saber = require('./lib/saber');
const vivo = require('./lib/vivo');
const vigia = require('./lib/vigia');
const memoria = require('./lib/memoria');
const cerebro = require('./lib/cerebro');
const canales = require('./lib/canales');
const voz = require('./lib/voz');
const herramientas = require('./lib/herramientas');
const genesis = require('./lib/genesis');
const pdf = require('./lib/pdf');
const archivos = require('./lib/archivos');
const permisos = require('./lib/permisos');
const boveda = require('./lib/boveda');
const aprender = require('./lib/aprender');
const equipo = require('./lib/equipo');
const salud = require('./lib/salud');
const avisos = require('./lib/avisos');
const bitacora = require('./lib/bitacora');
const sesiones = require('./lib/sesiones');
const preferencias = require('./lib/preferencias');
const caja = require('./lib/caja');
const mundo = require('./lib/mundo');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ── La junta ────────────────────────────────────────────────────────────────

/* El GID se compara SIEMPRE por esta forma, de los dos lados: el que escribió
   quien configuró la variable y el que contesta Genesis. Un espacio de más al
   pegar, o una minúscula, dejaría a un miembro fuera de su propia casa sin que
   nada explicara por qué. */
const normalizarGid = (g) => String(g || '').trim().toUpperCase();

function leerJunta() {
  const raw = (process.env.ULTRON_JUNTA || '').trim();
  if (!raw) return [];
  try {
    const l = JSON.parse(raw);
    if (!Array.isArray(l)) return [];
    /* Hace falta nombre, correo y AL MENOS UNA forma de probar quién es: la
       clave o el GID. Un miembro con las dos entra por donde quiera; uno con
       solo GID entra únicamente por la wallet (y es lo correcto: no tiene
       clave que adivinarle); uno con solo clave, como hasta hoy. Uno sin
       ninguna de las dos no es un miembro, es una línea suelta, y se descarta
       en vez de crear un correo que abre sin nada. */
    return l.filter((m) => m && m.correo && m.nombre && (m.clave || m.gid)).map((m) => ({
      nombre: String(m.nombre), correo: String(m.correo).toLowerCase(), rol: m.rol ? String(m.rol) : 'junta directiva',
      whatsapp: m.whatsapp ? String(m.whatsapp) : null,
      clave: m.clave ? String(m.clave) : null,
      gid: m.gid ? normalizarGid(m.gid) : null,
    }));
  } catch (e) {
    console.error(`[puerta] ULTRON_JUNTA no es JSON válido: ${e.message}`);
    return [];
  }
}
const JUNTA = leerJunta();
const SECRETO = (process.env.ULTRON_SECRETO || '').trim() || randomBytes(32).toString('hex');
if (!process.env.ULTRON_SECRETO) console.warn('[puerta] sin ULTRON_SECRETO: las sesiones se caen al reiniciar');
if (!JUNTA.length) console.error('[puerta] SIN JUNTA (ULTRON_JUNTA vacía o inválida): no entra nadie');
else console.log(`[puerta] junta de ${JUNTA.length}: ${JUNTA.map((m) => m.nombre).join(', ')}`);
/* Cuántos de la junta tienen GID se canta al arrancar, y no es un detalle: si
   el botón de la wallet está encendido pero NADIE tiene gid, el único síntoma
   sería que todo el mundo rebota con «esa identidad no es de la junta» y nadie
   sabría que lo que falta es un campo en una variable. */
const CON_GID = JUNTA.filter((m) => m.gid).length;
if (!genesis.configurado()) console.log('[puerta] SSO de Genesis apagado (sin GENESIS_API_KEY): se entra con correo y clave');
else if (!CON_GID) console.warn('[puerta] SSO de Genesis encendido pero NINGÚN miembro tiene gid en ULTRON_JUNTA: nadie va a poder entrar por la wallet');
else console.log(`[puerta] SSO de Genesis encendido: ${CON_GID} de ${JUNTA.length} miembro(s) con gid`);

/* LA VERSIÓN. La escribe el despliegue dentro del paquete (bin/desplegar.mjs).
   Corriendo desde el repositorio no existe y se dice «en el taller»: inventar
   un número de versión en desarrollo es exactamente cómo se confunde una
   pantalla vieja con una nueva. */
const VERSION = (() => {
  try { return JSON.parse(readFileSync(join(__dirname, 'version.json'), 'utf8')); }
  catch { return { commit: 'taller', rama: 'local', cuando: new Date().toISOString() }; }
})();
console.log(`[ultron] versión ${VERSION.commit} (${VERSION.rama}) · ${VERSION.cuando}`);

const SESION_MS = 12 * 60 * 60 * 1000;
const firmar = (s) => createHmac('sha256', SECRETO).update(s).digest('base64url');
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

/* La cookie lleva TRES cosas: quién, hasta cuándo y CUÁL sesión. El id es lo
   que permite cerrarla desde otro aparato: sin él, una cookie firmada vale
   hasta que vence —doce horas— y no hay manera de retirarla. Perder el teléfono
   desbloqueado era perder ULTRON hasta el día siguiente.
   Las cookies viejas (sin id) siguen valiendo hasta que venzan: no se echa a
   nadie de su sesión por un despliegue. */
function emitirSesion(correo, sid = '') {
  const vence = Date.now() + SESION_MS;
  const cuerpo = `${correo}|${vence}${sid ? `|${sid}` : ''}`;
  return `${Buffer.from(cuerpo).toString('base64url')}.${firmar(cuerpo)}`;
}
function leerSesion(token) {
  if (!token || !token.includes('.')) return null;
  const [c, f] = token.split('.');
  let cuerpo; try { cuerpo = Buffer.from(c, 'base64url').toString(); } catch { return null; }
  if (!iguales(firmar(cuerpo), f)) return null;
  const [correo, vence, sid] = cuerpo.split('|');
  if (Number(vence) < Date.now()) return null;
  if (sid && !sesiones.vive(sid)) return null;        // se cerró desde Ajustes
  const m = JUNTA.find((x) => x.correo === correo);
  return m ? { ...m, sid: sid || null } : null;
}
const sinClave = ({ clave, ...m }) => m;

/* EL DUEÑO. ULTRON_DUENO, o el miembro con rol «presidente», o el primero de
   la junta. Es el único que aprueba lo peligroso y el único que toca la
   bóveda. Se canta al arrancar para que nadie tenga que adivinarlo. */
const DUENO = permisos.dueñoDe(JUNTA);
if (JUNTA.length) console.log(`[permisos] el dueño es ${DUENO}${process.env.ULTRON_DUENO ? ' (ULTRON_DUENO)' : ' (por rol o por orden en la junta)'}`);
function soloDueño(req, res, next) {
  if (permisos.rolDe(req.miembro, JUNTA) !== 'dueño') return res.status(403).json({ error: 'Esto lo hace solo el dueño.', codigo: 'SOLO_DUENO' });
  next();
}

/** La puerta. */
function puerta(req, res, next) {
  if (!JUNTA.length) return res.status(503).json({ error: 'ULTRON no tiene junta configurada (ULTRON_JUNTA).', codigo: 'SIN_JUNTA' });
  const m = leerSesion(req.cookies?.ultron);
  if (!m) return res.status(401).json({ error: 'Sin sesión.', codigo: 'SIN_SESION' });
  req.miembro = m;
  sesiones.tocar(m.sid);               // «visto por última vez», como mucho cada 5 min
  next();
}

// ── Andamio ─────────────────────────────────────────────────────────────────

/* ── QUE UNA RUTA NO SE LLEVE A LA CASA ──────────────────────────────────────
   Express 4 no atrapa el rechazo de un manejador `async`: sube a
   `unhandledRejection` y Node 22 termina el proceso. Un fallo en una descarga
   —una ruta que usa una persona, de vez en cuando— tumbaba ULTRON ENTERO: la
   junta se quedaba sin consola, sin voz y sin tablero por un archivo.
   Se registra con todo detalle y se sigue en pie. Esto NO es tapar el fallo: el
   registro lo canta y las rutas siguen teniendo su propio `try`; es que la
   avería de una pieza no puede ser la avería de todas. */
process.on('unhandledRejection', (e) => {
  console.error('[ultron] promesa sin atrapar (la casa sigue en pie):', e?.stack || e);
  /* Y se cuenta: veinte veces el mismo fallo es una avería, y hasta hoy se
     perdía en el registro de Heroku sin que nadie lo sumara. */
  try { salud.anotarFallo(e, 'promesa sin atrapar'); } catch { /* la salud no puede tumbar la casa */ }
});

/* ── COMPRIMIR LO QUE VIAJA ───────────────────────────────────────────────────
 * Medido antes de ponerlo: la pantalla del OS son 281 kB que viajaban ENTEROS.
 * Comprimidos son unos 65. En una oficina no se nota; con datos móviles en
 * Roatán son varios segundos de pantalla en blanco cada vez que se entra.
 *
 * LO QUE NO SE COMPRIME, Y POR QUÉ IMPORTA: `/pensar` es un flujo de eventos
 * (SSE) que manda el texto A MEDIDA que el modelo lo escribe. Un compresor,
 * por definición, junta bytes antes de mandarlos — y eso convierte el flujo en
 * un bloque que llega al final. ULTRON dejaría de escribir en vivo y pasaría a
 * aparecer de golpe: exactamente el problema que el flujo vino a resolver.
 * Los audios (mp3) tampoco: ya vienen comprimidos y volver a hacerlo gasta
 * procesador para dejarlos igual o más grandes.
 */
app.use(compression({
  filter(req, res) {
    const tipo = String(res.getHeader('Content-Type') || '');
    if (tipo.includes('text/event-stream')) return false;
    if (/^(audio|video|image)\//.test(tipo) && !tipo.includes('svg')) return false;
    return compression.filter(req, res);
  },
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      /* SIN `'unsafe-inline'` en los guiones. No hay un solo `<script>` con
         cuerpo ni un solo manejador `on…=` en las dos pantallas —se comprobó—,
         así que el permiso no servía para nada y a cambio anulaba la principal
         defensa que la política aporta: el día que se cuele una inyección en
         alguno de los muchos `innerHTML`, esto es lo que la detiene. */
      scriptSrc: ["'self'"],
      /* Las fuentes ya no salen de la casa: van servidas desde /vendor/fuentes,
         por el mismo motivo por el que Three.js se vendorizó. Una consola
         privada no le cuenta a Google quién la abre ni desde dónde, y una hoja
         de estilos externa en la ruta crítica deja la pantalla sin tipografía
         cuando el otro extremo va lento.
         `'unsafe-inline'` en los ESTILOS sigue haciendo falta por los muchos
         `style=` en línea del marcado; quitarlos es un trabajo aparte. */
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

/* Subir tiene su propio freno y es MÁS BAJO que el de pensar: cada subida lee
   hasta ocho megas, los descomprime y les saca el texto. Veinte por minuto
   dejarían el dyno inflando zips en vez de contestando. */
const frenoSubir = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados archivos seguidos. Esperá un momento.', codigo: 'FRENO' } });
const frenoEntrar = rateLimit({ windowMs: 15 * 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá un rato.', codigo: 'FRENO' } });
/* La voz tiene su propio freno, y mucho más alto. Cada RESPUESTA se dice
   frase por frase, así que una respuesta larga son diez o quince llamadas a
   /voz en pocos segundos: con el freno de pensar (veinte por minuto) se
   agotaba a mitad de la segunda respuesta y ULTRON se quedaba mudo sin decir
   por qué. Lo que hay que frenar es el PENSAR, que es lo que cuesta. */
const frenoVoz = rateLimit({ windowMs: 60 * 1000, max: 180, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas frases seguidas. Esperá unos segundos.', codigo: 'MUCHA_VOZ' },
});
const frenoPensar = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.miembro?.correo || req.ip,
  message: { error: 'Muy seguido. Esperá un momento.', codigo: 'FRENO' } });

// ── Público ─────────────────────────────────────────────────────────────────

app.get('/salud', async (req, res) => {
  // Si piensa con el nodo, /salud dice si el nodo contesta: un cerebro
  // «encendido» cuyo motor está caído no está encendido.
  const nodoSalud = cerebro.cual() === 'nodo' ? await cerebro.nodo.salud() : null;
  res.json({
    nodo: nodoSalud,
    ok: true, nombre: 'ULTRON FP · Conocimiento Full',
    junta: JUNTA.length, cerebro: cerebro.encendido(), modelo: cerebro.modelo(), donde: cerebro.cual(),
    /* La puerta se describe entera: si el SSO está encendido y cuántos
       miembros pueden usarlo. Es lo que mira la pantalla de entrada para
       decidir si enseña el botón de la wallet, y lo que mira quien diagnostica
       por qué no lo enseña. */
    /* `genesis` es que se pueda COMPROBAR un pase; `genesisPase` es que haya a
       dónde mandar a la persona a SACARLO. Son dos cosas distintas y la puerta
       necesita las dos: con la primera sola enseñaba un botón que mandaba un
       pase vacío y contestaba «falta el pase». */
    genesis: genesis.configurado(), genesisPase: !!genesis.dondeSacarElPase(), juntaConGid: CON_GID,
    voz: voz.encendida(), memoria: memoria.estado(), canales: canales.estado(),
    saber: saber.resumen().total, saberArmado: saber.resumen().armadoEn,
    boveda: boveda.encendida(), equipo: equipo.estado().encendido, dueño: !!DUENO, herramientas: herramientas.DEFINICIONES.length,
    /* La nota de la última ronda del médico. Es lo que hace que «¿está bien
       ULTRON?» tenga una respuesta sin entrar al panel. */
    nota: salud.ultima()?.puntaje ?? null, relevo: cerebro.relevo?.().activo || false, avisos: avisos.MODO(),
    version: VERSION.commit, versionCuando: VERSION.cuando, rama: VERSION.rama,
  });
});

app.post('/entrar', frenoEntrar, (req, res) => {
  if (!JUNTA.length) return res.status(503).json({ error: 'ULTRON no tiene junta configurada.', codigo: 'SIN_JUNTA' });
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  const clave = String(req.body?.clave || '');
  const m = JUNTA.find((x) => x.correo === correo);
  /* `!m.clave` ANTES de comparar, y esto no es defensa de más. Un miembro de
     solo GID —el que entra por la wallet y no tiene clave— llegaba acá con
     m.clave = null; iguales() hace String(null) y la puerta se abría a
     cualquiera que escribiera «null». La comparación vacía nunca es un sí. */
  // El mismo mensaje exista o no el correo: no se regala la lista.
  if (!m || !m.clave || !iguales(m.clave, clave)) return res.status(401).json({ error: 'Correo o clave incorrectos.', codigo: 'NO_ENTRA' });
  sesiones.abrir({ correo: m.correo, req, como: 'clave', vence: Date.now() + SESION_MS }).then((sid) => {
    res.cookie('ultron', emitirSesion(m.correo, sid), {
      httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: SESION_MS,
    });
    res.json({ miembro: sinClave(m) });
  }).catch((e) => {
    /* Si no se pudo apuntar la sesión, se entra igual —quedarse fuera por no
       poder escribir un registro sería peor— pero sin id, o sea sin poder
       cerrarla desde lejos. Queda en el registro. */
    console.warn('[sesiones] no se pudo abrir:', e.message);
    res.cookie('ultron', emitirSesion(m.correo), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: SESION_MS });
    res.json({ miembro: sinClave(m) });
  });
});

/* ── POST /entrar/genesis — la puerta por el pase de la wallet ──────────────
 *
 * { token } → { miembro } y la misma cookie de siempre.
 *
 * La persona toca «Entrar con mi Veta Wallet», la wallet le pide a Genesis un
 * pase y la devuelve acá con él en el hash. Esta ruta hace tres cosas y ni una
 * más: se lo da a Genesis a comprobar, mira de quién es, y busca ese GID en la
 * junta.
 *
 * LOS TRES «NO» SON DISTINTOS Y SE DICEN DISTINTO, porque llevan a la persona
 * a sitios distintos:
 *
 *   503 SIN_GENESIS      — acá no hay clave de API. Es culpa NUESTRA; no se le
 *                          manda a la gente a sacar otro pase contra algo que
 *                          jamás va a poder abrirles.
 *   503 GENESIS_CAIDO    — no se pudo preguntar. Reintentar sirve.
 *   401 PASE_INVALIDO    — Genesis dijo que no. Sacar otro pase sirve.
 *   403 NO_ES_JUNTA      — el pase vale, pero ese GID no está en la lista.
 *                          Reintentar NO sirve: hay que entrar en la lista.
 *
 * Y el 403 SÍ dice el GID, a propósito. Es el suyo —lo acaba de probar con un
 * pase firmado— así que no se le regala nada, y sin verlo escrito nadie puede
 * pedir que lo agreguen: sería un «no» sin salida. Es también como se da de
 * alta a un miembro nuevo sin inventar un trámite: entra, ve su GID, se lo
 * pasa a quien administra la variable, y a la segunda vez entra.
 */
/* ── GET /entrar/genesis/ir — a buscar el pase ───────────────────────────────
 *
 * COMPROBAR un pase y REPARTIRLO son dos cosas distintas. `GENESIS_API_KEY`
 * sirve para lo primero; para lo segundo hay que mandar a la persona a la
 * wallet, que es quien se lo pide a Genesis y la devuelve acá con él en el
 * hash. Esa dirección no se adivina: se pone en `GENESIS_SSO_URL`, y si lleva
 * `{volver}` se le mete ahí la dirección de vuelta.
 *
 * Hasta hoy el botón «Entrar con mi Veta Wallet» mandaba `{}` —un pase VACÍO—
 * y el servidor contestaba, con toda la razón, «falta el pase». O sea: un
 * botón que no podía funcionar nunca, y que le decía a la persona que el fallo
 * era suyo. */
app.get('/entrar/genesis/ir', frenoEntrar, (req, res) => {
  const donde = genesis.dondeSacarElPase();
  if (!donde) return res.status(503).json({ error: 'Este servidor no sabe dónde se saca el pase de la wallet (falta GENESIS_SSO_URL).', codigo: 'SIN_SSO' });
  const volver = `${req.protocol}://${req.get('host')}/`;
  const url = donde.includes('{volver}')
    ? donde.replace('{volver}', encodeURIComponent(volver))
    : donde + (donde.includes('?') ? '&' : '?') + 'volver=' + encodeURIComponent(volver);
  res.redirect(302, url);
});

app.post('/entrar/genesis', frenoEntrar, async (req, res) => {
  if (!JUNTA.length) return res.status(503).json({ error: 'ULTRON no tiene junta configurada.', codigo: 'SIN_JUNTA' });
  if (!genesis.configurado()) {
    console.error('[puerta] pase de Genesis recibido pero este servidor no tiene GENESIS_API_KEY');
    return res.status(503).json({ error: 'El ingreso con Veta Wallet no está configurado en este servidor.', codigo: 'SIN_GENESIS' });
  }
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Falta el pase.', codigo: 'SIN_PASE' });

  let acceso;
  try {
    acceso = await genesis.verificarSso(token);
  } catch (e) {
    console.error(`[puerta] no se pudo comprobar el pase contra Genesis: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo comprobar el acceso con Genesis. Intente de nuevo.', codigo: 'GENESIS_CAIDO' });
  }
  if (!acceso.valido || !acceso.gid) {
    return res.status(401).json({ error: 'El pase no es válido o ya venció.', codigo: 'PASE_INVALIDO' });
  }

  const gid = normalizarGid(acceso.gid);
  const m = JUNTA.find((x) => x.gid && x.gid === gid);
  if (!m) {
    console.warn(`[puerta] pase válido de ${gid}, que no está en la junta`);
    return res.status(403).json({
      error: 'Su identidad es válida, pero no está en la junta directiva de ULTRON.',
      codigo: 'NO_ES_JUNTA', gid,
    });
  }
  /* La identidad tiene que seguir verificada HOY. Genesis ya devuelve 403
     cuando la bloqueó o la suspendió —así que esto casi nunca dispara— pero
     «casi nunca» no es «nunca», y el perfil es la única lectura que lo dice de
     frente. Si a la clave le faltara el alcance gid.perfil el perfil no
     vendría: eso es un fallo NUESTRO de configuración y se canta como tal en
     vez de dejar entrar a ciegas. */
  if (!acceso.perfil || typeof acceso.perfil !== 'object') {
    console.error('[puerta] Genesis validó el pase pero no mandó perfil: a la clave de ultron le falta el alcance gid.perfil');
    return res.status(503).json({ error: 'El ingreso con Veta Wallet no está bien configurado.', codigo: 'SIN_GENESIS' });
  }
  if (acceso.perfil.verificada !== true) {
    return res.status(403).json({ error: 'Su identidad ya no está verificada en Genesis ID.', codigo: 'SIN_VERIFICAR', gid });
  }

  console.log(`[puerta] ${m.nombre} entró con el pase de Genesis (${gid})`);
  const sidG = await sesiones.abrir({ correo: m.correo, req, como: 'genesis', vence: Date.now() + SESION_MS }).catch(() => '');
  res.cookie('ultron', emitirSesion(m.correo, sidG), {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: SESION_MS,
  });
  res.json({ miembro: sinClave(m), por: 'genesis' });
});

app.post('/salir', (req, res) => {
  /* Borrar la cookie del navegador no basta: la copia firmada que alguien
     tuviera seguiría valiendo hasta que venza. Se cierra la sesión de verdad. */
  const m = leerSesion(req.cookies?.ultron);
  if (m?.sid) sesiones.cerrar(m.sid, { por: m.correo }).catch(() => {});
  res.clearCookie('ultron');
  res.json({ ok: true });
});

// ── La junta ────────────────────────────────────────────────────────────────

app.get('/yo', puerta, (req, res) => {
  res.json({
    miembro: sinClave(req.miembro),
    junta: JUNTA.map((m) => ({ nombre: m.nombre, correo: m.correo, rol: m.rol, whatsapp: !!m.whatsapp, esDueño: m.correo === DUENO })),
    permiso: permisos.rolDe(req.miembro, JUNTA), dueño: DUENO,
    cerebro: cerebro.encendido(), modelo: cerebro.modelo(), donde: cerebro.cual(), voz: voz.encendida(),
    memoria: memoria.estado(), canales: canales.estado(), saber: saber.resumen(),
  });
});

/* `/vivo` lleva ADEMÁS lo que el vigía recuerda: desde cuándo está cada casa
   como está. «ORDENEX CAÍDA» sin fecha no deja decidir nada; «caída desde las
   03:14» sí. La lectura del momento y la memoria del vigía son dos cosas
   distintas y viajan por separado, para que se vea cuál es cuál. */
app.get('/vivo', puerta, async (req, res) => {
  /* El panel repregunta cada pocos segundos: servirle lo guardado y refrescar
     detrás es exactamente lo que quiere. */
  const v = await vivo.leerRapido();
  res.json({ ...v, vigia: vigia.estado() });
});
app.get('/saber', puerta, (req, res) => res.json(saber.resumen()));
app.get('/saber/buscar', puerta, (req, res) => res.json(saber.buscar(String(req.query.q || ''), { maximo: 10 })));

app.get('/memorias', puerta, async (req, res) => res.json(await memoria.memoriasDe(req.miembro.correo, { limite: 200 })));
app.post('/memorias', puerta, async (req, res) => {
  const m = await memoria.recordar({ texto: req.body?.texto, alcance: req.body?.alcance === 'junta' ? 'junta' : 'miembro',
    miembro: req.miembro.correo, dichoPor: req.miembro.nombre, tema: req.body?.tema, origen: 'pedido' });
  if (!m) return res.status(400).json({ error: 'Texto vacío.', codigo: 'VACIO' });
  res.json(m);
});
app.delete('/memorias/:id', puerta, async (req, res) => {
  res.json({ ok: await memoria.olvidar(req.params.id, req.miembro.correo) });
});

/* ── LOS PENDIENTES ──────────────────────────────────────────────────────────
   Son de la JUNTA, no de cada quien: cualquiera de los seis los ve, los anota
   y los cierra. Una lista de tareas que cada miembro ve distinta no es una
   lista de la junta, son seis listas que se contradicen. */
app.get('/pendientes', puerta, async (req, res) => {
  res.json(await memoria.pendientes({ conHechos: req.query.hechos === '1' }));
});
app.post('/pendientes', puerta, async (req, res) => {
  const p = await memoria.anotarPendiente({
    texto: req.body?.texto, quien: req.body?.quien, tema: req.body?.tema, creadoPor: req.miembro.correo, vence: req.body?.vence || null });
  if (!p) return res.status(400).json({ error: 'Texto vacío.', codigo: 'VACIO' });
  res.json(p);
});
app.patch('/pendientes/:id', puerta, async (req, res) => {
  const p = await memoria.cerrarPendiente(req.params.id, req.miembro.correo, { reabrir: req.body?.estado === 'abierto' });
  if (!p) return res.status(404).json({ error: 'No existe.', codigo: 'NO_EXISTE' });
  res.json(p);
});
app.delete('/pendientes/:id', puerta, async (req, res) => {
  res.json({ ok: await memoria.borrarPendiente(req.params.id) });
});

/* ── EL SALUDO ───────────────────────────────────────────────────────────────
   Lo primero que ULTRON dice al abrir: por su nombre, con la hora de Honduras
   y con lo que hay —qué casa no contesta, si la compra está cerrada, cuántos
   pendientes—. Es DETERMINISTA a propósito: sale al instante, no gasta un
   turno del modelo y no puede irse a otro idioma. Lo que se dice después ya
   es conversación. */
app.get('/saludo', puerta, async (req, res) => {
  const [v, abiertos] = await Promise.all([vivo.leerRapido().catch(() => null), memoria.pendientes({ limite: 100 })]);
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Tegucigalpa', hour: 'numeric', hour12: false }));
  const momento = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = String(req.miembro.nombre || '').split(' ')[0];
  const partes = [];
  if (v) {
    const caidas = ['ordenex', 'aucorp', 'wallet', 'genesis', 'ordenscan'].filter((k) => v[k] && v[k].vivo === false)
      .map((k) => ({ ordenex: 'Ordenex', aucorp: 'AuCorp', wallet: 'Veta Wallet', genesis: 'Genesis ID', ordenscan: 'OrdenScan' })[k]);
    if (v.origen?.origenUsd) partes.push(`el ORIGEN está a ${v.origen.origenUsd.toFixed(4)} dólares`);
    if (v.ordenex?.compraUsdt === 'cerrada') partes.push('la compra con USDT sigue cerrada');
    const lista = (l) => l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l.at(-1);
    if (caidas.length >= 5) partes.push('ninguna casa contesta');
    else if (caidas.length) partes.push(`${lista(caidas)} no ${caidas.length > 1 ? 'contestan' : 'contesta'}`);
  }
  const n = abiertos.length;
  partes.push(n === 0 ? 'no hay pendientes abiertos' : n === 1 ? 'hay un pendiente abierto' : `hay ${n} pendientes abiertos`);
  // Registro institucional: se saluda por el nombre, se informa, y se cede la
  // palabra. Ni «¿por dónde empezamos?» ni exclamaciones: es un despacho.
  /* EL CLIMA EN EL SALUDO. José lo pidió así: «cuando abro ocupo me diga cómo
     está señor José, cómo está el día de hoy, y da el clima actualizado». Va
     con su plazo propio y corto: si Open-Meteo tarda, se saluda sin clima — un
     saludo que se hace esperar tres segundos deja de ser un saludo. */
  const pref = await preferencias.de(req.miembro.correo).catch(() => ({ lugar: 'Tegucigalpa' }));
  /* DÓNDE, de verdad: si el navegador dio la ubicación hace poco, esa manda
     sobre el sitio escrito en Ajustes. José viaja a Roatán y darle el tiempo de
     Tegucigalpa desde la isla es exactamente lo que vino a arreglar. Pasadas
     doce horas la medida caduca y se vuelve al sitio elegido a mano. */
  const donde = preferencias.lugarDelClima(pref);
  let clima = null;
  try {
    clima = await Promise.race([
      mundo.climaCorto(donde),
      new Promise((ok) => setTimeout(() => ok(null), 2500)),
    ]);
  } catch { /* sin clima se saluda igual */ }

  const texto = `${momento}, ${nombre}. ${clima ? `${clima} ` : ''}${partes.join(', ').replace(/^./, (c) => c.toUpperCase())}. `
    + 'Quedo a su disposición: ¿en qué le ayudo?';
  res.json({ texto, nombre, hora, pendientes: n, clima, lugar: typeof donde === 'string' ? donde : 'su ubicación' });
});

/* ── LAS HERRAMIENTAS, A LA VISTA Y A MANO ────────────────────────────────────
   La consola enseña el catálogo entero (qué puede hacer ULTRON, agrupado por
   lo que toca) y deja correr cualquiera directamente, sin pasar por el modelo:
   un miembro de la junta que quiere el libro de AUKA-ORIGEN no tiene por qué
   redactar una pregunta para que un modelo decida llamar la función. Lo que
   corre es EXACTAMENTE la misma función que usa el modelo, con el mismo
   contexto, así que lo que la persona ve a mano es lo que ULTRON ve solo. */
app.get('/herramientas', puerta, (req, res) => res.json({ herramientas: herramientas.catalogo(), grupos: Object.keys(herramientas.GRUPOS) }));

app.post('/herramientas/:nombre', puerta, frenoPensar, async (req, res) => {
  const nombre = String(req.params.nombre || '');
  if (!herramientas.DEFINICIONES.some((d) => d.name === nombre)) return res.status(404).json({ error: 'No existe esa herramienta.', codigo: 'NO_EXISTE' });
  const ctx = { miembro: req.miembro, junta: JUNTA.map(sinClave), conversacionId: null, fuentes: [], memorias: [], documentos: [], envios: [], pendientes: [], acciones: [], chico: false, canal: 'mano' };
  const t0 = Date.now();
  /* Con `try`. Una herramienta que revienta —GitHub 404, AWS sin permiso—
     rechazaba la promesa, Express 4 no la atrapaba, y la persona se quedaba
     treinta segundos mirando el punto hasta el H12 de Heroku: ni respuesta ni
     motivo. El motivo es justo lo que la persona necesita para arreglarlo. */
  try {
    const salida = await herramientas.correr(nombre, req.body?.entrada || {}, ctx);
    res.json({ nombre, salida: String(salida), ms: Date.now() - t0, acciones: ctx.acciones, documentos: ctx.documentos, envios: ctx.envios, fuentes: ctx.fuentes.slice(0, 12) });
  } catch (e) {
    salud.anotarFallo(e, `herramienta ${nombre}`);
    res.status(e?.http === 404 ? 404 : 500).json({ nombre, error: String(e?.message || e).slice(0, 400), codigo: e?.codigo || 'HERRAMIENTA', ms: Date.now() - t0 });
  }
});

/* Lo que cuesta pensar. Va detrás de la puerta como todo lo demás: cuánto
   gasta la junta no es asunto de nadie más. */
app.get('/gasto', puerta, async (req, res) => res.json(await memoria.gasto()));

/* ── LA CAJA DE ORDENEX, PARA EL PANEL ────────────────────────────────────────
   El mismo dato que la herramienta `ordenex_caja`, en crudo: el panel lo pinta
   y ULTRON lo cuenta. Va con plazo largo porque del otro lado hay cuatro
   lecturas de cadena, y sin caché: si alguien toca ACTUALIZAR es justamente
   porque quiere el número de ahora. */
app.get('/ordenex/caja', puerta, async (req, res) => {
  try { res.json(await caja.leer()); }
  catch (e) { res.status(e.http === 401 || e.http === 403 ? 502 : 503).json({ error: e.message, codigo: e.codigo || 'CAJA' }); }
});

app.get('/conversaciones', puerta, async (req, res) => res.json(await memoria.conversacionesDe(req.miembro.correo)));
/* EL REGISTRO POR DÍA, que es como se busca una conversación: nadie se acuerda
   del título, se acuerda del día. */
app.get('/conversaciones/registro', puerta, async (req, res) => {
  try { res.json({ dias: await memoria.registroPorDia(req.miembro.correo, { dias: 30 }), hoy: memoria.diaDe() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
/* La de hoy, para que el panel siga el mismo hilo al recargar sin tener que
   escribir nada primero. */
app.get('/conversaciones/hoy', puerta, async (req, res) => {
  try {
    const c = await memoria.conversacionDelDia(req.miembro.correo, { canal: 'panel' });
    res.json({ _id: String(c._id), titulo: c.titulo || null, turnos: (c.turnos || []).length, yaExistia: !!c.yaExistia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/conversaciones/:id', puerta, async (req, res) => {
  const c = await memoria.conversacion(req.params.id, req.miembro.correo);
  if (!c) return res.status(404).json({ error: 'No existe.', codigo: 'NO_EXISTE' });
  res.json(c);
});

/* ── PENSAR, en vivo ──────────────────────────────────────────────────────────
   Server-Sent Events: el texto llega a medida que el modelo lo escribe, y las
   herramientas se anuncian cuando corren. Un asistente que se queda mudo
   veinte segundos y suelta un bloque no se siente vivo aunque piense bien. */
/* ── CALENTAR: la mitad de la fluidez está aquí ──────────────────────────────
 *
 * Medido contra producción el 6-sep con la misma pregunta: caché de prefijo
 * fría, la primera palabra a los 6,5 s; caliente, 1,0 s. La consola llama a
 * esto en cuanto se abre el micrófono, así que los tres segundos en que la
 * persona está hablando —en los que el motor no hacía nada— se gastan
 * evaluando el prompt que va a hacer falta.
 *
 * DOS GUARDAS, y las dos importan porque el nodo tiene UNA sola ranura:
 *  · Si hay un turno de verdad en vuelo, no se calienta: sería ponerse en fila
 *    delante de una respuesta que alguien está esperando.
 *  · Y no más de una vez cada veinte segundos por miembro, porque abrir y
 *    cerrar el micrófono es un gesto que se repite.
 * Contesta enseguida y sin esperar al motor: quien llama no espera nada. */
let pensando = 0;
const calentadoEn = new Map();
app.post('/precalentar', puerta, (req, res) => {
  const quien = req.miembro.correo;
  const ahora = Date.now();
  if (pensando > 0) return res.json({ ok: false, motivo: 'ocupado' });
  if (ahora - (calentadoEn.get(quien) || 0) < 20_000) return res.json({ ok: false, motivo: 'reciente' });
  calentadoEn.set(quien, ahora);
  res.json({ ok: true, lanzado: true });
  /* Se registra el resultado SIEMPRE, salga bien o mal. La primera versión solo
     escribía cuando salía bien, así que cuando en producción no salió nunca no
     hubo ni una línea que lo dijera: el tablero calentaba, el 200 volvía, y no
     se calentaba nada. Una mejora invisible que falla en silencio es peor que
     no tenerla. */
  cerebro.precalentar({ miembro: req.miembro, junta: JUNTA.map(sinClave), modo: req.body?.modo === 'texto' ? 'texto' : 'voz', alias: null })
    .then((r) => console.log(r?.ok ? `[calentar] ${modo} · ${r.fichas} fichas en ${r.ms}ms` : `[calentar] ${modo} · NO se calentó: ${r?.motivo || 'sin motivo'}`))
    .catch((e) => console.warn(`[calentar] falló: ${e?.codigo || ''} ${String(e?.message || e).slice(0, 120)}`));
});

app.post('/pensar', puerta, frenoPensar, async (req, res) => {
  const texto = String(req.body?.texto || '').trim().slice(0, 12_000);
  if (!texto) return res.status(400).json({ error: 'Nada que pensar.', codigo: 'VACIO' });
  if (!cerebro.encendido()) return res.status(503).json({ error: cerebro.cual() === 'nodo' ? 'El cerebro del nodo no está configurado (ULTRON_NODO_URL / ULTRON_NODO_SECRETO).' : 'El cerebro está apagado: falta ANTHROPIC_API_KEY.', codigo: 'CEREBRO_APAGADO' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const emitir = (evento, datos) => { try { res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`); } catch { /* se fue */ } };
  const latido = setInterval(() => { try { res.write(': latido\n\n'); } catch { /* nada */ } }, 15_000);

  /* ── SI SE VA, SE APAGA EL MOTOR ─────────────────────────────────────────
     Interrumpir a ULTRON —tocar el centro, o hablarle encima— corta el SSE
     desde la consola. Hasta hoy el servidor no se enteraba: seguía pensando la
     respuesta entera, ocupando la ÚNICA ranura del nodo, y la pregunta
     siguiente —la que la persona acababa de hacer— esperaba en fila detrás de
     una respuesta que ya nadie iba a leer. De ahí venían los diez segundos de
     silencio después de cada interrupción.
     Ahora la desconexión aborta: el motor deja de generar, la ranura queda
     libre en el acto y el turno nuevo arranca de una. */
  const corte = new AbortController();
  let terminado = false;
  pensando++;
  res.on('close', () => { if (!terminado) { corte.abort(); console.log('[pensar] se cortó: lo dejó quien preguntaba'); } });

  const t0 = Date.now();
  const reloj = { llegó: 0, hilo: 0, pensó: 0 };
  try {
    /* ── LAS DOS LECTURAS QUE HAY QUE HACER, EN PARALELO ────────────────────
       El hilo del día y las preferencias no dependen el uno del otro, y antes
       iban en fila con el pensar esperando detrás. */
    const pedidoConv = req.body?.conversacionId ? String(req.body.conversacionId) : null;
    const [hilo, pref] = await Promise.all([
      (async () => {
        if (pedidoConv) {
          const ya = await memoria.conversacion(pedidoConv, req.miembro.correo);
          if (ya) return { conv: ya, nueva: false };
        }
        /* LA DEL DÍA, no una nueva. Recargar la página, cerrar la pestaña o
           volver por la tarde abría una conversación distinta cada vez: el día
           quedaba partido en trozos sueltos y —lo que más pesa— el cerebro lee
           la conversación anterior para tener contexto, así que al volver del
           almuerzo ULTRON no se acordaba de la mañana. */
        const c = await memoria.conversacionDelDia(req.miembro.correo, { canal: 'panel' });
        return { conv: c, nueva: !c.yaExistia };
      })(),
      preferencias.de(req.miembro.correo).catch(() => ({ idioma: 'es' })),
    ]);
    const convId = String(hilo.conv._id);
    const nueva = hilo.nueva;
    reloj.hilo = Date.now() - t0;
    emitir('inicio', { conversacionId: convId, nueva });

    /* ── EL TURNO DEL MIEMBRO SE ANOTA MIENTRAS SE PIENSA ───────────────────
       Era un `await` a una ESCRITURA con el modelo parado esperándola. Ahora
       se solapa con el pensar. Pero se ESPERA antes de anotar la respuesta:
       son dos `$push` sobre el mismo documento, y sin esperar podrían quedar
       invertidos en la conversación; y un fallo de escritura tiene que verse,
       no perderse en silencio. */
    const anotado = memoria.anotarTurno(convId, req.miembro.correo, { rol: 'miembro', texto })
      .catch((e) => { console.error('[pensar] no se anotó el turno del miembro:', e?.message); return null; });

    // `modo: 'voz'` es la conversación hablada: respuestas cortas, sin markdown,
    // hechas para escucharse. `texto` (por omisión) es la de siempre.
    const modo = req.body?.modo === 'voz' ? 'voz' : 'texto';
    // `alias`: cómo se presenta en esta interfaz (AURA OS le dice «Aura»).
    const alias = /^[A-Za-zÁÉÍÓÚáéíóúñÑ\- ]{2,24}$/.test(String(req.body?.alias || '')) ? String(req.body.alias).trim() : null;
    /* El hilo ya leído viaja hacia abajo: el cerebro lo volvía a pedir a Mongo
       con el mismo id que acabamos de leer aquí. */
    const r = await cerebro.pensar({ miembro: req.miembro, junta: JUNTA.map(sinClave), texto, conversacionId: convId, previa: hilo.conv, emitir, modo, alias, idioma: pref.idioma, senalCorte: corte.signal });
    reloj.pensó = Date.now() - t0;
    await anotado;
    await memoria.anotarTurno(convId, req.miembro.correo, { rol: 'ultron', texto: r.texto, herramientas: r.herramientas, fuentes: r.fuentes });
    /* ── EL TÍTULO NO RETIENE LA RESPUESTA ──────────────────────────────────
       Titular una conversación nueva es OTRA llamada al modelo, y estaba
       delante del `fin`: la última frase de la respuesta se quedaba esperando
       a que un segundo modelo inventara un título. Ahora el `fin` sale
       primero y el título llega después, por su propio evento. */
    emitir('fin', { ...r, conversacionId: convId, ms: { ...reloj, total: Date.now() - t0, ...(r.ms || {}) } });
    console.log(`[pensar] ${modo} · hilo ${reloj.hilo}ms · pensar ${reloj.pensó - reloj.hilo}ms · total ${Date.now() - t0}ms${r.ms ? ` · ${Object.entries(r.ms).map(([k, v]) => `${k} ${v}ms`).join(' · ')}` : ''}`);
    if (nueva) {
      try {
        const t = await cerebro.titular(texto);
        if (t) { await memoria.titular(convId, req.miembro.correo, t); emitir('titulo', { titulo: t }); }
      } catch { /* sin título se vive; la conversación ya está guardada */ }
    }
  } catch (e) {
    const m = cerebro.motivo(e);
    /* Un turno cancelado no es un fallo: no se escribe en rojo en el registro
       ni se le manda un error a una consola que ya se fue. */
    if (m.codigo === 'CORTADO' || corte.signal.aborted) console.log('[pensar] cancelado por quien preguntaba');
    else {
      console.error(`[pensar] ${m.codigo} · ${e?.status || ''} ${e?.message || e}`);
      emitir('error', { mensaje: m.mensaje, codigo: m.codigo });
    }
  } finally {
    terminado = true;
    pensando--;
    clearInterval(latido);
    res.end();
  }
});

/* ── ARCHIVOS: lo que la junta le MANDA a ULTRON ─────────────────────────────
 *
 * El camino contrario al de los documentos. Hasta hoy ULTRON escribía y no
 * podía recibir: para que leyera un informe había que copiarlo y pegarlo en la
 * caja de texto, y un informe de treinta páginas no se pega.
 *
 * El cuerpo llega CRUDO y no como formulario de varias partes. Un multipart se
 * arma con una librería más y trae su propia clase de fallos —bordes mal
 * cerrados, nombres de campo, codificaciones— para transportar un solo archivo.
 * Aquí el archivo ES el cuerpo, el nombre viaja en una cabecera y el tipo en
 * el Content-Type de siempre. El navegador lo manda con `fetch(body: File)` en
 * una línea.
 */
const TOPE_SUBIDA = archivos.TOPE_BYTES;
const crudo = express.raw({ type: () => true, limit: TOPE_SUBIDA });

app.post('/archivos', puerta, frenoSubir, crudo, async (req, res) => {
  try {
    /* Un `%` suelto en el nombre hace que `decodeURIComponent` LANCE, y eso
       caía en el catch de abajo y salía un 500 con un mensaje interno por un
       archivo llamado «100% cerrado.pdf». Si no se puede descifrar, se usa tal
       cual: el nombre es una etiqueta, no una instrucción. */
    const crudoNombre = String(req.get('x-nombre') || '');
    let nombre; try { nombre = decodeURIComponent(crudoNombre); } catch { nombre = crudoNombre; }
    nombre = nombre.slice(0, 200);
    const a = await archivos.guardar({
      nombre, tipo: req.get('content-type'), buf: req.body,
      miembro: req.miembro.correo, conversacion: req.get('x-conversacion') || null,
    });
    res.json(a);
  } catch (e) {
    /* Los cuatro motivos por los que un archivo se rechaza tienen nombre y se
       dicen. «No se pudo subir» manda a la persona a probar otra vez con el
       mismo archivo que nunca va a entrar. */
    const codigo = e?.codigo || 'ERROR';
    res.status(codigo === 'TIPO_NO' || codigo === 'MUY_GRANDE' || codigo === 'VACIO' ? 400 : 500)
      .json({ error: e.message, codigo });
  }
});
/* El cuerpo que pasa del tope lo corta express antes de llegar arriba, y sin
   esto sale un 500 genérico con una pila. Se contesta lo que de verdad pasó. */
app.use('/archivos', (err, req, res, sig) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: `El archivo pasa de ${Math.round(TOPE_SUBIDA / 1e6)} MB.`, codigo: 'MUY_GRANDE' });
  }
  return sig(err);
});

app.get('/archivos', puerta, async (req, res) => res.json(await archivos.lista({ limite: 40 })));

/* Con `try`. Express 4 no atrapa el rechazo de un manejador `async`: se va a
   `unhandledRejection` y Node 22 TERMINA EL PROCESO. Por eso un solo byte mal
   tipado en esta ruta no daba un 500 con su explicación: tumbaba a ULTRON
   entero y Heroku enseñaba «Application Error». Una descarga que falla tiene
   que fallar sola. */
app.get('/archivos/:id/bajar', puerta, async (req, res) => {
  try {
  const a = await archivos.uno(req.params.id, { conCrudo: true });
  if (!a) return res.status(404).json({ error: 'No existe.', codigo: 'NO_EXISTE' });
  if (!Buffer.isBuffer(a.crudo)) return res.status(500).json({ error: 'El archivo está guardado en un formato que no se puede devolver.', codigo: 'CRUDO_RARO' });
  const limpio = String(a.nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w. -]/g, '').slice(0, 120) || 'archivo';
  res.setHeader('Content-Type', a.tipo);
  res.setHeader('Content-Length', a.crudo.length);
  /* `inline` para lo que el navegador sabe enseñar —un PDF, una imagen— y
     `attachment` para lo demás: obligar a bajar un PDF que se podía mirar es
     un clic de más y un archivo suelto en la carpeta de descargas. */
  const aLaVista = /^(application\/pdf|image\/|text\/plain)/.test(a.tipo);
  res.setHeader('Content-Disposition', `${aLaVista ? 'inline' : 'attachment'}; filename="${limpio}"`);
  res.send(a.crudo);
  } catch (e) {
    console.error('[archivos] bajar falló:', e?.message);
    if (!res.headersSent) res.status(500).json({ error: 'No se pudo devolver el archivo.', codigo: 'BAJAR_FALLO' });
  }
});

app.delete('/archivos/:id', puerta, async (req, res) => {
  const fue = await archivos.borrar(req.params.id, null);
  if (!fue) return res.status(404).json({ error: 'No existe.', codigo: 'NO_EXISTE' });
  res.json({ ok: true });
});

// ── Documentos ──────────────────────────────────────────────────────────────

app.get('/documentos', puerta, async (req, res) => res.json(await memoria.documentos()));
app.get('/documentos/:id', puerta, async (req, res) => {
  const d = await memoria.documento(req.params.id);
  if (!d) return res.status(404).json({ error: 'No existe.', codigo: 'NO_EXISTE' });
  res.json(d);
});
app.get('/documentos/:id/descargar', puerta, async (req, res) => {
  const d = await memoria.documento(req.params.id);
  if (!d) return res.status(404).json({ error: 'No existe.', codigo: 'NO_EXISTE' });
  const nombre = pdf.nombreArchivo(d.titulo);
  /* El PDF es el formato con el que un documento SALE de la casa: se adjunta a
     un correo, se imprime para una reunión, se le manda a un abogado. Se dibuja
     acá mismo, sin navegador sin ventana (lib/pdf.js explica por qué). */
  if (req.query.formato === 'pdf') {
    try {
      const bytes = await pdf.documentoPdf(d);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', bytes.length);
      res.setHeader('Content-Disposition',
        `${req.query.ver === '1' ? 'inline' : 'attachment'}; filename="${nombre}.pdf"`);
      return res.send(bytes);
    } catch (e) {
      console.error(`[pdf] ${d._id}: ${e.message}`);
      return res.status(500).json({ error: 'No se pudo armar el PDF.', codigo: 'PDF_ROTO' });
    }
  }
  if (req.query.formato === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.html"`);
    return res.send(documentoHtml(d));
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.md"`);
  res.send(d.markdown);
});

/** Un documento como HTML de la casa, para imprimir o mandar. */
function documentoHtml(d) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = require('./public/markdown');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(d.titulo)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{max-width:760px;margin:40px auto;padding:0 24px;font:15.5px/1.65 Georgia,serif;color:#1a1a1a;background:#fff}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin-top:28px}h3{font-size:16px}
.meta{color:#666;font-size:13px;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:22px}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ccc;padding:6px 9px;text-align:left;font-size:14px}
code{background:#f3f3f3;padding:1px 4px;border-radius:3px;font-size:13px}pre{background:#f3f3f3;padding:12px;overflow:auto}
blockquote{border-left:3px solid #C9A961;margin:12px 0;padding:4px 14px;color:#444}
.pie{margin-top:40px;border-top:1px solid #ddd;padding-top:10px;color:#888;font-size:12px}
@media print{body{margin:0}}
</style></head><body>
<div class="meta">Orden Global · Junta Directiva · ${esc(d.tipo)} · ${new Date(d.en).toLocaleDateString('es-HN', { dateStyle: 'long' })}${d.para === 'fuera' ? ' · para fuera de la junta' : ' · uso interno'}</div>
${md.aHtml(d.markdown)}
<div class="pie">Escrito por ULTRON FP a pedido de ${esc(d.miembro || 'la junta')}. Las fuentes están al final del texto.</div>
</body></html>`;
}

// ── Envíos: solo con una persona confirmando ────────────────────────────────

app.post('/enviar', puerta, async (req, res) => {
  const e = req.body?.envio || {};
  const canal = e.canal === 'whatsapp' ? 'whatsapp' : e.canal === 'correo' ? 'correo' : null;
  if (!canal) return res.status(400).json({ error: 'Canal inválido.', codigo: 'CANAL_INVALIDO' });
  // El destino se vuelve a comprobar contra la junta AQUÍ, no se confía en lo
  // que vino del navegador: el panel es nuestro, pero un POST lo manda cualquiera con sesión.
  const quien = JUNTA.find((j) => j.correo === String(e?.a?.correo || '').toLowerCase());
  if (!quien) return res.status(400).json({ error: 'El destinatario no es de la junta.', codigo: 'DESTINO_INVALIDO' });
  const texto = String(e.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'Mensaje vacío.', codigo: 'VACIO' });
  try {
    const firma = `\n\n— ULTRON FP, a pedido de ${req.miembro.nombre}`;
    const r = canal === 'whatsapp'
      ? await canales.whatsapp(quien.whatsapp, texto + firma)
      : await canales.correo(quien.correo, e.asunto || 'De la junta directiva · Orden Global', texto + firma);
    res.json({ ok: true, canal, a: quien.nombre, id: r.id });
  } catch (err) {
    const http = err?.codigo === 'CANAL_APAGADO' ? 503 : err?.codigo === 'DESTINO_INVALIDO' ? 400 : 502;
    res.status(http).json({ error: err.message, codigo: err.codigo || 'ERROR' });
  }
});

// ── La voz ──────────────────────────────────────────────────────────────────

/* Las voces que la junta puede elegir (español primero). Sin llave: lista vacía. */
app.get('/voces', puerta, async (req, res) => {
  try { res.json({ actual: voz.VOZ, voces: await voz.voces() }); }
  catch (e) { res.status(502).json({ error: e.message, codigo: 'PROVEEDOR' }); }
});

/* Las muletillas: lo que ULTRON dice mientras piensa. El catálogo es público
   para quien entró (son siete frases, no hay nada que proteger) y cada audio se
   pide por su grupo y su número. Se graban una vez y quedan en memoria. */
app.get('/voz/muletillas', puerta, async (req, res) => {
  const pref = await preferencias.de(req.miembro.correo).catch(() => ({ idioma: 'es' }));
  res.json({ idioma: pref.idioma, muletillas: voz.muletillas(pref.idioma), hay: voz.encendida() });
});
app.get('/voz/muletilla/:grupo/:i', puerta, async (req, res) => {
  if (!voz.encendida()) return res.status(503).json({ error: 'Voz apagada.', codigo: 'VOZ_APAGADA' });
  try {
    const pref = await preferencias.de(req.miembro.correo).catch(() => ({ idioma: 'es', vozId: null }));
    const audio = await voz.muletilla(pref.idioma, String(req.params.grupo), Number(req.params.i) || 0, { vozId: pref.vozId || null });
    res.setHeader('Content-Type', 'audio/mpeg');
    /* Un año de caché: una muletilla es la misma frase con la misma voz para
       siempre. Es lo que hace que a la segunda vez salga sin ningún viaje. */
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(audio);
  } catch (e) { res.status(502).json({ error: e.message, codigo: e.codigo || 'ERROR' }); }
});

/* ── LA VOZ, EN VIVO Y POR DIRECCIÓN ──────────────────────────────────────────
 * Esta ruta existe para una cosa: que el navegador pueda poner la dirección en
 * una etiqueta de audio y EMPEZAR A SONAR con los primeros kilobytes, en vez de
 * bajar el mp3 entero y sonarlo después. Por eso es GET y no POST — una
 * etiqueta de audio no sabe mandar un POST — y por eso el texto viaja en la
 * dirección.
 *
 * El texto de una frase hablada son doscientas letras: cabe de sobra. Si
 * alguien manda un párrafo entero, se corta y se dice.
 *
 * Y se puede guardar en el navegador una hora: la misma frase con la misma voz
 * suena igual siempre, y ULTRON repite muchas —el cierre del saludo, «quedo a
 * su disposición», los «sí, señor»—. `private` porque lleva lo que ULTRON le
 * dijo a esta persona: no lo guarda ningún intermediario.
 */
app.get('/voz', puerta, frenoVoz, async (req, res) => {
  if (!voz.encendida()) return res.status(503).json({ error: 'Voz apagada (falta ELEVENLABS_API_KEY).', codigo: 'VOZ_APAGADA' });
  const texto = String(req.query?.t || '').slice(0, 900);
  if (!texto.trim()) return res.status(400).json({ error: 'Nada que decir.', codigo: 'VACIO' });
  try {
    const chorro = await voz.hablarEnVivo(texto, { rapido: req.query?.lento !== '1', vozId: req.query?.v ? String(req.query.v).slice(0, 40) : null });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    /* Sin esto, el proxy de Heroku junta trozos y el chorro deja de serlo. */
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const { Readable } = require('node:stream');
    Readable.fromWeb(chorro).pipe(res);
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch { /* ya */ } return; }
    res.status(e?.codigo === 'VACIO' ? 400 : 502).json({ error: e.message, codigo: e.codigo || 'ERROR' });
  }
});

app.post('/voz', puerta, frenoVoz, async (req, res) => {
  if (!voz.encendida()) return res.status(503).json({ error: 'Voz apagada (falta ELEVENLABS_API_KEY).', codigo: 'VOZ_APAGADA' });
  try {
    const audio = await voz.hablar(String(req.body?.texto || ''), { rapido: req.body?.rapido === true, vozId: req.body?.vozId ? String(req.body.vozId).slice(0, 40) : null });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(audio);
  } catch (e) {
    res.status(e?.codigo === 'VACIO' ? 400 : 502).json({ error: e.message, codigo: e.codigo || 'ERROR' });
  }
});

/* ── WHATSAPP, ENTRADA ────────────────────────────────────────────────────────
   AU-RA es la que sondea la bandeja. Cuando ve un mensaje de un número de la
   junta, lo trae acá con el secreto compartido y devuelve la respuesta por su
   boca. Sin secreto, o con uno que no coincide, no se contesta nada. */
app.post('/whatsapp/entrada', async (req, res) => {
  const secreto = (process.env.ULTRON_SECRETO_AURA || '').trim();
  if (!secreto) return res.status(503).json({ error: 'Entrada de WhatsApp apagada (ULTRON_SECRETO_AURA).', codigo: 'CANAL_APAGADO' });
  if (!iguales(String(req.get('x-ultron-secreto') || ''), secreto)) return res.status(401).json({ error: 'No.', codigo: 'NO' });
  const de = String(req.body?.de || '').replace(/[^\d]/g, '');
  const m = JUNTA.find((j) => j.whatsapp && j.whatsapp.replace(/[^\d]/g, '') === de);
  if (!m) return res.status(403).json({ error: 'Ese número no es de la junta.', codigo: 'NO_ES_JUNTA' });
  const texto = String(req.body?.texto || '').trim().slice(0, 4000);
  if (!texto) return res.status(400).json({ error: 'Vacío.', codigo: 'VACIO' });
  if (!cerebro.encendido()) return res.status(503).json({ error: 'Cerebro apagado.', codigo: 'CEREBRO_APAGADO' });
  try {
    // Un hilo por canal y miembro: el de WhatsApp de José es siempre el mismo.
    const lista = await memoria.conversacionesDe(m.correo, { limite: 50 });
    let conv = lista.find((c) => c.canal === 'whatsapp');
    if (!conv) conv = await memoria.abrirConversacion(m.correo, { canal: 'whatsapp', titulo: 'WhatsApp' });
    await memoria.anotarTurno(conv._id, m.correo, { rol: 'miembro', texto });
    const prefW = await preferencias.de(m.correo).catch(() => ({ idioma: 'es' }));
    const r = await cerebro.pensar({ miembro: m, junta: JUNTA.map(sinClave), texto, conversacionId: String(conv._id), idioma: prefW.idioma });
    await memoria.anotarTurno(conv._id, m.correo, { rol: 'ultron', texto: r.texto, herramientas: r.herramientas, fuentes: r.fuentes });
    // WhatsApp no pinta markdown: se le quita lo que no se ve.
    const plano = r.texto.replace(/^#{1,6}\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/`/g, '');
    res.json({ respuesta: plano.slice(0, 4000), documentos: r.documentos, envios: r.envios.length });
  } catch (e) {
    // Por WhatsApp no se cuenta el detalle de una avería nuestra: quien
    // escribe no puede hacer nada con eso. Va al registro, con su nombre.
    const m = cerebro.motivo(e);
    console.error(`[whatsapp] ${m.codigo} · ${e?.message || e}`);
    res.status(500).json({ error: 'No se pudo contestar.', codigo: m.codigo });
  }
});

// ── El panel ────────────────────────────────────────────────────────────────

/* ULTRON OS. La consola de siempre sigue en la raíz y no se toca: es la que la
   junta ya conoce y la que funciona en cualquier navegador viejo. El OS es la
   otra cara —el tablero con el busto— y vive en /os.
   Dos puertas al mismo ULTRON, no dos ULTRON: la misma sesión, las mismas
   rutas, la misma memoria. Si el 3D no arranca en un aparato, /  sigue ahí. */
/* ── LA MANO DERECHA: autorizaciones, bóveda, equipo, habilidades ───────────
 *
 * Todo lo peligroso que ULTRON propone pasa por aquí antes de correr. El
 * panel lista los pedidos; el dueño —y nadie más— aprueba o niega, viendo el
 * resumen exacto de lo que se va a hacer. La bóveda solo la toca el dueño y
 * el valor de un secreto entra por POST /boveda desde su pantalla: no hay
 * ninguna ruta que lo devuelva.
 */
app.get('/autorizaciones', puerta, async (req, res) => {
  try { res.json({ pendientes: await permisos.pendientes(), recientes: await permisos.lista({ limite: 20 }), dueño: DUENO, soyDueño: permisos.rolDe(req.miembro, JUNTA) === 'dueño' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/autorizaciones/:id', puerta, soloDueño, async (req, res) => {
  try {
    const decision = String(req.body?.decision || '');
    const p = await permisos.resolver(req.params.id, { por: req.miembro.correo, decision });
    if (!p) return res.status(404).json({ error: 'Ese pedido no está pendiente.', codigo: 'NO_PENDIENTE' });
    console.log(`[permisos] ${req.miembro.correo} ${decision}: ${p.resumen}`);
    res.json(p);
  } catch (e) { res.status(e.codigo === 'DECISION' ? 400 : 500).json({ error: e.message, codigo: e.codigo }); }
});

app.get('/boveda', puerta, async (req, res) => {
  try { res.json({ encendida: boveda.encendida(), secretos: await boveda.listar(), juicio: await boveda.juicio() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/boveda', puerta, soloDueño, express.json({ limit: '32kb' }), async (req, res) => {
  try {
    const s = await boveda.guardar({ nombre: req.body?.nombre, valor: req.body?.valor, nota: req.body?.nota, por: req.miembro.correo, yaEn: req.body?.yaEn });
    console.log(`[boveda] ${req.miembro.correo} guardó ${s.nombre} (${s.largo} caracteres)`);   // el nombre y el largo; el valor, jamás
    res.json(s);
  } catch (e) { res.status(e.codigo === 'BOVEDA_APAGADA' ? 503 : 400).json({ error: e.message, codigo: e.codigo }); }
});
app.delete('/boveda/:nombre', puerta, soloDueño, async (req, res) => {
  try { res.json({ ok: await boveda.borrar(req.params.nombre) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/equipo', puerta, async (req, res) => {
  try { res.json({ ...equipo.estado(), partes: await equipo.partes({ limite: Number(req.query.limite) || 12, bot: req.query.bot || null }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/equipo/:bot/correr', puerta, async (req, res) => {
  try { res.json(await equipo.correr(req.params.bot, { pensar: cerebro.pensar, junta: JUNTA, pedidoPor: req.miembro.correo })); }
  catch (e) { res.status(e.codigo === 'NO_EXISTE' ? 404 : e.codigo === 'EN_MARCHA' ? 409 : 500).json({ error: e.message, codigo: e.codigo }); }
});

/* ── LA SALUD DE ULTRON, PARA LA PANTALLA ──────────────────────────────────
   `/salud` es público y dice lo básico. Esto es la revisión entera, con los
   nueve signos y sus arreglos, y solo la ve quien entró. */
app.get('/salud/profunda', puerta, async (req, res) => {
  try { res.json(await salud.revisar()); }
  catch (e) { salud.anotarFallo(e, 'GET /salud/profunda'); res.status(500).json({ error: e.message }); }
});
/* Los avisos: modo, últimos enviados y por dónde. Nunca el texto entero de
   uno grave si lleva datos; aquí solo título, gravedad y canal. */
/* ── AJUSTES ────────────────────────────────────────────────────────────────
   Todo lo que una persona puede mirar y cambiar de SU ULTRON: su perfil, la
   voz, el idioma, la figura del centro, y desde dónde tiene la sesión abierta.
   Las sesiones son de quien pregunta y de nadie más: ni el dueño ve las de
   otro miembro desde aquí. */
app.get('/sesiones', puerta, async (req, res) => {
  try {
    const l = await sesiones.listar(req.miembro.correo);
    res.json({ sesiones: l.map((s) => ({ ...s, esta: s.sid === req.miembro.sid })), actual: req.miembro.sid || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/sesiones/:sid', puerta, async (req, res) => {
  try {
    const mias = await sesiones.listar(req.miembro.correo);
    if (!mias.some((s) => s.sid === req.params.sid)) return res.status(404).json({ error: 'No existe esa sesión.', codigo: 'NO_EXISTE' });
    await sesiones.cerrar(req.params.sid, { por: req.miembro.correo });
    res.json({ ok: true, era: req.params.sid === req.miembro.sid ? 'esta' : 'otra' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/sesiones/cerrar-otras', puerta, async (req, res) => {
  try { res.json({ cerradas: await sesiones.cerrarOtras(req.miembro.correo, req.miembro.sid, { por: req.miembro.correo }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/preferencias', puerta, async (req, res) => {
  try {
    const p = await preferencias.de(req.miembro.correo);
    /* Cómo se llama el sitio que se midió, para poder ENSEÑARLO en Ajustes. Se
       resuelve sin red cuando cae cerca de un sitio de la casa, que es el 99 %
       de los días; si no, se dicen las coordenadas, que es la verdad. */
    let donde = null;
    if (preferencias.coordsFrescas(p.coords)) {
      const l = mundo.porCoordenadas(p.coords.lat, p.coords.lon);
      donde = l.nombre || `${p.coords.lat}, ${p.coords.lon}`;
    }
    res.json({ ...p, donde, sugeridas: preferencias.VOCES_SUGERIDAS, vozDeLaCasa: voz.VOZ });
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/preferencias', puerta, express.json({ limit: '8kb' }), async (req, res) => {
  try { res.json(await preferencias.guardar(req.miembro.correo, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/casa', puerta, async (req, res) => {
  const c = await preferencias.casa();
  res.json({ ...c, opciones: preferencias.CEREBROS, cual: cerebro.cual(), nodoConfigurado: cerebro.nodo.encendido(), claudeConfigurado: !!(process.env.ANTHROPIC_API_KEY || '').trim() });
});
app.post('/casa', puerta, soloDueño, express.json({ limit: '4kb' }), async (req, res) => {
  try { res.json(await preferencias.guardarCasa(req.body || {}, req.miembro.correo)); }
  catch (e) { res.status(400).json({ error: e.message, codigo: e.codigo || 'ERROR' }); }
});

app.get('/avisos', puerta, (req, res) => res.json(avisos.estado()));
/* La bitácora: solo lectura desde aquí también. */
app.get('/bitacora', puerta, async (req, res) => {
  try { res.json({ acciones: await bitacora.leer({ limite: Math.min(100, Number(req.query.limite) || 40), herramienta: req.query.herramienta || null, quien: req.query.quien || null }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/salud/historial', puerta, async (req, res) => {
  try { res.json({ rondas: await salud.historial({ limite: Math.min(60, Number(req.query.limite) || 24) }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
/* Reparar es de nivel «escribir»: interno y reversible. Lo puede pedir
   cualquiera de la junta desde el panel; el dueño no tiene que estar. */
app.post('/salud/reparar', puerta, async (req, res) => {
  try { res.json(await salud.reparar(Array.isArray(req.body?.arreglos) ? req.body.arreglos : null)); }
  catch (e) { salud.anotarFallo(e, 'POST /salud/reparar'); res.status(500).json({ error: e.message }); }
});

app.get('/habilidades', puerta, async (req, res) => {
  try { res.json((await aprender.listar()).map((h) => ({ nombre: h.nombre, cuando: h.cuando, origen: h.origen, version: h.version, publicada: h.publicada }))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/habilidades/:nombre', puerta, async (req, res) => {
  try { res.json(await aprender.usar(req.params.nombre)); } catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── UNA SOLA PUERTA ────────────────────────────────────────────────────────
   José lo pidió con estas palabras: «un solo link, que no cambie». La raíz ES
   ULTRON OS: se llega, el núcleo despierta, se pide la llave si hace falta y se
   abre el tablero, todo en la misma pantalla y sin recargar.
   `/os` sigue existiendo porque está en enlaces viejos y en las pruebas. Y la
   consola de siempre —la que la junta ya conocía, que funciona en cualquier
   navegador viejo— queda en `/consola`: no se borra nada, se cambia cuál es la
   puerta principal. */
/* ── LA CACHÉ, SIN QUEDARSE CON CÓDIGO VIEJO ──────────────────────────────────
 * Los archivos de la pantalla se guardaban diez minutos. Poco: cada rato se
 * vuelven a bajar 281 kB. Y subirlo sin más es peor todavía: como las
 * direcciones no cambian, el navegador se quedaría con el código de ayer
 * después de un despliegue, y no hay manera de decirle que lo tire.
 *
 * La solución de siempre: que la DIRECCIÓN cambie cuando cambia el código.
 * A cada archivo de la página se le pega `?v=<commit>`, y entonces sí se puede
 * guardar un año entero: si el commit cambia, la dirección es otra y el
 * navegador la baja; si no cambia, no vuelve a pedir nada nunca.
 *
 * La página en sí NO se guarda —es la que trae las direcciones nuevas—, pero
 * comprimida son doce kilobytes, así que pedirla cada vez no cuesta.
 */
const marcaVersion = String(VERSION.commit || 'dev').replace(/[^\w.-]/g, '').slice(0, 20);
let osConVersion = null;
function paginaConVersion() {
  if (osConVersion) return osConVersion;
  const crudo = readFileSync(join(__dirname, 'public', 'os.html'), 'utf8');
  /* Solo lo de la casa: una dirección de fuera no se toca, y una que ya lleva
     interrogante tampoco (añadir otra la rompería). */
  osConVersion = crudo.replace(/\b(src|href)="(?!https?:|\/\/|data:|#)([^"?#]+)"/g, `$1="$2?v=${marcaVersion}"`);
  return osConVersion;
}
const paginaOS = (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(paginaConVersion());
};
app.get('/', paginaOS);
app.get('/os', paginaOS);
app.get('/os.html', paginaOS);
app.get('/consola', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));

/* LA CONSOLA vive en public/: una sola puerta, en la raíz. */
/* `index:false`: la raíz la sirve la ruta de arriba (el OS). Con `index:
   'index.html'` el estático se adelantaba y devolvía la consola vieja. */
/* Lo pedido CON versión se guarda un año y no se vuelve a preguntar; lo pedido
   sin versión —alguien que escribe la dirección a mano, un enlace viejo— sigue
   con los diez minutos de siempre, que es lo prudente para algo que no dice
   qué versión es. */
app.use((req, res, sig) => { res.locals.conVersion = !!req.query.v; sig(); });
app.use(express.static(join(__dirname, 'public'), {
  index: false,
  maxAge: '10m',
  setHeaders(res) { if (res.locals?.conVersion) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); },
}));
app.use((req, res) => res.status(404).json({ error: 'No existe esa ruta.', codigo: 'NO_EXISTE' }));
app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
  console.error(`[ultron] ${err?.message || err}`);
  res.status(err?.type === 'entity.parse.failed' ? 400 : 500).json({ error: 'Algo salió mal.', codigo: 'ERROR' });
});

// ── Arrancar ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PUERTO = Number(process.env.PORT || 3900);
  memoria.conectar().finally(() => {
    /* El vigía arranca con el servidor y no con la pantalla: la avería que
       importa es la que pasa cuando nadie está mirando. */
    vigia.arrancar();
    permisos.comprobarCatalogo(herramientas.DEFINICIONES.map((d) => d.name));
    equipo.arrancar({ pensar: cerebro.pensar, junta: JUNTA });
    /* El médico. Arranca con el servidor por la misma razón que el vigía: la
       avería que importa es la que pasa cuando nadie está mirando. */
    salud.arrancar();
    sesiones.cargar().then((n) => { if (n) console.log(`[sesiones] ${n} sesión(es) cerradas recordadas`); });
    preferencias.casa().then((c) => console.log(`[casa] cerebro: ${c.cerebro}`));
    if (!boveda.encendida()) console.warn('[boveda] apagada: sin ULTRON_BOVEDA_LLAVE no se guardan secretos');
    app.listen(PUERTO, () => {
      console.log(`[ultron] escuchando en ${PUERTO} · cerebro ${cerebro.encendido() ? MODELO_LOG() : 'APAGADO'} · voz ${voz.encendida() ? 'ElevenLabs' : 'del navegador'} · memoria ${memoria.estado()}`);
    });
  });
}
function MODELO_LOG() { return cerebro.modelo(); }

module.exports = { app, _adentro: { emitirSesion, leerSesion, leerJunta, documentoHtml, vigia } };
