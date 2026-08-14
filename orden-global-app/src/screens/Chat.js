// La mensajería del ecosistema, completa:
//   · lista de conversaciones con lo último dicho y burbujas de no-leídos;
//   · directorio de Genesis: buscas a la gente por nombre o correo y la
//     encuentras si ya está en el ecosistema — sin teclear direcciones;
//   · el hilo con separadores de día, horas, palomita de entregado, emojis
//     y ENVIAR ORIGEN en la cabecera, que abre la wallet con todo preparado.
//
// La verdad del transporte, escrita donde se mantiene: los mensajes van por
// el relevo del cerebro y se consultan cada 3 s con el hilo abierto. Sin
// cifrado de extremo a extremo en v1 — no se promete en ningún texto.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../theme';
import { useT } from '../i18n';
import {
  quienSoy, chatAlta, chatEnviar, chatBandeja, chatBuscar,
  chatConversaciones, chatLeido,
} from '../api';
import { Entra, Etiqueta } from '../ui';
import { aUri } from '../rutas';

const EMOJIS = ['👍', '🙏', '🎉', '💛', '😂', '🤝', '🔥', '✨', '💰', '🚀'];

const horaDe = (ms) => {
  const d = new Date(ms);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
};
const diaDe = (ms) => new Date(ms).toDateString();

