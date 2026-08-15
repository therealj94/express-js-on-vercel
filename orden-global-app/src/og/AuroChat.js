// ═══ AURO CHAT ═════════════════════════════════════════════════════════
// La mensajería de Orden Global. Lo que la define:
//   · SOLO se abre con Genesis ID aprobado — es la red de gente real;
//   · personas Y grupos en la MISMA lista: un grupo es otra conversación,
//     no otra pantalla, porque así se usan de verdad;
//   · el pago vive DENTRO de la charla: un mensaje tipo:'pago' no se pinta
//     como texto sino como comprobante, con su hash y su enlace al
//     explorador. Eso es lo que ninguna otra mensajería puede enseñar;
//   · a alguien se le encuentra por el directorio (nombre, correo o su
//     GID de Genesis) o ESCANEANDO SU CÓDIGO, y
//     al escanear se ofrece guardarlo — un contacto que se pierde obliga a
//     volver a escanear, y eso ya no es una red;
//   · adjuntos (📎) ≤ 8 MB: el id largo del archivo ES su permiso.
// Sin cifrado de extremo a extremo en esta versión: no se promete en ningún
// texto de esta pantalla — y la verdad completa no se calla, vive en
// AjustesAuro → «Privacidad y seguridad», que es donde se va a buscarla.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet, Modal, Animated,
  ActivityIndicator, Image, Platform, BackHandler,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { C, G } from '../theme';
import { Header, Button3D, Avatar, useAccount, useToast, hap } from '../ui';
import { Icon } from '../icons';
import { useLang } from '../i18n';
import { PantallaConTeclado, useTeclado } from './Teclado';
import { genesis } from '../genesis';
import * as M from './mensajes';
import { aUri } from './rutas';
import { guardarContacto, renombrarContacto, eliminarContacto, leerLibreta, comoMapa } from './contactos';
import { reproducir } from './sonidos';

const TXT = {
  es: {
    marca: 'AURO CHAT', sub: 'Personas y grupos, con Genesis ID',
    buscar: 'Buscar por nombre, correo o GID…', dir: 'EN EL ECOSISTEMA',
    nadie: 'Nadie con ese nombre o GID todavía.',
    vacio: 'Aún no tienes conversaciones.',
    escribe: 'Escribe…', origen: 'ENVIAR ORIGEN', miqr: 'MI CÓDIGO', escanear: 'ESCANEAR',
    agregar: 'AGREGAR', ayer: 'ayer',
    ajustes: 'Mi perfil y ajustes', nuevoGrupo: 'Nuevo grupo',
    gateTit: 'El chat es de gente verificada',
    gateTxt: 'Para chatear necesitas tu Genesis ID aprobado. Así todos saben que del otro lado hay una persona real.',
    gateBtn: 'COMPLETAR MI GENESIS ID', mirando: 'Comprobando tu Genesis ID…',
    qrTuyo: 'Este es tu código. Quien lo escanee abre un chat contigo en AURO CHAT.',
    apunta: 'Apunta al código de la otra persona',
    adjImagen: 'Imagen', adjVideo: 'Video', adjArchivo: 'Archivo',
    ultImagen: 'Imagen', ultVideo: 'Video', ultArchivo: 'Archivo',
    grande: 'Pesa más de 8 MB. Comparte una versión más ligera.',
    noSubio: 'No se pudo subir. Revisa tu conexión e intenta de nuevo.',
    noAbre: 'No se pudo abrir el archivo.',
    tu: 'Tú', miembros: 'miembros', grupo: 'Grupo',
    escaneaste: 'Escaneaste a', guardarTxt: '¿Lo dejas guardado en tus contactos?',
    guardarBtn: 'AGREGAR CONTACTO', guardado: 'Guardado en tus contactos.',
    noGuardo: 'No se pudo guardar el contacto.',
    pagoEnviaste: 'ENVIASTE', pagoRecibiste: 'RECIBISTE', pagoEnvio: 'ENVIÓ',
    confirmado: 'confirmado', explorador: 'Ver en el explorador',
    editarNombre: 'Editar nombre', quitarLibreta: 'Eliminar de mi libreta',
    guardarNombre: 'GUARDAR', nombrePh: 'Nombre',
    renombrado: 'Nombre guardado en tu libreta.',
    eliminado: 'Se quitó de tu libreta.',
    editarNota: 'Así lo verás tú en tu libreta; su perfil no cambia.',
    fallo: 'No se envió', reintentar: 'Reintentar',
    nuevos: 'Mensajes nuevos ↓',
    sinRedT: 'Sin conexión',
    sinRedConvos: 'No pudimos traer tus conversaciones. Revisa tu conexión; tus chats siguen ahí.',
    sinRedHilo: 'No pudimos traer los mensajes de esta conversación.',
    sinRedBusca: 'La búsqueda no salió. Revisa tu conexión e intenta de nuevo.',
    reint: 'REINTENTAR', bannerRed: 'Sin conexión — reintentando…',
    // Culpar a la red cuando el servidor SÍ contestó —y contestó que esta
    // instalación no es la de antes— manda a la persona a revisar su wifi
    // durante horas. Se dice lo que pasa y dónde están sus mensajes.
    otraTit: 'Este chat quedó en tu instalación anterior',
    otraTxt: 'Tus conversaciones están a salvo en el servidor, pero esta instalación de la app todavía no puede abrirlas: la sesión del chat se quedó en la anterior. Estamos habilitando la recuperación; mientras tanto, el resto de la app funciona con normalidad.',
  },
  en: {
    marca: 'AURO CHAT', sub: 'People and groups, with Genesis ID',
    buscar: 'Search by name, email or GID…', dir: 'IN THE ECOSYSTEM',
    nadie: 'Nobody with that name or GID yet.',
    vacio: 'No conversations yet.',
    escribe: 'Type…', origen: 'SEND ORIGEN', miqr: 'MY CODE', escanear: 'SCAN',
    agregar: 'ADD', ayer: 'yesterday',
    ajustes: 'My profile and settings', nuevoGrupo: 'New group',
    gateTit: 'The chat is for verified people',
    gateTxt: 'You need your approved Genesis ID to chat. That way everyone knows there is a real person on the other side.',
    gateBtn: 'COMPLETE MY GENESIS ID', mirando: 'Checking your Genesis ID…',
    qrTuyo: 'This is your code. Whoever scans it opens a chat with you on AURO CHAT.',
    apunta: 'Point at the other person’s code',
    adjImagen: 'Image', adjVideo: 'Video', adjArchivo: 'File',
    ultImagen: 'Image', ultVideo: 'Video', ultArchivo: 'File',
    grande: 'It is over 8 MB. Share a lighter version.',
    noSubio: 'Upload failed. Check your connection and try again.',
    noAbre: 'Could not open the file.',
    tu: 'You', miembros: 'members', grupo: 'Group',
    escaneaste: 'You scanned', guardarTxt: 'Want to keep them in your contacts?',
    guardarBtn: 'ADD CONTACT', guardado: 'Saved to your contacts.',
    noGuardo: 'The contact could not be saved.',
    pagoEnviaste: 'YOU SENT', pagoRecibiste: 'YOU RECEIVED', pagoEnvio: 'SENT',
    confirmado: 'confirmed', explorador: 'View on the explorer',
    editarNombre: 'Edit name', quitarLibreta: 'Remove from my contacts',
    guardarNombre: 'SAVE', nombrePh: 'Name',
    renombrado: 'Name saved to your contacts.',
    eliminado: 'Removed from your contacts.',
    editarNota: 'This is how YOU will see them; their profile does not change.',
    fallo: 'Not sent', reintentar: 'Retry',
    nuevos: 'New messages ↓',
    sinRedT: 'No connection',
    sinRedConvos: 'We could not fetch your conversations. Check your connection; your chats are still there.',
    sinRedHilo: 'We could not fetch the messages of this conversation.',
    sinRedBusca: 'The search did not go through. Check your connection and try again.',
    reint: 'RETRY', bannerRed: 'Offline — retrying…',
    otraTit: 'This chat stayed in your previous install',
    otraTxt: 'Your conversations are safe on the server, but this install of the app cannot open them yet: the chat session stayed in the previous one. We are enabling recovery; meanwhile the rest of the app works normally.',
  },
};

