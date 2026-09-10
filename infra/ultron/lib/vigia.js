/* EL VIGÍA: el que mira cuando nadie mira.
 *
 * LA PREGUNTA QUE ESTO CONTESTA. «Si algo se rompe a las tres de la mañana,
 * ¿me entero?» Hasta hoy la respuesta era NO, y por una razón sencilla: nada
 * medía por su cuenta. `/vivo` solo se leía cuando un navegador lo pedía, así
 * que con la pantalla apagada no se medía nada, no se guardaba nada y no se
 * avisaba a nadie. A las ocho de la mañana se veía «ORDENEX CAÍDA» sin saber si
 * llevaba dos minutos o nueve horas — que es la diferencia entre un aviso al
 * equipo y un comunicado a los clientes.
 *
 * ── DOS LECTURAS ANTES DE GRITAR ────────────────────────────────────────────
 * Una casa que tarda un segundo de más no está caída. Se exige que falle DOS
 * lecturas seguidas antes de darla por caída, y que acierte una para darla por
 * levantada. Sin eso, un pico de red manda un aviso de madrugada y a la tercera
 * vez los avisos se silencian — y una alarma silenciada es peor que ninguna.
 *
 * ── EL AVISO NO SE MANDA SOLO ───────────────────────────────────────────────
 * Medir y recordar es gratis y no molesta a nadie: eso corre siempre. MANDAR un
 * mensaje es una acción hacia fuera, así que está APAGADA salvo que se encienda
 * a propósito con `ULTRON_AVISOS=whatsapp`, `=correo` o `=ambos`. Sin eso el
 * vigía sigue midiendo y guardando —el «caída desde» de la pantalla sale de
 * aquí— y no manda nada.
 */

const vivo = require('./vivo');
const avisos = require('./avisos');
const tesoro = require('./tesoro');

const CADA_MS = Number(process.env.VIGIA_CADA_MS || 60_000);
const FALLOS_PARA_CAIDA = 2;
const CASAS = ['ordenex', 'aucorp', 'wallet', 'genesis', 'ordenscan', 'ordenglobal'];

/* Por casa: si está en pie, desde cuándo lo está o no, y cuántas lecturas
   seguidas lleva fallando. `desde` es lo que la pantalla necesita para escribir
   «CAÍDA DESDE LAS 03:14 · hace 4 h 51 m». */
const libro = new Map();
let ultimaVuelta = null;
let corriendo = null;

function comoEsta(k) {
  if (!libro.has(k)) libro.set(k, { viva: null, desde: null, fallos: 0, ultimoOk: null });
  return libro.get(k);
}

/** Lo que sabe el vigía, para la pantalla y para las herramientas. */
function estado() {
  const casas = {};
  for (const k of CASAS) {
    const c = libro.get(k);
    if (!c || c.viva === null) { casas[k] = null; continue; }
    casas[k] = { viva: c.viva, desde: c.desde, ultimoOk: c.ultimoOk };
  }
  return {
    encendido: !!corriendo,
    cada: CADA_MS,
    tesoro: tesoroUltimo,
    ultimaVuelta,
    avisa: avisos.MODO(),
    casas,
  };
}


/* A quién se le avisa: a la junta, con lo que cada quien tenga puesto. Nunca a
   una lista de fuera, nunca a nadie que no esté en la junta. */
function junta() {
  try { return JSON.parse(process.env.ULTRON_JUNTA || '[]'); } catch { return []; }
}

/* Los avisos van por la puerta única (lib/avisos.js): una casa que se cae es
   GRAVE —al teléfono—, una casa que vuelve es leve —al correo—. Aquí solo se
   dice qué pasó. */
async function avisar(cambios) {
  for (const c of cambios) {
    try { await avisos.avisar({ clave: `casa:${c.casa}`, gravedad: c.grave ? 'grave' : 'leve', titulo: c.titulo, lineas: [c.texto], forzar: true }); }
    catch (e) { console.warn('[vigia] no se pudo avisar:', String(e?.message || e).slice(0, 120)); }
  }
}

