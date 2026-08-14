// El chat de Orden Global, con las reglas pedidas:
//   · SOLO se abre con Genesis ID verificado — es la red de gente real;
//   · a alguien se le encuentra por el directorio, o ESCANEANDO SU CÓDIGO:
//     cada quien tiene su QR (og://chat/abrir?con=correo) y al escanearlo
//     se abre el hilo y queda el contacto;
//   · conversaciones con no-leídos, hilo con días y horas, emojis, y
//     ENVIAR ORIGEN que abre la pantalla nativa de envío YA PREPARADA;
//   · adjuntos (📎): imagen inline con pantalla completa al tocar, video y
//     archivo como tarjeta que abre el enlace del relevo (el id es el permiso).
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { C, G } from '../theme';
import { Header, useAccount, useToast, hap } from '../ui';
import { useLang } from '../i18n';
import { genesis } from '../genesis';
import * as M from './mensajes';
import { aUri } from './rutas';

const TXT = {
  es: {
    titulo: 'Chat', sub: 'Gente real, con Genesis ID',
    buscar: 'Buscar por nombre o correo…', dir: 'EN EL ECOSISTEMA',
    nadie: 'Nadie con ese nombre todavía. Compartan su código QR para conectarse.',
    vacio: 'Aún no tienes conversaciones.\nBusca a alguien arriba o escanea su código.',
    escribe: 'Escribe…', origen: 'ENVIAR ORIGEN', miqr: 'MI CÓDIGO', escanear: 'ESCANEAR',
    gateTit: 'El chat es de gente verificada',
    gateTxt: 'Para chatear necesitas tu Genesis ID aprobado. Así todos saben que del otro lado hay una persona real.',
    gateBtn: 'COMPLETAR MI GENESIS ID', mirando: 'Comprobando tu Genesis ID…',
    qrTuyo: 'Este es tu código. Quien lo escanee abre un chat contigo.',
    apunta: 'Apunta al código de la otra persona',
    adjImagen: 'Imagen', adjVideo: 'Video', adjArchivo: 'Archivo',
    ultImagen: 'Imagen', ultVideo: 'Video', ultArchivo: 'Archivo',
    grande: 'Pesa más de 8 MB y el relevo no lo acepta. Comparte una versión más ligera.',
    noSubio: 'No se pudo subir. Revisa tu conexión e intenta de nuevo.',
    noAbre: 'No se pudo abrir el archivo.',
  },
  en: {
    titulo: 'Chat', sub: 'Real people, with Genesis ID',
    buscar: 'Search by name or email…', dir: 'IN THE ECOSYSTEM',
    nadie: 'Nobody with that name yet. Share your QR codes to connect.',
    vacio: 'No conversations yet.\nSearch someone above or scan their code.',
    escribe: 'Type…', origen: 'SEND ORIGEN', miqr: 'MY CODE', escanear: 'SCAN',
    gateTit: 'The chat is for verified people',
    gateTxt: 'You need your approved Genesis ID to chat. That way everyone knows there is a real person on the other side.',
    gateBtn: 'COMPLETE MY GENESIS ID', mirando: 'Checking your Genesis ID…',
    qrTuyo: 'This is your code. Whoever scans it opens a chat with you.',
    apunta: 'Point at the other person’s code',
    adjImagen: 'Image', adjVideo: 'Video', adjArchivo: 'File',
    ultImagen: 'Image', ultVideo: 'Video', ultArchivo: 'File',
    grande: 'It is over 8 MB and the relay won’t take it. Share a lighter version.',
    noSubio: 'Upload failed. Check your connection and try again.',
    noAbre: 'Could not open the file.',
  },
};

// El relevo rechaza adjuntos de más de 8MB — mismo número aquí para avisar
// ANTES de gastar datos subiendo algo que va a rebotar.
const TOPE_ADJUNTO = 8_000_000;

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

