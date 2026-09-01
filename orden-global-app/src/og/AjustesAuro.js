// Los ajustes de PULSE CHAT: lo mío y lo que de mí ve el resto.
//   · mi foto y mi nombre — es TODO lo que el otro lado ve de mí;
//   · mi GID, visible, copiable al toque y con su botón de compartir: es la
//     seña que viaja por el chat y por eso vive aquí y en el pasaporte;
//   · mi código QR, para que me agreguen sin dictar el correo;
//   · qué se ve de mí, en una línea y sin letra chica;
//   · «Privacidad y seguridad»: la verdad del cifrado vive AQUÍ y no en las
//     pantallas de uso diario. No hay extremo a extremo todavía y no se dice
//     lo contrario — pero se dice en lenguaje de producto, no de laboratorio.
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Image, Modal,
  ActivityIndicator, Share, StyleSheet,
} from 'react-native';
import { PantallaConTeclado, CuerpoDesplazable } from './Teclado';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { C } from '../theme';
import { Header, Button3D, tono, useAccount, useToast, hap } from '../ui';
import { useLang } from '../i18n';
import * as M from './mensajes';
import { aUri } from './rutas';
// Se pide a entorno.js y no a notify.js: aquí solo hace falta saber DÓNDE
// corre la app, y notify.js arrastraría expo-task-manager entero para eso.
import { enExpoGo } from '../entorno';

