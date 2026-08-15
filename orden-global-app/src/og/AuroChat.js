// ═══ AURO CHAT ═════════════════════════════════════════════════════════
// La mensajería de Orden Global. Lo que la define:
//   · SOLO se abre con Genesis ID aprobado — es la red de gente real;
//   · personas Y grupos en la MISMA lista: un grupo es otra conversación,
//     no otra pantalla, porque así se usan de verdad;
//   · el pago vive DENTRO de la charla: un mensaje tipo:'pago' no se pinta
//     como texto sino como comprobante, con su hash y su enlace al
//     explorador. Eso es lo que ninguna otra mensajería puede enseñar;
//   · a alguien se le encuentra por el directorio o ESCANEANDO SU CÓDIGO, y
//     al escanear se ofrece guardarlo — un contacto que se pierde obliga a
//     volver a escanear, y eso ya no es una red;
//   · adjuntos (📎) ≤ 8 MB: el id largo del archivo ES su permiso.
// Sin cifrado de extremo a extremo en esta versión: no se promete en ningún
// texto de esta pantalla.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet, Modal, Animated,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { C, G } from '../theme';
import { Header, useAccount, useToast, hap } from '../ui';
import { Icon } from '../icons';
import { useLang } from '../i18n';
import { genesis } from '../genesis';
import { addContact, isAddress } from '../addressBook';
import * as M from './mensajes';
import { aUri } from './rutas';

const TXT = {
  es: {
    marca: 'AURO CHAT', sub: 'Personas y grupos, con Genesis ID',
    buscar: 'Buscar por nombre o correo…', dir: 'EN EL ECOSISTEMA',
    nadie: 'Nadie con ese nombre todavía. Compartan su código QR para conectarse.',
    vacio: 'Aún no tienes conversaciones.\nBusca a alguien, escanea su código o crea un grupo.',
    escribe: 'Escribe…', origen: 'ENVIAR ORIGEN', miqr: 'MI CÓDIGO', escanear: 'ESCANEAR',
    ajustes: 'Mi perfil y ajustes', nuevoGrupo: 'Nuevo grupo',
    gateTit: 'El chat es de gente verificada',
    gateTxt: 'Para chatear necesitas tu Genesis ID aprobado. Así todos saben que del otro lado hay una persona real.',
    gateBtn: 'COMPLETAR MI GENESIS ID', mirando: 'Comprobando tu Genesis ID…',
    qrTuyo: 'Este es tu código. Quien lo escanee abre un chat contigo en AURO CHAT.',
    apunta: 'Apunta al código de la otra persona',
    adjImagen: 'Imagen', adjVideo: 'Video', adjArchivo: 'Archivo',
    ultImagen: 'Imagen', ultVideo: 'Video', ultArchivo: 'Archivo',
    grande: 'Pesa más de 8 MB y el relevo no lo acepta. Comparte una versión más ligera.',
    noSubio: 'No se pudo subir. Revisa tu conexión e intenta de nuevo.',
    noAbre: 'No se pudo abrir el archivo.',
    tu: 'Tú', miembros: 'miembros', grupo: 'Grupo',
    escaneaste: 'Escaneaste a', guardarTxt: '¿Lo dejas guardado en tus contactos?',
    guardarBtn: 'AGREGAR CONTACTO', guardado: 'Guardado en tus contactos.',
    noGuardo: 'No se pudo guardar el contacto.',
    pagoEnviaste: 'ENVIASTE', pagoRecibiste: 'RECIBISTE', pagoEnvio: 'ENVIÓ',
    confirmado: 'confirmado', explorador: 'Ver en el explorador',
  },
  en: {
    marca: 'AURO CHAT', sub: 'People and groups, with Genesis ID',
    buscar: 'Search by name or email…', dir: 'IN THE ECOSYSTEM',
    nadie: 'Nobody with that name yet. Share your QR codes to connect.',
    vacio: 'No conversations yet.\nSearch someone, scan their code or create a group.',
    escribe: 'Type…', origen: 'SEND ORIGEN', miqr: 'MY CODE', escanear: 'SCAN',
    ajustes: 'My profile and settings', nuevoGrupo: 'New group',
    gateTit: 'The chat is for verified people',
    gateTxt: 'You need your approved Genesis ID to chat. That way everyone knows there is a real person on the other side.',
    gateBtn: 'COMPLETE MY GENESIS ID', mirando: 'Checking your Genesis ID…',
    qrTuyo: 'This is your code. Whoever scans it opens a chat with you on AURO CHAT.',
    apunta: 'Point at the other person’s code',
    adjImagen: 'Image', adjVideo: 'Video', adjArchivo: 'File',
    ultImagen: 'Image', ultVideo: 'Video', ultArchivo: 'File',
    grande: 'It is over 8 MB and the relay won’t take it. Share a lighter version.',
    noSubio: 'Upload failed. Check your connection and try again.',
    noAbre: 'Could not open the file.',
    tu: 'You', miembros: 'members', grupo: 'Group',
    escaneaste: 'You scanned', guardarTxt: 'Want to keep them in your contacts?',
    guardarBtn: 'ADD CONTACT', guardado: 'Saved to your contacts.',
    noGuardo: 'The contact could not be saved.',
    pagoEnviaste: 'YOU SENT', pagoRecibiste: 'YOU RECEIVED', pagoEnvio: 'SENT',
    confirmado: 'confirmed', explorador: 'View on the explorer',
  },
};

