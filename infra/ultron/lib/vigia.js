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
const canales = require('./canales');

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
    ultimaVuelta,
    avisa: MODO_AVISO || 'apagado',
    casas,
  };
}

const MODO_AVISO = (process.env.ULTRON_AVISOS || '').trim().toLowerCase();

/* A quién se le avisa: a la junta, con lo que cada quien tenga puesto. Nunca a
   una lista de fuera, nunca a nadie que no esté en la junta. */
function junta() {
  try { return JSON.parse(process.env.ULTRON_JUNTA || '[]'); } catch { return []; }
}

async function avisar(lineas) {
  if (!MODO_AVISO || MODO_AVISO === 'apagado' || !lineas.length) return;
  const texto = `ULTRON · cambio en el ecosistema\n\n${lineas.join('\n')}`;
  for (const m of junta()) {
    try {
      if ((MODO_AVISO === 'whatsapp' || MODO_AVISO === 'ambos') && m.whatsapp) await canales.whatsapp(m.whatsapp, texto);
      if ((MODO_AVISO === 'correo' || MODO_AVISO === 'ambos') && m.correo) await canales.correo(m.correo, 'ULTRON · cambio en el ecosistema', texto);
    } catch (e) {
      // Un aviso que no sale no puede tumbar al vigía: si el vigía muere, se
      // pierde también el «desde cuándo», que es lo que más falta hace después.
      console.warn('[vigia] no se pudo avisar a', m.correo, '·', String(e?.message || e).slice(0, 120));
    }
  }
}

/** Una vuelta: se lee, se compara con lo anterior y se anota lo que cambió. */
async function unaVuelta() {
  let v;
  try { v = await vivo.leer(); } catch (e) {
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
      if (c.viva === false) { cambios.push(`${nombre(k)} volvió a contestar (estuvo caída desde ${hora(c.desde)}).`); c.desde = ahora; }
      if (c.viva !== true) { c.viva = true; c.desde = c.desde || ahora; }
    } else {
      c.fallos++;
      // Todavía no se declara caída: una lectura mala puede ser un pico.
      if (c.fallos >= FALLOS_PARA_CAIDA && c.viva !== false) {
        c.viva = false; c.desde = ahora;
        const porQue = d?.http ? `HTTP ${d.http}` : (d?.error || 'no contestó');
        cambios.push(`${nombre(k)} dejó de contestar (${porQue}).`);
      }
      if (c.viva === null && c.fallos < FALLOS_PARA_CAIDA) { /* aún no se sabe */ }
    }
  }
  if (cambios.length) { console.log('[vigia]', cambios.join(' ')); await avisar(cambios); }
  return cambios;
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
  console.log(`[vigia] mirando las ${CASAS.length} casas cada ${Math.round(CADA_MS / 1000)} s · avisos: ${MODO_AVISO || 'apagados'}`);
  return corriendo;
}

function parar() { if (corriendo) { clearInterval(corriendo); corriendo = null; } }

module.exports = { arrancar, parar, estado, unaVuelta, _adentro: { libro, CASAS, FALLOS_PARA_CAIDA } };
