// Los ajustes de AURO CHAT: lo mío y lo que de mí ve el resto.
//   · mi foto y mi nombre — es TODO lo que el otro lado ve de mí;
//   · mi código QR, para que me agreguen sin dictar el correo;
//   · qué se ve de mí, en una línea y sin letra chica;
//   · el cifrado: NO hay extremo a extremo en esta versión. Va en su propia
//     tarjeta y con todas las letras, porque una promesa de privacidad que no
//     se cumple es peor que no prometer nada.
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Image, Modal,
  ActivityIndicator, Share, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { Header, Button3D, useAccount, useToast, hap } from '../ui';
import { useLang } from '../i18n';
import * as M from './mensajes';
import { aUri } from './rutas';

const TXT = {
  es: {
    titulo: 'AURO CHAT', sub: 'Mi perfil y lo que se ve de mí',
    perfilTit: 'MI PERFIL',
    nombrePh: 'Tu nombre',
    cambiarFoto: 'CAMBIAR FOTO', anadirFoto: 'AÑADIR FOTO', quitarFoto: 'QUITAR',
    guardar: 'GUARDAR NOMBRE', guardado: 'Guardado', cancelar: 'CANCELAR',
    noGuarda: 'No se pudo guardar. Revisa tu conexión.',
    grande: 'La foto pesa más de 8 MB y el relevo no la acepta. Elige una más ligera.',
    noSubio: 'No se pudo subir la foto. Revisa tu conexión.',
    quitarTit: '¿Quitar tu foto?',
    quitarTxt: 'Vuelves a la inicial de tu nombre. Puedes poner otra cuando quieras.',

    qrTit: 'MI CÓDIGO',
    qrTxt: 'Quien lo escanee abre un chat contigo, sin dictar el correo ni buscarte.',
    copiar: 'COPIAR ENLACE', compartir: 'COMPARTIR', copiado: 'Enlace copiado',
    invito: 'Escríbeme por AURO CHAT:',

    veTit: 'LO QUE SE VE DE MÍ',
    veTxt: 'Quien te busque en AURO CHAT ve tu nombre, tu foto, tu correo y tu dirección de wallet — nada más: ni tu teléfono, ni tus documentos, ni con quién hablas.',

    cifTit: 'SIN CIFRADO DE EXTREMO A EXTREMO',
    cifTxt: 'En esta versión no lo hay, y no vamos a decir lo contrario. Tus mensajes viajan protegidos hasta el relevo (HTTPS), pero ahí se guardan legibles: quien administre ese servidor puede leerlos. Los adjuntos igual — su enlace largo es todo el permiso, y quien lo tenga abre el archivo.',
    cifTxt2: 'Para lo que no soportaría ser leído por un tercero, esta no es la vía todavía.',

    telTit: 'EN ESTE TELÉFONO',
    telTxt: 'Ninguna conversación se guarda aquí: viven en el relevo y se piden cada vez que abres el hilo, así que no hay nada que vaciar. Lo único guardado en el teléfono es tu llave de AURO, la que prueba que ese buzón es tuyo — si se borrara, ese correo se quedaría sin dueño para siempre, y por eso no hay un botón que lo haga.',
  },
  en: {
    titulo: 'AURO CHAT', sub: 'My profile and what others see',
    perfilTit: 'MY PROFILE',
    nombrePh: 'Your name',
    cambiarFoto: 'CHANGE PHOTO', anadirFoto: 'ADD PHOTO', quitarFoto: 'REMOVE',
    guardar: 'SAVE NAME', guardado: 'Saved', cancelar: 'CANCEL',
    noGuarda: 'Could not save. Check your connection.',
    grande: 'The photo is over 8 MB and the relay won’t take it. Pick a lighter one.',
    noSubio: 'Could not upload the photo. Check your connection.',
    quitarTit: 'Remove your photo?',
    quitarTxt: 'You go back to the initial of your name. You can set another one whenever you want.',

    qrTit: 'MY CODE',
    qrTxt: 'Whoever scans it opens a chat with you, no need to dictate your email.',
    copiar: 'COPY LINK', compartir: 'SHARE', copiado: 'Link copied',
    invito: 'Write to me on AURO CHAT:',

    veTit: 'WHAT OTHERS SEE OF ME',
    veTxt: 'Anyone searching for you on AURO CHAT sees your name, your photo, your email and your wallet address — nothing else: not your phone, not your documents, not who you talk to.',

    cifTit: 'NO END-TO-END ENCRYPTION',
    cifTxt: 'There is none in this version, and we are not going to say otherwise. Your messages travel protected to the relay (HTTPS), but there they are stored readable: whoever runs that server can read them. Attachments too — their long link is the whole permission, and whoever holds it opens the file.',
    cifTxt2: 'For anything that could not stand being read by a third party, this is not the way yet.',

    telTit: 'ON THIS PHONE',
    telTxt: 'No conversation is stored here: they live on the relay and are fetched each time you open a thread, so there is nothing to clear. The only thing kept on the phone is your AURO key, the one proving that mailbox is yours — erasing it would leave that email ownerless forever, which is why there is no button for it.',
  },
};