// El relevo rechaza adjuntos de más de 8MB — mismo número aquí para avisar
// ANTES de gastar datos subiendo algo que va a rebotar.
const TOPE_ADJUNTO = 8_000_000;

// El explorador de la cadena. El comprobante no se cree a sí mismo: enseña el
// hash y lleva a donde cualquiera puede comprobarlo por su cuenta.
const EXPLORADOR = 'https://testnet.ordenscan.com/tx/';

// La libreta del chat va en SecureStore por encargo. Los valores de SecureStore
// se pueden quedar cortos pasados unos 2 KB, así que cada contacto guarda solo
// lo que hace falta para escribirle o pagarle, y la lista se queda con los 30
// más recientes: mejor una libreta que siempre escribe que una que un día
// falla en silencio. La dirección de cadena, además, se copia a la libreta del
// teléfono (addressBook), que es la que pone nombre a un 0x en Enviar y en
// Actividad — src/api.js no exporta guardarContacto, se comprobó.
const LIBRETA = 'og.contactos';
const TOPE_LIBRETA = 30;

// blob → base64 pelado (sin el prefijo data:...;base64,). FileReader existe
// en React Native y evita cargar el binario entero como string intermedio.
const blobABase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onerror = () => rej(new Error('lector'));
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.readAsDataURL(blob);
});

const hora = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const TONOS = [['#F8EFCF', '#C9A961'], ['#9FE3C9', '#2E8F6E'], ['#BFD8F5', '#4A78B0'], ['#F2C4B3', '#B0674A']];
const tono = (c) => TONOS[String(c).split('').reduce((a, x) => a + x.charCodeAt(0), 0) % TONOS.length];
// Una conversación se identifica por su id de grupo o por el correo, y de ahí
// en adelante el destino es UNO SOLO: enviar, bandeja, leído y el aviso del
// pago hablan todos del mismo string.
const idDe = (c) => (c ? (c.id || c.correo || '') : '');
const esGrupoDe = (c) => !!(c && (c.esGrupo || M.esGrupo(idDe(c))));
// El monto llega como TEXTO del relevo a propósito (un float redondearía los
// decimales de ORIGEN); aquí solo se le quitan los ceros de adorno.
const montoBonito = (x) => {
  const s = String(x == null ? '' : x).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return s;
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

// Entrada en cascada: cada fila aparece con opacidad + subida, escalonada.
// useNativeDriver porque solo se anima opacity/transform — nada de layout —
// y así la lista sigue fluida mientras el relevo contesta en segundo plano.
function Entrada({ delay = 0, style, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, speed: 12, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [op, y, delay]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

// El avatar sirve a las tres cosas que hay en la lista: una persona con foto,
// una persona sin foto (su inicial sobre un tono estable sacado del correo) y
// un grupo, que se reconoce de un vistazo por la silueta de gente.
function Avatar({ nombre, correo, foto, grupo, tam = 42 }) {
  if (foto) {
    return (
      <Image source={{ uri: M.urlArchivo(foto) }} resizeMode="cover"
        style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: C.panel2 }} />
    );
  }
  return (
    <LinearGradient colors={tono(correo)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: tam, height: tam, borderRadius: tam / 2, alignItems: 'center', justifyContent: 'center' }}>
      {grupo ? <Icon name="people" size={tam * 0.5} color="#12312b" /> : (
        <Text style={{ color: '#12312b', fontWeight: '800', fontSize: tam * 0.4 }}>
          {String(nombre || correo || '?')[0].toUpperCase()}
        </Text>
      )}
    </LinearGradient>
  );
}

