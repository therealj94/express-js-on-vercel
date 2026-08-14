// Bonos y regalos: el programa de lealtad de MyTokenPay, nativo dentro de
// Orden Global. Se porta `bonos.tsx` del mytokenpay-app (Expo 51) con su
// misma anatomía —saldo de puntos arriba, filtros por tipo de premio, la
// rejilla de premios canjeables y el historial de canjes— vestida con el oro
// sobre verde de la casa.
//
// POR QUÉ AQUÍ NO HAY PREMIOS TODAVÍA
// El original pintaba nueve premios que venían de `api.listRewards()`, y el
// saldo de puntos de `api.myRewardsState()`. Ese servidor de MyTokenPay no
// está enchufado en esta app. Los premios que traía el código eran datos de
// demostración —comercios de ejemplo, fotos de relleno de picsum— y pintarlos
// aquí sería prometerle a alguien un café gratis que nadie le va a dar, y
// enseñarle un saldo de puntos que no existe.
//
// Así que la pantalla está COMPLETA pero dice la verdad: la mecánica del
// programa se explica (es real: así funciona), el saldo se muestra como
// desconocido en vez de como cero —cero es una cifra, y una cifra falsa es
// peor que un guion— y el catálogo dice por qué está vacío. Toda la parte que
// pinta premios y canjea está escrita y viva: el día que exista el servidor,
// lo único que cambia es `traerBonos()`.
//
// El morado-negro #0A0812 de MyTokenPay es su marca; se conserva su carácter
// —el saldo como una sola tarjeta de acento que manda en la pantalla— con el
// oro de Orden Global.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Modal, Image, Animated, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../../theme';
import { Header, Skeleton, useToast, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';

const TXT = {
  es: {
    titulo: 'Bonos', sub: 'Tus puntos ORIGEN y sus premios',
    saldo: 'puntos ORIGEN', saldoNota: 'El contador de puntos lo lleva el servidor de MyTokenPay, que todavía no está conectado a esta app. Por eso no te enseñamos un número: cuando el servidor entre, tu saldo real aparece aquí.',
    comoTit: 'CÓMO SE GANAN', comoSub: 'La mecánica del programa, tal como está definida:',
    como1: 'Pagas con ORIGEN', como1d: 'En cualquier comercio afiliado del ecosistema, con tu QR.',
    como2: 'Acumulas puntos', como2d: 'Cada compra suma puntos ORIGEN a tu cuenta.',
    como3: 'Canjeas premios', como3d: 'Descuentos, cosas gratis y experiencias en los mismos comercios.',
    premios: 'CANJEA POR PREMIOS',
    fTodos: 'Todos', fDescuento: 'Descuentos', fGratis: 'Gratis', fExperiencia: 'Experiencias',
    vacioTit: 'Todavía no hay premios que mostrar',
    vacioTxt: 'El catálogo de premios vive en el servidor de MyTokenPay y esta app aún no habla con él. En cuanto se conecte, los premios de los comercios afiliados aparecen aquí con su costo en puntos.',
    vacioFiltro: 'Sin premios en esta categoría por ahora.',
    canjes: 'MIS CANJES', canjesVacio: 'Cuando canjees tu primer premio, queda aquí con su fecha para que puedas mostrarlo en el comercio.',
    costo: 'pts', canjear: 'CANJEAR', faltan: 'Te faltan puntos',
    confTit: '¿Canjear este premio?', confBtn: 'CANJEAR', cancelar: 'Cancelar',
    sinServidor: 'No se puede canjear todavía: la app no tiene conexión con el servidor de MyTokenPay.',
    pie: 'Los puntos no son dinero y no salen de tu billetera: son del programa de lealtad. Lo que sí se mueve en ORIGEN lo firmas tú, siempre, en la pantalla de envío.',
  },
  en: {
    titulo: 'Rewards', sub: 'Your ORIGEN points and their prizes',
    saldo: 'ORIGEN points', saldoNota: 'The point ledger is kept by the MyTokenPay server, which is not wired into this app yet. That is why we show no number: when the server lands, your real balance appears here.',
    comoTit: 'HOW YOU EARN', comoSub: 'The programme mechanics, as defined:',
    como1: 'You pay with ORIGEN', como1d: 'At any affiliated business in the ecosystem, with your QR.',
    como2: 'You collect points', como2d: 'Every purchase adds ORIGEN points to your account.',
    como3: 'You redeem prizes', como3d: 'Discounts, free items and experiences at those same businesses.',
    premios: 'REDEEM FOR PRIZES',
    fTodos: 'All', fDescuento: 'Discounts', fGratis: 'Free', fExperiencia: 'Experiences',
    vacioTit: 'No prizes to show yet',
    vacioTxt: 'The prize catalogue lives on the MyTokenPay server and this app does not talk to it yet. As soon as it connects, the affiliated businesses’ prizes show up here with their cost in points.',
    vacioFiltro: 'No prizes in this category for now.',
    canjes: 'MY REDEMPTIONS', canjesVacio: 'When you redeem your first prize it stays here with its date, so you can show it at the business.',
    costo: 'pts', canjear: 'REDEEM', faltan: 'Not enough points',
    confTit: 'Redeem this prize?', confBtn: 'REDEEM', cancelar: 'Cancel',
    sinServidor: 'Cannot redeem yet: the app has no connection to the MyTokenPay server.',
    pie: 'Points are not money and never leave your wallet: they belong to the loyalty programme. Anything that actually moves in ORIGEN is signed by you, always, on the send screen.',
  },
};

// Los mismos cuatro filtros del original. La clave vacía es "todos".
const FILTROS = [
  { clave: '', txt: 'fTodos' },
  { clave: 'descuento', txt: 'fDescuento' },
  { clave: 'gratis', txt: 'fGratis' },
  { clave: 'experiencia', txt: 'fExperiencia' },
];

// ═══ EL ÚNICO PUNTO DE ENCHUFE ═══════════════════════════════════════
// Aquí iban `api.listRewards()` y `api.myRewardsState()` del mytokenpay-app.
// Mientras no haya servidor MTP, esto devuelve un estado HONESTO: puntos
// desconocidos (null, que no es lo mismo que cero) y listas vacías. Todo lo
// que hay debajo ya sabe pintar premios y canjes de verdad, así que cuando
// exista el backend basta con que esta función los traiga, con esta forma:
//
//   puntos:  número (saldo) o null si no se pudo saber
//   premios: [{ id, titulo, detalle, costo, categoria, imagen, comercio }]
//            categoria ∈ 'descuento' | 'gratis' | 'experiencia' (los filtros)
//   canjes:  [{ id, titulo, cuando }]  ·  cuando = fecha ISO o ms
async function traerBonos() {
  return { puntos: null, premios: [], canjes: [] };
}

const fmtPuntos = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

// Entrada en cascada — la misma que usan el panel y la actividad de pay.
function Entrada({ delay = 0, style, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 420, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, speed: 11, bounciness: 7, useNativeDriver: true }),
    ]).start();
  }, [op, y, delay]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

