/* EL CANDADO · el mismo sobre que la web, escrito para el teléfono.
 *
 * ══ QUÉ ES ESTO Y POR QUÉ EXISTE ══════════════════════════════════════════
 *
 * PULSE2CHAT cifra de punta a punta desde la web (apps-web/veta-wallet/
 * candado.js). La pantalla nativa de la app no sabía abrir esos sobres, y por
 * eso el planeta del chat abría la versión web dentro de una vista de
 * navegador — que no recibe avisos, no suena con la app cerrada y se siente
 * prestada. Esto es lo que quita ese obstáculo: el MISMO esquema, aquí.
 *
 * ══ LA REGLA QUE MANDA SOBRE TODO LO DEMÁS ════════════════════════════════
 *
 * Un sobre cerrado aquí tiene que abrirse allá, y al revés, BYTE POR BYTE. No
 * es una aspiración: si las dos implementaciones se separan un milímetro —un
 * `info` distinto, un IV de otro largo, la etiqueta de GCM en otro sitio— los
 * mensajes dejan de abrirse entre el teléfono y el navegador, y el fallo se
 * ve como «me llegó un mensaje vacío». Por eso hay una prueba que carga LAS
 * DOS implementaciones de verdad y se las cruza: pruebas/probar-candado.cjs.
 * Si esa prueba se pone roja, este archivo está mal, no la web.
 *
 * ══ POR QUÉ @noble Y NO UN MÓDULO NATIVO ══════════════════════════════════
 *
 * React Native no trae WebCrypto, así que `crypto.subtle` no existe y el
 * código de la web no se puede copiar tal cual. Las dos salidas son un módulo
 * nativo (react-native-quick-crypto) o criptografía en JavaScript puro.
 *
 * Se elige JavaScript puro, y no por gusto: un módulo nativo ata la app a
 * compilar un APK para cada arreglo del chat. Con @noble, todo esto viaja por
 * la actualización POR AIRE — un fallo de cifrado se corrige y llega a los
 * teléfonos al reabrir la app, sin tienda y sin esperar una compilación. En la
 * pieza más delicada del producto, poder arreglar rápido vale más que unos
 * milisegundos. @noble está auditada y es la misma que usa medio ecosistema
 * de Ethereum.
 *
 * ══ DÓNDE VIVE LA LLAVE PRIVADA ═══════════════════════════════════════════
 *
 * En `expo-secure-store`, que en Android es el llavero del sistema respaldado
 * por hardware. Hay una diferencia honesta con la web que conviene decir: allá
 * la llave es NO EXTRAÍBLE —su contenido no pasa nunca por JavaScript— y aquí
 * sí lo hace, porque en JavaScript puro no hay otra manera. A cambio, el
 * almacén del teléfono está cifrado por el sistema y atado a la pantalla de
 * bloqueo, que el almacén de un navegador no lo está. Ninguna de las dos es
 * estrictamente mejor; las dos son razonables, y la diferencia queda escrita
 * aquí en vez de descubrirse después.
 */
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha2';
import { hkdf } from '@noble/hashes/hkdf';
import { gcm } from '@noble/ciphers/aes';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/* ══ LA VERSIÓN 2 FIRMA, Y ESO NO ES OPCIONAL ══════════════════════════════
 *
 * El sobre v1 sólo garantizaba «quien conocía este secreto fabricó esto», y si
 * el secreto sale de una llave elegida por un atacante, esa garantía se queda
 * en el aire: quien pudiera escribir en el relevo podría poner palabras en boca
 * de un contacto. La v2 firma el bulto con ECDSA y `abrir` juzga esa firma
 * contra las llaves PUBLICADAS del remitente, no contra las que vienen dentro.
 *
 * Se siguen abriendo los bultos v1 —son los que ya están guardados y no se
 * pueden refirmar— pero marcados como no verificados, para que la pantalla lo
 * diga en vez de callarlo.
 *
 * Este archivo nació apuntando a la v1 y la prueba de compatibilidad lo cazó al
 * primer intento: cerraba sobres que la web ya no aceptaba. Ese es exactamente
 * el trabajo que hace `pruebas/probar-candado.cjs`. */
const VERSION = 2;
const VERSION_SIN_FIRMA = 1;
/* Los mismos textos que la web, letra por letra. Cambiar uno de estos rompe
   la compatibilidad en silencio: los sobres se siguen cerrando y ya no se
   abren del otro lado. */
const INFO_SOBRE = 'pulse2chat/sobre/v1';
const INFO_CODIGO = 'pulse2chat/codigo/v1|';
const PREFIJO_FIRMA = 'pulse2chat/bulto/v2';

