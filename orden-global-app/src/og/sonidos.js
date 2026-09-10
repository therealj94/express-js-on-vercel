// ═══ LOS SONIDOS DEL DINERO ═════════════════════════════════════════════
// Dos únicos, fabricados para la casa: 'enviado' suena cuando la cadena
// confirma un envío y 'recibido' cuando entra dinero o llega un mensaje.
// No hay más: un tercer sonido ya sería ruido, no marca.
//
// REGLA DEL AIRE ── expo-audio SÍ está en package.json, pero los APK que la
// gente ya tiene instalados no llevan su módulo nativo dentro: un import
// estático se evaluaría al cargar el bundle por aire y la app arrancaría en
// negro. Por eso se pide con require dentro de try/catch, igual que
// Inmersivo.js con expo-navigation-bar: si el módulo está, la app suena; si
// no está, queda en silencio y todo lo demás funciona exactamente igual.
let Audio = null;
try {
  Audio = require('expo-audio');
} catch (e) {
  Audio = null;
}
if (Audio && typeof Audio.createAudioPlayer !== 'function') Audio = null;

// Para que quien quiera pueda preguntar sin volver a arriesgarse al require.
export const haySonido = !!Audio;

// Los .mp3 viajan DENTRO del bundle de JS (son assets, no módulo nativo):
// este require es seguro incluso en los teléfonos donde expo-audio no exista.
const FUENTES = {
  enviado: require('../../assets/sonidos/enviado.mp3'),
  recibido: require('../../assets/sonidos/recibido.mp3'),
};

// Un reproductor por sonido, creado la primera vez y reutilizado: crear y
// destruir uno nativo por cada aviso deja fugas y tartamudea en gama baja.
const reproductores = {};
let modoListo = false;

/**
 * reproducir('enviado' | 'recibido', { suave }) — dispara el sonido y no
 * espera a que termine. `suave: true` lo baja a un tercio del volumen: es el
 * tono de un mensaje de chat, no el de dinero entrando.
 * Nunca lanza: sin módulo, sin permiso o con el player roto, devuelve false.
 */
export async function reproducir(nombre, { suave = false } = {}) {
  if (!Audio || !FUENTES[nombre]) return false;
  try {
    if (!modoListo) {
      modoListo = true;
      // En iOS el interruptor lateral de silencio calla los sonidos de app
      // por defecto; el aviso de dinero debe sonar igual que una llamada.
      try { await Audio.setAudioModeAsync({ playsInSilentMode: true }); } catch (e) {}
    }
    let p = reproductores[nombre];
    if (!p) {
      p = Audio.createAudioPlayer(FUENTES[nombre]);
      reproductores[nombre] = p;
    }
    p.volume = suave ? 0.35 : 1;
    // volver al inicio ANTES de play: el player reutilizado se queda parado
    // al final del clip y sin esto la segunda vez no se oye nada
    await p.seekTo(0);
    p.play();
    return true;
  } catch (e) {
    // Un sonido que falla jamás debe romper un envío ni un aviso. Se anota
    // en desarrollo y se descarta el player por si quedó en mal estado.
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[sonidos] no sonó', nombre, e?.message || e);
    try { reproductores[nombre]?.remove?.(); } catch (e2) {}
    delete reproductores[nombre];
    return false;
  }
}