const TXT = {
  es: {
    titulo: 'PULSE CHAT', sub: 'Mi perfil y lo que se ve de mí',
    perfilTit: 'MI PERFIL',
    nombrePh: 'Tu nombre',
    cambiarFoto: 'CAMBIAR FOTO', anadirFoto: 'AÑADIR FOTO', quitarFoto: 'QUITAR',
    guardar: 'GUARDAR NOMBRE', guardado: 'Guardado', cancelar: 'CANCELAR',
    noGuarda: 'No se pudo guardar. Revisa tu conexión.',
    grande: 'La foto pesa más de 8 MB. Elige una más ligera.',
    noSubio: 'No se pudo subir la foto. Revisa tu conexión.',
    sinPicker: 'Esta versión de la app no puede abrir tu galería. Actualiza la app para cambiar la foto.',
    quitarTit: '¿Quitar tu foto?',
    quitarTxt: 'Vuelves a la inicial de tu nombre. Puedes poner otra cuando quieras.',

    gidTit: 'MI GENESIS ID',
    gidTxt: 'Quien lo tenga te encuentra en PULSE CHAT buscándolo tal cual.',
    gidCopiar: 'COPIAR GID',
    gidCopiado: 'GID copiado',
    // El gesto real es MANTENER PULSADO: un toque no selecciona nada.
    gidMano: 'También puedes mantenerlo pulsado y copiarlo a mano.',
    gidNoListo: 'Tu Genesis ID todavía no está listo: aparecerá aquí en cuanto Genesis lo emita.',
    gidCompartir: 'COMPARTIR MI GID',
    gidInvito: 'Búscame en PULSE CHAT con mi Genesis ID:',

    qrTit: 'MI CÓDIGO',
    qrTxt: 'Quien lo escanee abre un chat contigo, sin dictar el correo ni buscarte.',
    copiar: 'COPIAR ENLACE', compartir: 'COMPARTIR', copiado: 'Enlace copiado',
    noCopia: 'No se pudo copiar. Inténtalo de nuevo.',
    invito: 'Escríbeme por PULSE CHAT:',
    // El enlace se fabrica con el esquema og://, que es el del APK. En Expo
    // Go el esquema real del teléfono es exp://, o sea que quien reciba este
    // enlace por WhatsApp no abrirá nada — y quien lo mandó creerá que sí.
    // El QR de arriba entra igual: lo lee el escáner de la propia app, que es
    // la cámara leyendo texto y no el sistema abriendo un enlace.
    qrGo: 'Vista previa: el enlace solo abre desde el APK instalado. Aquí comparte el código de arriba y que lo escaneen con el escáner de la app.',

    avisosGo: 'Vista previa: en Expo Go el teléfono no te avisa de los mensajes nuevos. Los verás al abrir la app. En el APK instalado sí llega el aviso.',

    veTit: 'LO QUE SE VE DE MÍ',
    veTxt: 'Quien te busque en PULSE CHAT ve tu nombre, tu foto, tu correo, tu Genesis ID y tu dirección de wallet — nada más: ni tu teléfono, ni tus documentos, ni con quién hablas.',

    privTit: 'PRIVACIDAD Y SEGURIDAD',
    privTxt: 'Tus mensajes viajan cifrados hasta el servidor de Orden Global. El cifrado de extremo a extremo llegará en una próxima versión.',
    privTxt2: 'Tus conversaciones viven en ese servidor, no en este teléfono: se piden cada vez que abres un hilo. Aquí solo quedan tu llave de AURO —la que prueba que tu buzón es tuyo— y tu libreta, con los nombres que tú le pusiste a tu gente; esa se edita manteniendo pulsado un contacto en la lista del chat.',
  },
  en: {
    titulo: 'PULSE CHAT', sub: 'My profile and what others see',
    perfilTit: 'MY PROFILE',
    nombrePh: 'Your name',
    cambiarFoto: 'CHANGE PHOTO', anadirFoto: 'ADD PHOTO', quitarFoto: 'REMOVE',
    guardar: 'SAVE NAME', guardado: 'Saved', cancelar: 'CANCEL',
    noGuarda: 'Could not save. Check your connection.',
    grande: 'The photo is over 8 MB. Pick a lighter one.',
    noSubio: 'Could not upload the photo. Check your connection.',
    sinPicker: 'This version of the app cannot open your gallery. Update the app to change the photo.',
    quitarTit: 'Remove your photo?',
    quitarTxt: 'You go back to the initial of your name. You can set another one whenever you want.',

    gidTit: 'MY GENESIS ID',
    gidTxt: 'Anyone who has it can find you on PULSE CHAT by searching it as is.',
    gidCopiar: 'COPY GID',
    gidCopiado: 'GID copied',
    // Ver la nota en español: el gesto es mantener pulsado, no tocar.
    gidMano: 'You can also press and hold it to copy it by hand.',
    gidNoListo: 'Your Genesis ID is not ready yet: it will show up here as soon as Genesis issues it.',
    gidCompartir: 'SHARE MY GID',
    gidInvito: 'Find me on PULSE CHAT with my Genesis ID:',

    qrTit: 'MY CODE',
    qrTxt: 'Whoever scans it opens a chat with you, no need to dictate your email.',
    copiar: 'COPY LINK', compartir: 'SHARE', copiado: 'Link copied',
    noCopia: 'Could not copy. Try again.',
    invito: 'Write to me on PULSE CHAT:',
    qrGo: 'Preview: the link only opens from the installed APK. Here, share the code above and have them scan it with the app scanner.',

    avisosGo: 'Preview: in Expo Go your phone does not alert you about new messages. You will see them when you open the app. In the installed APK the alert does arrive.',

    veTit: 'WHAT OTHERS SEE OF ME',
    veTxt: 'Anyone searching for you on PULSE CHAT sees your name, your photo, your email, your Genesis ID and your wallet address — nothing else: not your phone, not your documents, not who you talk to.',

    privTit: 'PRIVACY AND SECURITY',
    privTxt: 'Your messages travel encrypted to the Orden Global server. End-to-end encryption will arrive in an upcoming version.',
    privTxt2: 'Your conversations live on that server, not on this phone: they are fetched each time you open a thread. Only two things stay here — your AURO key, the one proving that mailbox is yours, and your contact book with the names you gave people; you edit that one by long-pressing a contact in the chat list.',
  },
};

const TOPE_ARCHIVO = 8_000_000;
// El relevo corta el nombre a 80: cortarlo aquí evita escribir uno y recibir otro.
const TOPE_NOMBRE = 80;