/** Una vuelta: se lee, se compara con lo anterior y se anota lo que cambió. */
/* ── EL TESORO, MÁS DESPACIO QUE LAS CASAS ───────────────────────────────────
   Las casas se miran cada minuto porque una casa caída es urgente. Un tesoro
   que baja no lo es: baja recarga a recarga, no de golpe. Mirarlo cada minuto
   serían 1 440 llamadas al día a la cadena para ver un número que se mueve
   unas pocas veces. Cada diez minutos llega igual de a tiempo. */
const TESORO_CADA_MS = Number(process.env.TESORO_CADA_MS || 600_000);
let ultimoTesoro = 0;
let tesoroUltimo = null;

async function mirarElTesoro() {
  if (!tesoro.hay()) return;
  if (Date.now() - ultimoTesoro < TESORO_CADA_MS) return;
  ultimoTesoro = Date.now();
  try { tesoroUltimo = await tesoro.mirarYAvisar(); }
  catch (e) { console.warn('[vigia] el tesoro no se pudo mirar:', String(e?.message || e).slice(0, 120)); }
}

async function unaVuelta() {
  /* Va primero y sin `await` que bloquee la vuelta: si la cadena de Polygon
     está lenta, eso no puede retrasar el aviso de una casa caída. */
  mirarElTesoro().catch(() => {});
  let v;
  /* `refrescar()` y no `leer()`: la vuelta del vigía ya sale a las seis casas
     cada minuto, así que de paso llena la despensa que usa el camino de
     pensar. Cero tráfico nuevo, y la lectura que antes se tiraba ahora ahorra
     nueve segundos de espera al turno siguiente. */
  try { v = await vivo.refrescar(); } catch (e) {
    console.warn('[vigia] la lectura falló entera:', String(e?.message || e).slice(0, 120));
    return [];
  }
  ultimaVuelta = new Date().toISOString();
  const cambios = [];
  const ahora = new Date().toISOString();

  for (const k of CASAS) {
    const d = v?.[k];
    const c = comoEsta(k);
    const enPie = !!d?.vivo;

    if (enPie) {
      c.fallos = 0; c.ultimoOk = ahora;
      if (c.viva === false) { cambios.push({ casa: k, grave: false, titulo: `${nombre(k)} volvió`, texto: `${nombre(k)} volvió a contestar (estuvo caída desde ${hora(c.desde)}).` }); c.desde = ahora; }
      if (c.viva !== true) { c.viva = true; c.desde = c.desde || ahora; }
    } else {
      c.fallos++;
      // Todavía no se declara caída: una lectura mala puede ser un pico.
      if (c.fallos >= FALLOS_PARA_CAIDA && c.viva !== false) {
        c.viva = false; c.desde = ahora;
        const porQue = d?.http ? `HTTP ${d.http}` : (d?.error || 'no contestó');
        cambios.push({ casa: k, grave: true, titulo: `${nombre(k)} CAÍDA`, texto: `${nombre(k)} dejó de contestar (${porQue}) a las ${hora(ahora)}. Dos lecturas seguidas fallaron.` });
      }
      if (c.viva === null && c.fallos < FALLOS_PARA_CAIDA) { /* aún no se sabe */ }
    }
  }
  if (cambios.length) { console.log('[vigia]', cambios.map((c) => c.texto).join(' ')); await avisar(cambios); }
  return cambios.map((c) => c.texto);
}

const NOMBRES = {
  ordenex: 'Ordenex', aucorp: 'AuCorp', wallet: 'Veta Wallet',
  genesis: 'Genesis ID', ordenscan: 'OrdenScan', ordenglobal: 'ordenglobal.org',
};
const nombre = (k) => NOMBRES[k] || k;
const hora = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'no se sabe');

function arrancar() {
  if (corriendo) return corriendo;
  unaVuelta().catch(() => {});
  corriendo = setInterval(() => { unaVuelta().catch(() => {}); }, CADA_MS);
  corriendo.unref?.();          // que no impida cerrar el proceso en las pruebas
  console.log(`[vigia] mirando las ${CASAS.length} casas cada ${Math.round(CADA_MS / 1000)} s · avisos: ${avisos.MODO()}`);
  return corriendo;
}

function parar() { if (corriendo) { clearInterval(corriendo); corriendo = null; } }

module.exports = { arrancar, parar, estado, unaVuelta, mirarElTesoro, _adentro: { libro, CASAS, FALLOS_PARA_CAIDA, TESORO_CADA_MS } };