const TOPE_ARCHIVO = 8_000_000;
// El relevo corta el nombre a 80: cortarlo aquí evita escribir uno y recibir otro.
const TOPE_NOMBRE = 80;

const TONOS = [['#F8EFCF', '#C9A961'], ['#9FE3C9', '#2E8F6E'], ['#BFD8F5', '#4A78B0'], ['#F2C4B3', '#B0674A']];
const tono = (c) => TONOS[String(c).split('').reduce((a, x) => a + x.charCodeAt(0), 0) % TONOS.length];

export default function AjustesAuro({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const toast = useToast();
  const correo = (account?.email || '').toLowerCase();

  const [foto, setFoto] = useState('');        // id del relevo, '' = sin foto
  const [nombre, setNombre] = useState('');
  const [original, setOriginal] = useState('');
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [preguntar, setPreguntar] = useState(false);

  // Mi ficha se pide al relevo y no a la cuenta local: el nombre y la foto de
  // AURO se editan aquí y pueden no ser los de la wallet.
  useEffect(() => {
    if (!correo) return;
    let vivo = true;
    (async () => {
      try { await M.alta(account); } catch {}
      try {
        const f = await M.ficha(correo);
        if (!vivo) return;
        setNombre(f.nombre || ''); setOriginal(f.nombre || ''); setFoto(f.foto || '');
      } catch {
        // sin red se edita igual sobre lo que ya sabe la cuenta: guardar es
        // lo que manda al relevo, y eso se reintenta cuando haya señal
        if (vivo) { setNombre(account?.name || ''); setOriginal(account?.name || ''); }
      }
      if (vivo) setCargando(false);
    })();
    return () => { vivo = false; };
  }, [correo]);

  const enlace = correo ? aUri('chat/abrir', { con: correo }) : '';

  const guardarNombre = async () => {
    const n = nombre.trim();
    if (!n || n === original) return;
    try { await M.perfil({ nombre: n }); setOriginal(n); hap(); toast(t.guardado); }
    catch { toast(t.noGuarda, 'error'); }
  };

  // El recorte cuadrado lo hace la persona en el picker: la foto se pinta en
  // un círculo y así elige ella qué se pierde, no nosotros.
  const cambiarFoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], base64: true, quality: 0.7, allowsEditing: true, aspect: [1, 1],
    }).catch(() => null);
    const a = r?.assets?.[0];
    if (!a?.base64) return;
    if (a.base64.length * 0.75 > TOPE_ARCHIVO) { toast(t.grande, 'error'); return; }
    setSubiendo(true);
    try {
      const { id } = await M.subir(a.fileName || 'foto.jpg', 'imagen', a.mimeType || 'image/jpeg', a.base64);
      await M.perfil({ foto: id });
      setFoto(id); hap(); toast(t.guardado);
    } catch { toast(t.noSubio, 'error'); }
    finally { setSubiendo(false); }
  };

  // Mandar la clave vacía es lo que el relevo entiende por «quítala»; no
  // mandarla sería «no la toques».
  const quitarFoto = async () => {
    setPreguntar(false);
    try { await M.perfil({ foto: '' }); setFoto(''); hap(); toast(t.guardado); }
    catch { toast(t.noGuarda, 'error'); }
  };

  const copiar = async () => { await Clipboard.setStringAsync(enlace); hap(); toast(t.copiado); };
  const compartir = () => { hap(); Share.share({ message: t.invito + '\n' + enlace }).catch(() => {}); };

  const cambiado = !!nombre.trim() && nombre.trim() !== original;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.screen}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">

        {/* mi perfil */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.perfilTit}</Text>
          <Pressable style={st.fotoCentro} onPress={cambiarFoto} disabled={subiendo}>
            {subiendo ? <ActivityIndicator color={C.gold} size="large" /> : foto ? (
              <Image source={{ uri: M.urlArchivo(foto) }} resizeMode="cover" style={st.retrato} />
            ) : (
              <LinearGradient colors={tono(correo)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.retrato}>
                <Text style={st.inicial}>{String(nombre || correo || '?')[0].toUpperCase()}</Text>
              </LinearGradient>
            )}
            <Text style={st.fotoTxt}>{foto ? t.cambiarFoto : t.anadirFoto}</Text>
          </Pressable>
          {!!foto && (
            <Pressable style={st.btnSoltar} onPress={() => setPreguntar(true)}>
              <Text style={st.btnSoltarTxt}>{t.quitarFoto}</Text>
            </Pressable>
          )}
          {cargando ? <ActivityIndicator color={C.gold} style={{ marginVertical: 12 }} /> : (
            <TextInput value={nombre} onChangeText={setNombre} placeholder={t.nombrePh}
              placeholderTextColor={C.txt3} style={st.caja} maxLength={TOPE_NOMBRE} />
          )}
          <Text style={st.correo}>{correo}</Text>
          {cambiado && <Button3D title={t.guardar} onPress={guardarNombre} style={{ marginTop: 12 }} />}
        </View>

        {/* mi código, para que me agreguen */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.qrTit}</Text>
          {!!enlace && (
            <View style={st.qrBlanco}>
              <QRCode value={enlace} size={214} color="#04211d" backgroundColor="#ffffff" ecl="M" />
            </View>
          )}
          <Text style={st.tarTxt}>{t.qrTxt}</Text>
          <View style={st.dosBtn}>
            <Pressable style={st.btnLinea} onPress={copiar}><Text style={st.btnLineaTxt}>{t.copiar}</Text></Pressable>
            <Pressable style={st.btnLinea} onPress={compartir}><Text style={st.btnLineaTxt}>{t.compartir}</Text></Pressable>
          </View>
        </View>

        {/* lo que se ve de mí: una línea, sin letra chica */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.veTit}</Text>
          <Text style={[st.tarTxt, { marginBottom: 0 }]}>{t.veTxt}</Text>
        </View>

        {/* la verdad sobre el cifrado, en su propia tarjeta y marcada */}
        <View style={[st.tarjeta, st.tarjetaAviso]}>
          <Text style={[st.seccion, { color: C.down }]}>{t.cifTit}</Text>
          <Text style={st.tarTxt}>{t.cifTxt}</Text>
          <Text style={[st.tarTxt, { color: C.txt, marginBottom: 0 }]}>{t.cifTxt2}</Text>
        </View>

        {/* qué queda en el teléfono: nada que vaciar, y por qué */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.telTit}</Text>
          <Text style={[st.tarTxt, { marginBottom: 0 }]}>{t.telTxt}</Text>
        </View>
      </ScrollView>

      <Modal visible={preguntar} transparent animationType="fade" onRequestClose={() => setPreguntar(false)}>
        <View style={st.velo}>
          <View style={st.dialogo}>
            <Text style={st.dlgTit}>{t.quitarTit}</Text>
            <Text style={st.dlgTxt}>{t.quitarTxt}</Text>
            <View style={st.dlgFila}>
              <Pressable style={st.dlgNo} onPress={() => setPreguntar(false)}>
                <Text style={st.dlgNoTxt}>{t.cancelar}</Text>
              </Pressable>
              <Pressable style={st.dlgSi} onPress={quitarFoto}>
                <Text style={st.dlgSiTxt}>{t.quitarFoto}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  tarjeta: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 18, marginBottom: 16 },
  // el aviso del cifrado no se disfraza de tarjeta más: se marca en rojo para
  // que no se lea de paso
  tarjetaAviso: { borderColor: 'rgba(240,119,107,0.42)', backgroundColor: 'rgba(52,20,18,0.42)' },
  seccion: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginBottom: 12 },
  tarTxt: { color: C.txt2, fontSize: 13, lineHeight: 19.5, marginBottom: 14 },
  fotoCentro: { alignItems: 'center', gap: 10 },
  retrato: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  inicial: { color: '#12312b', fontWeight: '800', fontSize: 42 },
  fotoTxt: { color: C.goldLt, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.4 },
  caja: { backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: C.txt, fontSize: 15, marginTop: 16 },
  correo: { color: C.txt3, fontSize: 12, marginTop: 8, marginBottom: 4, textAlign: 'center' },
  qrBlanco: { backgroundColor: '#fff', padding: 16, borderRadius: 18, alignSelf: 'center', marginBottom: 14 },
  dosBtn: { flexDirection: 'row', gap: 10 },
  btnLinea: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  btnLineaTxt: { color: C.goldLt, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.3 },
  btnSoltar: { alignItems: 'center', paddingVertical: 10 },
  btnSoltarTxt: { color: C.txt3, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.3 },
  velo: { flex: 1, backgroundColor: 'rgba(1,10,11,0.88)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialogo: { backgroundColor: '#0A3436', borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 20, width: '100%', maxWidth: 380 },
  dlgTit: { color: C.goldLt, fontSize: 17, fontWeight: '700', marginBottom: 9 },
  dlgTxt: { color: C.txt2, fontSize: 13.5, lineHeight: 20, marginBottom: 18 },
  dlgFila: { flexDirection: 'row', gap: 10 },
  dlgNo: { flex: 1, borderWidth: 1, borderColor: C.line2, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  dlgNoTxt: { color: C.txt2, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.3 },
  dlgSi: { flex: 1, borderWidth: 1, borderColor: 'rgba(240,119,107,0.5)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(240,119,107,0.12)' },
  dlgSiTxt: { color: C.down, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.3 },
});