// Colores de avatar estables por persona: la misma inicial siempre en el
// mismo tono, para que la lista se reconozca de un vistazo.
const TONOS = [['#F8EFCF', '#C9A961'], ['#9FE3C9', '#2E8F6E'], ['#BFD8F5', '#4A78B0'], ['#F2C4B3', '#B0674A']];
const tonoDe = (correo) => TONOS[(String(correo).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % TONOS.length];

function Avatar({ nombre, correo, tam = 42 }) {
  return (
    <LinearGradient colors={tonoDe(correo)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: tam, height: tam, borderRadius: tam / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#123', fontWeight: '800', fontSize: tam * 0.4 }}>
        {String(nombre || correo || '?')[0].toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

export default function Chat({ params, abrir }) {
  const t = useT();
  const yo = quienSoy() || {};
  const [convos, setConvos] = useState(null);      // null = cargando
  const [busca, setBusca] = useState('');
  const [gente, setGente] = useState(null);        // resultados del directorio
  const [con, setCon] = useState(null);            // {correo, nombre, addr}
  const [hilo, setHilo] = useState([]);
  const [texto, setTexto] = useState('');
  const lista = useRef(null);

  useEffect(() => { chatAlta().catch(() => {}); }, []);

  // ── conversaciones: se refrescan cada 5 s mientras se mira la lista ──
  const traerConvos = useCallback(async () => {
    try {
      const d = await chatConversaciones();
      if (Array.isArray(d?.conversaciones)) setConvos(d.conversaciones);
    } catch { if (convos === null) setConvos([]); }
  }, [convos === null]);
  useEffect(() => {
    if (con) return;
    traerConvos();
    const reloj = setInterval(traerConvos, 5000);
    return () => clearInterval(reloj);
  }, [con, traerConvos]);

  // llegar con og://chat/abrir?con=correo abre ese hilo directo
  useEffect(() => {
    if (params?.con && convos) {
      const c = convos.find((x) => x.correo === params.con);
      if (c) setCon(c);
    }
  }, [params?.con, convos === null]);

  // ── el directorio: buscar gente del ecosistema ───────────────────────
  useEffect(() => {
    if (busca.trim().length < 2) { setGente(null); return; }
    const reloj = setTimeout(async () => {
      try { const d = await chatBuscar(busca.trim()); setGente(d?.gente || []); }
      catch { setGente([]); }
    }, 350);
    return () => clearTimeout(reloj);
  }, [busca]);

  // ── el hilo abierto: cada 3 s, y marca leído al entrar ───────────────
  const traerHilo = useCallback(async () => {
    if (!con) return;
    try {
      const d = await chatBandeja(con.correo);
      if (Array.isArray(d?.mensajes)) setHilo(d.mensajes);
    } catch { /* sin red: queda lo último visto */ }
  }, [con?.correo]);
  useEffect(() => {
    if (!con) return;
    traerHilo();
    chatLeido(con.correo).catch(() => {});
    const reloj = setInterval(traerHilo, 3000);
    return () => clearInterval(reloj);
  }, [con?.correo, traerHilo]);

  const mandar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo || !con) return;
    setTexto('');
    const mio = { de: yo.email, para: con.correo, texto: cuerpo, cuando: Date.now(), pendiente: true };
    setHilo((h) => [...h, mio]);
    try { await chatEnviar(con.correo, cuerpo); traerHilo(); }
    catch { setHilo((h) => h.map((m) => (m === mio ? { ...m, fallo: true } : m))); }
  };

  const enviarOrigen = () => {
    if (!con) return;
    abrir(aUri('wallet/enviar', { to: con.addr || con.correo, nombre: con.nombre, monto: '' }));
  };

  // ════ LISTA DE CONVERSACIONES + DIRECTORIO ════════════════════════════
  if (!con) {
    const filas = gente !== null ? gente : (convos || []);
    return (
      <View style={s.todo}>
        <View style={s.cabLista}>
          <Text style={s.titulo}>{t('chat.titulo')}</Text>
          <Text style={s.subTitulo}>{t('chat.sub')}</Text>
          <TextInput
            value={busca} onChangeText={setBusca}
            placeholder={t('chat.buscar')} placeholderTextColor={C.txt3}
            style={s.busca} autoCapitalize="none"
          />
        </View>
        {convos === null ? (
          <ActivityIndicator color={C.gold} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={filas}
            keyExtractor={(c) => c.correo}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            ListHeaderComponent={gente !== null
              ? <Etiqueta style={{ marginTop: 4 }}>{t('chat.directorio')}</Etiqueta>
              : null}
            ListEmptyComponent={
              <Text style={s.vacio}>
                {gente !== null ? t('chat.nadie') : t('chat.vacio')}
              </Text>}
            renderItem={({ item, index }) => (
              <Entra delay={index * 40}>
                <Pressable style={s.fila} onPress={() => { setBusca(''); setGente(null); setCon(item); }}>
                  <Avatar nombre={item.nombre} correo={item.correo} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={s.filaSup}>
                      <Text style={s.fNom} numberOfLines={1}>{item.nombre}</Text>
                      {!!item.ultimo && <Text style={s.fHora}>{horaDe(item.ultimo.cuando)}</Text>}
                    </View>
                    <View style={s.filaSup}>
                      <Text style={s.fUlt} numberOfLines={1}>
                        {item.ultimo
                          ? (item.ultimo.de === yo.email ? '✓ ' : '') + item.ultimo.texto
                          : item.correo}
                      </Text>
                      {item.sinLeer > 0 && (
                        <View style={s.globo}><Text style={s.globoTxt}>{item.sinLeer}</Text></View>
                      )}
                    </View>
                  </View>
                </Pressable>
              </Entra>
            )}
          />
        )}
      </View>
    );
  }

  // ════ EL HILO ════════════════════════════════════════════════════════
  // separadores de día calculados una vez por render
  const conDias = [];
  let diaPrevio = '';
  for (const m of hilo) {
    const d = diaDe(m.cuando);
    if (d !== diaPrevio) { conDias.push({ separador: d, cuando: m.cuando }); diaPrevio = d; }
    conDias.push(m);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.todo}>
      <View style={s.cabHilo}>
        <Pressable onPress={() => { setCon(null); setHilo([]); }} hitSlop={10}>
          <Text style={s.volver}>‹</Text>
        </Pressable>
        <Avatar nombre={con.nombre} correo={con.correo} tam={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.fNom} numberOfLines={1}>{con.nombre}</Text>
          <Text style={s.enLinea} numberOfLines={1}>
            {con.addr ? '⛓ ' + con.addr.slice(0, 8) + '…' + con.addr.slice(-4) : con.correo}
          </Text>
        </View>
        <Pressable onPress={enviarOrigen}>
          <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnOrigen}>
            <Text style={s.btnOrigenTxt}>{t('chat.enviarOrigen')}</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <FlatList
        ref={lista}
        data={conDias}
        keyExtractor={(m, i) => (m.separador ? 'd' + m.separador : String(m.cuando || i))}
        contentContainerStyle={{ padding: 14, gap: 4 }}
        onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          if (item.separador) {
            return (
              <View style={s.dia}>
                <Text style={s.diaTxt}>
                  {new Date(item.cuando).toLocaleDateString(t.idioma === 'en' ? 'en-US' : 'es-HN',
                    { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
              </View>
            );
          }
          const mio = item.de === yo.email;
          return (
            <View style={[s.burbuja, mio ? s.mia : s.suya, item.fallo && { opacity: 0.45 }]}>
              <Text style={[s.msg, mio && { color: C.darkText }]}>{item.texto}</Text>
              <Text style={[s.msgHora, mio && { color: 'rgba(58,44,8,0.55)' }]}>
                {horaDe(item.cuando)}{mio ? (item.pendiente ? ' ·' : ' ✓') : ''}
              </Text>
            </View>
          );
        }}
      />

      <View style={s.emojis}>
        {EMOJIS.map((e) => (
          <Pressable key={e} onPress={() => setTexto((x) => x + e)} hitSlop={4}>
            <Text style={s.emoji}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.filaEscribe}>
        <TextInput value={texto} onChangeText={setTexto} placeholder={t('chat.escribe')}
          placeholderTextColor={C.txt3} style={s.cajaTxt}
          onSubmitEditing={mandar} returnKeyType="send" multiline />
        <Pressable onPress={mandar}>
          <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.mandar}>
            <Text style={s.mandarTxt}>↑</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  todo: { flex: 1 },
  cabLista: { padding: 18, paddingBottom: 10 },
  titulo: { color: C.txt, fontSize: 24, fontWeight: '300' },
  subTitulo: { color: C.txt3, fontSize: 12, marginTop: 2, marginBottom: 12 },
  busca: { backgroundColor: C.input, borderWidth: 1, borderColor: 'rgba(46,116,119,0.6)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: C.txt, fontSize: 14 },
  vacio: { color: C.txt3, fontSize: 13, lineHeight: 20, marginTop: 14, textAlign: 'center', paddingHorizontal: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.08)' },
  filaSup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fNom: { color: C.txt, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  fHora: { color: C.txt3, fontSize: 10.5 },
  fUlt: { color: C.txt3, fontSize: 12.5, flexShrink: 1, marginTop: 2 },
  globo: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  globoTxt: { color: C.darkText, fontSize: 11, fontWeight: '800' },
  cabHilo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line2, backgroundColor: 'rgba(2,17,18,0.7)' },
  volver: { color: C.gold, fontSize: 28, paddingHorizontal: 4, lineHeight: 30 },
  enLinea: { color: C.txt3, fontSize: 10.5 },
  btnOrigen: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8 },
  btnOrigenTxt: { color: C.darkText, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  dia: { alignSelf: 'center', backgroundColor: 'rgba(110,147,143,0.14)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginVertical: 8 },
  diaTxt: { color: C.txt3, fontSize: 10.5, letterSpacing: 0.5 },
  burbuja: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8, marginVertical: 1.5 },
  mia: { alignSelf: 'flex-end', backgroundColor: C.goldLt, borderBottomRightRadius: 5 },
  suya: { alignSelf: 'flex-start', backgroundColor: C.panel2, borderBottomLeftRadius: 5 },
  msg: { color: C.txt, fontSize: 14.5, lineHeight: 20 },
  msgHora: { color: C.txt3, fontSize: 9.5, alignSelf: 'flex-end', marginTop: 2 },
  emojis: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line2 },
  emoji: { fontSize: 21 },
  filaEscribe: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10, alignItems: 'flex-end' },
  cajaTxt: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: 'rgba(46,116,119,0.6)', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, color: C.txt, fontSize: 14.5, maxHeight: 110 },
  mandar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  mandarTxt: { color: C.darkText, fontSize: 18, fontWeight: '800' },
});
