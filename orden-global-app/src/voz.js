// La voz de GENESIS. La misma disciplina que la del cerebro: se parte cada
// frase por sus juntas y se respira entre trozos, porque lo que suena a
// robot no es el timbre --es leer de corrido, sin aire--. El timbre lo pone
// la mejor voz del teléfono; elegimos es-MX / en-US y bajamos un poco el
// ritmo, que es lo que más humaniza una voz de sistema.
import * as Speech from 'expo-speech';

let turno = 0; // habla nueva mata a la anterior, sin reportarlo como error

function trozos(texto) {
  const t = String(texto || '').trim();
  if (!t) return [];
  // por coma, punto y coma, dos puntos y puntos; los signos se quedan
  const partes = t.match(/[^.,;:!?]+[.,;:!?]*/g) || [t];
  return partes.map((x) => x.trim()).filter(Boolean);
}

const pausaDe = (trozo) => (/[.!?]$/.test(trozo) ? 300 : /[;:]$/.test(trozo) ? 190 : 110);

export function decir(texto, idi = 'es') {
  const mio = ++turno;
  const lang = idi === 'en' ? 'en-US' : 'es-MX';
  Speech.stop();
  const lista = trozos(texto);
  let i = 0;
  const siguiente = () => {
    if (mio !== turno || i >= lista.length) return;
    const pieza = lista[i++];
    Speech.speak(pieza, {
      language: lang,
      rate: 0.92,        // un pelo más lento: narración, no aviso de megafonía
      pitch: idi === 'en' ? 0.96 : 1.0,
      onDone: () => { if (mio === turno) setTimeout(siguiente, pausaDe(pieza)); },
      onError: () => { if (mio === turno) setTimeout(siguiente, 60); },
    });
  };
  siguiente();
}

export function callar() { turno++; Speech.stop(); }
