/* LOS AVISOS — la única puerta por la que ULTRON habla sin que le hablen.
 *
 * ── POR QUÉ UNA SOLA PUERTA ─────────────────────────────────────────────────
 * Hasta hoy cada pieza que medía algo (el vigía, la salud, los bots) tenía que
 * decidir por su cuenta si avisar, a quién y por dónde — y como mandar hacia
 * fuera es delicado, la respuesta de todas era «no aviso». José se enteraba de
 * una casa caída a las ocho de la mañana, mirando la pantalla.
 *
 * Aquí se decide UNA vez. Quien mide dice qué pasó y cuán grave es; esto decide
 * el canal, a quién, y si ya se dijo hace un rato.
 *
 * ── GRAVE POR WHATSAPP, LO DEMÁS POR CORREO ─────────────────────────────────
 * José lo pidió con esas palabras. Lo GRAVE es lo que hay que saber ahora
 * aunque sean las tres de la mañana: una casa que se cae, ULTRON mudo, la base
 * perdida. Va al teléfono, y también al correo para que quede escrito. Lo LEVE
 * es lo que se lee con el café: una casa que volvió, un signo en «ojo», el
 * parte del día, una reparación que se repite. Va al correo y nada más.
 *
 * ── NO REPETIRSE ────────────────────────────────────────────────────────────
 * Un aviso con la misma clave no se manda dos veces en seis horas, salvo que
 * la gravedad haya subido. La alarma que suena cada cinco minutos es la que se
 * silencia, y una alarma silenciada es peor que ninguna.
 *
 * ── MODOS (`ULTRON_AVISOS`) ──────────────────────────────────────────────────
 *   apagado   (por omisión) se mide, se guarda, no se manda nada
 *   correo    todo por correo
 *   whatsapp  todo por WhatsApp
 *   ambos     todo por los dos
 *   partido   grave → WhatsApp + correo · leve → correo     ← lo que pidió José
 */

const canales = require('./canales');

const MODO = () => (process.env.ULTRON_AVISOS || '').trim().toLowerCase() || 'apagado';
const SILENCIO_MS = Number(process.env.ULTRON_AVISOS_SILENCIO_MS || 6 * 3600_000);
const enviados = new Map();              // clave → { cuando, gravedad }
const libro = [];                        // los últimos 60, para el panel y la bitácora

function junta() {
  try { return JSON.parse(process.env.ULTRON_JUNTA || '[]'); } catch { return []; }
}

/* Por dónde va cada gravedad en cada modo. */
function canalesPara(gravedad) {
  const m = MODO();
  if (m === 'apagado' || m === 'off' || m === '') return { whatsapp: false, correo: false };
  if (m === 'correo') return { whatsapp: false, correo: true };
  if (m === 'whatsapp') return { whatsapp: true, correo: false };
  if (m === 'ambos') return { whatsapp: true, correo: true };
  // partido
  return gravedad === 'grave' ? { whatsapp: true, correo: true } : { whatsapp: false, correo: true };
}

/**
 * Avisar a la junta.
 *   clave     identifica el hecho («casa:ordenex», «salud:cerebro») para no repetirse
 *   gravedad  'grave' | 'leve'
 *   titulo    una línea; es el asunto del correo y la primera línea del WhatsApp
 *   lineas    el cuerpo, ya escrito para una persona
 *   a         opcional: solo a estos correos (por omisión toda la junta)
 * Devuelve { enviado, canales, motivo }.
 */
async function avisar({ clave, gravedad = 'leve', titulo, lineas = [], a = null, forzar = false }) {
  const g = gravedad === 'grave' ? 'grave' : 'leve';
  const registro = { cuando: new Date(), clave, gravedad: g, titulo, enviado: false, canales: [], motivo: null };
  libro.unshift(registro); if (libro.length > 60) libro.pop();

  const c = canalesPara(g);
  if (!c.whatsapp && !c.correo) { registro.motivo = `avisos en modo «${MODO()}»`; return registro; }

  const previo = enviados.get(clave);
  const subio = previo && previo.gravedad === 'leve' && g === 'grave';
  if (!forzar && previo && Date.now() - previo.cuando < SILENCIO_MS && !subio) {
    registro.motivo = `ya se avisó hace ${Math.round((Date.now() - previo.cuando) / 60000)} min`;
    return registro;
  }

  const cuerpo = [`ULTRON · ${g === 'grave' ? 'GRAVE' : 'aviso'} · ${titulo}`, '', ...lineas].join('\n');
  const destinos = junta().filter((m) => !a || a.includes(m.correo));
  for (const m of destinos) {
    try {
      if (c.whatsapp && m.whatsapp) { await canales.whatsapp(m.whatsapp, cuerpo); registro.canales.push(`whatsapp:${m.nombre || m.correo}`); }
      if (c.correo && m.correo) { await canales.correo(m.correo, `ULTRON · ${g === 'grave' ? 'GRAVE' : 'aviso'} · ${titulo}`.slice(0, 180), cuerpo); registro.canales.push(`correo:${m.correo}`); }
    } catch (e) {
      /* Un aviso que no sale no puede tumbar a quien avisa. Se anota y se sigue
         con el siguiente miembro. */
      console.warn(`[avisos] no salió para ${m.correo}: ${String(e?.message || e).slice(0, 120)}`);
      registro.motivo = (registro.motivo ? registro.motivo + ' · ' : '') + `falló ${m.correo}`;
    }
  }
  registro.enviado = registro.canales.length > 0;
  if (registro.enviado) enviados.set(clave, { cuando: Date.now(), gravedad: g });
  console.log(`[avisos] ${g} «${titulo}» → ${registro.canales.join(', ') || 'nadie'}`);
  return registro;
}

/* Para que un hecho que se resolvió pueda volver a avisar cuando se repita
   (una casa que cae, vuelve, y cae otra vez el mismo día es dos avisos). */
function olvidar(clave) { enviados.delete(clave); }

function estado() {
  return { modo: MODO(), silencioMin: Math.round(SILENCIO_MS / 60000), ultimos: libro.slice(0, 20),
    canales: canales.estado(), junta: junta().map((m) => ({ nombre: m.nombre, correo: !!m.correo, whatsapp: !!m.whatsapp })) };
}

module.exports = { avisar, olvidar, estado, canalesPara, MODO, _adentro: { enviados, libro, SILENCIO_MS } };
