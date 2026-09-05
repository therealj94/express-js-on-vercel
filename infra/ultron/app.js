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
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');
const { join } = require('node:path');

const saber = require('./lib/saber');
const vivo = require('./lib/vivo');
const memoria = require('./lib/memoria');
const cerebro = require('./lib/cerebro');
const canales = require('./lib/canales');
const voz = require('./lib/voz');
const herramientas = require('./lib/herramientas');
const genesis = require('./lib/genesis');

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

const SESION_MS = 12 * 60 * 60 * 1000;
const firmar = (s) => createHmac('sha256', SECRETO).update(s).digest('base64url');
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

function emitirSesion(correo) {
  const vence = Date.now() + SESION_MS;
  const cuerpo = `${correo}|${vence}`;
  return `${Buffer.from(cuerpo).toString('base64url')}.${firmar(cuerpo)}`;
}
function leerSesion(token) {
  if (!token || !token.includes('.')) return null;
  const [c, f] = token.split('.');
  let cuerpo; try { cuerpo = Buffer.from(c, 'base64url').toString(); } catch { return null; }
  if (!iguales(firmar(cuerpo), f)) return null;
  const [correo, vence] = cuerpo.split('|');
  if (Number(vence) < Date.now()) return null;
  return JUNTA.find((m) => m.correo === correo) || null;
}
const sinClave = ({ clave, ...m }) => m;

/** La puerta. */
function puerta(req, res, next) {
  if (!JUNTA.length) return res.status(503).json({ error: 'ULTRON no tiene junta configurada (ULTRON_JUNTA).', codigo: 'SIN_JUNTA' });
  const m = leerSesion(req.cookies?.ultron);
  if (!m) return res.status(401).json({ error: 'Sin sesión.', codigo: 'SIN_SESION' });
  req.miembro = m;
  next();
}

// ── Andamio ─────────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
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
    genesis: genesis.configurado(), juntaConGid: CON_GID,
    voz: voz.encendida(), memoria: memoria.estado(), canales: canales.estado(),
    saber: saber.resumen().total, saberArmado: saber.resumen().armadoEn,
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
  res.cookie('ultron', emitirSesion(m.correo), {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: SESION_MS,
  });
  res.json({ miembro: sinClave(m) });
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
  res.cookie('ultron', emitirSesion(m.correo), {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: SESION_MS,
  });
  res.json({ miembro: sinClave(m), por: 'genesis' });
});

app.post('/salir', (req, res) => { res.clearCookie('ultron'); res.json({ ok: true }); });

// ── La junta ────────────────────────────────────────────────────────────────

app.get('/yo', puerta, (req, res) => {
  res.json({
    miembro: sinClave(req.miembro),
    junta: JUNTA.map((m) => ({ nombre: m.nombre, correo: m.correo, rol: m.rol, whatsapp: !!m.whatsapp })),
    cerebro: cerebro.encendido(), modelo: cerebro.modelo(), donde: cerebro.cual(), voz: voz.encendida(),
    memoria: memoria.estado(), canales: canales.estado(), saber: saber.resumen(),
  });
});

app.get('/vivo', puerta, async (req, res) => res.json(await vivo.leerConCache()));
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
    texto: req.body?.texto, quien: req.body?.quien, tema: req.body?.tema, creadoPor: req.miembro.correo });
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
  const [v, abiertos] = await Promise.all([vivo.leerConCache().catch(() => null), memoria.pendientes({ limite: 100 })]);
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
  const texto = `${momento}, ${nombre}. ${partes.join(', ').replace(/^./, (c) => c.toUpperCase())}. Quedo a su disposición.`;
  res.json({ texto, nombre, hora, pendientes: n });
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
  const ctx = { miembro: req.miembro, junta: JUNTA.map(sinClave), conversacionId: null, fuentes: [], memorias: [], documentos: [], envios: [], pendientes: [], acciones: [], chico: false };
  const t0 = Date.now();
  const salida = await herramientas.correr(nombre, req.body?.entrada || {}, ctx);
  res.json({ nombre, salida: String(salida), ms: Date.now() - t0, acciones: ctx.acciones, documentos: ctx.documentos, envios: ctx.envios, fuentes: ctx.fuentes.slice(0, 12) });
});