// ── bytes ──────────────────────────────────────────────────────────────────
// base64url, no base64 a secas: estos textos viajan dentro de JSON y `+` y `/`
// se rompen ahí. Escrito a mano porque el `btoa` del navegador no existe aquí.
const ALF = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function aB64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    s += ALF[(n >> 18) & 63] + ALF[(n >> 12) & 63];
    if (i + 1 < b.length) s += ALF[(n >> 6) & 63];
    if (i + 2 < b.length) s += ALF[n & 63];
  }
  return s;
}

export function deB64(txt) {
  const s = String(txt || '');
  const salida = new Uint8Array(Math.floor((s.length * 3) / 4));
  let n = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ALF.indexOf(s[i]);
    if (v < 0) continue;                     // el relleno `=` y la basura, fuera
    n = (n << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; salida[j++] = (n >> bits) & 255; }
  }
  return salida.subarray(0, j);
}

const textoABytes = (s) => {
  // TextEncoder existe en Hermes, pero no en todas las versiones: se hace a
  // mano para no depender de eso en la pieza que no puede fallar.
  const u = unescape(encodeURIComponent(String(s)));
  const b = new Uint8Array(u.length);
  for (let i = 0; i < u.length; i++) b[i] = u.charCodeAt(i);
  return b;
};

const bytesATexto = (b) => {
  let u = '';
  for (let i = 0; i < b.length; i++) u += String.fromCharCode(b[i]);
  return decodeURIComponent(escape(u));
};

const azar = (n) => Crypto.getRandomBytes(n);

// ── el par de llaves de ESTE aparato ───────────────────────────────────────
const CAJON = 'p2c.candado.priv';
/* Un SEGUNDO par, sólo para firmar. No se reutiliza el de acuerdo por la misma
   razón por la que la web tampoco lo hace: WebCrypto no deja que una llave de
   ECDH sirva también para ECDSA, y ese límite es sano — una llave, un uso. */
const CAJON_FIRMA = 'p2c.candado.firma';

let mio = null;
let arrancando = null;

function armar(priv, privF) {
  /* La pública SIN COMPRIMIR (65 bytes: 0x04 ‖ X ‖ Y). Es lo que exporta
     WebCrypto en formato `raw`, y lo que la web publica y espera recibir. */
  const pub = p256.getPublicKey(priv, false);
  const pubB64 = aB64(pub);
  /* El id del aparato es el resumen de su propia llave pública, igual que en
     la web: así dos aparatos no chocan nunca y el id se puede recalcular. */
  const id = aB64(sha256(pub)).slice(0, 22);
  const pubF = privF ? p256.getPublicKey(privF, false) : null;
  return { id, priv, pub, pubB64, privF: privF || null, pubFB64: pubF ? aB64(pubF) : null };
}

export async function mias() {
  if (mio) return mio;
  if (arrancando) return arrancando;
  arrancando = (async () => {
    try {
      const guardada = await SecureStore.getItemAsync(CAJON).catch(() => null);
      let guardadaF = await SecureStore.getItemAsync(CAJON_FIRMA).catch(() => null);
      if (guardada && deB64(guardada).length === 32) {
        /* Los aparatos de antes de la v2 no tienen par de firma. NO se les
           cambia el de acuerdo —eso les rompería todo lo que ya recibieron—:
           se les AGREGA el de firma al lado y desde ahí firman como los
           nuevos. Es la única forma de que nadie pierda su historial. */
        if (!guardadaF || deB64(guardadaF).length !== 32) {
          guardadaF = aB64(p256.utils.randomPrivateKey());
          await SecureStore.setItemAsync(CAJON_FIRMA, guardadaF).catch(() => {});
        }
        mio = armar(deB64(guardada), deB64(guardadaF));
        return mio;
      }
      const priv = p256.utils.randomPrivateKey();
      const privF = p256.utils.randomPrivateKey();
      await SecureStore.setItemAsync(CAJON, aB64(priv)).catch(() => {});
      await SecureStore.setItemAsync(CAJON_FIRMA, aB64(privF)).catch(() => {});
      mio = armar(priv, privF);
    } catch {
      /* El llavero puede negarse —un teléfono sin bloqueo de pantalla, un
         almacén lleno—. Se sigue con un par que solo vive en memoria: cifra
         igual mientras la app esté abierta, y al cerrarla se pierde. Es peor
         que guardarlo y muchísimo mejor que mandar el texto en claro. */
      try {
        mio = { ...armar(p256.utils.randomPrivateKey(), p256.utils.randomPrivateKey()),
                volatil: true };
      }
      catch { mio = null; }
    }
    return mio;
  })();
  return arrancando;
}

/** ¿Se puede cifrar en este aparato? Aquí siempre: no depende del navegador. */
export const hay = () => true;