// `tono` viene de src/ui.js: estaba triplicado en las tres pantallas de AURO
// CHAT y tres copias acaban pintando a la misma persona con colores distintos.

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
    // REGLA DEL AIRE: expo-image-picker es un módulo NATIVO y esta pantalla
    // llega por OTA a binarios que quizá no lo traen (Expo Go, APK
    // pre-fusión). El require vive DENTRO del gesto —como en More.js— para
    // que un import en la cabecera no tumbe el arranque entero: sin módulo,
    // los ajustes abren igual y aquí solo se avisa que la foto no se puede
    // cambiar en esta versión.
    let ImagePicker = null;
    try { ImagePicker = require('expo-image-picker'); } catch (e) { ImagePicker = null; }
    if (!ImagePicker?.launchImageLibraryAsync) { toast(t.sinPicker, 'error'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], base64: true, quality: 0.7, allowsEditing: true, aspect: [1, 1],
    }).catch(() => null);
    const a = r?.assets?.[0];
    if (!a?.base64) return;
    if (a.base64.length * 0.75 > TOPE_ARCHIVO) { toast(t.grande, 'error'); return; }
    setSubiendo(true);
    try {
      /* EN CLARO A PROPÓSITO: el relevo reparte esta foto a cualquiera
         que te vea en una lista, así que cifrarla no protegía nada y sí
         la rompía — se subía cerrada, se tiraba la llave, y se servía
         como imagen algo que ningún visor podía abrir. */
      const { id } = await M.subirPublico(a.fileName || 'foto.jpg', 'imagen', a.mimeType || 'image/jpeg', a.base64);
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

  // Copiar y compartir, a prueba de cierres. Las dos reglas que salieron del
  // fallo que reportó José:
  //   · `Clipboard.setStringAsync` es `async`: cualquier fallo suyo llega como
  //     promesa RECHAZADA. Sin try/catch nadie la recoge, y lo que la persona
  //     ve es que toca, no vibra, no sale aviso y no se copió nada.
  //   · `Share.share` NO es async: sus comprobaciones —que el contenido sea un
  //     objeto, que el mensaje sea texto y, en Android, que el módulo del
  //     sistema esté registrado— se lanzan de forma SÍNCRONA, ANTES de que
  //     exista la promesa. Por eso un `.catch()` colgado detrás no las atrapa:
  //     la excepción sube al manejador global y en la app instalada eso la
  //     cierra. La única red que sirve es el try/catch alrededor de la llamada.
  // `vibrar` es false cuando quien llama es un Button3D: ese botón ya vibra
  // solo al hundirse, y dos toques seguidos se sienten como un fallo.
  const copiarAlPapel = async (valor, avisoOk, vibrar = true) => {
    const v = String(valor || '');
    if (!v) return false;
    if (vibrar) hap();  // la vibración confirma el TOQUE: va antes del viaje al portapapeles
    try { await Clipboard.setStringAsync(v); toast(avisoOk); return true; }
    catch { toast(t.noCopia || TXT.es.noCopia, 'error'); return false; }
  };

  // El mensaje se arma con respaldo en español si faltara la clave del idioma:
  // mandarle "undefined" a un desconocido es peor que mandarlo en otro idioma.
  const compartirTexto = async (texto) => {
    hap();
    try { await Share.share({ message: String(texto || '') }); } catch (e) {}
  };

  const copiar = () => copiarAlPapel(enlace, t.copiado);
  const compartir = () => {
    if (!enlace) return;
    return compartirTexto((t.invito || TXT.es.invito) + '\n' + enlace);
  };

  // Mi GID: la seña con la que me encuentran en el buscador del chat. COPIAR es
  // la acción principal y por eso es el botón grande; compartir queda aparte.
  const gid = account?.genesisUid || '';
  // Sin GID no se intenta nada: se dice por qué, en vez de copiar el vacío o
  // mandar un mensaje con el hueco.
  const copiarGid = () => {
    if (!gid) { toast(t.gidNoListo || TXT.es.gidNoListo, 'info'); return; }
    return copiarAlPapel(gid, t.gidCopiado, false);
  };
  const compartirGid = () => {
    if (!gid) { toast(t.gidNoListo || TXT.es.gidNoListo, 'info'); return; }
    return compartirTexto((t.gidInvito || TXT.es.gidInvito) + '\n' + String(gid));
  };

  const cambiado = !!nombre.trim() && nombre.trim() !== original;
  return (
    // La cabecera no se mueve y el cuerpo cede el alto que ocupa el teclado.
    <PantallaConTeclado desplaza={false} style={st.screen}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <CuerpoDesplazable contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>

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

        {/* mi GID. Antes el único BOTÓN de esta tarjeta decía «COMPARTIR» y
            copiar era tocar el número pelado: el dedo iba a lo que parecía un
            botón, se abría el diálogo de compartir y nadie copiaba nada. Ahora
            el orden es el de la vida real: COPIAR manda —botón grande, con
            ícono— y compartir baja a segundo plano, separado por el texto y
            por una línea, para que no se confundan al tacto.
            La tarjeta se pinta SIEMPRE: si Genesis aún no emitió el GID, el
            hueco vacío de antes no explicaba nada. */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.gidTit}</Text>
          {gid ? (
            <>
              {/* El camino a mano, la salida que pidió José: copiar y pegar
                  donde sea aunque el botón de arriba fallara.
                  Va como <Text selectable> y NO como `<TextInput
                  editable={false} selectTextOnFocus>`: React Native solo enfoca
                  el campo cuando `editable !== false` (se ve en
                  Libraries/Components/TextInput/TextInput.js), así que con el
                  campo apagado el toque no enfoca, `selectTextOnFocus` no corre
                  nunca y no se seleccionaba nada. Con `selectable` el gesto es
                  el del sistema: mantener pulsado abre el menú de copiar. */}
              <Text selectable style={st.gidCampo}>{String(gid)}</Text>
              <Text style={st.gidMano}>{t.gidMano}</Text>
              <Button3D title={t.gidCopiar} icon="copy" onPress={copiarGid} style={{ marginTop: 14 }} />
              <Text style={[st.tarTxt, { textAlign: 'center', marginTop: 16, marginBottom: 0 }]}>{t.gidTxt}</Text>
              <View style={st.separa} />
              <Pressable style={st.btnGid} onPress={compartirGid} hitSlop={6}>
                <Text style={st.btnLineaTxt}>{t.gidCompartir}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={[st.tarTxt, { marginBottom: 0 }]}>{t.gidNoListo}</Text>
          )}
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
          {/* El aviso va PEGADO a los botones y no en una nota al pie: el
              momento de saber que el enlace no abrirá es antes de mandarlo. */}
          {enExpoGo && <Text style={st.avisoGo}>{t.qrGo}</Text>}
        </View>

        {/* lo que se ve de mí: una línea, sin letra chica */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.veTit}</Text>
          <Text style={[st.tarTxt, { marginBottom: 0 }]}>{t.veTxt}</Text>
        </View>

        {/* Privacidad y seguridad: aquí vive la verdad del cifrado (§5 del
            plan). Se mudó de las pantallas de uso diario —donde asustaba sin
            ayudar— a esta tarjeta, en lenguaje de producto y sin perder la
            honestidad: no hay E2E todavía y se dice con fecha de promesa. */}
        <View style={st.tarjeta}>
          <Text style={st.seccion}>{t.privTit}</Text>
          <Text style={st.tarTxt}>{t.privTxt}</Text>
          <Text style={[st.tarTxt, { marginBottom: 0 }]}>{t.privTxt2}</Text>
          {/* Los avisos de mensaje nuevo son notificaciones LOCALES y en Expo
              Go no salen: expo-notifications no se puede cargar allí (ver la
              cabecera de notify.js). Callarlo dejaría a la persona esperando
              un aviso que no va a sonar nunca. */}
          {enExpoGo && <Text style={[st.avisoGo, { marginTop: 14 }]}>{t.avisosGo}</Text>}
        </View>
      </CuerpoDesplazable>

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
    </PantallaConTeclado>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  tarjeta: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 18, marginBottom: 16 },
  seccion: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginBottom: 12 },
  // el GID en grande y tabular: es una seña para dictar o copiar, no un
  // párrafo — cada glifo tiene que distinguirse al primer vistazo. Lleva el
  // trazo de los campos de la casa (C.input / C.inputBr) para que se lea como
  // algo que se puede marcar con el dedo y no como un título, aunque por dentro
  // sea un <Text selectable> y no un TextInput (ver la nota de arriba).
  gidCampo: {
    backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 12, textAlign: 'center',
    color: C.goldHi, fontSize: 19, fontWeight: '800', letterSpacing: 1.2, fontVariant: ['tabular-nums'],
  },
  gidMano: { color: C.txt3, fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  // La línea que separa lo principal (copiar) de lo secundario (compartir):
  // sin ella los dos botones se leían como una misma fila de opciones.
  separa: { height: 1, backgroundColor: C.line2, marginTop: 18, marginBottom: 16 },
  // el botón de compartir el GID: mismo trazo que COPIAR/COMPARTIR del QR,
  // pero sin flex:1 — aquí va solo, a lo ancho de la tarjeta
  btnGid: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  tarTxt: { color: C.txt2, fontSize: 13, lineHeight: 19.5, marginBottom: 14 },
  // Aviso de vista previa: ámbar, para que se lea como «ojo con esto» y no
  // como una explicación más de la tarjeta.
  avisoGo: { color: '#FBBF24', fontSize: 11.5, lineHeight: 17, marginTop: 12 },
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