function Avatar({ nombre, correo, tam = 42 }) {
  return (
    <LinearGradient colors={tono(correo)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: tam, height: tam, borderRadius: tam / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#12312b', fontWeight: '800', fontSize: tam * 0.4 }}>
        {String(nombre || correo || '?')[0].toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

export default function ChatOG({ nav, params }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const [puerta, setPuerta] = useState('mirando');       // mirando | falta | abierta
  const [convos, setConvos] = useState(null);
  const [busca, setBusca] = useState('');
  const [gente, setGente] = useState(null);
  const [con, setCon] = useState(null);
  const [hilo, setHilo] = useState([]);
  const [texto, setTexto] = useState('');
  const [qr, setQr] = useState(null);                    // 'mio' | 'scan' | null
  const [hoja, setHoja] = useState(false);               // la hojita del 📎
  const [subiendo, setSubiendo] = useState(false);
  const [foto, setFoto] = useState(null);                // url de imagen a pantalla completa
  const [permiso, pedirPermiso] = useCameraPermissions();
  const toast = useToast();
  const lista = useRef(null);
  const leido = useRef(false);

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
    try { const d = await M.conversaciones(); setConvos(d.conversaciones || []); }
    catch { setConvos((x) => x || []); }
  }, []);
  useEffect(() => {
    if (puerta !== 'abierta' || con) return;
    traerConvos();
    const r = setInterval(traerConvos, 5000);
    return () => clearInterval(r);
  }, [puerta, con, traerConvos]);

  // llegar con ?con=correo (del QR o del asistente) abre el hilo directo
  useEffect(() => {
    if (params?.con && puerta === 'abierta') {
      (async () => {
        let nom = params.con.split('@')[0], addr = '';
        try { const f = await M.ficha(params.con); nom = f.nombre || nom; addr = f.addr || ''; } catch {}
        setCon({ correo: params.con.toLowerCase(), nombre: nom, addr });
      })();
    }
  }, [params?.con, puerta]);

  useEffect(() => {
    if (busca.trim().length < 2) { setGente(null); return; }
    const r = setTimeout(async () => {
      try { const d = await M.buscar(busca.trim()); setGente(d.gente || []); } catch { setGente([]); }
    }, 350);
    return () => clearTimeout(r);
  }, [busca]);

  const traerHilo = useCallback(async () => {
    if (!con) return;
    try {
      const d = await M.bandeja(con.correo);
      setHilo(d.mensajes || []);
      if (!leido.current) { leido.current = true; M.leido(con.correo).catch(() => {}); }
    } catch {}
  }, [con?.correo]);
  useEffect(() => {
    if (!con) { leido.current = false; return; }
    traerHilo();
    const r = setInterval(traerHilo, 3000);
    return () => clearInterval(r);
  }, [con?.correo]);

  const mandar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo || !con) return;
    setTexto('');
    const mio = { de: account.email, texto: cuerpo, cuando: Date.now(), pendiente: true };
    setHilo((h) => [...h, mio]);
    try { await M.enviar(con.correo, cuerpo); traerHilo(); }
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
      await M.enviar(con.correo, '', { tipo, archivo: id, nombre });
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

  // cómo se resume un 'ultimo' con adjunto en la lista de conversaciones
  const resumen = (u) => {
    if (u.tipo === 'imagen') return '📷 ' + t.ultImagen;
    if (u.tipo === 'video') return '🎬 ' + t.ultVideo;
    if (u.tipo === 'archivo') return '📎 ' + (u.nombre || t.ultArchivo);
    return u.texto;
  };

  const alEscanear = ({ data }) => {
    const m = String(data || '').match(/^og:\/\/chat\/abrir\?con=(.+)$/);
    if (!m) return;
    hap(); setQr(null); setBusca(''); setGente(null);
    nav.go('chat', { con: decodeURIComponent(m[1]) });
  };

  // ════ el candado ═════════════════════════════════════════════════════
  if (puerta !== 'abierta') {
    return (
      <View style={st.screen}>
        <Header title={t.titulo} onBack={nav.back} />
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
          <Pressable onPress={() => { setCon(null); setHilo([]); }} hitSlop={10}><Text style={st.volver}>‹</Text></Pressable>
          <Avatar nombre={con.nombre} correo={con.correo} tam={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.nom} numberOfLines={1}>{con.nombre}</Text>
            <Text style={st.mini} numberOfLines={1}>
              {con.addr ? '⛓ ' + con.addr.slice(0, 8) + '…' + con.addr.slice(-4) : con.correo}
            </Text>
          </View>
          <Pressable onPress={() => nav.go('send', { to: con.addr || '', amount: '' })}>
            <LinearGradient colors={G.gold} style={st.btnOrigen} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={st.btnOrigenTxt}>{t.origen}</Text>
            </LinearGradient>
          </Pressable>
        </View>
        <FlatList
          ref={lista} data={conDias}
          keyExtractor={(m, i) => (m.sep ? 'd' + m.sep : String(m.cuando || i))}
          contentContainerStyle={{ padding: 14, gap: 4 }}
          onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            if (item.sep) return (
              <View style={st.dia}><Text style={st.diaTxt}>
                {new Date(item.cuando).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-HN', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text></View>
            );
            const mio = item.de === account.email;
            const conAdj = !!item.archivo && ['imagen', 'video', 'archivo'].includes(item.tipo);
            return (
              <View style={[st.burbuja, mio ? st.mia : st.suya, item.fallo && { opacity: 0.45 }]}>
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
      <Header title={t.titulo} onBack={nav.back} />
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={st.sub}>{t.sub}</Text>
        <TextInput value={busca} onChangeText={setBusca} placeholder={t.buscar}
          placeholderTextColor={C.txt3} style={st.busca} autoCapitalize="none" />
        <View style={st.qrFila}>
          <Pressable style={st.qrBtn} onPress={() => setQr('mio')}><Text style={st.qrBtnTxt}>▣ {t.miqr}</Text></Pressable>
          <Pressable style={st.qrBtn} onPress={async () => {
            if (!permiso?.granted) await pedirPermiso();
            setQr('scan');
          }}><Text style={st.qrBtnTxt}>⌖ {t.escanear}</Text></Pressable>
        </View>
      </View>
      {convos === null ? <ActivityIndicator color={C.gold} style={{ marginTop: 28 }} /> : (
        <FlatList
          data={filas} keyExtractor={(c) => c.correo}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ListHeaderComponent={gente !== null ? <Text style={st.dir}>{t.dir}</Text> : null}
          ListEmptyComponent={<Text style={st.vacio}>{gente !== null ? t.nadie : t.vacio}</Text>}
          renderItem={({ item }) => (
            <Pressable style={st.fila} onPress={() => { setBusca(''); setGente(null); setCon(item); }}>
              <Avatar nombre={item.nombre} correo={item.correo} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={st.filaSup}>
                  <Text style={st.nom} numberOfLines={1}>{item.nombre}</Text>
                  {!!item.ultimo && <Text style={st.hora}>{hora(item.ultimo.cuando)}</Text>}
                </View>
                <View style={st.filaSup}>
                  <Text style={st.ult} numberOfLines={1}>
                    {item.ultimo ? (item.ultimo.de === account.email ? '✓ ' : '') + resumen(item.ultimo) : item.correo}
                  </Text>
                  {item.sinLeer > 0 && <View style={st.globo}><Text style={st.globoTxt}>{item.sinLeer}</Text></View>}
                </View>
              </View>
            </Pressable>
          )}
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
  sub: { color: C.txt3, fontSize: 12, marginBottom: 10 },
  busca: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: C.txt, fontSize: 14 },
  qrFila: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 6 },
  qrBtn: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  qrBtnTxt: { color: C.goldLt, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  dir: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 3, marginVertical: 8 },
  vacio: { color: C.txt3, fontSize: 13, lineHeight: 20, marginTop: 16, textAlign: 'center' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.08)' },
  filaSup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nom: { color: C.txt, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  hora: { color: C.txt3, fontSize: 10.5 },
  ult: { color: C.txt3, fontSize: 12.5, flexShrink: 1, marginTop: 2 },
  globo: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  globoTxt: { color: '#3A2C08', fontSize: 11, fontWeight: '800' },
  cabHilo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line2 },
  volver: { color: C.gold, fontSize: 28, paddingHorizontal: 4, lineHeight: 30 },
  mini: { color: C.txt3, fontSize: 10.5 },
  btnOrigen: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8 },
  btnOrigenTxt: { color: '#3A2C08', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  dia: { alignSelf: 'center', backgroundColor: 'rgba(110,147,143,0.14)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginVertical: 8 },
  diaTxt: { color: C.txt3, fontSize: 10.5 },
  burbuja: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8, marginVertical: 1.5 },
  mia: { alignSelf: 'flex-end', backgroundColor: C.goldLt, borderBottomRightRadius: 5 },
  suya: { alignSelf: 'flex-start', backgroundColor: C.panel2, borderBottomLeftRadius: 5 },
  msg: { color: C.txt, fontSize: 14.5, lineHeight: 20 },
  msgHora: { color: C.txt3, fontSize: 9.5, alignSelf: 'flex-end', marginTop: 2 },
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
