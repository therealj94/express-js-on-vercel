// LA VOZ: ULTRON habla, y habla bien.
//
// AU-RA habla con un modelo de voz que corre en el nodo (infra/aura/voz.py),
// hecho para miles de personas y para frases que se repiten. ULTRON le habla a
// seis personas y cada frase es distinta: para eso ElevenLabs suena mejor y
// cuesta lo mismo que un café al mes. La llave vive en el servidor
// (ELEVENLABS_API_KEY) y el navegador nunca la ve — pide el audio a /voz y
// este archivo lo fabrica.
//
// Si no hay llave, /voz contesta 503 y el panel usa la voz del propio
// navegador. Peor voz, pero ULTRON sigue hablando. Un asistente que se queda
// mudo porque falta una variable no es un asistente.
//
// Y una memoria corta: la misma frase dos veces no se fabrica dos veces. Es la
// lección de infra/aura/vozmemoria.py, y acá sale gratis con un Map.

const LLAVE = (process.env.ELEVENLABS_API_KEY || '').trim();
/* La voz por omisión: una voz multilingüe de ElevenLabs que suena bien en
   español. Se cambia con ELEVENLABS_VOZ; el id se ve en la cuenta. */
const VOZ = (process.env.ELEVENLABS_VOZ || 'XrExE9yKIg1WjnnlVkGX').trim();
const MODELO = process.env.ELEVENLABS_MODELO || 'eleven_multilingual_v2';
/* Para CONVERSAR importa más el tiempo hasta la primera palabra que el último
   matiz: `eleven_flash_v2_5` contesta en una fracción de segundo. El panel lo
   pide frase por frase mientras el modelo sigue escribiendo, así que ULTRON
   empieza a hablar antes de terminar de pensar. Para leer un documento entero
   se sigue usando el multilingüe, que suena mejor. */
const MODELO_RAPIDO = process.env.ELEVENLABS_MODELO_RAPIDO || 'eleven_flash_v2_5';
const MAXIMO = 2500;   // letras por petición: más largo se parte en el panel

const memoria = new Map();   // sha1(texto) -> Buffer
const MEMORIA_MAX = 120;   // 60 frases sueltas + las muletillas, que conviene que no se caigan nunca

function encendida() { return !!LLAVE; }

