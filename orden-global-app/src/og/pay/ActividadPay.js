// La actividad del negocio en MyTokenPay: SOLO los cobros recibidos.
// Es deliberadamente distinta de la Actividad de la billetera (que mezcla
// entradas y salidas con filtros): un comerciante mirando su caja quiere ver
// quién le pagó, cuánto y cuándo — nada más. Se porta el espíritu de la
// lista "Cobros recibidos" de negocio-panel.tsx (mytokenpay-app, Expo 51)
// sin importar nada de allí, con el oro sobre verde profundo de la casa.
//
// El dato es la verdad de la cadena: transferencias ENTRANTES de
// account.transfers. Sin backend MTP no hay facturas ni propinas — y no se
// inventan: cuando no hay nada, la pantalla dice exactamente por qué.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, Animated, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../../theme';
import { Header, Button3D, Skeleton, useAccount, useToast } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import { qtyFmt } from '../../data';
import { apiPortfolio } from '../../api';
import { upsertApiAccount } from '../../accounts';
import { listContacts, nameFor } from '../../addressBook';

const TXT = {
  es: {
    titulo: 'Cobros', sub: 'Recibidos en la cadena · Orden Global',
    total: 'TOTAL RECIBIDO', numCobros: '{n} cobros', unCobro: '1 cobro',
    otros: 'Además de ORIGEN también recibiste otros tokens; aparecen abajo con su símbolo.',
    de: 'De', leyendo: 'Leyendo tus cobros en la cadena…',
    sinDatos: 'La cadena no devolvió movimientos: puede que tu cuenta sea nueva o que no hubiera conexión. Desliza hacia abajo para reintentar.',
    vacioT: 'Sin cobros todavía',
    vacioP: 'Cuando alguien escanee tu QR y firme el pago, el cobro aparece aquí con su fecha, su monto y de quién vino.',
    cobrarBtn: 'COBRAR CON QR', refrescado: 'Cobros actualizados',
  },
  en: {
    titulo: 'Payments', sub: 'Received on chain · Orden Global',
    total: 'TOTAL RECEIVED', numCobros: '{n} payments', unCobro: '1 payment',
    otros: 'Besides ORIGEN you also received other tokens; they show below with their symbol.',
    de: 'From', leyendo: 'Reading your payments on chain…',
    sinDatos: 'The chain returned no movements: your account may be new, or the connection failed. Pull down to retry.',
    vacioT: 'No payments yet',
    vacioP: 'When someone scans your QR and signs the payment, it shows up here with its date, amount and who it came from.',
    cobrarBtn: 'CHARGE WITH QR', refrescado: 'Payments refreshed',
  },
};

// El mismo criterio de "entrante" que Actividad y los avisos ('recive' es el
// literal histórico del backend; se respeta para no perder movimientos).
const esEntrante = (x) => x.type === 'recive' || x.type === 'receive' || x.type === 'in';
const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

