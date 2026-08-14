// El chat del ecosistema: contactos, conversación, emojis y el botón que
// prepara un envío de ORIGEN desde la charla. Los mensajes viajan por el
// relevo del cerebro (infra/mensajes) y se consultan cada pocos segundos
// mientras la pantalla está abierta.
//
// Honestidad por delante, escrita aquí para quien mantenga esto: v1 SIN
// cifrado de extremo a extremo — el relevo guarda el texto. No se promete
// E2E en la interfaz, y por eso NO se prometió en ningún texto de i18n.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { C } from '../theme';
import { useT } from '../i18n';
import { listaContactos, guardarContacto, chatAlta, chatEnviar, chatBandeja, chatFicha, quienSoy } from '../api';
import { BotonOro, Tarjeta, Etiqueta, Entra } from '../ui';
import { aUri } from '../rutas';

const EMOJIS = ['👍', '🙏', '🎉', '💛', '😂', '🤝', '🔥', '✨', '💰', '🚀'];

export default function Chat({ params, abrir }) {
  const t = useT();
  const yo = quienSoy() || {};
  const [contactos, setContactos] = useState([]);
  const [con, setCon] = useState(null);          // contacto abierto
  const [hilo, setHilo] = useState([]);
  const [texto, setTexto] = useState('');
  const [alta, setAlta] = useState(false);       // formulario de contacto
  const [nNombre, setNNombre] = useState('');
  const [nCorreo, setNCorreo] = useState('');
  const lista = useRef(null);

  useEffect(() => { chatAlta().catch(() => {}); }, []);
  useEffect(() => {
    listaContactos().then((l) => {
      setContactos(l);
      if (params?.con) setCon(l.find((c) => c.correo === params.con) || null);
    });
  }, [params?.con]);

  // La bandeja se consulta cada 4 s mientras el hilo está abierto. Sencillo
  // y suficiente; el día que haga falta tiempo real, el relevo ya habla HTTP
  // y se le pone un websocket delante sin tocar esta pantalla.
  const traer = useCallback(async () => {
    if (!con) return;
    try {
      const d = await chatBandeja(con.correo);
      if (Array.isArray(d?.mensajes)) setHilo(d.mensajes);
    } catch { /* sin red: se queda lo último visto */ }
  }, [con]);
  useEffect(() => {
    traer();
    const reloj = setInterval(traer, 4000);
    return () => clearInterval(reloj);
  }, [traer]);

  const mandar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo || !con) return;
    setTexto('');
    // se pinta al instante; si el relevo falla, se marca
    const mio = { de: yo.email, texto: cuerpo, cuando: Date.now(), local: true };
    setHilo((h) => [...h, mio]);
    try { await chatEnviar(con.correo, cuerpo); traer(); }
    catch { setHilo((h) => h.map((m) => (m === mio ? { ...m, fallo: true } : m))); }
  };

  const agregar = async () => {
    if (!nNombre.trim() || !/@/.test(nCorreo)) return;
    // si el contacto ya usa el chat, su ficha trae la dirección de su wallet
    let addr = '';
    try { const f = await chatFicha(nCorreo.trim().toLowerCase()); addr = f?.addr || ''; } catch {}
    const l = await guardarContacto({ nombre: nNombre.trim(), correo: nCorreo.trim(), addr });
    setContactos(l); setAlta(false); setNNombre(''); setNCorreo('');
  };

  // «ENVIAR ORIGEN»: el chat no mueve dinero. Prepara el envío por el mismo
  // camino que GENESIS --la misma uri del mapa-- y la wallet lo firma.
  const enviarOrigen = () => {
    if (!con) return;
    abrir(aUri('wallet/enviar', { to: con.addr || con.correo, nombre: con.nombre, monto: '' }));
  };

  // ── lista de contactos ──────────────────────────────────────────────
  if (!con) {
    return (
      <View style={s.todo}>
        <Etiqueta style={{ margin: 18, marginBottom: 8 }}>{t('chat.titulo').toUpperCase()}</Etiqueta>
        <FlatList
          data={contactos}
          keyExtractor={(c) => c.correo}
          contentContainerStyle={{ paddingHorizontal: 18 }}
          ListEmptyComponent={<Text style={s.vacio}>{t('chat.vacio')}</Text>}
          renderItem={({ item, index }) => (
            <Entra delay={index * 50}>
              <Pressable style={s.contacto} onPress={() => setCon(item)}>
                <View style={s.avatar}><Text style={s.avatarTxt}>{item.nombre[0]?.toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cNom}>{item.nombre}</Text>
                  <Text style={s.cCorreo}>{item.correo}</Text>
                </View>
                {!!item.addr && <Text style={s.enCadena}>⛓ {t('chat.enCadena')}</Text>}
              </Pressable>
            </Entra>
          )}
        />
        {alta ? (
          <Tarjeta style={{ margin: 18 }}>
            <TextInput value={nNombre} onChangeText={setNNombre} placeholder={t('chat.nombre')}
              placeholderTextColor={C.txt3} style={s.input} />
            <TextInput value={nCorreo} onChangeText={setNCorreo} placeholder={t('chat.correo')}
              placeholderTextColor={C.txt3} style={s.input} autoCapitalize="none" keyboardType="email-address" />
            <BotonOro onPress={agregar}>{t('chat.agregar')}</BotonOro>
          </Tarjeta>
        ) : (
          <View style={{ margin: 18 }}>
            <BotonOro sec onPress={() => setAlta(true)}>{t('chat.nuevo')}</BotonOro>
          </View>
        )}
      </View>
    );
  }

  // ── el hilo ─────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.todo}>
      <View style={s.cabHilo}>
        <Pressable onPress={() => setCon(null)}><Text style={s.volver}>‹</Text></Pressable>
        <View style={s.avatar}><Text style={s.avatarTxt}>{con.nombre[0]?.toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cNom}>{con.nombre}</Text>
          <Text style={s.cCorreo}>{con.correo}</Text>
        </View>
        <Pressable style={s.btnOrigen} onPress={enviarOrigen}>
          <Text style={s.btnOrigenTxt}>{t('chat.enviarOrigen')}</Text>
        </Pressable>
      </View>
      <FlatList
        ref={lista}
        data={hilo}
        keyExtractor={(m, i) => String(m.cuando || i)}
        contentContainerStyle={{ padding: 14, gap: 6 }}
        onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mio = item.de === yo.email;
          return (
            <View style={[s.burbuja, mio ? s.mia : s.suya, item.fallo && s.falloB]}>
              <Text style={[s.msg, mio && { color: C.darkText }]}>{item.texto}</Text>
            </View>
          );
        }}
      />
      <View style={s.emojis}>
        {EMOJIS.map((e) => (
          <Pressable key={e} onPress={() => setTexto((x) => x + e)}><Text style={s.emoji}>{e}</Text></Pressable>
        ))}
      </View>
      <View style={s.filaEscribe}>
        <TextInput value={texto} onChangeText={setTexto} placeholder={t('chat.escribe')}
          placeholderTextColor={C.txt3} style={[s.input, { flex: 1, marginBottom: 0 }]}
          onSubmitEditing={mandar} returnKeyType="send" />
        <Pressable style={s.mandar} onPress={mandar}><Text style={s.mandarTxt}>↑</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  todo: { flex: 1 },
  vacio: { color: C.txt3, fontSize: 13, lineHeight: 20, marginTop: 8 },
  contacto: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 14, padding: 12, marginBottom: 8 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: C.darkText, fontWeight: '800', fontSize: 15 },
  cNom: { color: C.txt, fontSize: 14.5, fontWeight: '600' },
  cCorreo: { color: C.txt3, fontSize: 11 },
  enCadena: { color: C.up, fontSize: 9.5 },
  input: { backgroundColor: C.input, borderWidth: 1, borderColor: 'rgba(46,116,119,0.6)', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, color: C.txt, fontSize: 14, marginBottom: 8 },
  cabHilo: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: C.line2 },
  volver: { color: C.gold, fontSize: 26, paddingHorizontal: 6 },
  btnOrigen: { backgroundColor: C.gold, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  btnOrigenTxt: { color: C.darkText, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  burbuja: { maxWidth: '80%', borderRadius: 15, paddingHorizontal: 13, paddingVertical: 9 },
  mia: { alignSelf: 'flex-end', backgroundColor: C.goldLt, borderBottomRightRadius: 4 },
  suya: { alignSelf: 'flex-start', backgroundColor: C.panel2, borderBottomLeftRadius: 4 },
  falloB: { opacity: 0.5 },
  msg: { color: C.txt, fontSize: 14.5 },
  emojis: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line2 },
  emoji: { fontSize: 20 },
  filaEscribe: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10, alignItems: 'center' },
  mandar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  mandarTxt: { color: C.darkText, fontSize: 18, fontWeight: '800' },
});