/** La llave pública de este aparato, lista para publicar. */
export async function miLlave() {
  const m = await mias();
  return m ? { id: m.id, pub: m.pubB64, fir: m.pubFB64 || null, volatil: !!m.volatil } : null;
}

// ── el secreto compartido entre dos aparatos ───────────────────────────────
const cache = new Map();

function secretoCon(pubAjenaB64, priv) {
  const guardada = cache.get(pubAjenaB64);
  if (guardada) return guardada;
  /* ══ LOS 32 BYTES QUE TIENEN QUE COINCIDIR ═════════════════════════════
     WebCrypto `deriveBits` con P-256 devuelve SOLO la coordenada X: 32 bytes.
     @noble devuelve el punto entero. Pidiéndolo comprimido son 33 bytes —un
     prefijo y la X— así que se le quita el prefijo y queda exactamente lo
     mismo. Tomar los 65 bytes sin comprimir aquí daría un secreto distinto y
     los sobres no abrirían del otro lado: el fallo entero cabe en esta línea. */
  const compartido = p256.getSharedSecret(priv, deB64(pubAjenaB64), true).slice(1);
  /* HKDF sobre eso, no los bytes crudos: ECDH no los reparte parejo. El `salt`
     vacío y el `info` son los de la web — es lo que ata este secreto a este
     uso y no a otro. */
  const k = hkdf(sha256, compartido, new Uint8Array(0), textoABytes(INFO_SOBRE), 32);
  cache.set(pubAjenaB64, k);
  return k;
}

function dedup(lista) {
  const visto = new Set();
  return (lista || []).filter((x) => {
    if (!x?.id || !x?.pub || visto.has(x.id)) return false;
    visto.add(x.id);
    return true;
  });
}

// ── cerrar y abrir ─────────────────────────────────────────────────────────

/**
 * Cierra un texto para una lista de aparatos.
 * @param {string} texto
 * @param {Array<{id:string, pub:string}>} aparatos  los de quien recibe
 */
export async function cerrar(texto, aparatos) {
  const m = await mias();
  if (!m) throw new Error('sin-llaves');
  /* El sobre para uno mismo no es un detalle: sin él, uno no puede releer lo
     que escribió, ni desde aquí ni desde ningún otro aparato suyo. */
  const todos = dedup([...(aparatos || []), { id: m.id, pub: m.pubB64 }]);
  if (!todos.length) throw new Error('sin-destino');

  const llaveMsg = azar(32);
  const iv = azar(12);
  const cerrado = gcm(llaveMsg, iv).encrypt(textoABytes(texto));

  const sobres = [];
  for (const ap of todos) {
    try {
      const k = secretoCon(ap.pub, m.priv);
      const ivS = azar(12);
      sobres.push({ a: ap.id, iv: aB64(ivS), k: aB64(gcm(k, ivS).encrypt(llaveMsg)) });
    } catch {
      /* Una llave pública corrupta no puede tumbar el envío a los demás. Ese
         aparato no podrá abrirlo, y se nota: al abrirlo dirá que no hay sobre. */
    }
  }
  if (!sobres.length) throw new Error('sin-destino');

  /* LO QUE SE FIRMA, y por qué eso y no otra cosa: el resumen de todo lo que
     identifica a este bulto — la versión, la llave de acuerdo de quien
     escribe, el texto cifrado, su vector y la lista entera de sobres. Con eso,
     cambiar un byte de cualquiera de las partes —o mover un sobre de un bulto a
     otro— rompe la firma. La firma NO tapa los metadatos: quién habla con quién
     y cuándo lo sigue viendo el servidor. */
  const cuerpo = { v: VERSION, de: m.pubB64, iv: aB64(iv), ct: aB64(cerrado), s: sobres };
  if (!m.privF) return cuerpo;
  const firma = p256.sign(sha256(textoABytes(paraFirmar(cuerpo))), m.privF);
  /* En formato CRUDO (r‖s, 64 bytes), que es lo que produce y espera
     WebCrypto. @noble entrega DER por omisión: mandando DER, la web diría
     «firma rota» en cada mensaje del teléfono. */
  return { ...cuerpo, fir: m.pubFB64, f: aB64(firma.toCompactRawBytes()) };
}

/** El texto exacto que se firma. Mismo orden siempre, o la firma no cuadra. */
function paraFirmar(c) {
  return [
    PREFIJO_FIRMA,
    c.v, c.de, c.iv, c.ct,
    (c.s || []).map((x) => `${x.a}.${x.iv}.${x.k}`).join('|'),
  ].join('\n');
}