/** Lo que se lee en voz alta no es lo que se lee en pantalla. */
const numeros = require('./decir-numeros');
function paraDecir(texto, idioma = 'es') {
  /* `estructura` va PRIMERO y sobre el texto con sus saltos de línea: los
     títulos y los «1.» de una lista solo se reconocen por dónde empieza la
     línea, y dos renglones más abajo ya se aplastó todo a un solo espacio. */
  return numeros.paraLaVoz(numeros.estructura(String(texto), idioma)
    .replace(/```[\s\S]*?```/g, ' (código omitido) ')
    .replace(/https?:\/\/\S+/g, ' (enlace) ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[#*_>`|]/g, '')
    .replace(/\s+/g, ' ').trim()).slice(0, MAXIMO);
}

/* ── EL CATÁLOGO DE VOCES ─────────────────────────────────────────────────────
   La junta elige la voz por oído, no por el nombre en un archivo: /voces
   devuelve las voces en español de la cuenta (id, nombre, género, edad,
   acento), el OS las deja probar, y /voz acepta `vozId` SOLO si está en el
   catálogo. Una voz que no es de la cuenta no se puede pedir por acá. */
let catalogo = { en: 0, voces: [] };
async function voces() {
  if (!LLAVE) return [];
  if (Date.now() - catalogo.en < 3600_000 && catalogo.voces.length) return catalogo.voces;
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': LLAVE }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) return catalogo.voces;
  const j = await r.json();
  const lista = (j.voices || []).map((v) => ({
    id: v.voice_id, nombre: String(v.name || '').split(' - ')[0].split(' | ')[0].trim(), genero: v.labels?.gender || null, edad: v.labels?.age || null,
    acento: v.labels?.accent || null, idioma: v.labels?.language || null, descripcion: v.labels?.descriptive || v.labels?.description || null,
    categoria: v.category || null,
  }));
  // primero las de español; después el resto, por si la junta quiere otra
  const es = lista.filter((v) => v.idioma === 'es');
  catalogo = { en: Date.now(), voces: [...es, ...lista.filter((v) => v.idioma !== 'es')] };
  return catalogo.voces;
}
function vozPermitida(id) {
  if (!id) return VOZ;
  const s = String(id).trim();
  if (s === VOZ) return VOZ;
  return catalogo.voces.some((v) => v.id === s) ? s : VOZ;
}

/* ── EL AUDIO, MIENTRAS SE FABRICA ───────────────────────────────────────────
 * `hablar()` espera el mp3 ENTERO de ElevenLabs y después el navegador espera
 * el mp3 entero otra vez. Dos esperas completas antes de que suene un byte.
 *
 * `hablarEnVivo()` usa el punto de ElevenLabs que va soltando el audio a medida
 * que lo genera, y devuelve ese chorro tal cual para que el servidor lo pase al
 * navegador según llega. El navegador, con una etiqueta de audio y una
 * dirección, empieza a sonar con los primeros kilobytes: no espera al final.
 * Es la diferencia entre oír a los tres segundos y oír al medio segundo.
 *
 * Y el formato baja de `mp3_44100_128` a `mp3_22050_32`. Es una voz hablando,
 * no música: a 22 kHz y 32 kbps suena igual de bien por un altavoz de iPad y
 * son la cuarta parte de los bytes, que en datos móviles de Honduras es la
 * diferencia entre fluido y entrecortado.
 */
const FORMATO_VIVO = process.env.ELEVENLABS_FORMATO || 'mp3_22050_32';

async function hablarEnVivo(texto, { rapido = true, vozId = null } = {}) {
  const voz = vozPermitida(vozId);
  if (!LLAVE) { const e = new Error('Voz no configurada.'); e.codigo = 'VOZ_APAGADA'; throw e; }
  const dicho = paraDecir(texto);
  if (!dicho) { const e = new Error('Nada que decir.'); e.codigo = 'VACIO'; throw e; }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}/stream?output_format=${FORMATO_VIVO}`, {
    method: 'POST',
    headers: { 'xi-api-key': LLAVE, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: dicho, model_id: rapido ? MODELO_RAPIDO : MODELO,
      voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true },
      /* `optimize_streaming_latency` le dice a ElevenLabs que empiece a mandar
         antes, a cambio de un pelo de prosodia. Para una conversación, llegar
         antes vale más que la última décima de entonación. */
      optimize_streaming_latency: 3,
    }),
    /* Sin plazo total: el chorro puede durar lo que dure la frase. Lo que sí
       tiene plazo es la CONEXIÓN, y de eso se encarga el propio fetch. */
  });
  if (!r.ok) {
    const e = new Error(`ElevenLabs contestó ${r.status}.`);
    e.codigo = 'PROVEEDOR'; e.detalle = (await r.text().catch(() => '')).slice(0, 200); throw e;
  }
  return r.body;   // un chorro web; el servidor lo empalma con su respuesta
}

async function hablar(texto, { rapido = false, vozId = null } = {}) {
  const voz = vozPermitida(vozId);
  if (!LLAVE) { const e = new Error('Voz no configurada.'); e.codigo = 'VOZ_APAGADA'; throw e; }
  const dicho = paraDecir(texto);
  if (!dicho) { const e = new Error('Nada que decir.'); e.codigo = 'VACIO'; throw e; }
  const modelo = rapido ? MODELO_RAPIDO : MODELO;
  const { createHash } = require('node:crypto');
  const clave = createHash('sha1').update(voz + '|' + modelo + '|' + dicho).digest('hex');
  if (memoria.has(clave)) return memoria.get(clave);

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': LLAVE, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: dicho, model_id: modelo,
      /* La voz de un mayordomo, no la de un locutor: estable (0,6) para que no
         se agite, poco «estilo» (0,15) para que no actúe, y el mismo timbre
         siempre (0,85). Un asistente que suena igual a las tres de la tarde y
         a las once de la noche es uno en el que se confía. */
      /* Un Jarvis: sereno pero con vida. Estabilidad media-alta (0,55) para
         que no se agite, algo de estilo (0,25) para que no suene a locutor de
         aeropuerto, y el mismo timbre siempre (0,85). */
      voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    const e = new Error(`ElevenLabs contestó ${r.status}.`);
    e.codigo = 'PROVEEDOR'; e.detalle = (await r.text().catch(() => '')).slice(0, 200); throw e;
  }
  const audio = Buffer.from(await r.arrayBuffer());
  if (memoria.size >= MEMORIA_MAX) memoria.delete(memoria.keys().next().value);
  memoria.set(clave, audio);
  return audio;
}

/* ── LAS MULETILLAS ──────────────────────────────────────────────────────────
 * José lo pidió así: «grabar voces, 7 palabras diferentes, y se activa random
 * cuando está pensando, como un “déjame ver” o “déjame revisar”». Tiene toda la
 * razón en el diagnóstico: entre que uno pregunta y el nodo contesta pueden
 * pasar veinte segundos de SILENCIO, y un silencio de veinte segundos se siente
 * como que el aparato se colgó.
 *
 * DOS CORRECCIONES A LA IDEA, y las dos hacen que suene más vivo, no menos:
 *
 *   1. NO AL AZAR DEL TODO. Si ULTRON está leyendo el mercado, decir «déjeme
 *      mirar el mercado» es mejor que «déjeme ver» — y no cuesta nada, porque
 *      ya se sabe qué herramienta está corriendo. Al azar solo cuando no hay
 *      nada que decir. Y nunca la misma dos veces seguidas: siete frases que se
 *      repiten sin memoria se vuelven un tic en dos días.
 *   2. GRABADAS UNA VEZ, NO EN CADA VUELTA. Se piden a ElevenLabs la primera
 *      vez y quedan en memoria: son unas 200 letras en total, se pagan una vez
 *      por arranque del dyno y después salen al instante. Ese «al instante» es
 *      todo el punto: una muletilla que tarda dos segundos en llegar no tapa
 *      ningún silencio.
 */
const MULETILLAS = {
  es: {
    general: ['Déjeme ver.', 'Un momento, lo reviso.', 'Voy a mirarlo.', 'Déjeme revisar eso.',
      'Un segundo.', 'Ya lo estoy viendo.', 'Permítame.'],
    datos: ['Déjeme leer los números.', 'Voy a mirar cómo está eso ahora.'],
    buscar: ['Voy a buscarlo.', 'Déjeme buscar eso.'],
    archivo: ['Déjeme leer eso.', 'Voy a mirar el archivo.'],
    largo: ['Esto me va a tomar un momento.'],
  },
  en: {
    general: ['Let me see.', 'One moment, I am checking.', 'Let me look at that.', 'Give me a second.',
      'I am on it.', 'Let me review that.', 'One second.'],
    datos: ['Let me read the numbers.', 'Let me check how that stands right now.'],
    buscar: ['Let me search for that.', 'I will look it up.'],
    archivo: ['Let me read that.', 'I will look at the file.'],
    largo: ['This one will take me a moment.'],
  },
};

/** El catálogo que el panel necesita para pedirlas por su número. */
function muletillas(idioma = 'es') {
  const m = MULETILLAS[idioma === 'en' ? 'en' : 'es'];
  const lista = [];
  for (const [grupo, frases] of Object.entries(m)) frases.forEach((texto, i) => lista.push({ grupo, i, texto }));
  return lista;
}

/** El audio de una muletilla, por grupo e índice. Se graba una vez y queda. */
async function muletilla(idioma, grupo, indice, { vozId = null } = {}) {
  const m = MULETILLAS[idioma === 'en' ? 'en' : 'es'];
  const frases = m[grupo] || m.general;
  const texto = frases[Number(indice) % frases.length];
  if (!texto) { const e = new Error('No hay esa muletilla.'); e.codigo = 'NO_EXISTE'; throw e; }
  /* Con el modelo rápido: son tres palabras y lo que importa es que estén ya. */
  return hablar(texto, { rapido: true, vozId });
}

module.exports = { hablar, hablarEnVivo, voces, encendida, paraDecir, VOZ, muletillas, muletilla,
  _adentro: { memoria, VOZ, MODELO, MODELO_RAPIDO, vozPermitida, MULETILLAS } };
