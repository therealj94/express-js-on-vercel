// La voz de AU-RA. La misma disciplina que la del cerebro: se parte cada
// frase por sus juntas y se respira entre trozos, porque lo que suena a
// robot no es el timbre --es leer de corrido, sin aire--. El timbre lo pone
// la mejor voz del teléfono; elegimos es-MX / en-US.
//
// REGLA DEL AIRE: expo-speech es un módulo NATIVO. Está en package.json,
// pero un APK viejo que reciba esta pantalla por OTA no lo lleva en el
// binario: el require va en try/catch y sin módulo decir()/callar() son
// no-op silenciosos — un asistente mudo sigue siendo un asistente; una
// pantalla roja no es nada.
let Speech = null;
try {
  Speech = require('expo-speech');
} catch (e) {
  Speech = null;
}

let turno = 0; // habla nueva mata a la anterior, sin reportarlo como error

/* CÓMO SE DICEN LOS NOMBRES DE LA CASA.
   Una voz de sistema lee «AU-RA» deletreando, «AUBANK» como una palabra sola y
   «ORIGEN» en inglés arrancando con «or-», que es justo lo que no es: el nombre
   es español y se dice oh-REE-hen también en medio de una frase en inglés.
   Nuestros nombres son lo primero que oye alguien; decirlos mal es presentarse
   mal.

   Esto se aplica SOLO a lo que sale por el altavoz — el texto que se lee en
   pantalla no se toca. Su gemelo vive en la web (apps-web/veta-wallet/aura.js,
   const DICCION): si cambia uno, cambia el otro, o el mismo ecosistema se
   llamará distinto según por dónde se entre. */
const DICCION = {
  es: [
    [/AU-RA/g, 'Aura'], [/AUBANK/g, 'Au Banc'], [/Ordenexchange/g, 'Orden Exchéinch'],
    [/PULSE CHAT/g, 'Puls Chat'], [/MyTokenPay/g, 'Mai Token Péi'],
    [/Veta Wallet/g, 'Veta Wálet'], [/ORDENSCAN/g, 'orden scan'], [/ordenscan/g, 'orden scan'],
    [/Genesis ID/g, 'Génesis Aidí'], [/Layer 1/g, 'Léyer Uan'],
    [/Hyperledger Besu/g, 'Jaiper Ledyer Besu'], [/QBFT/g, 'Cu Be Efe Te'],
  ],
  en: [
    [/AU-RA/g, 'Aura'], [/AUBANK/g, 'A U Bank'], [/Ordenexchange/g, 'Orden Exchange'],
    [/ORIGEN/g, 'oh REE hen'],
    [/PULSE CHAT/g, 'Pulse Chat'], [/MyTokenPay/g, 'My Token Pay'],
    [/Genesis ID/g, 'Genesis I D'], [/Layer 1/g, 'Layer One'],
    [/Hyperledger Besu/g, 'Hyperledger Bessoo'], [/QBFT/g, 'Q B F T'],
    [/ORDENSCAN/g, 'Orden Scan'], [/ordenscan/g, 'Orden Scan'],
  ],
};

const pronunciar = (texto, idi) =>
  (DICCION[idi] || []).reduce((t2, [re, con]) => t2.replace(re, con), String(texto || ''));

function trozos(texto) {
  const t = String(texto || '').trim();
  if (!t) return [];
  // por coma, punto y coma, dos puntos y puntos; los signos se quedan
  const partes = t.match(/[^.,;:!?]+[.,;:!?]*/g) || [t];
  return partes.map((x) => x.trim()).filter(Boolean);
}

// Pausas cortas: la respiración se nota, pero la frase no se arrastra. Con
// las de antes (300/190/110) una confirmación de dos frases tardaba más en
// pausas que en palabras y AU-RA sonaba a contestador.
const pausaDe = (trozo) => (/[.!?]$/.test(trozo) ? 200 : /[;:]$/.test(trozo) ? 130 : 70);

export function decir(texto, idi = 'es') {
  if (!Speech) return;               // sin nativo no hay voz, y no pasa nada
  const mio = ++turno;
  const lang = idi === 'en' ? 'en-US' : 'es-MX';
  try { Speech.stop(); } catch (e) {}
  // se parte lo que se VA A DECIR, ya con los nombres bien dichos
  const lista = trozos(pronunciar(texto, idi));
  let i = 0;
  const siguiente = () => {
    if (mio !== turno || i >= lista.length) return;
    const pieza = lista[i++];
    try {
      Speech.speak(pieza, {
        language: lang,
        // es-MX a ritmo natural y un pelo más agudo: la voz de sistema en
        // 0.92 sonaba a narración sedada; la confirmación corta pide soltura.
        rate: idi === 'en' ? 0.96 : 1.0,
        pitch: idi === 'en' ? 0.96 : 1.04,
        onDone: () => { if (mio === turno) setTimeout(siguiente, pausaDe(pieza)); },
        onError: () => { if (mio === turno) setTimeout(siguiente, 60); },
      });
    } catch (e) {
      // un trozo que falla no calla el resto
      if (mio === turno) setTimeout(siguiente, 60);
    }
  };
  siguiente();
}

export function callar() {
  turno++;
  if (!Speech) return;
  try { Speech.stop(); } catch (e) {}
}
