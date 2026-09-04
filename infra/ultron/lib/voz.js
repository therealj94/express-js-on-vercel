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
const MAXIMO = 2500;   // letras por petición: más largo se parte en el panel

const memoria = new Map();   // sha1(texto) -> Buffer
const MEMORIA_MAX = 60;

function encendida() { return !!LLAVE; }

/** Lo que se lee en voz alta no es lo que se lee en pantalla. */
function paraDecir(texto) {
  return String(texto)
    .replace(/```[\s\S]*?```/g, ' (código omitido) ')
    .replace(/https?:\/\/\S+/g, ' (enlace) ')
    .replace(/[#*_>`|]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ').trim().slice(0, MAXIMO);
}

async function hablar(texto) {
  if (!LLAVE) { const e = new Error('Voz no configurada.'); e.codigo = 'VOZ_APAGADA'; throw e; }
  const dicho = paraDecir(texto);
  if (!dicho) { const e = new Error('Nada que decir.'); e.codigo = 'VACIO'; throw e; }
  const { createHash } = require('node:crypto');
  const clave = createHash('sha1').update(VOZ + '|' + MODELO + '|' + dicho).digest('hex');
  if (memoria.has(clave)) return memoria.get(clave);

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOZ)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': LLAVE, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: dicho, model_id: MODELO,
      // Estable pero con vida: 0,5 de estabilidad suena a persona; 1,0 suena a lector.
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
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

module.exports = { hablar, encendida, paraDecir, _adentro: { memoria, VOZ, MODELO } };