/* ══ JUZGAR LA FIRMA ══════════════════════════════════════════════════════
 * `aparatos` son las llaves PUBLICADAS del remitente, tal como las declara el
 * servidor. La que viene dentro del bulto no vale por sí sola: sin esta
 * comprobación, quien pudiera escribir en el relevo firmaría con una llave suya
 * y todo cuadraría. */
function juzgarFirma(bulto, aparatos) {
  if (!bulto.f || !bulto.fir) return { verificado: false, motivo: 'sin-firma' };
  if (!Array.isArray(aparatos) || !aparatos.length) {
    return { verificado: false, motivo: 'sin-llaves-del-remitente' };
  }
  const publicadas = aparatos.map((a) => a && a.fir).filter(Boolean);
  if (!publicadas.includes(bulto.fir)) return { verificado: false, motivo: 'llave-no-publicada' };
  /* Y además: la llave de acuerdo que dice el bulto tiene que ser la del MISMO
     aparato que firmó. Si no, alguien podría firmar con la suya un bulto
     cerrado con la de otro. */
  const suyo = aparatos.find((a) => a && a.fir === bulto.fir);
  if (!suyo || suyo.pub !== bulto.de) return { verificado: false, motivo: 'aparato-no-cuadra' };
  try {
    const ok = p256.verify(
      deB64(bulto.f),
      sha256(textoABytes(paraFirmar({ v: bulto.v, de: bulto.de, iv: bulto.iv, ct: bulto.ct, s: bulto.s }))),
      deB64(bulto.fir),
    );
    return ok ? { verificado: true, motivo: '' } : { verificado: false, motivo: 'firma-rota' };
  } catch {
    return { verificado: false, motivo: 'firma-ilegible' };
  }
}

/**
 * Abre un bulto. Devuelve el texto, o null si este aparato no tiene sobre —lo
 * cual es normal: un mensaje que llegó cuando este teléfono todavía no existía
 * no se puede abrir aquí, y la pantalla lo dice con esas palabras en vez de
 * enseñar un renglón vacío.
 */
export async function abrir(bulto, aparatosDelRemitente) {
  const m = await mias();
  if (!m || !bulto) return null;
  if (bulto.v !== VERSION && bulto.v !== VERSION_SIN_FIRMA) return null;
  const sobre = (bulto.s || []).find((x) => x.a === m.id);
  if (!sobre) return null;
  let texto;
  try {
    const k = secretoCon(bulto.de, m.priv);
    const llaveMsg = gcm(k, deB64(sobre.iv)).decrypt(deB64(sobre.k));
    texto = bytesATexto(gcm(llaveMsg, deB64(bulto.iv)).decrypt(deB64(bulto.ct)));
  } catch {
    /* GCM falla si el bulto fue tocado. Que falle es la señal de que algo no
       cuadra, no un detalle a esconder. */
    return null;
  }
  return { texto, ...juzgarFirma(bulto, aparatosDelRemitente) };
}

/** Cierra bytes (una foto, una nota de voz) con una llave suelta. La llave
 *  viaja DENTRO del texto cifrado del mensaje, no al lado: por eso el servidor
 *  guarda el archivo cerrado y jamás ve con qué abrirlo. */
export function cerrarBytes(bytes) {
  const llave = azar(32);
  const iv = azar(12);
  return { bytes: gcm(llave, iv).encrypt(bytes), llave: aB64(llave), iv: aB64(iv) };
}

export function abrirBytes(bytes, llaveB64, ivB64) {
  return gcm(deB64(llaveB64), deB64(ivB64)).decrypt(bytes);
}

/* ── el código de seguridad ────────────────────────────────────────────────
   Se lee en voz alta y tiene que salir IDÉNTICO en los dos aparatos. Las dos
   mitades se ordenan siempre igual —la menor primero— para que las dos
   personas vean el mismo número sin liarse con el orden.

   Si coincide, no hay nadie en medio. Si no coincide, alguien cambió una
   llave: puede ser que la otra persona reinstaló, o puede ser un ataque, y
   hasta saber cuál de las dos cosas es, no se manda nada delicado. */
export function codigoDeSeguridad(pubsMias, pubsSuyas) {
  const huella = (lista) => {
    const juntas = (lista || []).slice().sort().join('|');
    const b = sha256(textoABytes(INFO_CODIGO + juntas));
    let s = '';
    for (let i = 0; i < 15; i += 3) {
      const n = (((b[i] << 16) | (b[i + 1] << 8) | b[i + 2]) >>> 0) % 100000;
      s += String(n).padStart(5, '0') + ' ';
    }
    return s.trim();
  };
  const a = huella(pubsMias);
  const b = huella(pubsSuyas);
  return a < b ? `${a}  ${b}` : `${b}  ${a}`;
}
