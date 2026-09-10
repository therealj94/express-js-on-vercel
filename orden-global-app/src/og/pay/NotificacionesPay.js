// NotificacionesPay — la bandeja de avisos de MyTokenPay.
//
// Port de `mobile/app/notificaciones.tsx` del mytokenpay-app (Expo 51): su
// misma anatomía —tarjetas con icono por tipo, resalte y punto azul en las no
// leídas, "hace 2 h" debajo, y todo se marca leído solo a los 0,9 s de
// abrir— y su mismo estado vacío ("No tienes notificaciones por ahora.").
//
// DE DÓNDE SALEN LOS AVISOS, Y POR QUÉ NO HAY PROMOCIONES
// Su bandeja se llenaba desde `src/store/notifications.ts`, cuyo contenido
// es literalmente una constante `SEED` con cuatro avisos escritos a mano: un
// 2x1 en un rooftop de San Salvador, un café gratis, un premio canjeable y
// una bienvenida que regala 480 puntos. Son datos de demostración sobre
// comercios de ejemplo y sobre un contador de puntos que ningún servidor
// lleva todavía. Pintarlos aquí sería prometer regalos que nadie va a
// entregar, así que no se portan.
//
// Lo que sí hay es verdad y tiene fecha: los cobros que entraron a la cadena
// (ver avisos.js) y el estado real del Genesis ID. Con eso se llena la
// bandeja. Cuando el servidor de MyTokenPay entre, sus promociones y sus
// premios se suman en `avisosDe` y esta pantalla los pinta sin cambiar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, FlatList, StyleSheet, Animated, RefreshControl,
} from 'react-native';
import { C } from '../../theme';
import { Header, Skeleton, useAccount, useToast, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import { qtyFmt } from '../../data';
import { apiPortfolio } from '../../api';
import { upsertApiAccount } from '../../accounts';
import { listContacts, nameFor } from '../../addressBook';
import { avisosDe, leerVisto, guardarVisto, haceCuanto } from './avisos';

const TXT = {
  es: {
    titulo: 'Notificaciones', sub: 'MyTokenPay',
    leyendo: 'Leyendo la cadena…',
    vacio: 'No tienes notificaciones por ahora.',
    vacioP: 'Cuando alguien pague tu QR, el cobro aparece aquí al instante con su fecha y de quién vino.',
    sinDatos: 'La cadena no devolvió movimientos: puede que tu cuenta sea nueva o que no hubiera conexión. Desliza hacia abajo para reintentar.',
    cobroT: 'Cobro recibido', cobroDe: 'de',
    gidOkT: 'Genesis ID verificado',
    gidOkP: 'Tu identidad está aprobada: tu negocio nace verificado y no se te piden papeles dos veces.',
    gidNoT: 'Completa tu Genesis ID',
    gidNoP: 'Es la identidad única del ecosistema: con ella tu comercio aparece verificado en el directorio. Toca para continuar.',
    verCobros: 'Ver todos los cobros',
    recorte: 'Aquí se enseñan solo los {n} avisos más recientes: el historial completo vive en «Ver todos los cobros».',
    pie: 'Las promociones y los premios de los comercios llegarán a esta bandeja cuando el servidor de MyTokenPay esté conectado a la app. Hasta entonces aquí solo aparece lo que de verdad ocurre en tu cuenta.',
    refrescado: 'Avisos actualizados',
  },
  en: {
    titulo: 'Notifications', sub: 'MyTokenPay',
    leyendo: 'Reading the chain…',
    vacio: 'You have no notifications right now.',
    vacioP: 'When somebody pays your QR, the payment appears here instantly with its date and who it came from.',
    sinDatos: 'The chain returned no movements: your account may be new, or the connection failed. Pull down to retry.',
    cobroT: 'Payment received', cobroDe: 'from',
    gidOkT: 'Genesis ID verified',
    gidOkP: 'Your identity is approved: your business is born verified and no papers are asked twice.',
    gidNoT: 'Complete your Genesis ID',
    gidNoP: 'It is the single identity of the ecosystem: with it your business shows as verified in the directory. Tap to continue.',
    verCobros: 'See all payments',
    recorte: 'Only the {n} most recent alerts show here: the full history lives under “See all payments”.',
    pie: 'Promotions and prizes from businesses will land in this tray once the MyTokenPay server is connected to the app. Until then only what truly happens in your account shows here.',
    refrescado: 'Notifications refreshed',
  },
};

const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

// La bandeja se corta a los 30 avisos más recientes: pintar CIENTOS de
// tarjetas animadas en cada apertura (una por cobro histórico) trababa la
// pantalla, y lo leído de hace meses ya vive en Cobros — esta bandeja avisa,
// no duplica el historial. El corte va con FlatList, que además virtualiza.
const TOPE_BANDEJA = 30;

// Entrada en cascada, como el resto de la sección: solo opacity y transform,
// así que useNativeDriver.
function Entrada({ indice = 0, style, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    const d = Math.min(indice, 8) * 50;
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 360, delay: d, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay: d, speed: 12, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [op, y, indice]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

export default function NotificacionesPay({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account, login } = useAccount();
  const toast = useToast();
  const [refrescando, setRefrescando] = useState(false);
  const [contactos, setContactos] = useState([]);
  // `visto` se congela al ENTRAR: si se actualizara al marcar leído, las
  // tarjetas perderían el resalte delante de los ojos de quien acaba de
  // abrirlas. El original hace lo mismo — marca leído a los 0,9 s pero deja
  // ver el estilo de "nuevo" durante esta visita.
  const [visto, setVisto] = useState(null);

  useEffect(() => {
    if (account?.email) listContacts(account.email).then(setContactos).catch(() => {});
  }, [account?.email]);
  const etiqueta = (addr) => nameFor(contactos, addr) || shortAddr(addr);

  const refrescar = useCallback(async (avisar) => {
    if (!account?.email) return;
    try {
      const p = await apiPortfolio();
      const upd = await upsertApiAccount({ email: account.email, name: account.name }, account.addr, p);
      if (upd) login(upd);
      if (avisar) toast(t.refrescado);
    } catch (e) {}
  }, [account?.email, account?.name, account?.addr]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refrescar(false); }, [refrescar]);

  useEffect(() => { leerVisto(account?.email).then((v) => setVisto(v)); }, [account?.email]);

  // null ⇒ la cadena nunca se leyó (esqueleto); [] ⇒ leída y sin nada.
  const avisos = useMemo(() => avisosDe(account), [account]);

  // El markAllRead del original, con su mismo respiro de 0,9 s: da tiempo a
  // ver qué era nuevo antes de que el globo del inicio se apague.
  useEffect(() => {
    if (!avisos || avisos.length === 0 || visto === null) return undefined;
    const masNuevo = avisos[0].ts;
    if (masNuevo <= visto) return undefined;
    const id = setTimeout(() => { guardarVisto(account?.email, masNuevo); }, 900);
    return () => clearTimeout(id);
  }, [avisos, visto, account?.email]);

  const sinLeer = (a) => visto !== null && a.ts > visto;
  const hayTransfers = Array.isArray(account?.transfers);
  const gidOk = !!account?.genesisUid;

  // Solo los TOPE_BANDEJA más recientes se montan como tarjetas.
  const recortados = (avisos || []).slice(0, TOPE_BANDEJA);

  return (
    <View style={st.screen}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <FlatList
        data={recortados}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={st.dentro}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando} tintColor={C.gold} colors={[C.gold]}
            onRefresh={async () => { setRefrescando(true); await refrescar(true); setRefrescando(false); }}
          />
        }
        ListHeaderComponent={
          <>
            {/* ── el estado de la identidad: no es un aviso con fecha, es una
                condición de la cuenta, así que va fijo arriba y no cuenta como
                "no leído" (si contara, el globo no se apagaría nunca). ───── */}
            <Entrada indice={0}>
              <Pressable
                onPress={gidOk ? undefined : () => { hap(); nav.go('kyc'); }}
                accessibilityRole={gidOk ? undefined : 'button'}
                accessibilityLabel={gidOk ? t.gidOkT : t.gidNoT}
                style={[st.tarjeta, gidOk ? st.tarjetaOk : st.tarjetaPend]}>
                <View style={[st.ic, gidOk ? st.icOk : st.icPend]}>
                  <Icon name={gidOk ? 'shield-checkmark' : 'finger-print'} size={17} color={gidOk ? C.up : '#FBBF24'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.tit}>{gidOk ? t.gidOkT : t.gidNoT}</Text>
                  <Text style={st.cuerpo}>{gidOk ? t.gidOkP : t.gidNoP}</Text>
                  {gidOk ? <Text style={st.uid}>{account.genesisUid}</Text> : null}
                </View>
                {gidOk ? null : <Icon name="chevron-forward" size={15} color={C.txt3} />}
              </Pressable>
            </Entrada>

            {avisos === null ? (
              <View style={{ gap: 10, marginTop: 12 }}>
                <Skeleton width="100%" height={74} radius={16} />
                <Skeleton width="100%" height={74} radius={16} />
                <Text style={st.nota}>{t.leyendo}</Text>
              </View>
            ) : avisos.length === 0 ? (
              <Entrada indice={1}>
                <View style={st.vacio}>
                  <View style={st.vacioIc}><Icon name="notifications" size={26} color={C.txt3} /></View>
                  <Text style={st.vacioT}>{t.vacio}</Text>
                  <Text style={st.vacioP}>{hayTransfers && account.transfers.length === 0 ? t.sinDatos : t.vacioP}</Text>
                </View>
              </Entrada>
            ) : null}
          </>
        }
        renderItem={({ item: a, index: i }) => (
          <Entrada indice={i + 1}>
            <View style={[st.tarjeta, sinLeer(a) && st.tarjetaNueva]}>
              <View style={[st.ic, sinLeer(a) && st.icNuevo]}>
                <Icon name="arrow-down" size={17} color={sinLeer(a) ? C.up : C.txt3} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={st.titFila}>
                  <Text style={st.tit} numberOfLines={1}>{t.cobroT}</Text>
                  {sinLeer(a) ? <View style={st.punto} /> : null}
                </View>
                <Text style={st.cuerpo}>
                  +{qtyFmt(a.valor)} {a.simbolo} {t.cobroDe} {etiqueta(a.de)}
                </Text>
                <Text style={st.cuando}>{haceCuanto(a.ts, lang)}</Text>
              </View>
            </View>
          </Entrada>
        )}
        ListFooterComponent={
          <>
            {/* si hubo recorte se dice, y el camino al historial completo es
                el enlace de siempre a Cobros */}
            {avisos && avisos.length > TOPE_BANDEJA ? (
              <Text style={st.nota}>{t.recorte.replace('{n}', String(TOPE_BANDEJA))}</Text>
            ) : null}
            {avisos && avisos.length > 0 ? (
              <Pressable
                onPress={() => { hap(); nav.go('pay-actividad'); }}
                accessibilityRole="button" accessibilityLabel={t.verCobros}
                style={st.enlace}>
                <Icon name="pulse" size={15} color={C.gold} />
                <Text style={st.enlaceTxt}>{t.verCobros}</Text>
              </Pressable>
            ) : null}
            <Text style={st.pie}>{t.pie}</Text>
          </>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 6 },
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },

  tarjeta: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 14, marginBottom: 10,
  },
  tarjetaNueva: { borderColor: 'rgba(62,217,160,0.34)', backgroundColor: 'rgba(62,217,160,0.07)' },
  tarjetaOk: { borderColor: 'rgba(62,217,160,0.30)' },
  tarjetaPend: { borderColor: 'rgba(251,191,36,0.35)', backgroundColor: 'rgba(251,191,36,0.07)' },
  ic: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  icNuevo: { backgroundColor: 'rgba(62,217,160,0.13)' },
  icOk: { backgroundColor: 'rgba(62,217,160,0.13)' },
  icPend: { backgroundColor: 'rgba(251,191,36,0.13)' },
  titFila: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tit: { flex: 1, color: C.txt, fontSize: 13.5, fontWeight: '700' },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.up },
  cuerpo: { color: C.txt2, fontSize: 12, lineHeight: 18, marginTop: 4 },
  cuando: { color: C.txt3, fontSize: 10.5, marginTop: 6 },
  uid: { color: C.gold, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, marginTop: 6 },

  nota: { color: C.txt3, fontSize: 12, lineHeight: 18, marginTop: 4 },
  vacio: {
    alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2,
    borderRadius: 18, padding: 24, marginTop: 8,
  },
  vacioIc: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.panel2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  vacioT: { color: C.txt, fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  vacioP: { color: C.txt3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 7 },

  enlace: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  enlaceTxt: { color: C.gold, fontSize: 13, fontWeight: '600' },
  pie: { color: C.txt3, fontSize: 11.5, lineHeight: 17.5, marginTop: 16 },
});