// El relevo rechaza adjuntos de más de 8MB — mismo número aquí para avisar
// ANTES de gastar datos subiendo algo que va a rebotar.
const TOPE_ADJUNTO = 8_000_000;

// El explorador de la cadena. El comprobante no se cree a sí mismo: enseña el
// hash y lleva a donde cualquiera puede comprobarlo por su cuenta. La URL
// sale de expoConfig.extra —igual que la del relevo en mensajes.js— con el
// testnet solo como valor por defecto: el día que la cadena salga de testnet
// basta cambiar app.json y ningún comprobante viejo queda con el enlace roto.
const EXPLORADOR = ((Constants.expoConfig?.extra || {}).exploradorTx || 'https://testnet.ordenscan.com/tx/');

// La libreta del chat (og.contactos) se mudó a ./contactos.js: antes solo se
// ESCRIBÍA desde aquí y ninguna pantalla la leía. Ahora esta pantalla la lee
// —el nombre que tú le pusiste a alguien pinta encima del que esa persona se
// puso en el relevo— y Enviar la renombra cuando el pago nace de una charla.

// blob → base64 pelado (sin el prefijo data:...;base64,). FileReader existe
// en React Native y evita cargar el binario entero como string intermedio.
const blobABase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onerror = () => rej(new Error('lector'));
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.readAsDataURL(blob);
});

const hora = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
// El cuándo de la LISTA, dicho como lo diría una persona: la hora si fue hoy,
// «ayer», el día corto («lun») dentro de la semana y la fecha corta después.
// Dentro del hilo la hora exacta sí importa; aquí solo orienta.
const cuandoHumano = (ms, lang, ayer) => {
  const d = new Date(ms);
  const hoy = new Date();
  const dia0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia0(hoy) - dia0(d)) / 86400000);
  if (dias <= 0) return hora(ms);
  if (dias === 1) return ayer;
  const loc = lang === 'en' ? 'en-US' : 'es-HN';
  if (dias < 7) return d.toLocaleDateString(loc, { weekday: 'short' });
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
};
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

