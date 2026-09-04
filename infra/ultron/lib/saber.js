// EL SABER: lo que la casa tiene escrito, y cómo se le pregunta.
//
// ── POR QUÉ RECUPERAR Y NO MANDARLO TODO ────────────────────────────────────
//
// Son 679 secciones y 440 KB — unas cien mil fichas de modelo. Cabe en la
// ventana, pero mandarlo entero en cada turno es pagar cien mil fichas para
// que el modelo lea sobre el APK cuando la pregunta es sobre la minería, y
// un modelo con cien mil fichas de ruido delante contesta peor, no mejor.
//
// Así que se recupera: se eligen las secciones que hablan de lo que se
// preguntó, y esas van completas. Sin base vectorial ni servicio aparte —
// una puntuación por palabras sobre 679 documentos tarda menos de un
// milisegundo y no tiene nada que se pueda caer.
//
// ── LO QUE SIEMPRE VA, PREGUNTEN LO QUE PREGUNTEN ──────────────────────────
//
// Las fichas de AU-RA marcadas como públicas llevan la VOZ de la casa: qué se
// puede decir y qué no, en qué palabras. Van siempre, porque ULTRON escribe
// correos y documentos que salen de la junta, y una frase que prometa una
// ganancia o llame «regulada» a la casa no puede salir por ningún canal.

const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const DIR = join(__dirname, '..', 'saber');

let secciones = [];
let indice = null;
let porId = new Map();

function cargar() {
  const a = join(DIR, 'secciones.json'), b = join(DIR, 'indice.json');
  if (!existsSync(a) || !existsSync(b)) {
    // Sin saber NO se arranca a ciegas. Se dice y se sigue vacío: el modelo
    // va a saber que no tiene fichas y va a decir que no sabe.
    console.error('[saber] NO HAY SABER ARMADO. Correr: node bin/armar-saber.mjs');
    secciones = []; indice = null; porId = new Map();
    return;
  }
  secciones = JSON.parse(readFileSync(a, 'utf8'));
  indice = JSON.parse(readFileSync(b, 'utf8'));
  porId = new Map(secciones.map((s) => [s.id, s]));
  for (const s of secciones) s._palabras = palabrasDe(s.titulo + ' ' + s.texto + ' ' + (s.palabras || []).join(' '));
  console.log(`[saber] ${secciones.length} secciones · armado ${indice.armadoEn}`);
}

/* Palabras en minúscula sin tildes, quitando las que no dicen nada. El español
   tiene muchas de estas y sin quitarlas «la casa de cambio» puntúa igual que
   «la mesa de noche». */
const VACIAS = new Set(('de la el los las un una unos unas y o que en a por para con sin sobre es son se su sus al del lo le les ' +
  'como más mas pero si no ya muy este esta esto ese esa eso hay fue ser está están the of and to in is are for on with').split(' '));

function palabrasDe(t) {
  return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !VACIAS.has(w));
}

/** Frecuencia de cada palabra en una lista. */
function frecuencia(lista) {
  const f = new Map();
  for (const w of lista) f.set(w, (f.get(w) || 0) + 1);
  return f;
}

/**
 * Las secciones que más hablan de la pregunta.
 *
 * BM25 sencillo: cuenta cuántas veces aparece cada palabra de la pregunta en
 * cada sección, castiga las secciones largas y premia las palabras raras (una
 * palabra que está en todas las secciones no distingue nada). Y multiplica
 * por el `peso` que se le dio a la fuente al armar: un dosier de la junta
 * vale más que el LEEME de una carpeta.
 */
function buscar(pregunta, { maximo = 12, maxBytes = 60_000 } = {}) {
  if (!secciones.length) return [];
  const q = palabrasDe(pregunta);
  if (!q.length) return [];
  const N = secciones.length;
  const largoMedio = secciones.reduce((a, s) => a + s._palabras.length, 0) / N;
  // df: en cuántas secciones aparece cada palabra
  const df = new Map();
  for (const w of new Set(q)) {
    let n = 0;
    for (const s of secciones) if (s._palabras.includes(w)) n++;
    df.set(w, n);
  }
  const k1 = 1.4, b = 0.75;
  const puntuadas = secciones.map((s) => {
    const f = frecuencia(s._palabras);
    let p = 0;
    for (const w of new Set(q)) {
      const n = df.get(w) || 0;
      if (!n) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const tf = f.get(w) || 0;
      p += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * s._palabras.length / largoMedio));
    }
    // El título cuenta doble: una palabra en el título es de lo que trata.
    for (const w of new Set(q)) if (palabrasDe(s.titulo).includes(w)) p *= 1.5;
    return { s, p: p * (s.peso || 1) };
  }).filter((x) => x.p > 0).sort((a, b2) => b2.p - a.p);

  const salida = [];
  let bytes = 0;
  for (const { s, p } of puntuadas) {
    if (salida.length >= maximo || bytes + s.texto.length > maxBytes) break;
    salida.push({ ...sinPrivados(s), puntos: Number(p.toFixed(2)) });
    bytes += s.texto.length;
  }
  return salida;
}

/** Las fichas públicas de AU-RA: la voz de la casa, siempre presentes. */
function vozDeLaCasa() {
  return secciones.filter((s) => s.id.startsWith('aura-') && s.publico).map(sinPrivados);
}

/** Una sección por id, para citar. */
function seccion(id) { const s = porId.get(id); return s ? sinPrivados(s) : null; }

/** Qué sabe: para el panel y para que el modelo pueda decir qué fuentes tiene. */
function resumen() {
  return {
    armadoEn: indice?.armadoEn || null,
    total: secciones.length,
    fuentes: (indice?.fuentes || []).map((f) => ({ ruta: f.ruta, tema: f.tema, secciones: f.secciones })),
    temas: [...new Set(secciones.map((s) => s.tema))].sort(),
  };
}

/** Las huellas con las que se armó, para que la prueba sepa si está viejo. */
function huellas() { return indice?.huellas || {}; }

function sinPrivados(s) { const { _palabras, ...resto } = s; return resto; }

cargar();

module.exports = { buscar, vozDeLaCasa, seccion, resumen, huellas, cargar, _adentro: { palabrasDe, DIR } };