function Paso({ n, titulo, texto }) {
  return (
    <View style={st.paso}>
      <View style={st.pasoNum}><Text style={st.pasoNumTxt}>{n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={st.pasoTit}>{titulo}</Text>
        <Text style={st.pasoTxt}>{texto}</Text>
      </View>
    </View>
  );
}

export default function BonosPay({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const toast = useToast();

  const [puntos, setPuntos] = useState(undefined);   // undefined ⇒ leyendo; null ⇒ desconocido
  const [premios, setPremios] = useState(undefined);
  const [canjes, setCanjes] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const [mirando, setMirando] = useState(null);      // premio a punto de canjearse

  const cargar = useCallback(async () => {
    try {
      const d = await traerBonos();
      setPuntos(d.puntos); setPremios(d.premios || []); setCanjes(d.canjes || []);
    } catch (e) {
      setPuntos(null); setPremios([]); setCanjes([]);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = (premios || []).filter((p) => (filtro ? p.categoria === filtro : true));

  // El canje del original descontaba puntos en el servidor y devolvía el
  // comprobante. Sin servidor no se puede fingir: se dice y no se toca nada.
  const canjear = async () => {
    const premio = mirando;
    setMirando(null);
    if (!premio) return;
    hap();
    toast(t.sinServidor, 'error');
  };

  return (
    <View style={st.screen}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <ScrollView
        contentContainerStyle={st.dentro}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando} tintColor={C.gold} colors={[C.gold]}
            onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }}
          />
        }>

        {/* ── el saldo: la tarjeta que manda en la pantalla ────────────── */}
        <Entrada delay={0}>
          <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.saldo}>
            <Icon name="star" size={20} color={C.darkText} />
            {puntos === undefined
              ? <Skeleton width={120} height={40} radius={10} style={{ marginTop: 10, backgroundColor: 'rgba(58,44,8,0.18)' }} />
              : <Text style={st.saldoNum}>{fmtPuntos(puntos)}</Text>}
            <Text style={st.saldoLbl}>{t.saldo}</Text>
          </LinearGradient>
          {puntos === null ? <Text style={st.nota}>{t.saldoNota}</Text> : null}
        </Entrada>

        {/* ── cómo se ganan: la mecánica, que sí es real ───────────────── */}
        <Entrada delay={90}>
          <Text style={[st.grupo, { marginTop: 22 }]}>{t.comoTit}</Text>
          <Text style={st.grupoSub}>{t.comoSub}</Text>
          <View style={st.pasos}>
            <Paso n="1" titulo={t.como1} texto={t.como1d} />
            <Paso n="2" titulo={t.como2} texto={t.como2d} />
            <Paso n="3" titulo={t.como3} texto={t.como3d} />
          </View>
        </Entrada>

        {/* ── el catálogo, con sus filtros ─────────────────────────────── */}
        <Entrada delay={170}>
          <Text style={[st.grupo, { marginTop: 24 }]}>{t.premios}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {FILTROS.map((f) => {
              const activo = filtro === f.clave;
              return (
                <Pressable key={f.clave || 'todos'} onPress={() => { hap(); setFiltro(f.clave); }}
                  accessibilityRole="button" accessibilityLabel={t[f.txt]}
                  style={[st.chip, activo && st.chipOn]}>
                  <Text style={[st.chipTxt, activo && { color: C.darkText, fontWeight: '800' }]}>{t[f.txt]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {premios === undefined ? (
            <View style={{ gap: 11 }}>
              <Skeleton width="100%" height={190} radius={18} />
              <Skeleton width="100%" height={190} radius={18} />
            </View>
          ) : lista.length === 0 ? (
            <View style={st.vacio}>
              <View style={st.vacioIc}><Text style={st.vacioEmoji}>🎁</Text></View>
              <Text style={st.vacioTit}>{t.vacioTit}</Text>
              <Text style={st.vacioTxt}>{filtro && premios.length > 0 ? t.vacioFiltro : t.vacioTxt}</Text>
            </View>
          ) : (
            lista.map((p) => {
              const alcanza = puntos != null && puntos >= p.costo;
              return (
                <View key={p.id} style={st.premio}>
                  {p.imagen ? <Image source={{ uri: p.imagen }} style={st.premioImg} resizeMode="cover" /> : null}
                  <View style={{ padding: 14 }}>
                    <View style={st.premioCab}>
                      <Text style={st.premioTit}>{p.titulo}</Text>
                      <View style={st.pastilla}><Text style={st.pastillaTxt}>{p.costo} {t.costo}</Text></View>
                    </View>
                    <Text style={st.premioTxt}>{p.detalle}</Text>
                    {p.comercio ? (
                      <View style={st.comercio}>
                        <Icon name="storefront" size={12} color={C.txt3} />
                        <Text style={st.comercioTxt}>{p.comercio}</Text>
                      </View>
                    ) : null}
                    <Pressable disabled={!alcanza} onPress={() => { hap(); setMirando(p); }}
                      accessibilityRole="button" accessibilityLabel={t.canjear}
                      style={[st.canjeBtn, !alcanza && st.canjeBtnOff]}>
                      <Text style={[st.canjeBtnTxt, !alcanza && { color: C.txt3 }]}>
                        {alcanza ? t.canjear : t.faltan}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </Entrada>

        {/* ── el historial de canjes ───────────────────────────────────── */}
        <Entrada delay={250}>
          <Text style={[st.grupo, { marginTop: 26 }]}>{t.canjes}</Text>
          {canjes.length === 0 ? (
            <Text style={st.notaCaja}>{t.canjesVacio}</Text>
          ) : (
            canjes.map((c) => (
              <View key={c.id} style={st.canje}>
                <View style={st.canjeIc}><Icon name="checkmark-circle" size={18} color={C.up} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.canjeTit} numberOfLines={1}>{c.titulo}</Text>
                  <Text style={st.canjeCuando}>
                    {new Date(c.cuando).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-HN',
                      { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              </View>
            ))
          )}
          <Text style={st.pie}>{t.pie}</Text>
        </Entrada>
      </ScrollView>

      {/* el ConfirmDialog del original: canjear puntos no puede ser un
          resbalón del dedo, así que siempre se pregunta antes */}
      <Modal visible={!!mirando} transparent animationType="fade" onRequestClose={() => setMirando(null)}>
        <Pressable style={st.velo} onPress={() => setMirando(null)}>
          <View style={st.dialogo}>
            <Text style={st.dialogoEmoji}>🎁</Text>
            <Text style={st.dialogoTit}>{t.confTit}</Text>
            {mirando ? (
              <Text style={st.dialogoTxt}>
                {mirando.titulo} · {mirando.costo} {t.costo}
              </Text>
            ) : null}
            <Pressable onPress={canjear}>
              <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.dialogoBtn}>
                <Text style={st.dialogoBtnTxt}>{t.confBtn}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setMirando(null)} hitSlop={8}>
              <Text style={st.dialogoNo}>{t.cancelar}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 6 },
  dentro: { paddingHorizontal: 20, paddingBottom: 110 },
  grupo: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6 },
  grupoSub: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  nota: { color: C.txt3, fontSize: 12, lineHeight: 18, marginTop: 12 },
  notaCaja: { color: C.txt3, fontSize: 12.5, lineHeight: 19, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 15, marginTop: 12 },

  saldo: { borderRadius: 22, padding: 22, alignItems: 'center', shadowColor: '#C9A961', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  saldoNum: { color: C.darkText, fontSize: 40, fontWeight: '800', marginTop: 8, fontVariant: ['tabular-nums'] },
  saldoLbl: { color: 'rgba(58,44,8,0.78)', fontSize: 12, fontWeight: '700', marginTop: 2, letterSpacing: 0.4 },

  pasos: { marginTop: 14, gap: 11 },
  paso: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 14 },
  pasoNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(201,169,97,0.14)', borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  pasoNumTxt: { color: C.gold, fontSize: 13, fontWeight: '800' },
  pasoTit: { color: C.txt, fontSize: 14, fontWeight: '700' },
  pasoTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  chips: { gap: 8, marginTop: 14, marginBottom: 14, paddingRight: 8 },
  chip: { borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipTxt: { color: C.txt2, fontSize: 12, fontWeight: '600' },

  vacio: { alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 20, padding: 24 },
  vacioIc: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  vacioEmoji: { fontSize: 28 },
  vacioTit: { color: C.goldLt, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  vacioTxt: { color: C.txt3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 8 },

  premio: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  premioImg: { width: '100%', height: 132, backgroundColor: C.panel2 },
  premioCab: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 9 },
  premioTit: { flex: 1, color: C.txt, fontSize: 14.5, fontWeight: '700' },
  pastilla: { backgroundColor: 'rgba(201,169,97,0.14)', borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pastillaTxt: { color: C.goldLt, fontSize: 11, fontWeight: '800' },
  premioTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 18, marginTop: 7 },
  comercio: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  comercioTxt: { color: C.txt3, fontSize: 11 },
  canjeBtn: { marginTop: 13, backgroundColor: C.gold, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  canjeBtnOff: { backgroundColor: C.panel2 },
  canjeBtnTxt: { color: C.darkText, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },

  canje: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginTop: 10 },
  canjeIc: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(62,217,160,0.12)', alignItems: 'center', justifyContent: 'center' },
  canjeTit: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  canjeCuando: { color: C.txt3, fontSize: 11, marginTop: 2 },

  pie: { color: C.txt3, fontSize: 11.5, lineHeight: 17, marginTop: 22, textAlign: 'center' },

  velo: { flex: 1, backgroundColor: 'rgba(1,10,11,0.88)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  dialogo: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#0A3436', borderWidth: 1, borderColor: C.line2, borderRadius: 22, padding: 22 },
  dialogoEmoji: { fontSize: 30 },
  dialogoTit: { color: C.txt, fontSize: 16.5, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  dialogoTxt: { color: C.txt2, fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  dialogoBtn: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 34, alignItems: 'center', marginTop: 18 },
  dialogoBtnTxt: { color: C.darkText, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  dialogoNo: { color: C.txt3, fontSize: 13, marginTop: 14 },
});