// El Avatar vive ahora en src/ui.js: estaba triplicado aquí, en GruposAuro y
// en AjustesAuro, y tres copias del mismo dibujo acaban pintando a la misma
// persona de tres maneras.

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
  const [pendientes, setPendientes] = useState([]);      // burbujas mías aún sin entrar (o fallidas)
  const [sinRed, setSinRed] = useState(false);           // el relevo no contesta: se DICE, no se finge vacío
  const [llaveOtra, setLlaveOtra] = useState(false);     // el relevo SÍ contesta: la llave quedó en la instalación anterior
  const reparando = useRef(false);                       // cerrojo: la reparación de la llave se intenta UNA vez
  const [buscaMal, setBuscaMal] = useState(false);       // la búsqueda falló por red, no por "nadie"
  const [nuevos, setNuevos] = useState(false);           // chip «mensajes nuevos ↓» si el scroll no está al fondo
  const [nombres, setNombres] = useState({});            // correo → nombre, para saber quién habla
  const [texto, setTexto] = useState('');
  const [qr, setQr] = useState(null);                    // 'mio' | 'scan' | null
  const [hoja, setHoja] = useState(false);               // la hojita del 📎
  const [subiendo, setSubiendo] = useState(false);
  const [foto, setFoto] = useState(null);                // url de imagen a pantalla completa
  const [ofrecido, setOfrecido] = useState(null);        // a quién ofrecemos guardar tras escanear
  const [libreta, setLibreta] = useState({});            // correo → ficha de MI libreta (og.contactos)
  const [menuContacto, setMenuContacto] = useState(null); // {correo, nombre, addr}: la hojita de mantener pulsado
  const [editar, setEditar] = useState(null);            // a quién se le edita el nombre
  const [nombreEd, setNombreEd] = useState('');          // el nombre en la hoja de editar
  const [permiso, pedirPermiso] = useCameraPermissions();
  const toast = useToast();
  const lista = useRef(null);
  const leido = useRef(false);
  const fotoConvos = useRef(null);                       // id → cuando del último; para oír solo lo NUEVO
  const alFondo = useRef(true);                          // ¿el scroll del hilo está pegado al final?
  const prevLargo = useRef(0);                           // cuántas filas tenía el hilo en el último repintado
  const enviando = useRef(false);                        // un envío en vuelo: no se dispara dos veces
  const destino = idDe(con);
  const enGrupo = esGrupoDe(con);
  const tecla = useTeclado();

  // Al abrirse el teclado la lista pierde alto por abajo, y el último
  // mensaje —que es el que se estaba leyendo— se queda fuera de cuadro. Se
  // vuelve al final en cuanto el teclado termina de subir. El retardo no es
  // capricho: sin él el desplazamiento se calcula con el alto viejo y la
  // lista se queda a media pantalla.
  useEffect(() => {
    if (!tecla.alto) return undefined;
    const id = setTimeout(() => {
      // solo si ya se estaba al fondo: abrir el teclado mientras se lee el
      // historial no debe robar el scroll igual que no lo roba el sondeo
      if (!alFondo.current) return;
      try { lista.current?.scrollToEnd({ animated: true }); } catch (e) {}
    }, 60);
    return () => clearTimeout(id);
  }, [tecla.alto]);

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

  // ── mi libreta: el nombre que YO le puse manda sobre el del relevo ──
  const cargarLibreta = useCallback(async () => {
    setLibreta(comoMapa(await leerLibreta().catch(() => [])));
  }, []);
  useEffect(() => { cargarLibreta(); }, [cargarLibreta]);

  // El nombre con el que se pinta a alguien: primero mi libreta, luego lo
  // que diga el relevo, y de último lo que va antes de la arroba.
  const nombreDe = useCallback((correo, delRelevo) => {
    const c = String(correo || '').toLowerCase();
    return (libreta[c] && libreta[c].nombre) || delRelevo || c.split('@')[0] || '?';
  }, [libreta]);

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
      // El tono suave del chat: solo cuando un mensaje AJENO llega estando
      // esta lista a la vista (el sondeo se detiene con un hilo abierto, así
      // que aquí nunca se suena encima de la conversación que se está
      // leyendo). La primera pasada solo toma la foto: el historial no suena.
      const mio = String(account?.email || '').toLowerCase();
      const previa = fotoConvos.current;
      const foto = {};
      let hayNuevo = false;
      for (const c of cs) {
        const u = c.ultimo;
        const cuando = u ? Number(u.cuando) || 0 : 0;
        foto[idDe(c)] = cuando;
        if (previa && u && c.sinLeer > 0 && String(u.de || '').toLowerCase() !== mio
          && cuando > (previa[idDe(c)] || 0)) hayNuevo = true;
      }
      fotoConvos.current = foto;
      if (hayNuevo) reproducir('recibido', { suave: true });
      // Salió bien: se apagan los DOS avisos, o el de la llave se quedaría
      // pegado en pantalla después de recuperarse.
      setSinRed(false); setLlaveOtra(false);
    } catch (e) {
      // Sin red NO se finge una lista vacía: `convos` se queda como estaba
      // (null pinta el estado de «sin conexión», nunca el «aún no tienes
      // conversaciones») y el banner avisa mientras el sondeo reintenta.
      //
      // Pero hay un fallo que NO es la red y que estaba disfrazado de red: al
      // reinstalar la app se borra el almacén seguro, y con él la llave del
      // chat. El correo sigue reclamado por la instalación anterior, así que
      // el relevo contesta 401 (llave que no coincide) o 409 (ese correo ya
      // tiene llave). Decirle «revisa tu conexión» a alguien con wifi perfecto
      // lo manda a pelear con su router durante horas. Se distingue.
      if (e && (e.code === 401 || e.code === 409)) {
        // Un 401 casi siempre es una llave local que el relevo no reconoce
        // (cambio de cuenta, o un alta que no se llegó a completar). Eso se
        // arregla SOLO: se tira la llave y se pide una nueva. Se intenta UNA
        // vez —con `reparando` de cerrojo— para no entrar en bucle si el
        // correo de verdad tiene otro dueño; en ese caso el relevo responde
        // 409 y ahí sí toca decírselo a la persona.
        if (e.code === 401 && !reparando.current && account?.email) {
          reparando.current = true;
          try {
            await M.rehacerAlta(account);
            await traerConvos();          // con la llave nueva, otra vez
            return;
          } catch (e2) {
            if (!(e2 && e2.code === 409)) { setSinRed(true); return; }
          }
        }
        setLlaveOtra(true);
      } else setSinRed(true);
    }
  }, [aprenderNombres, account?.email]);
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
      // /ficha ya devuelve gid: con él la cabecera del hilo firma a la
      // persona con su Genesis ID pequeño debajo del nombre.
      const lleno = { correo, nombre: f.nombre || base.nombre, addr: f.addr || '', foto: f.foto || '', gid: f.gid || '' };
      setCon((x) => (x && x.correo === correo ? { ...x, ...lleno } : x));
      setOfrecido((x) => (x && x.correo === correo ? { ...x, ...lleno } : x));
      aprenderNombres([[correo, lleno.nombre]]);
    } catch {}
  }, [aprenderNombres]);

  // llegar con ?con=correo (del QR o del asistente) abre el hilo directo.
  // Y si además viene ?txt= (el mensaje DICTADO a NEXUS: «…que diga llego en
  // diez minutos»), el texto se deja ESCRITO en la caja, jamás enviado: José
  // lo pidió con todas las letras — «solo toque enviar». El último control
  // sobre lo que sale de su teléfono es su dedo, no el asistente.
  useEffect(() => {
    if (params?.con && puerta === 'abierta') {
      abrirPersona(params.con);
      if (params?.txt) setTexto(String(params.txt));
    }
  }, [params?.con, params?.txt, puerta, abrirPersona]);

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

  // La ficha del cara a cara: un hilo abierto desde la LISTA llega sin gid
  // (la fila de conversaciones no lo trae) y la cabecera lo quiere pequeño
  // bajo el nombre. Se pide una sola vez por hilo; abrirPersona ya lo hace
  // por su cuenta y entonces `con.gid` existe y esto no dispara.
  useEffect(() => {
    if (!destino || enGrupo || con?.gid !== undefined) return;
    let vivo = true;
    M.ficha(destino).then((f) => {
      if (!vivo || !f) return;
      setCon((x) => (x && idDe(x) === destino
        ? { ...x, nombre: f.nombre || x.nombre, addr: f.addr || x.addr || '', foto: x.foto || f.foto || '', gid: f.gid || '' }
        : x));
    }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino, enGrupo]);

  useEffect(() => {
    if (busca.trim().length < 2) { setGente(null); return; }
    const r = setTimeout(async () => {
      // Sin red la búsqueda NO dice «nadie con ese nombre» — eso sería
      // afirmar algo que el relevo nunca contestó. `buscaMal` pinta la verdad.
      try { const d = await M.buscar(busca.trim()); setGente(d.gente || []); setBuscaMal(false); }
      catch { setGente([]); setBuscaMal(true); }
    }, 350);
    return () => clearTimeout(r);
  }, [busca]);

  const traerHilo = useCallback(async () => {
    if (!destino) return;
    try {
      const d = await M.bandeja(destino);
      setHilo(d.mensajes || []);
      setSinRed(false);
      if (!leido.current) { leido.current = true; M.leido(destino).catch(() => {}); }
    } catch {
      // El catch vacío dejaba la pantalla en blanco sin decir por qué. Ahora
      // `sinRed` pinta el aviso y el sondeo de 3s sigue reintentando solo.
      setSinRed(true);
    }
  }, [destino]);
  useEffect(() => {
    if (!destino) return;
    leido.current = false;
    // hilo nuevo, scroll nuevo: se arranca pegado al fondo y sin chip
    alFondo.current = true;
    prevLargo.current = 0;
    setNuevos(false);
    traerHilo();
    const r = setInterval(traerHilo, 3000);
    return () => clearInterval(r);
  }, [destino, traerHilo]);

  // El botón ATRÁS de Android dentro de una conversación vuelve a la LISTA,
  // no afuera de AURO CHAT: el hilo no es una ruta del router (vive en el
  // estado `con`), así que sin esto el handler global de App.js hacía pop de
  // 'chat' entero — en WhatsApp atrás = lista, y esa es la expectativa.
  // Misma convención de la casa que ExplorarPay y NegocioPanel: el listener
  // más reciente gana al global mientras haya hilo abierto.
  useEffect(() => {
    if (Platform.OS !== 'android' || !con) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setCon(null); setHilo([]); setPendientes([]); setOfrecido(null);
      return true;
    });
    return () => sub.remove();
  }, [con]);

  // Enviar sin que el texto pueda perderse JAMÁS. Tres reglas:
  //   · la burbuja optimista vive en `pendientes`, NO en `hilo`: el sondeo de
  //     3s puede reemplazar el hilo entero sin llevársela;
  //   · la caja no se vacía hasta que el envío ENTRA en el relevo;
  //   · si falla, la burbuja queda en rojo con «Reintentar» al toque.
  const mandar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo || !destino || enviando.current) return;
    enviando.current = true;
    const mio = {
      idLocal: 'p' + Date.now() + Math.random().toString(36).slice(2, 6),
      de: account.email, texto: cuerpo, cuando: Date.now(), pendiente: true,
    };
    setPendientes((p) => [...p, mio]);
    try {
      await M.enviar(destino, cuerpo);
      // solo AHORA se vacía la caja — y sin pisar lo que se haya tecleado
      // encima mientras el envío viajaba
      setTexto((x) => (x.trim() === cuerpo ? '' : x));
      await traerHilo();
      setPendientes((p) => p.filter((x) => x.idLocal !== mio.idLocal));
    } catch {
      // la burbuja roja conserva el texto y ofrece reintentar: la caja se
      // libera para lo siguiente, el mensaje ya no puede desaparecer
      setPendientes((p) => p.map((x) => (x.idLocal === mio.idLocal ? { ...x, pendiente: false, fallo: true } : x)));
      setTexto((x) => (x.trim() === cuerpo ? '' : x));
    } finally { enviando.current = false; }
  };

  const reintentar = async (m) => {
    hap();
    setPendientes((p) => p.map((x) => (x.idLocal === m.idLocal ? { ...x, pendiente: true, fallo: false } : x)));
    try {
      await M.enviar(destino, m.texto);
      await traerHilo();
      setPendientes((p) => p.filter((x) => x.idLocal !== m.idLocal));
    } catch {
      setPendientes((p) => p.map((x) => (x.idLocal === m.idLocal ? { ...x, pendiente: false, fallo: true } : x)));
    }
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

  // Quién habla, en corto. Primero MI libreta (el nombre que yo le puse),
  // luego los nombres aprendidos de las charlas y de la ficha del grupo;
  // mientras no se sepa el de alguien se usa lo que va antes de la arroba —
  // feo, pero nunca deja una frase sin dueño.
  const nombreCorto = (correo) => {
    const c = String(correo || '').toLowerCase();
    const n = (libreta[c] && libreta[c].nombre) || nombres[c];
    return (n || c.split('@')[0]).split(' ')[0];
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
    const s = String(data || '');
    const persona = s.match(/^og:\/\/chat\/abrir\?con=(.+)$/);
    if (persona) {
      hap(); setQr(null); setBusca(''); setGente(null);
      // se abre el hilo Y se ofrece guardarlo: escanear a alguien y que no
      // quede nada obliga a volver a buscar el papel del QR la próxima vez
      abrirPersona(decodeURIComponent(persona[1]), true);
      return;
    }
    // El QR de invitación de un grupo (GruposAuro) es og://chat/grupo?inv=…:
    // el escáner interno lo acepta igual que la cámara del teléfono — antes
    // solo entendía chat/abrir y la invitación escaneada moría en silencio.
    const grupo = s.match(/^og:\/\/chat\/grupo\?inv=(.+)$/);
    if (grupo) {
      hap(); setQr(null); setBusca(''); setGente(null);
      nav.go('auro-grupo', { inv: decodeURIComponent(grupo[1]) });
    }
  };

  const guardarOfrecido = async () => {
    if (!ofrecido) return;
    try {
      await guardarContacto(ofrecido.correo, ofrecido.nombre, ofrecido.addr, account?.email);
      hap(); setOfrecido(null); toast(t.guardado);
      cargarLibreta();
    } catch { toast(t.noGuardo, 'error'); }
  };

  // AGREGAR desde el buscador: UN toque y la persona queda en la libreta del
  // chat (og.contactos) Y —si su ficha trae dirección de cadena— en la de la
  // wallet, porque guardarContacto ya hace los dos asientos de un solo
  // guardado. Un contacto que solo existe en una de las dos libretas acaba
  // contando historias distintas en Enviar y en el chat.
  const agregarBuscado = async (p) => {
    try {
      await guardarContacto(p.correo, p.nombre, p.addr, account?.email);
      hap(); toast(t.guardado);
      cargarLibreta();
    } catch { toast(t.noGuardo, 'error'); }
  };

  // ── editar nombre / eliminar de mi libreta ────────────────────────────
  // La hojita sale de mantener pulsado un contacto en la lista o de tocar la
  // cabecera de un hilo 1 a 1 (en un grupo la cabecera abre su ficha).
  const abrirMenuContacto = (correo, delRelevo, addr) => {
    const c = String(correo || '').toLowerCase();
    if (!c || M.esGrupo(c)) return;
    hap();
    setMenuContacto({ correo: c, nombre: nombreDe(c, delRelevo), addr: addr || (libreta[c] && libreta[c].addr) || '' });
  };

  const renombrar = async () => {
    const n = nombreEd.trim();
    if (!n || !editar) return;
    try {
      await renombrarContacto(editar.correo, n, editar.addr, account?.email);
      hap(); setEditar(null); toast(t.renombrado);
      cargarLibreta(); // el hilo y la lista se repintan solos con el nombre nuevo
    } catch { toast(t.noGuardo, 'error'); }
  };

  const quitarDeLibreta = async () => {
    if (!menuContacto) return;
    try {
      await eliminarContacto(menuContacto.correo, account?.email);
      hap(); setMenuContacto(null); toast(t.eliminado);
      cargarLibreta();
    } catch { toast(t.noGuardo, 'error'); }
  };

  // Las dos hojas del contacto viven en una sola pieza porque se llegan a
  // ellas desde DOS pantallas de este mismo fichero: la lista (mantener
  // pulsada una fila) y el hilo (tocar la cabecera).
  const hojasContacto = (
    <>
      {/* la hojita: editar nombre / eliminar de mi libreta */}
      <Modal visible={!!menuContacto} transparent animationType="fade" onRequestClose={() => setMenuContacto(null)}>
        <Pressable style={st.veloBajo} onPress={() => setMenuContacto(null)}>
          <View style={st.hoja}>
            <View style={st.menuQuien}>
              <Avatar nombre={menuContacto?.nombre} correo={menuContacto?.correo || ''} tam={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.nom} numberOfLines={1}>{menuContacto?.nombre}</Text>
                <Text style={st.mini} numberOfLines={1}>{menuContacto?.correo}</Text>
              </View>
            </View>
            <Pressable style={st.hojaBtn} onPress={() => {
              hap(); setNombreEd(menuContacto?.nombre || ''); setEditar(menuContacto); setMenuContacto(null);
            }}>
              <Icon name="create" size={19} color={C.gold} />
              <Text style={st.hojaTxt}>{t.editarNombre}</Text>
            </Pressable>
            <Pressable style={[st.hojaBtn, { borderBottomWidth: 0 }]} onPress={quitarDeLibreta}>
              <Icon name="trash" size={19} color={C.down} />
              <Text style={[st.hojaTxt, { color: C.down }]}>{t.quitarLibreta}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* la hoja pequeña de renombrar */}
      <Modal visible={!!editar} transparent animationType="fade" onRequestClose={() => setEditar(null)}>
        <Pressable style={st.velo} onPress={() => setEditar(null)}>
          <Pressable style={st.editCaja} onPress={() => {}}>
            <Text style={st.editTit}>{t.editarNombre}</Text>
            <Text style={st.mini} numberOfLines={1}>{editar?.correo}</Text>
            <TextInput value={nombreEd} onChangeText={setNombreEd} placeholder={t.nombrePh}
              placeholderTextColor={C.txt3} style={st.editInput} autoFocus maxLength={60}
              onSubmitEditing={renombrar} returnKeyType="done" />
            <Text style={st.editNota}>{t.editarNota}</Text>
            <Button3D title={t.guardarNombre} onPress={renombrar} disabled={!nombreEd.trim()} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

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
              {/* el mismo Button3D de la casa que usa GruposAuro para este
                  mismo CTA: dos pantallas, un solo botón */}
              <Button3D title={t.gateBtn} onPress={() => nav.go('kyc')} />
            </View>
          )}
        </View>
      </View>
    );
  }

  // ════ hilo abierto ═══════════════════════════════════════════════════
  if (con) {
    // Los pendientes/fallidos se FUSIONAN al final del hilo del relevo: así
    // el sondeo puede reemplazar `hilo` completo sin llevarse ninguna burbuja
    // mía que todavía no entró (o que falló y espera su reintento).
    const todos = hilo.concat(pendientes);
    const conDias = []; let dPrev = '';
    for (const m of todos) {
      const d = new Date(m.cuando).toDateString();
      if (d !== dPrev) { conDias.push({ sep: d, cuando: m.cuando }); dPrev = d; }
      conDias.push(m);
    }
    return (
      // El hilo NO es un formulario: aquí no se desplaza la pantalla entera,
      // se ENCOGE. La cabecera se queda arriba, la lista cede el alto que
      // ocupa el teclado y la caja de escribir queda pegada justo encima de
      // las teclas —que es donde José espera verla mientras escribe—. De eso
      // se encarga `desplaza={false}`: KeyboardAvoidingView manda sobre el
      // alto y la FlatList, al ser el único hijo con flex:1, es la que paga.
      <PantallaConTeclado desplaza={false} style={st.screen}>
        <View style={st.cabHilo}>
          <Pressable onPress={() => { setCon(null); setHilo([]); setPendientes([]); setOfrecido(null); }} hitSlop={10}>
            <Text style={st.volver}>‹</Text>
          </Pressable>
          {/* en un grupo la cabecera es la puerta a su ficha: nombre, foto,
              miembros e invitación viven allí, no aquí. En un cara a cara la
              cabecera abre la hojita del contacto: editar su nombre en MI
              libreta o quitarlo de ella. */}
          <Pressable style={st.cabQuien}
            onPress={() => {
              if (enGrupo) { hap(); nav.go('auro-grupo', { id: destino }); }
              else abrirMenuContacto(destino, con.nombre, con.addr);
            }}>
            <Avatar nombre={enGrupo ? con.nombre : nombreDe(destino, con.nombre)} correo={destino} foto={con.foto} grupo={enGrupo} tam={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.nom} numberOfLines={1}>{enGrupo ? con.nombre : nombreDe(destino, con.nombre)}</Text>
              {/* la seña bajo el nombre: primero el GID (la identidad de la
                  casa), luego la cadena, y el correo solo si no hay más */}
              <Text style={st.mini} numberOfLines={1}>
                {enGrupo
                  ? (con.miembros ? con.miembros + ' ' + t.miembros : t.grupo)
                  : (con.gid || (con.addr ? '⛓ ' + con.addr.slice(0, 8) + '…' + con.addr.slice(-4) : con.correo))}
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

        {/* el relevo no contesta pero hay historial: banner, como WhatsApp */}
        {sinRed && todos.length > 0 && (
          <View style={st.bannerRed}>
            <Icon name="cloud-offline" size={13} color="#fff" />
            <Text style={st.bannerRedTxt}>{t.bannerRed}</Text>
          </View>
        )}

        <FlatList
          ref={lista} data={conDias}
          keyExtractor={(m, i) => (m.sep ? 'd' + m.sep : m.idLocal || ((m.cuando || i) + '·' + (m.de || '')))}
          contentContainerStyle={{ padding: 14, gap: 4 }}
          // Sin esto, con el teclado abierto el primer toque en un
          // comprobante solo cierra el teclado: había que tocar dos veces
          // para abrir el explorador.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // ¿Dónde anda el scroll? Si está pegado al fondo, un mensaje nuevo
          // sí desplaza; si se está leyendo el historial, NO se roba el
          // scroll: sale el chip «mensajes nuevos ↓» (como WhatsApp).
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const fondo = contentOffset.y + layoutMeasurement.height >= contentSize.height - 60;
            alFondo.current = fondo;
            if (fondo && nuevos) setNuevos(false);
          }}
          scrollEventThrottle={90}
          onContentSizeChange={() => {
            if (alFondo.current) lista.current?.scrollToEnd({ animated: true });
            else if (conDias.length > prevLargo.current) setNuevos(true);
            prevLargo.current = conDias.length;
          }}
          // Sin mensajes hay dos verdades distintas: conversación nueva
          // (nada que decir) o SIN RED (se dice y se ofrece reintentar).
          ListEmptyComponent={sinRed ? (
            <View style={st.redCaja}>
              <Icon name="cloud-offline" size={22} color={C.down} />
              <Text style={st.redTit}>{t.sinRedT}</Text>
              <Text style={st.redTxt}>{t.sinRedHilo}</Text>
              <Pressable style={st.redBtn} onPress={() => { hap(); traerHilo(); }}>
                <Text style={st.redBtnTxt}>{t.reint}</Text>
              </Pressable>
            </View>
          ) : null}
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
                {/* Un envío fallido NO se desvanece: burbuja marcada en rojo
                    con «Reintentar» al toque — el texto nunca se pierde. */}
                <View style={[st.burbuja, mio ? st.mia : st.suya, item.fallo && st.burbujaFallo]}>
                  {!!autor && <Text style={st.autor}>{autor}</Text>}
                  {conAdj && item.tipo === 'imagen' && (
                    <Pressable onPress={() => { hap(); setFoto(M.urlArchivo(item.archivo)); }}>
                      <Image source={{ uri: M.urlArchivo(item.archivo) }} style={st.foto} resizeMode="cover" />
                    </Pressable>
                  )}
                  {conAdj && item.tipo !== 'imagen' && (
                    <Pressable style={st.adjCard} onPress={() => abrirAdjunto(item.archivo)}>
                      <Icon name={item.tipo === 'video' ? 'videocam' : 'document-text'} size={24}
                        color={mio ? '#3A2C08' : C.gold} />
                      <Text style={[st.adjNom, mio && { color: '#3A2C08' }]} numberOfLines={2}>
                        {item.nombre || (item.tipo === 'video' ? t.ultVideo : t.ultArchivo)}
                      </Text>
                    </Pressable>
                  )}
                  {!!item.texto && <Text style={[st.msg, mio && { color: item.fallo ? C.txt : '#3A2C08' }]}>{item.texto}</Text>}
                  {item.fallo ? (
                    <Pressable onPress={() => reintentar(item)} hitSlop={8} style={st.reintentar}>
                      <Icon name="refresh" size={12} color={C.down} />
                      <Text style={st.reintentarTxt}>{t.fallo} · {t.reintentar}</Text>
                    </Pressable>
                  ) : (
                    <Text style={[st.msgHora, mio && { color: 'rgba(58,44,8,0.55)' }]}>
                      {hora(item.cuando)}{mio ? (item.pendiente ? ' ·' : ' ✓') : ''}
                    </Text>
                  )}
                </View>
              </Entrada>
            );
          }}
        />
        {/* el chip que avisa sin robar el scroll: tocarlo baja al final */}
        {nuevos && (
          <Pressable style={st.chipNuevos} onPress={() => {
            hap(); setNuevos(false); alFondo.current = true;
            try { lista.current?.scrollToEnd({ animated: true }); } catch (e) {}
          }}>
            <Text style={st.chipNuevosTxt}>{t.nuevos}</Text>
          </Pressable>
        )}
        <View style={st.emojis}>
          {['👍', '🙏', '🎉', '💛', '😂', '🤝', '🔥', '✨', '💰', '🚀'].map((e) => (
            <Pressable key={e} onPress={() => setTexto((x) => x + e)} hitSlop={4}><Text style={st.emoji}>{e}</Text></Pressable>
          ))}
        </View>
        <View style={st.filaEscribe}>
          {/* el clip es del set de la casa: el emoji 📎 salía a color en
              Android y desentonaba con la paleta oro/verde */}
          <Pressable onPress={() => { hap(); setHoja(true); }} disabled={subiendo} style={st.clip}>
            {subiendo ? <ActivityIndicator color={C.gold} size="small" /> : <Icon name="attach" size={20} color={C.goldLt} />}
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
              {/* iconos de la casa, no emojis: en Android el emoji sale a
                  color y rompe la paleta oro/verde de toda la hojita */}
              <Pressable style={st.hojaBtn} onPress={elegirImagen}>
                <Icon name="image" size={20} color={C.gold} /><Text style={st.hojaTxt}>{t.adjImagen}</Text>
              </Pressable>
              <Pressable style={st.hojaBtn} onPress={elegirVideo}>
                <Icon name="videocam" size={20} color={C.gold} /><Text style={st.hojaTxt}>{t.adjVideo}</Text>
              </Pressable>
              <Pressable style={[st.hojaBtn, { borderBottomWidth: 0 }]} onPress={elegirArchivo}>
                <Icon name="document-text" size={20} color={C.gold} /><Text style={st.hojaTxt}>{t.adjArchivo}</Text>
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

        {hojasContacto}
      </PantallaConTeclado>
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
            {/* 'scan' existe en el set desde 1.10 (la pestaña Pagar lo usa):
                el glifo ⌖ salía con otra fuente y otro grosor que el resto */}
            <Icon name="scan" size={14} color={C.goldLt} />
            <Text style={st.qrBtnTxt}>{t.escanear}</Text>
          </Pressable>
        </View>
      </View>
      {/* el relevo no contesta pero hay lista vieja a la vista: banner */}
      {sinRed && convos !== null && (
        <View style={st.bannerRed}>
          <Icon name="cloud-offline" size={13} color="#fff" />
          <Text style={st.bannerRedTxt}>{t.bannerRed}</Text>
        </View>
      )}
      {convos === null ? (
        // Nunca se ha podido leer el relevo: sin red se DICE (con reintentar),
        // no se pinta el «aún no tienes conversaciones» de una cuenta nueva.
        llaveOtra ? (
          // El relevo contestó: no es la red. Se dice lo que pasa y —lo que
          // más importa— que los mensajes NO se perdieron.
          <View style={st.redCaja}>
            <Icon name="key" size={22} color={C.gold} />
            <Text style={st.redTit}>{t.otraTit}</Text>
            <Text style={st.redTxt}>{t.otraTxt}</Text>
          </View>
        ) : sinRed ? (
          <View style={st.redCaja}>
            <Icon name="cloud-offline" size={22} color={C.down} />
            <Text style={st.redTit}>{t.sinRedT}</Text>
            <Text style={st.redTxt}>{t.sinRedConvos}</Text>
            <Pressable style={st.redBtn} onPress={() => { hap(); traerConvos(); }}>
              <Text style={st.redBtnTxt}>{t.reint}</Text>
            </Pressable>
          </View>
        ) : <ActivityIndicator color={C.gold} style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={filas} keyExtractor={(c) => idDe(c)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ListHeaderComponent={gente !== null ? <Text style={st.dir}>{t.dir}</Text> : null}
          ListEmptyComponent={<Text style={st.vacio}>{gente !== null ? (buscaMal ? t.sinRedBusca : t.nadie) : t.vacio}</Text>}
          renderItem={({ item, index }) => {
            const grupo = esGrupoDe(item);
            const enBusca = gente !== null;
            const yaMio = enBusca && !!libreta[String(idDe(item)).toLowerCase()];
            return (
              // la cascada solo escalona las primeras filas: más abajo el
              // retraso se notaría como lentitud, no como elegancia
              <Entrada delay={Math.min(index, 7) * 45}>
                <Pressable style={st.fila} onPress={() => {
                  hap(); setBusca(''); setGente(null); setOfrecido(null);
                  setCon(grupo ? { ...item, esGrupo: true } : item);
                }}
                  // mantener pulsada a una persona abre su hojita: editar el
                  // nombre con el que YO la veo, o quitarla de mi libreta
                  onLongPress={grupo ? undefined : () => abrirMenuContacto(idDe(item), item.nombre, item.addr)}
                  delayLongPress={350}>
                  <Avatar nombre={grupo ? item.nombre : nombreDe(idDe(item), item.nombre)} correo={idDe(item)} foto={item.foto} grupo={grupo} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={st.filaSup}>
                      <Text style={st.nom} numberOfLines={1}>{grupo ? item.nombre : nombreDe(idDe(item), item.nombre)}</Text>
                      {!enBusca && !!item.ultimo && <Text style={st.hora}>{cuandoHumano(item.ultimo.cuando, lang, t.ayer)}</Text>}
                    </View>
                    {enBusca ? (
                      // el resultado enseña SOLO el nombre; debajo, pequeño,
                      // su GID — y el correo únicamente cuando no tiene GID.
                      // El correo en grande convertía el directorio en una
                      // guía telefónica; el nombre es lo que se busca.
                      <Text style={[st.mini, { marginTop: 2 }]} numberOfLines={1}>{item.gid || item.correo}</Text>
                    ) : (
                      <View style={st.filaSup}>
                        <Text style={[st.ult, item.sinLeer > 0 && st.ultVivo]} numberOfLines={1}>{resumen(item)}</Text>
                        {item.sinLeer > 0 && <View style={st.globo}><Text style={st.globoTxt}>{item.sinLeer}</Text></View>}
                      </View>
                    )}
                  </View>
                  {/* AGREGAR guarda en mis dos libretas de un toque; si ya es
                      mío, la marca lo dice y no se ofrece guardarlo de nuevo */}
                  {enBusca && (yaMio ? (
                    <Icon name="checkmark-circle" size={20} color={C.up} />
                  ) : (
                    <Pressable onPress={() => agregarBuscado(item)} hitSlop={6}>
                      <LinearGradient colors={G.gold} style={st.guardaBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <Text style={st.guardaBtnTxt}>{t.agregar}</Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
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

      {hojasContacto}
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
  accesos: { flexDirection: 'row', gap: 8 },
  acceso: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: C.line2, backgroundColor: 'rgba(201,169,97,0.07)', alignItems: 'center', justifyContent: 'center' },
  masChico: { position: 'absolute', top: 4, right: 5, color: C.goldHi, fontSize: 12, fontWeight: '900' },
  busca: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: C.txt, fontSize: 14 },
  qrFila: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 6 },
  qrBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 9 },
  qrBtnTxt: { color: C.goldLt, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  dir: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 3, marginVertical: 8 },
  // ── los estados de red honestos ──
  // El banner dice «sin conexión» ENCIMA de lo ya cargado (que sigue siendo
  // legible); la caja roja es para cuando no hay nada que enseñar y lo único
  // honesto es decirlo y ofrecer reintentar.
  bannerRed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#8A2A21', paddingVertical: 5 },
  bannerRedTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  redCaja: { alignItems: 'center', gap: 6, marginTop: 30, marginHorizontal: 24, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(240,119,107,0.35)', backgroundColor: 'rgba(52,20,18,0.35)' },
  redTit: { color: C.txt, fontWeight: '800', fontSize: 14.5 },
  redTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  redBtn: { marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9 },
  redBtnTxt: { color: C.goldLt, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
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
  // el envío fallido se marca, no se desvanece: borde y fondo rojizos con el
  // texto legible, y debajo su «Reintentar»
  burbujaFallo: { backgroundColor: 'rgba(52,20,18,0.55)', borderWidth: 1.5, borderColor: 'rgba(240,119,107,0.6)' },
  reintentar: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-end' },
  reintentarTxt: { color: C.down, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  // el chip que baja al final sin robar el scroll mientras se lee historial
  chipNuevos: { alignSelf: 'center', marginTop: 2, marginBottom: 4, backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, shadowColor: '#C9A961', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  chipNuevosTxt: { color: '#3A2C08', fontSize: 11.5, fontWeight: '800' },
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
  // la imagen adentro de la burbuja: ancho fijo cómodo, el server no manda
  // dimensiones así que un rectángulo estable evita saltos en el scroll
  foto: { width: 210, height: 210, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)' },
  adjCard: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4, maxWidth: 220 },
  adjNom: { color: C.txt, fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  veloBajo: { flex: 1, backgroundColor: 'rgba(1,10,11,0.55)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: '#0A3436', borderWidth: 1, borderColor: C.line2, borderRadius: 18, margin: 12, marginBottom: 26, overflow: 'hidden' },
  hojaBtn: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.12)' },
  hojaTxt: { color: C.txt, fontSize: 14.5, fontWeight: '600' },
  // la hojita del contacto: quién es arriba, sus dos acciones debajo
  menuQuien: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.18)', backgroundColor: 'rgba(201,169,97,0.06)' },
  // la hoja pequeña de renombrar, centrada: es un solo campo y un botón
  editCaja: { alignSelf: 'stretch', marginHorizontal: 26, backgroundColor: '#0A3436', borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 18 },
  editTit: { color: C.goldLt, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  editInput: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 11, color: C.txt, fontSize: 14.5, marginTop: 12 },
  editNota: { color: C.txt3, fontSize: 11.5, lineHeight: 16, marginTop: 8, marginBottom: 12 },
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