// ── La tarjeta de pago ────────────────────────────────────────────────────
// Un pago NO es un mensaje de texto y no debe parecerlo: monto grande en oro,
// la marca de confirmado, la hora, y el enlace al explorador cuando hay hash.
// Es el comprobante de algo que ya pasó en la cadena.
function TarjetaPago({ m, mio, autor, t, toast }) {
  const abrir = () => {
    hap();
    Linking.openURL(EXPLORADOR + m.hash).catch(() => toast(t.noAbre, 'error'));
  };
  return (
    <View style={st.pago}>
      {/* el filo de oro: lo primero que distingue el comprobante del chat */}
      <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.pagoFilo} />
      <View style={st.pagoDentro}>
        {!!autor && <Text style={st.autor}>{autor}</Text>}
        <Text style={st.pagoVerbo}>
          {mio ? t.pagoEnviaste : (autor ? t.pagoEnvio : t.pagoRecibiste)}
        </Text>
        <View style={st.pagoFila}>
          <Text style={st.pagoMonto}>{montoBonito(m.monto)}</Text>
          <Text style={st.pagoMoneda}>{m.moneda || 'ORIGEN'}</Text>
        </View>
        {!!m.texto && <Text style={st.pagoNota}>{m.texto}</Text>}
        <View style={st.pagoPie}>
          <Icon name="checkmark-circle" size={13} color={C.up} />
          <Text style={st.pagoOk}>{t.confirmado}</Text>
          <Text style={st.pagoHora}>· {hora(m.cuando)}</Text>
        </View>
        {!!m.hash && (
          <Pressable style={st.pagoLink} onPress={abrir}>
            <Icon name="open-outline" size={14} color={C.gold} />
            <Text style={st.pagoLinkTxt}>{t.explorador}</Text>
            <Text style={st.pagoHash} numberOfLines={1}>{m.hash.slice(0, 10)}…</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// Guardar a alguien en la libreta. Se hace idempotente por correo: escanear
// dos veces al mismo actualiza su ficha en vez de duplicarla.
async function guardarContacto(correo, nombre, addr, emailCuenta) {
  const crudo = await SecureStore.getItemAsync(LIBRETA).catch(() => null);
  let lista = [];
  try { const p = JSON.parse(crudo || '[]'); if (Array.isArray(p)) lista = p; } catch { lista = []; }
  const rec = { nombre: nombre || correo.split('@')[0], correo, addr: addr || '' };
  const i = lista.findIndex((x) => String(x && x.correo || '').toLowerCase() === correo);
  if (i >= 0) lista[i] = { ...lista[i], ...rec }; else lista.push(rec);
  await SecureStore.setItemAsync(LIBRETA, JSON.stringify(lista.slice(-TOPE_LIBRETA)));
  // si además sabemos su dirección de cadena, entra en la libreta del teléfono
  // y su nombre aparecerá en Enviar y en Actividad, no solo aquí
  if (isAddress(rec.addr)) await addContact(emailCuenta, { name: rec.nombre, address: rec.addr }).catch(() => {});
}

export default function AuroChat({ nav, params }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const [puerta, setPuerta] = useState('mirando');       // mirando | falta | abierta
  const [convos, setConvos] = useState(null);
  const [busca, setBusca] = useState('');
  const [gente, setGente] = useState(null);
  const [con, setCon] = useState(null);                  // la conversación abierta
  const [hilo, setHilo] = useState([]);
  const [nombres, setNombres] = useState({});            // correo → nombre, para saber quién habla
  const [texto, setTexto] = useState('');
  const [qr, setQr] = useState(null);                    // 'mio' | 'scan' | null
  const [hoja, setHoja] = useState(false);               // la hojita del 📎
  const [subiendo, setSubiendo] = useState(false);
  const [foto, setFoto] = useState(null);                // url de imagen a pantalla completa
  const [ofrecido, setOfrecido] = useState(null);        // a quién ofrecemos guardar tras escanear
  const [permiso, pedirPermiso] = useCameraPermissions();
  const toast = useToast();
  const lista = useRef(null);
  const leido = useRef(false);
  const destino = idDe(con);
  const enGrupo = esGrupoDe(con);

  // La lista de nombres solo se reemplaza si de verdad cambió: si no, cada
  // vuelta del sondeo repintaría el hilo entero sin haber novedad.
  const aprenderNombres = useCallback((pares) => {
    setNombres((prev) => {
      let nuevo = null;
      for (const [correo, nombre] of pares) {
        const c = String(correo || '').toLowerCase();
        if (!c || !nombre || prev[c] === nombre) continue;
        nuevo = nuevo || { ...prev };
        nuevo[c] = nombre;
      }
      return nuevo || prev;
    });
  }, []);

  // ── el candado de Genesis: primero lo guardado (rápido), luego la red ──
  useEffect(() => {
    let vivo = true;
    (async () => {
      const local = await genesis.local().catch(() => null);
      if (local?.verificada) { if (vivo) setPuerta('abierta'); }
      const e = await genesis.estado().catch(() => null);
      if (!vivo) return;
      if (e?.verificada) setPuerta('abierta');
      else if (!local?.verificada) setPuerta('falta');
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (puerta === 'abierta' && account?.email) M.alta(account).catch(() => {});
  }, [puerta, account?.email]);

  const traerConvos = useCallback(async () => {
    try {
      const d = await M.conversaciones();
      const cs = d.conversaciones || [];
      setConvos(cs);
      aprenderNombres(cs.filter((c) => !esGrupoDe(c)).map((c) => [c.correo, c.nombre]));
    } catch { setConvos((x) => x || []); }
  }, [aprenderNombres]);
  useEffect(() => {
    if (puerta !== 'abierta' || con) return;
    traerConvos();
    const r = setInterval(traerConvos, 5000);
    return () => clearInterval(r);
  }, [puerta, con, traerConvos]);

  // Abrir el hilo de una persona: se pinta con lo que ya se sabe y la ficha
  // (nombre real, dirección, foto) llega después — esperarla dejaría la
  // pantalla en blanco por una red lenta.
  const abrirPersona = useCallback(async (correoCrudo, ofrecerGuardar) => {
    const correo = String(correoCrudo || '').toLowerCase();
    if (!correo) return;
    const base = { correo, nombre: correo.split('@')[0], addr: '' };
    setCon(base);
    if (ofrecerGuardar) setOfrecido(base);
    try {
      const f = await M.ficha(correo);
      const lleno = { correo, nombre: f.nombre || base.nombre, addr: f.addr || '', foto: f.foto || '' };
      setCon((x) => (x && x.correo === correo ? { ...x, ...lleno } : x));
      setOfrecido((x) => (x && x.correo === correo ? { ...x, ...lleno } : x));
      aprenderNombres([[correo, lleno.nombre]]);
    } catch {}
  }, [aprenderNombres]);

  // llegar con ?con=correo (del QR o del asistente) abre el hilo directo
  useEffect(() => {
    if (params?.con && puerta === 'abierta') abrirPersona(params.con);
  }, [params?.con, puerta, abrirPersona]);

  // La ficha del grupo: de aquí salen los nombres con los que se firma cada
  // burbuja ajena. Sin esto un grupo sería un montón de correos hablando.
  useEffect(() => {
    if (!enGrupo || !destino) return;
    let vivo = true;
    M.grupoInfo(destino).then((g) => {
      if (!vivo || !g) return;
      const gente = Array.isArray(g.miembros) ? g.miembros : [];
      setCon((x) => (idDe(x) === destino
        ? { ...x, nombre: g.nombre || x.nombre, foto: g.foto || x.foto, admin: g.admin, miembros: gente.length || x.miembros }
        : x));
      aprenderNombres(gente.map((m) => [m.correo, m.nombre]));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [destino, enGrupo, aprenderNombres]);

  useEffect(() => {
    if (busca.trim().length < 2) { setGente(null); return; }
    const r = setTimeout(async () => {
      try { const d = await M.buscar(busca.trim()); setGente(d.gente || []); } catch { setGente([]); }
    }, 350);
    return () => clearTimeout(r);
  }, [busca]);

  const traerHilo = useCallback(async () => {
    if (!destino) return;
    try {
      const d = await M.bandeja(destino);
      setHilo(d.mensajes || []);
      if (!leido.current) { leido.current = true; M.leido(destino).catch(() => {}); }
    } catch {}
  }, [destino]);
  useEffect(() => {
    if (!destino) return;
    leido.current = false;
    traerHilo();
    const r = setInterval(traerHilo, 3000);
    return () => clearInterval(r);
  }, [destino, traerHilo]);

  const mandar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo || !destino) return;
    setTexto('');
    const mio = { de: account.email, texto: cuerpo, cuando: Date.now(), pendiente: true };
    setHilo((h) => [...h, mio]);
    try { await M.enviar(destino, cuerpo); traerHilo(); }
    catch { setHilo((h) => h.map((m) => (m === mio ? { ...m, fallo: true } : m))); }
  };

  // ── adjuntos ──────────────────────────────────────────────────────────
  // Leer la uri como blob y pasarla a base64. Si pesa de más se avisa AQUÍ,
  // antes de subir nada: gastar megas del plan para recibir un 413 es cruel.
  const leerUri = async (uri) => {
    const res = await fetch(uri);
    const blob = await res.blob();
    if (blob.size > TOPE_ADJUNTO) { toast(t.grande, 'error'); return null; }
    return blobABase64(blob);
  };

  // Subir el binario al relevo y mandar el mensaje que lo referencia. El
  // hilo se refresca del servidor (sin burbuja optimista): el adjunto igual
  // necesita la URL real del relevo para pintarse.
  const subirYMandar = async (tipo, nombre, mime, datos) => {
    if (!datos) return;
    if (datos.length * 0.75 > TOPE_ADJUNTO) { toast(t.grande, 'error'); return; }
    setSubiendo(true);
    try {
      const { id } = await M.subir(nombre, tipo, mime, datos);
      await M.enviar(destino, '', { tipo, archivo: id, nombre });
      hap(); traerHilo();
    } catch { toast(t.noSubio, 'error'); }
    finally { setSubiendo(false); }
  };

  const elegirImagen = async () => {
    setHoja(false);
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], base64: true, quality: 0.8,
    }).catch(() => null);
    const a = r?.assets?.[0];
    if (!a) return;
    // el picker ya trae el base64 de la imagen; la uri es solo el respaldo
    const datos = a.base64 || (await leerUri(a.uri).catch(() => null));
    await subirYMandar('imagen', a.fileName || 'imagen.jpg', a.mimeType || 'image/jpeg', datos);
  };

  const elegirVideo = async () => {
    setHoja(false);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] }).catch(() => null);
    const a = r?.assets?.[0];
    if (!a) return;
    // primer filtro con el peso que reporta el picker; el definitivo lo da
    // el blob, que es lo que de verdad viajaría
    if (a.fileSize && a.fileSize > TOPE_ADJUNTO) { toast(t.grande, 'error'); return; }
    const datos = await leerUri(a.uri).catch(() => { toast(t.noSubio, 'error'); return null; });
    if (datos) await subirYMandar('video', a.fileName || 'video.mp4', a.mimeType || 'video/mp4', datos);
  };

  const elegirArchivo = async () => {
    setHoja(false);
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }).catch(() => null);
    const a = r?.assets?.[0];
    if (!a || r?.canceled) return;
    if (a.size && a.size > TOPE_ADJUNTO) { toast(t.grande, 'error'); return; }
    const datos = await leerUri(a.uri).catch(() => { toast(t.noSubio, 'error'); return null; });
    if (datos) await subirYMandar('archivo', a.name || 'archivo', a.mimeType || 'application/octet-stream', datos);
  };

  const abrirAdjunto = (id) => {
    hap();
    Linking.openURL(M.urlArchivo(id)).catch(() => toast(t.noAbre, 'error'));
  };

  // Quién habla, en corto. Los nombres se van aprendiendo de las charlas y de
  // la ficha del grupo; mientras no se sepa el de alguien se usa lo que va
  // antes de la arroba — feo, pero nunca deja una frase sin dueño.
  const nombreCorto = (correo) => {
    const n = nombres[String(correo || '').toLowerCase()];
    return (n || String(correo || '').split('@')[0]).split(' ')[0];
  };

  // Cómo se resume la última línea de una conversación. En un grupo lleva
  // SIEMPRE el prefijo de quién habló: sin eso, una lista de grupos es una
  // lista de frases sueltas sin dueño.
  const resumen = (c) => {
    const u = c.ultimo;
    if (!u) return esGrupoDe(c) ? (c.miembros || 0) + ' ' + t.miembros : c.correo;
    const mio = u.de === account?.email;
    let cuerpo;
    if (u.tipo === 'pago') cuerpo = '💰 ' + montoBonito(u.monto) + ' ' + (u.moneda || 'ORIGEN');
    else if (u.tipo === 'imagen') cuerpo = '📷 ' + t.ultImagen;
    else if (u.tipo === 'video') cuerpo = '🎬 ' + t.ultVideo;
    else if (u.tipo === 'archivo') cuerpo = '📎 ' + (u.nombre || t.ultArchivo);
    else cuerpo = u.texto;
    if (esGrupoDe(c)) return (mio ? t.tu : nombreCorto(u.de)) + ': ' + cuerpo;
    return (mio ? '✓ ' : '') + cuerpo;
  };

  const alEscanear = ({ data }) => {
    const m = String(data || '').match(/^og:\/\/chat\/abrir\?con=(.+)$/);
    if (!m) return;
    hap(); setQr(null); setBusca(''); setGente(null);
    // se abre el hilo Y se ofrece guardarlo: escanear a alguien y que no quede
    // nada obliga a volver a buscar el papel del QR la próxima vez
    abrirPersona(decodeURIComponent(m[1]), true);
  };

  const guardarOfrecido = async () => {
    if (!ofrecido) return;
    try {
      await guardarContacto(ofrecido.correo, ofrecido.nombre, ofrecido.addr, account?.email);
      hap(); setOfrecido(null); toast(t.guardado);
    } catch { toast(t.noGuardo, 'error'); }
  };

  // ════ el candado ═════════════════════════════════════════════════════
  if (puerta !== 'abierta') {
    return (
      <View style={st.screen}>
        <Header title={t.marca} onBack={nav.back} />
        <View style={st.centro}>
          {puerta === 'mirando' ? (
            <><ActivityIndicator color={C.gold} size="large" /><Text style={st.espera}>{t.mirando}</Text></>
          ) : (
            <View style={st.gate}>
              <Text style={st.gateTit}>{t.gateTit}</Text>
              <Text style={st.gateTxt}>{t.gateTxt}</Text>
              <Pressable onPress={() => nav.go('kyc')}>
                <LinearGradient colors={G.gold} style={st.btnOro} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Text style={st.btnOroTxt}>{t.gateBtn}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ════ hilo abierto ═══════════════════════════════════════════════════
  if (con) {
    const conDias = []; let dPrev = '';
    for (const m of hilo) {
      const d = new Date(m.cuando).toDateString();
      if (d !== dPrev) { conDias.push({ sep: d, cuando: m.cuando }); dPrev = d; }
      conDias.push(m);
    }
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.screen}>
        <View style={st.cabHilo}>
          <Pressable onPress={() => { setCon(null); setHilo([]); setOfrecido(null); }} hitSlop={10}>
            <Text style={st.volver}>‹</Text>
          </Pressable>
          {/* en un grupo la cabecera es la puerta a su ficha: nombre, foto,
              miembros e invitación viven allí, no aquí */}
          <Pressable style={st.cabQuien} disabled={!enGrupo}
            onPress={() => { hap(); nav.go('auro-grupo', { id: destino }); }}>
            <Avatar nombre={con.nombre} correo={destino} foto={con.foto} grupo={enGrupo} tam={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.nom} numberOfLines={1}>{con.nombre}</Text>
              <Text style={st.mini} numberOfLines={1}>
                {enGrupo
                  ? (con.miembros ? con.miembros + ' ' + t.miembros : t.grupo)
                  : (con.addr ? '⛓ ' + con.addr.slice(0, 8) + '…' + con.addr.slice(-4) : con.correo)}
              </Text>
            </View>
          </Pressable>
          {/* El puente con la wallet: `avisarChat` es lo que hará que el
              comprobante caiga en ESTA conversación cuando la cadena confirme
              —nunca antes—. En un grupo el destino de cadena lo elige la
              persona en la pantalla de envío; el aviso ya sabe a dónde ir. */}
          <Pressable onPress={() => { hap(); nav.go('send', { to: con.addr || '', amount: '', avisarChat: destino }); }}>
            <LinearGradient colors={G.gold} style={st.btnOrigen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={st.btnOrigenTxt}>{t.origen}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* tras escanear: el ofrecimiento de guardarlo, arriba del hilo */}
        {!!ofrecido && (
          <Entrada style={st.guardaBar}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.guardaTit} numberOfLines={1}>{t.escaneaste} {ofrecido.nombre}</Text>
              <Text style={st.guardaTxt} numberOfLines={1}>{t.guardarTxt}</Text>
            </View>
            <Pressable onPress={guardarOfrecido}>
              <LinearGradient colors={G.gold} style={st.guardaBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={st.guardaBtnTxt}>{t.guardarBtn}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setOfrecido(null)} hitSlop={10}>
              <Icon name="close" size={17} color={C.txt3} />
            </Pressable>
          </Entrada>
        )}

        <FlatList
          ref={lista} data={conDias}
          keyExtractor={(m, i) => (m.sep ? 'd' + m.sep : (m.cuando || i) + '·' + (m.de || ''))}
          contentContainerStyle={{ padding: 14, gap: 4 }}
          onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            if (item.sep) return (
              <View style={st.dia}><Text style={st.diaTxt}>
                {new Date(item.cuando).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-HN', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text></View>
            );
            const mio = item.de === account?.email;
            // en un grupo cada burbuja ajena se firma; en un cara a cara no
            // hace falta decir quién habla, ya está en la cabecera
            const autor = enGrupo && !mio ? nombreCorto(item.de) : '';
            if (item.tipo === 'pago') return (
              <Entrada style={[st.linea, st.lineaPago, mio ? st.der : st.izq]}>
                <TarjetaPago m={item} mio={mio} autor={autor} t={t} toast={toast} />
              </Entrada>
            );
            const conAdj = !!item.archivo && ['imagen', 'video', 'archivo'].includes(item.tipo);
            return (
              <Entrada style={[st.linea, mio ? st.der : st.izq]}>
                <View style={[st.burbuja, mio ? st.mia : st.suya, item.fallo && { opacity: 0.45 }]}>
                  {!!autor && <Text style={st.autor}>{autor}</Text>}
                  {conAdj && item.tipo === 'imagen' && (
                    <Pressable onPress={() => { hap(); setFoto(M.urlArchivo(item.archivo)); }}>
                      <Image source={{ uri: M.urlArchivo(item.archivo) }} style={st.foto} resizeMode="cover" />
                    </Pressable>
                  )}
                  {conAdj && item.tipo !== 'imagen' && (
                    <Pressable style={st.adjCard} onPress={() => abrirAdjunto(item.archivo)}>
                      <Text style={st.adjIco}>{item.tipo === 'video' ? '🎬' : '📄'}</Text>
                      <Text style={[st.adjNom, mio && { color: '#3A2C08' }]} numberOfLines={2}>
                        {item.nombre || (item.tipo === 'video' ? t.ultVideo : t.ultArchivo)}
                      </Text>
                    </Pressable>
                  )}
                  {!!item.texto && <Text style={[st.msg, mio && { color: '#3A2C08' }]}>{item.texto}</Text>}
                  <Text style={[st.msgHora, mio && { color: 'rgba(58,44,8,0.55)' }]}>
                    {hora(item.cuando)}{mio ? (item.pendiente ? ' ·' : ' ✓') : ''}
                  </Text>
                </View>
              </Entrada>
            );
          }}
        />
        <View style={st.emojis}>
          {['👍', '🙏', '🎉', '💛', '😂', '🤝', '🔥', '✨', '💰', '🚀'].map((e) => (
            <Pressable key={e} onPress={() => setTexto((x) => x + e)} hitSlop={4}><Text style={st.emoji}>{e}</Text></Pressable>
          ))}
        </View>
        <View style={st.filaEscribe}>
          <Pressable onPress={() => { hap(); setHoja(true); }} disabled={subiendo} style={st.clip}>
            {subiendo ? <ActivityIndicator color={C.gold} size="small" /> : <Text style={st.clipTxt}>📎</Text>}
          </Pressable>
          <TextInput value={texto} onChangeText={setTexto} placeholder={t.escribe}
            placeholderTextColor={C.txt3} style={st.caja} onSubmitEditing={mandar} returnKeyType="send" multiline />
          <Pressable onPress={mandar}>
            <LinearGradient colors={G.gold} style={st.mandar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={st.mandarTxt}>↑</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* la hojita del clip: tres opciones y nada más */}
        <Modal visible={hoja} transparent animationType="fade" onRequestClose={() => setHoja(false)}>
          <Pressable style={st.veloBajo} onPress={() => setHoja(false)}>
            <View style={st.hoja}>
              <Pressable style={st.hojaBtn} onPress={elegirImagen}>
                <Text style={st.hojaIco}>🖼</Text><Text style={st.hojaTxt}>{t.adjImagen}</Text>
              </Pressable>
              <Pressable style={st.hojaBtn} onPress={elegirVideo}>
                <Text style={st.hojaIco}>🎬</Text><Text style={st.hojaTxt}>{t.adjVideo}</Text>
              </Pressable>
              <Pressable style={[st.hojaBtn, { borderBottomWidth: 0 }]} onPress={elegirArchivo}>
                <Text style={st.hojaIco}>📄</Text><Text style={st.hojaTxt}>{t.adjArchivo}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* imagen a pantalla completa; tocar en cualquier lado la cierra */}
        <Modal visible={!!foto} transparent animationType="fade" onRequestClose={() => setFoto(null)}>
          <Pressable style={st.fotoVelo} onPress={() => setFoto(null)}>
            {!!foto && <Image source={{ uri: foto }} style={st.fotoLlena} resizeMode="contain" />}
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  // ════ lista + directorio + QR ════════════════════════════════════════
  const filas = gente !== null ? gente : (convos || []);
  return (
    <View style={st.screen}>
      <Header title={t.marca} sub={t.sub} onBack={nav.back} right={(
        <View style={st.accesos}>
          <Pressable style={st.acceso} accessibilityRole="button" accessibilityLabel={t.nuevoGrupo}
            onPress={() => { hap(); nav.go('auro-nuevo'); }}>
            <Icon name="people" size={19} color={C.gold} />
            <Text style={st.masChico}>+</Text>
          </Pressable>
          <Pressable style={st.acceso} accessibilityRole="button" accessibilityLabel={t.ajustes}
            onPress={() => { hap(); nav.go('auro-ajustes'); }}>
            <Icon name="settings-sharp" size={19} color={C.gold} />
          </Pressable>
        </View>
      )} />
      <View style={{ paddingHorizontal: 16 }}>
        <TextInput value={busca} onChangeText={setBusca} placeholder={t.buscar}
          placeholderTextColor={C.txt3} style={st.busca} autoCapitalize="none" />
        <View style={st.qrFila}>
          <Pressable style={st.qrBtn} onPress={() => { hap(); setQr('mio'); }}>
            <Icon name="qr-code" size={14} color={C.goldLt} />
            <Text style={st.qrBtnTxt}>{t.miqr}</Text>
          </Pressable>
          <Pressable style={st.qrBtn} onPress={async () => {
            hap();
            if (!permiso?.granted) await pedirPermiso();
            setQr('scan');
          }}>
            {/* la retícula va como glifo: el set de iconos de la casa no
                tiene "escanear" y no se le añade uno por un botón */}
            <Text style={st.qrMira}>⌖</Text>
            <Text style={st.qrBtnTxt}>{t.escanear}</Text>
          </Pressable>
        </View>
      </View>
      {convos === null ? <ActivityIndicator color={C.gold} style={{ marginTop: 28 }} /> : (
        <FlatList
          data={filas} keyExtractor={(c) => idDe(c)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ListHeaderComponent={gente !== null ? <Text style={st.dir}>{t.dir}</Text> : null}
          ListEmptyComponent={<Text style={st.vacio}>{gente !== null ? t.nadie : t.vacio}</Text>}
          renderItem={({ item, index }) => {
            const grupo = esGrupoDe(item);
            return (
              // la cascada solo escalona las primeras filas: más abajo el
              // retraso se notaría como lentitud, no como elegancia
              <Entrada delay={Math.min(index, 7) * 45}>
                <Pressable style={st.fila} onPress={() => {
                  hap(); setBusca(''); setGente(null); setOfrecido(null);
                  setCon(grupo ? { ...item, esGrupo: true } : item);
                }}>
                  <Avatar nombre={item.nombre} correo={idDe(item)} foto={item.foto} grupo={grupo} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={st.filaSup}>
                      <Text style={st.nom} numberOfLines={1}>{item.nombre}</Text>
                      {!!item.ultimo && <Text style={st.hora}>{hora(item.ultimo.cuando)}</Text>}
                    </View>
                    <View style={st.filaSup}>
                      <Text style={[st.ult, item.sinLeer > 0 && st.ultVivo]} numberOfLines={1}>{resumen(item)}</Text>
                      {item.sinLeer > 0 && <View style={st.globo}><Text style={st.globoTxt}>{item.sinLeer}</Text></View>}
                    </View>
                  </View>
                </Pressable>
              </Entrada>
            );
          }}
        />
      )}

      {/* mi código / escanear */}
      <Modal visible={!!qr} transparent animationType="fade" onRequestClose={() => setQr(null)}>
        <Pressable style={st.velo} onPress={() => setQr(null)}>
          <View style={st.qrCaja}>
            {qr === 'mio' ? (
              <>
                <View style={st.qrBlanco}>
                  <QRCode value={aUri('chat/abrir', { con: account?.email })} size={210} color="#04211d" backgroundColor="#ffffff" ecl="M" />
                </View>
                <Text style={st.qrNota}>{t.qrTuyo}</Text>
              </>
            ) : (
              <>
                {permiso?.granted ? (
                  <CameraView style={st.camara} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={alEscanear} />
                ) : <ActivityIndicator color={C.gold} />}
                <Text style={st.qrNota}>{t.apunta}</Text>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  centro: { flex: 1, justifyContent: 'center', padding: 24 },
  espera: { color: C.txt3, textAlign: 'center', marginTop: 12 },
  gate: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 20 },
  gateTit: { color: C.goldLt, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  gateTxt: { color: C.txt2, fontSize: 13.5, lineHeight: 20, marginBottom: 16 },
  btnOro: { borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  btnOroTxt: { color: '#3A2C08', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 },
  accesos: { flexDirection: 'row', gap: 8 },
  acceso: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: C.line2, backgroundColor: 'rgba(201,169,97,0.07)', alignItems: 'center', justifyContent: 'center' },
  masChico: { position: 'absolute', top: 4, right: 5, color: C.goldHi, fontSize: 12, fontWeight: '900' },
  busca: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: C.txt, fontSize: 14 },
  qrFila: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 6 },
  qrBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 9 },
  qrBtnTxt: { color: C.goldLt, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  qrMira: { color: C.goldLt, fontSize: 15, lineHeight: 16 },
  dir: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 3, marginVertical: 8 },
  vacio: { color: C.txt3, fontSize: 13, lineHeight: 20, marginTop: 16, textAlign: 'center' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.08)' },
  filaSup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nom: { color: C.txt, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  hora: { color: C.txt3, fontSize: 10.5 },
  ult: { color: C.txt3, fontSize: 12.5, flexShrink: 1, marginTop: 2 },
  // con mensajes sin leer la última línea sube de tono: el globo dorado dice
  // cuántos, y el texto dice que están vivos sin tener que contarlos
  ultVivo: { color: C.txt2, fontWeight: '600' },
  globo: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  globoTxt: { color: '#3A2C08', fontSize: 11, fontWeight: '800' },
  cabHilo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line2 },
  cabQuien: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  volver: { color: C.gold, fontSize: 28, paddingHorizontal: 4, lineHeight: 30 },
  mini: { color: C.txt3, fontSize: 10.5 },
  btnOrigen: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8 },
  btnOrigenTxt: { color: '#3A2C08', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  guardaBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 10, padding: 11, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(201,169,97,0.09)' },
  guardaTit: { color: C.goldLt, fontSize: 13, fontWeight: '700' },
  guardaTxt: { color: C.txt3, fontSize: 11.5, marginTop: 1 },
  guardaBtn: { borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9 },
  guardaBtnTxt: { color: '#3A2C08', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  dia: { alignSelf: 'center', backgroundColor: 'rgba(110,147,143,0.14)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginVertical: 8 },
  diaTxt: { color: C.txt3, fontSize: 10.5 },
  // el lado lo pone la línea (la que se anima); la burbuja solo se ocupa de
  // su propia forma, así el comprobante puede ser más ancho que un texto
  linea: { maxWidth: '82%' },
  lineaPago: { maxWidth: '90%', minWidth: 244 },
  izq: { alignSelf: 'flex-start' },
  der: { alignSelf: 'flex-end' },
  burbuja: { borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8, marginVertical: 1.5 },
  mia: { backgroundColor: C.goldLt, borderBottomRightRadius: 5 },
  suya: { backgroundColor: C.panel2, borderBottomLeftRadius: 5 },
  autor: { color: C.gold, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  msg: { color: C.txt, fontSize: 14.5, lineHeight: 20 },
  msgHora: { color: C.txt3, fontSize: 9.5, alignSelf: 'flex-end', marginTop: 2 },
  pago: { borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(4,25,27,0.86)', overflow: 'hidden', marginVertical: 3, shadowColor: '#C9A961', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  pagoFilo: { height: 3, width: '100%' },
  pagoDentro: { paddingHorizontal: 15, paddingVertical: 13 },
  pagoVerbo: { color: C.gold, fontSize: 9.5, fontWeight: '800', letterSpacing: 2.2 },
  pagoFila: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginTop: 3 },
  pagoMonto: { color: C.goldHi, fontSize: 30, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  pagoMoneda: { color: C.gold, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.4, marginBottom: 4 },
  pagoNota: { color: C.txt2, fontSize: 13, lineHeight: 18, marginTop: 4 },
  pagoPie: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  pagoOk: { color: C.up, fontSize: 11.5, fontWeight: '700' },
  pagoHora: { color: C.txt3, fontSize: 10.5 },
  pagoLink: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(201,169,97,0.20)' },
  pagoLinkTxt: { color: C.gold, fontSize: 12, fontWeight: '700' },
  pagoHash: { color: C.txt3, fontSize: 10.5, flexShrink: 1, fontVariant: ['tabular-nums'] },
  emojis: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line2 },
  emoji: { fontSize: 21 },
  filaEscribe: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10, alignItems: 'flex-end' },
  clip: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  clipTxt: { fontSize: 19 },
  // la imagen adentro de la burbuja: ancho fijo cómodo, el server no manda
  // dimensiones así que un rectángulo estable evita saltos en el scroll
  foto: { width: 210, height: 210, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)' },
  adjCard: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4, maxWidth: 220 },
  adjIco: { fontSize: 26 },
  adjNom: { color: C.txt, fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  veloBajo: { flex: 1, backgroundColor: 'rgba(1,10,11,0.55)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: '#0A3436', borderWidth: 1, borderColor: C.line2, borderRadius: 18, margin: 12, marginBottom: 26, overflow: 'hidden' },
  hojaBtn: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.12)' },
  hojaIco: { fontSize: 21 },
  hojaTxt: { color: C.txt, fontSize: 14.5, fontWeight: '600' },
  fotoVelo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', alignItems: 'center', justifyContent: 'center' },
  fotoLlena: { width: '100%', height: '100%' },
  caja: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, color: C.txt, fontSize: 14.5, maxHeight: 110 },
  mandar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  mandarTxt: { color: '#3A2C08', fontSize: 18, fontWeight: '800' },
  velo: { flex: 1, backgroundColor: 'rgba(1,10,11,0.88)', alignItems: 'center', justifyContent: 'center' },
  qrCaja: { alignItems: 'center', padding: 20 },
  qrBlanco: { backgroundColor: '#fff', padding: 16, borderRadius: 18 },
  camara: { width: 260, height: 260, borderRadius: 18, overflow: 'hidden' },
  qrNota: { color: C.txt2, fontSize: 13, textAlign: 'center', marginTop: 14, maxWidth: 260 },
});