/* Lo que cuesta pensar. Va detrás de la puerta como todo lo demás: cuánto
   gasta la junta no es asunto de nadie más. */
app.get('/gasto', puerta, async (req, res) => res.json(await memoria.gasto()));

app.get('/conversaciones', puerta, async (req, res) => res.json(await memoria.conversacionesDe(req.miembro.correo)));
app.get('/conversaciones/:id', puerta, async (req, res) => {
  const c = await memoria.conversacion(req.params.id, req.miembro.correo);
  if (!c) return res.status(404).json({ error: 'No existe.', codigo: 'NO_EXISTE' });
  res.json(c);
});

/* ── PENSAR, en vivo ──────────────────────────────────────────────────────────
   Server-Sent Events: el texto llega a medida que el modelo lo escribe, y las
   herramientas se anuncian cuando corren. Un asistente que se queda mudo
   veinte segundos y suelta un bloque no se siente vivo aunque piense bien. */
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

  try {
    let convId = req.body?.conversacionId ? String(req.body.conversacionId) : null;
    let nueva = false;
    if (!convId || !(await memoria.conversacion(convId, req.miembro.correo))) {
      const c = await memoria.abrirConversacion(req.miembro.correo, { canal: 'panel' });
      convId = String(c._id); nueva = true;
    }
    emitir('inicio', { conversacionId: convId, nueva });
    await memoria.anotarTurno(convId, req.miembro.correo, { rol: 'miembro', texto });

    // `modo: 'voz'` es la conversación hablada: respuestas cortas, sin markdown,
    // hechas para escucharse. `texto` (por omisión) es la de siempre.
    const modo = req.body?.modo === 'voz' ? 'voz' : 'texto';
    // `alias`: cómo se presenta en esta interfaz (AURA OS le dice «Aura»).
    const alias = /^[A-Za-zÁÉÍÓÚáéíóúñÑ\- ]{2,24}$/.test(String(req.body?.alias || '')) ? String(req.body.alias).trim() : null;
    const r = await cerebro.pensar({ miembro: req.miembro, junta: JUNTA.map(sinClave), texto, conversacionId: convId, emitir, modo, alias });
    await memoria.anotarTurno(convId, req.miembro.correo, { rol: 'ultron', texto: r.texto, herramientas: r.herramientas, fuentes: r.fuentes });
    if (nueva) { const t = await cerebro.titular(texto); if (t) await memoria.titular(convId, req.miembro.correo, t); emitir('titulo', { titulo: t }); }
    emitir('fin', { ...r, conversacionId: convId });
  } catch (e) {
    const m = cerebro.motivo(e);
    console.error(`[pensar] ${m.codigo} · ${e?.status || ''} ${e?.message || e}`);
    emitir('error', { mensaje: m.mensaje, codigo: m.codigo });
  } finally {
    clearInterval(latido);
    res.end();
  }
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
  const nombre = d.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'documento';
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
    const r = await cerebro.pensar({ miembro: m, junta: JUNTA.map(sinClave), texto, conversacionId: String(conv._id) });
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

/* LA CONSOLA vive en public/: una sola puerta, en la raíz. */
app.use(express.static(join(__dirname, 'public'), { index: 'index.html', maxAge: '10m' }));
app.use((req, res) => res.status(404).json({ error: 'No existe esa ruta.', codigo: 'NO_EXISTE' }));
app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
  console.error(`[ultron] ${err?.message || err}`);
  res.status(err?.type === 'entity.parse.failed' ? 400 : 500).json({ error: 'Algo salió mal.', codigo: 'ERROR' });
});

// ── Arrancar ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PUERTO = Number(process.env.PORT || 3900);
  memoria.conectar().finally(() => {
    app.listen(PUERTO, () => {
      console.log(`[ultron] escuchando en ${PUERTO} · cerebro ${cerebro.encendido() ? MODELO_LOG() : 'APAGADO'} · voz ${voz.encendida() ? 'ElevenLabs' : 'del navegador'} · memoria ${memoria.estado()}`);
    });
  });
}
function MODELO_LOG() { return cerebro.modelo(); }

module.exports = { app, _adentro: { emitirSesion, leerSesion, leerJunta, documentoHtml } };