// Cada fila entra con una pequeña cascada (tope de retardo para que al hacer
// scroll las filas nuevas no "lleguen tarde"). Solo opacity/transform ⇒
// useNativeDriver y el hilo de JS queda libre para la lista.
function Fila({ indice = 0, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    const delay = Math.min(indice, 9) * 45;
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 360, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, speed: 13, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [op, y, indice]);
  return <Animated.View style={{ opacity: op, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

export default function ActividadPay({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account, login } = useAccount();
  const toast = useToast();
  const [refrescando, setRefrescando] = useState(false);
  const [contactos, setContactos] = useState([]);

  // La libreta pone nombre a quien pagó; sin nombre, la dirección cortada.
  useEffect(() => {
    if (account?.email) listContacts(account.email).then(setContactos).catch(() => {});
  }, [account?.email]);
  const etiqueta = (addr) => nameFor(contactos, addr) || shortAddr(addr);

  // Esta pantalla puede abrirse sin pasar por Home (que es quien refrescaba
  // el portafolio), así que refresca ella misma: al entrar y al tirar.
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

  // undefined ⇒ la cadena nunca se leyó (skeleton); [] ⇒ leída y sin cobros.
  const transfers = account?.transfers;
  const entrantes = useMemo(() => (transfers || [])
    .filter(esEntrante)
    .slice()
    .sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0)), [transfers]);

  const esOrigen = (x) => (x.symbol || 'ORIGEN') === 'ORIGEN';
  const totalOrigen = entrantes.filter(esOrigen).reduce((a, x) => a + (Number(x.value) || 0), 0);
  const hayOtros = entrantes.some((x) => !esOrigen(x));

  // La lista se agrupa por día (como el hilo del chat): un separador por
  // fecha y las filas del día debajo. timeStamp viene en SEGUNDOS.
  const filas = useMemo(() => {
    const out = []; let diaPrev = '';
    for (const x of entrantes) {
      const ms = (Number(x.timeStamp) || 0) * 1000;
      const dia = new Date(ms).toDateString();
      if (dia !== diaPrev) { out.push({ sep: dia, ms }); diaPrev = dia; }
      out.push(x);
    }
    return out;
  }, [entrantes]);

  const loc = lang === 'en' ? 'en-US' : 'es-HN';
  const etiquetaDia = (ms) => {
    const d = new Date(ms);
    const conAnio = d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString(loc, {
      weekday: 'short', day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}),
    });
  };
  const hora = (ts) => new Date((Number(ts) || 0) * 1000)
    .toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });

  const tirador = (
    <RefreshControl
      refreshing={refrescando} tintColor={C.gold} colors={[C.gold]}
      onRefresh={async () => { setRefrescando(true); await refrescar(true); setRefrescando(false); }}
    />
  );

  // ══ cadena aún sin leer: esqueletos y la verdad, no un cero ═════════════
  if (transfers === undefined) {
    return (
      <View style={st.screen}>
        <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Skeleton width="100%" height={86} radius={20} />
          <Skeleton width="100%" height={58} radius={16} />
          <Skeleton width="100%" height={58} radius={16} />
          <Skeleton width="100%" height={58} radius={16} />
          <Text style={st.nota}>{t.leyendo}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={st.screen}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <FlatList
        data={filas}
        keyExtractor={(x, i) => (x.sep ? 'd' + x.sep : String(x.hash || x.timeStamp || i))}
        contentContainerStyle={st.dentro}
        showsVerticalScrollIndicator={false}
        refreshControl={tirador}
        ListHeaderComponent={
          entrantes.length > 0 ? (
            <Fila indice={0}>
              <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.resumen}>
                <View style={{ flex: 1 }}>
                  <Text style={st.resumenLbl}>{t.total}</Text>
                  <Text style={st.resumenNum}>
                    {qtyFmt(totalOrigen)} <Text style={st.resumenMon}>ORIGEN</Text>
                  </Text>
                  <Text style={st.resumenSub}>
                    {entrantes.length === 1 ? t.unCobro : t.numCobros.replace('{n}', String(entrantes.length))}
                  </Text>
                </View>
                <View style={st.resumenIc}><Icon name="trending-up" size={22} color={C.gold} /></View>
              </LinearGradient>
              {hayOtros ? <Text style={st.nota}>{t.otros}</Text> : null}
            </Fila>
          ) : null
        }
        ListEmptyComponent={
          <Fila indice={0}>
            <View style={st.vacio}>
              <View style={st.vacioIc}><Icon name="qr-code" size={30} color={C.gold} /></View>
              <Text style={st.vacioT}>{t.vacioT}</Text>
              <Text style={st.vacioP}>{transfers.length === 0 ? t.sinDatos : t.vacioP}</Text>
              <Button3D title={t.cobrarBtn} icon="qr-code" onPress={() => nav.go('cobrar')}
                style={{ alignSelf: 'stretch', marginTop: 18 }} />
            </View>
          </Fila>
        }
        renderItem={({ item, index }) => {
          if (item.sep) {
            return (
              <View style={st.dia}><Text style={st.diaTxt}>{etiquetaDia(item.ms)}</Text></View>
            );
          }
          return (
            <Fila indice={index}>
              <View style={st.cobro}>
                <View style={st.cobroIc}><Icon name="arrow-down" size={18} color={C.up} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.cobroDe} numberOfLines={1}>{t.de}: {etiqueta(item.from)}</Text>
                  <Text style={st.cobroCuando}>{hora(item.timeStamp)}</Text>
                </View>
                <Text style={st.cobroMonto}>+{qtyFmt(Number(item.value) || 0)} {item.symbol || 'ORIGEN'}</Text>
              </View>
            </Fila>
          );
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 6 },
  dentro: { paddingHorizontal: 20, paddingBottom: 110, flexGrow: 1 },

  resumen: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line, marginBottom: 6 },
  resumenLbl: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6 },
  resumenNum: { color: C.goldLt, fontSize: 28, fontWeight: '300', marginTop: 6, fontVariant: ['tabular-nums'] },
  resumenMon: { fontSize: 14, color: C.gold, fontWeight: '700' },
  resumenSub: { color: C.txt2, fontSize: 11.5, marginTop: 2 },
  resumenIc: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  nota: { color: C.txt3, fontSize: 11.5, lineHeight: 17, marginTop: 8, marginBottom: 2 },

  dia: { alignSelf: 'center', backgroundColor: 'rgba(110,147,143,0.14)', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 3, marginTop: 14, marginBottom: 8 },
  diaTxt: { color: C.txt3, fontSize: 10.5, letterSpacing: 0.4 },

  cobro: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginBottom: 9 },
  cobroIc: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(62,217,160,0.12)', alignItems: 'center', justifyContent: 'center' },
  cobroDe: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  cobroCuando: { color: C.txt3, fontSize: 11, marginTop: 2 },
  cobroMonto: { color: C.up, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] },

  vacio: { alignItems: 'center', marginTop: 46, paddingHorizontal: 12 },
  vacioIc: { width: 78, height: 78, borderRadius: 39, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  vacioT: { color: C.txt, fontWeight: '700', fontSize: 16, marginTop: 16 },
  vacioP: { color: C.txt3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 6 },
});
