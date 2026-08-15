// La portada del negocio en MyTokenPay, nativa dentro de Orden Global.
// Se porta el ESPÍRITU del panel de mytokenpay-app (Expo 51: panel.tsx y
// negocio-panel.tsx) sin importar nada de allí: mismo orden visual —tarjeta
// del comercio → resumen del día → acciones → últimos cobros— pero con la
// paleta oro-sobre-verde de la casa y sus componentes (Header, Button3D).
//
// De dónde salen los números: todavía NO hay backend propio de MyTokenPay
// enchufado, así que los "cobros" son las transferencias ENTRANTES reales de
// la billetera (account.transfers) — la verdad de la cadena, el mismo dato
// que la pantalla Actividad. Por eso los estados vacíos dicen la verdad
// ("aún no leemos la cadena" / "hoy no has cobrado") en vez de pintar ceros
// inventados que parecerían un negocio muerto.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, StyleSheet, Animated, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../../theme';
import { Header, Button3D, Skeleton, useAccount, useToast, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import { qtyFmt, money, tokensFromBalances } from '../../data';
import { apiPortfolio } from '../../api';
import { upsertApiAccount } from '../../accounts';
import { listContacts, nameFor } from '../../addressBook';
import { avisosDe, leerVisto, noLeidos } from './avisos';

const TXT = {
  es: {
    miNegocio: 'Mi negocio', bonos: 'Bonos y regalos',
    titulo: 'MyTokenPay', sub: 'Tu negocio cobra en ORIGEN',
    saludo: 'Hola, {n}', bienvenido: 'Bienvenido de nuevo a MyTokenPay.',
    saldoTit: 'SALDO DE TU BILLETERA', saldoPagar: 'Pagar',
    saldoNota: 'Es el ORIGEN real de tu Veta Wallet en la cadena: la misma bolsa con la que cobras y con la que pagas. Toca para pagar en un comercio.',
    sinPrecio: 'El feed de precios no respondió, así que no se enseña el equivalente en dólares en vez de una cifra congelada.',
    notis: 'Notificaciones', notisNuevas: '{n} nuevas', notisAlDia: 'Al día',
    panelNeg: 'Panel del negocio', panelNegS: 'Saldo, métricas y retiros',
    ticket: 'Ticket promedio',
    comercio: 'MI COMERCIO', personal: 'Comercio personal',
    genesisOk: 'Genesis · verificado', genesisNo: 'Genesis pendiente — complétalo',
    hoy: 'RESUMEN DE HOY', cobradoHoy: 'ORIGEN cobrado hoy',
    otrosHoy: 'Hoy también entraron otros tokens: míralos en la actividad.',
    cobrosHoy: 'Cobros hoy', historico: 'Cobros en total', totalRecibido: 'ORIGEN recibido',
    vacioHoy: 'Hoy todavía no has cobrado. Genera tu QR y el primer cobro aparece aquí.',
    sinDatos: 'La cadena no devolvió movimientos: puede que tu cuenta sea nueva o que no hubiera conexión. Desliza hacia abajo para reintentar.',
    leyendo: 'Leyendo tus cobros en la cadena…',
    cobrarBtn: 'COBRAR CON QR', actividad: 'Ver toda la actividad',
    ultimos: 'ÚLTIMOS COBROS', verTodo: 'Ver todo',
    nadieAun: 'Aún no has recibido ningún cobro. Cuando alguien pague tu QR, aparece aquí al instante.',
    de: 'De', refrescado: 'Cobros actualizados',
  },
  en: {
    miNegocio: 'My business', bonos: 'Rewards',
    titulo: 'MyTokenPay', sub: 'Your business charges in ORIGEN',
    saludo: 'Hi, {n}', bienvenido: 'Welcome back to MyTokenPay.',
    saldoTit: 'YOUR WALLET BALANCE', saldoPagar: 'Pay',
    saldoNota: 'This is the real ORIGEN in your Veta Wallet on chain: the same pocket you charge into and pay from. Tap to pay at a business.',
    sinPrecio: 'The price feed did not answer, so the dollar equivalent is not shown rather than showing a frozen figure.',
    notis: 'Notifications', notisNuevas: '{n} new', notisAlDia: 'Up to date',
    panelNeg: 'Business panel', panelNegS: 'Balance, metrics and payouts',
    ticket: 'Average ticket',
    comercio: 'MY BUSINESS', personal: 'Personal storefront',
    genesisOk: 'Genesis · verified', genesisNo: 'Genesis pending — complete it',
    hoy: "TODAY'S SUMMARY", cobradoHoy: 'ORIGEN collected today',
    otrosHoy: 'Other tokens also came in today: see them in the activity.',
    cobrosHoy: 'Payments today', historico: 'Payments overall', totalRecibido: 'ORIGEN received',
    vacioHoy: 'Nothing collected yet today. Generate your QR and the first payment shows up here.',
    sinDatos: 'The chain returned no movements: your account may be new, or the connection failed. Pull down to retry.',
    leyendo: 'Reading your payments on chain…',
    cobrarBtn: 'CHARGE WITH QR', actividad: 'See all activity',
    ultimos: 'LATEST PAYMENTS', verTodo: 'See all',
    nadieAun: 'No payments received yet. When someone pays your QR, it appears here instantly.',
    de: 'From', refrescado: 'Payments refreshed',
  },
};

// El mismo criterio de "entrante" que usan Actividad y los avisos: el backend
// histórico escribe 'recive' (sic) y no se corrige aquí para no perder nada.
const esEntrante = (x) => x.type === 'recive' || x.type === 'receive' || x.type === 'in';
const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

// Entrada en cascada: cada bloque aparece con opacidad + subida, escalonado.
// useNativeDriver porque solo se animan opacity/transform — nada de layout —
// y así la animación no compite con el hilo de JS mientras llega la cadena.
function Entrada({ delay = 0, style, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 420, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, speed: 11, bounciness: 7, useNativeDriver: true }),
    ]).start();
  }, [op, y, delay]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

export default function PanelPay({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account, login } = useAccount();
  const toast = useToast();
  const [refrescando, setRefrescando] = useState(false);
  const [contactos, setContactos] = useState([]);

  // La libreta de contactos: si quien pagó está guardado, se enseña SU NOMBRE
  // en vez de la dirección cortada — igual que en Actividad.
  useEffect(() => {
    if (account?.email) listContacts(account.email).then(setContactos).catch(() => {});
  }, [account?.email]);
  const etiqueta = (addr) => nameFor(contactos, addr) || shortAddr(addr);

  // El globo de la bandeja: cuántos cobros han entrado desde la última vez
  // que se abrieron las notificaciones. El cálculo vive en avisos.js para que
  // la portada, esta pantalla y la bandeja cuenten exactamente lo mismo.
  const [visto, setVisto] = useState(0);
  useEffect(() => { leerVisto(account?.email).then(setVisto); }, [account?.email]);
  const sinLeer = noLeidos(avisosDe(account), visto);

  // La sección pay puede abrirse sin pasar por Home, y Home es quien solía
  // refrescar el portafolio. Aquí se refresca también: al entrar y al tirar.
  // Si falla, no se rompe nada — queda lo cacheado y los textos son honestos.
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

  // undefined ⇒ nunca se ha leído la cadena (skeleton); [] ⇒ leída y sin nada.
  const transfers = account?.transfers;
  const entrantes = useMemo(() => (transfers || [])
    .filter(esEntrante)
    .slice()
    .sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0)), [transfers]);

  // "Hoy" = el día calendario del teléfono. timeStamp viene en SEGUNDOS.
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
  const deHoy = entrantes.filter((x) => (Number(x.timeStamp) || 0) * 1000 >= inicioHoy.getTime());
  const esOrigen = (x) => (x.symbol || 'ORIGEN') === 'ORIGEN';
  const origenHoy = deHoy.filter(esOrigen).reduce((a, x) => a + (Number(x.value) || 0), 0);
  const origenTotal = entrantes.filter(esOrigen).reduce((a, x) => a + (Number(x.value) || 0), 0);
  // El titular del día suma SOLO ORIGEN (mezclar símbolos daría un número
  // falso); si hoy entró otro token, se dice en una línea en vez de callarlo.
  const hayOtrosHoy = deHoy.some((x) => !esOrigen(x));

  // El ticket promedio del panel del negocio original, sobre cobros en
  // ORIGEN: promediar símbolos distintos daría un número sin significado.
  const enOrigen = entrantes.filter(esOrigen);
  const ticket = enOrigen.length ? origenTotal / enOrigen.length : 0;

  // El saldo de la billetera, que panel.tsx enseñaba como "Saldo Veta Wallet".
  // Aquí sale de los balances REALES de la cadena, y si el feed de precios no
  // respondió no se pinta un equivalente en dólares inventado (data.js:
  // un precio ausente nunca se sustituye por un valor congelado).
  const origenTok = useMemo(
    () => tokensFromBalances(account?.balances).find((x) => x.s === 'ORIGEN') || null,
    [account?.balances],
  );
  const saldo = origenTok ? origenTok.qty : 0;
  const saldoUsd = origenTok && origenTok.hasPrice ? origenTok.qty * origenTok.price : null;

  const fmtCuando = (ts) => {
    const d = new Date((Number(ts) || 0) * 1000);
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-HN', { day: 'numeric', month: 'short' })
      + ' · ' + d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-HN', { hour: '2-digit', minute: '2-digit' });
  };

  const acc = account || { name: '', email: '', initials: 'OG', genesisUid: null, passport: null };
  const foto = acc.passport?.photoUrl || null;

  return (
    <View style={st.screen}>
      <Header title={t.titulo} sub={t.sub} />
      <ScrollView
        contentContainerStyle={st.dentro}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando} tintColor={C.gold} colors={[C.gold]}
            onRefresh={async () => { setRefrescando(true); await refrescar(true); setRefrescando(false); }}
          />
        }>

        {/* ── el saludo con el que abría panel.tsx ("Hola, Nombre") ─────── */}
        <Entrada delay={0}>
          <Text style={st.saludo}>{t.saludo.replace('{n}', (acc.name || '').split(' ')[0] || acc.email)}</Text>
          <Text style={st.bienvenido}>{t.bienvenido}</Text>
        </Entrada>

        {/* ── la tarjeta del comercio: la persona ES el negocio ─────────── */}
        <Entrada delay={40}>
          <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.negocio}>
            <View style={st.negocioTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Icon name="storefront" size={15} color={C.gold} />
                <Text style={st.marca}>{t.comercio}</Text>
              </View>
              {acc.genesisUid ? (
                <View style={st.badgeOk}>
                  <Icon name="shield-checkmark" size={12} color={C.up} />
                  <Text style={st.badgeOkTxt}>{t.genesisOk}</Text>
                </View>
              ) : (
                <Pressable onPress={() => { hap(); nav.go('kyc'); }}>
                  <View style={st.badgePend}>
                    <Icon name="time" size={12} color="#FBBF24" />
                    <Text style={st.badgePendTxt}>{t.genesisNo}</Text>
                  </View>
                </Pressable>
              )}
            </View>
            <View style={st.negocioBody}>
              {foto ? (
                <Image source={{ uri: foto }} style={st.avatarFoto} />
              ) : (
                <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.avatar}>
                  <Text style={st.avatarTxt}>{acc.initials || 'OG'}</Text>
                </LinearGradient>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.nombre} numberOfLines={1}>{acc.name}</Text>
                <Text style={st.correo} numberOfLines={1}>{acc.email}</Text>
                <Text style={st.tipoNeg}>{t.personal}{acc.genesisUid ? ` · ${acc.genesisUid}` : ''}</Text>
              </View>
            </View>
          </LinearGradient>
        </Entrada>

        {/* ── el saldo de la billetera: la "Saldo Veta Wallet" del original,
            que además era el atajo a pagar. Aquí es el mismo ORIGEN con el
            que se cobra: en Orden Global no hay dos bolsas. ─────────────── */}
        <Entrada delay={70}>
          <Pressable
            onPress={() => { hap(); nav.go('pay-pagar'); }}
            accessibilityRole="button" accessibilityLabel={t.saldoTit}
            style={st.saldo}>
            <View style={st.saldoIc}><Icon name="wallet" size={18} color={C.gold} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.saldoLbl}>{t.saldoTit}</Text>
              <Text style={st.saldoVal} numberOfLines={1}>
                {qtyFmt(saldo)} ORIGEN
                {saldoUsd != null ? <Text style={st.saldoUsd}>{'  ≈ ' + money(saldoUsd)}</Text> : null}
              </Text>
            </View>
            <View style={st.saldoBtn}>
              <Text style={st.saldoBtnTxt}>{t.saldoPagar}</Text>
              <Icon name="arrow-forward" size={13} color={C.darkText} />
            </View>
          </Pressable>
          <Text style={st.nota}>{saldoUsd == null ? t.sinPrecio : t.saldoNota}</Text>
        </Entrada>

        {/* ── resumen del día ───────────────────────────────────────────── */}
        <Entrada delay={110}>
          <View style={st.resumen}>
            <Text style={st.grupo}>{t.hoy}</Text>
            {transfers === undefined ? (
              <View style={{ gap: 10, marginTop: 6 }}>
                <Skeleton width={170} height={34} radius={9} />
                <Skeleton width={220} height={13} />
                <Text style={st.nota}>{t.leyendo}</Text>
              </View>
            ) : (
              <>
                <Text style={st.granNumero}>
                  {qtyFmt(origenHoy)} <Text style={st.moneda}>ORIGEN</Text>
                </Text>
                <Text style={st.granSub}>{t.cobradoHoy}</Text>
                {/* el ticket promedio que enseñaba negocio-panel.tsx: dice si
                    los cobros son muchos y pequeños o pocos y grandes */}
                {enOrigen.length > 0 ? (
                  <Text style={st.granSub}>{t.ticket}: {qtyFmt(ticket)} ORIGEN</Text>
                ) : null}
                {hayOtrosHoy ? <Text style={st.nota}>{t.otrosHoy}</Text> : null}
                {entrantes.length === 0 ? (
                  <Text style={st.nota}>{transfers.length === 0 ? t.sinDatos : t.nadieAun}</Text>
                ) : deHoy.length === 0 ? (
                  <Text style={st.nota}>{t.vacioHoy}</Text>
                ) : null}
                <View style={st.statsFila}>
                  <View style={st.stat}>
                    <Text style={st.statNum}>{deHoy.length}</Text>
                    <Text style={st.statLbl}>{t.cobrosHoy}</Text>
                  </View>
                  <View style={[st.stat, st.statMedio]}>
                    <Text style={st.statNum}>{entrantes.length}</Text>
                    <Text style={st.statLbl}>{t.historico}</Text>
                  </View>
                  <View style={st.stat}>
                    <Text style={st.statNum}>{qtyFmt(origenTotal)}</Text>
                    <Text style={st.statLbl}>{t.totalRecibido}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </Entrada>

        {/* ── acciones: cobrar es EL botón; la actividad, el camino al detalle ── */}
        <Entrada delay={180}>
          <Button3D title={t.cobrarBtn} icon="qr-code" onPress={() => nav.go('cobrar')} style={{ marginTop: 16 }} />
          <Pressable
            onPress={() => { hap(); nav.go('pay-actividad'); }}
            accessibilityRole="button" accessibilityLabel={t.actividad}
            style={st.verAct}>
            <View style={st.verActIc}><Icon name="pulse" size={17} color={C.gold} /></View>
            <Text style={st.verActTxt}>{t.actividad}</Text>
            <Icon name="chevron-forward" size={15} color={C.txt3} />
          </Pressable>
          <Pressable
            onPress={() => { hap(); nav.go('pay-negocio'); }}
            accessibilityRole="button" accessibilityLabel="Mi negocio"
            style={st.verAct}>
            <View style={st.verActIc}><Icon name="storefront" size={17} color={C.gold} /></View>
            <Text style={st.verActTxt}>{t.miNegocio}</Text>
            <Icon name="chevron-forward" size={15} color={C.txt3} />
          </Pressable>
          <Pressable
            onPress={() => { hap(); nav.go('pay-bonos'); }}
            accessibilityRole="button" accessibilityLabel="Bonos"
            style={st.verAct}>
            {/* 'gift' se pedía aquí desde la primera entrega pero no estaba
                dibujado en el set, así que Icon devolvía un hueco invisible.
                Ahora existe (src/icons.js) y el regalo se ve. */}
            <View style={st.verActIc}><Icon name="gift" size={17} color={C.gold} /></View>
            <Text style={st.verActTxt}>{t.bonos}</Text>
            <Icon name="chevron-forward" size={15} color={C.txt3} />
          </Pressable>
          <Pressable
            onPress={() => { hap(); nav.go('pay-negocio-panel'); }}
            accessibilityRole="button" accessibilityLabel={t.panelNeg}
            style={st.verAct}>
            <View style={st.verActIc}><Icon name="cash" size={17} color={C.gold} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.verActTxt}>{t.panelNeg}</Text>
              <Text style={st.verActSub}>{t.panelNegS}</Text>
            </View>
            <Icon name="chevron-forward" size={15} color={C.txt3} />
          </Pressable>
          {/* La casilla de notificaciones de panel.tsx, con su misma pista:
              "N nuevas" cuando hay cobros sin ver, "Al día" cuando no. */}
          <Pressable
            onPress={() => { hap(); nav.go('pay-notificaciones'); }}
            accessibilityRole="button" accessibilityLabel={t.notis}
            style={st.verAct}>
            <View style={st.verActIc}>
              <Icon name="notifications" size={17} color={C.gold} />
              {sinLeer > 0 ? <View style={st.punto} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.verActTxt}>{t.notis}</Text>
              <Text style={st.verActSub}>
                {sinLeer > 0 ? t.notisNuevas.replace('{n}', sinLeer) : t.notisAlDia}
              </Text>
            </View>
            <Icon name="chevron-forward" size={15} color={C.txt3} />
          </Pressable>

        </Entrada>

        {/* ── los tres últimos cobros, de un vistazo ────────────────────── */}
        <Entrada delay={260}>
          <View style={st.ultCab}>
            <Text style={st.grupo}>{t.ultimos}</Text>
            {entrantes.length > 0 ? (
              <Pressable onPress={() => { hap(); nav.go('pay-actividad'); }} hitSlop={8}>
                <Text style={st.verTodo}>{t.verTodo}</Text>
              </Pressable>
            ) : null}
          </View>
          {transfers === undefined ? (
            <View style={{ gap: 9 }}>
              <Skeleton width="100%" height={58} radius={16} />
              <Skeleton width="100%" height={58} radius={16} />
            </View>
          ) : entrantes.length === 0 ? (
            <View style={st.vacio}>
              <View style={st.vacioIc}><Icon name="cash" size={26} color={C.txt3} /></View>
              <Text style={st.vacioTxt}>{t.nadieAun}</Text>
            </View>
          ) : (
            entrantes.slice(0, 3).map((x, i) => (
              <View key={x.hash || i} style={st.cobro}>
                <View style={st.cobroIc}><Icon name="arrow-down" size={18} color={C.up} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.cobroDe} numberOfLines={1}>{t.de}: {etiqueta(x.from)}</Text>
                  <Text style={st.cobroCuando}>{fmtCuando(x.timeStamp)}</Text>
                </View>
                <Text style={st.cobroMonto}>+{qtyFmt(Number(x.value) || 0)} {x.symbol || 'ORIGEN'}</Text>
              </View>
            ))
          )}
        </Entrada>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 6 },
  dentro: { paddingHorizontal: 20, paddingBottom: 110 },

  negocio: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line },
  negocioTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  marca: { color: C.goldLt, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
  badgeOk: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(62,217,160,0.13)', borderWidth: 1, borderColor: 'rgba(62,217,160,0.3)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeOkTxt: { color: C.up, fontSize: 10.5, fontWeight: '700' },
  badgePend: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgePendTxt: { color: '#FBBF24', fontSize: 10.5, fontWeight: '700' },
  negocioBody: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarFoto: { width: 56, height: 56, borderRadius: 17, backgroundColor: C.panel2 },
  avatarTxt: { color: C.darkText, fontWeight: '800', fontSize: 20 },
  nombre: { color: C.txt, fontSize: 18, fontWeight: '800' },
  correo: { color: C.txt2, fontSize: 12, marginTop: 2 },
  tipoNeg: { color: C.gold, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, marginTop: 5 },

  resumen: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 18, marginTop: 14 },
  grupo: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6 },
  granNumero: { color: C.goldLt, fontSize: 34, fontWeight: '300', marginTop: 8, fontVariant: ['tabular-nums'] },
  moneda: { fontSize: 15, color: C.gold, fontWeight: '700' },
  granSub: { color: C.txt2, fontSize: 12, marginTop: 2 },
  nota: { color: C.txt3, fontSize: 12, lineHeight: 18, marginTop: 10 },
  statsFila: { flexDirection: 'row', marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 13 },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statMedio: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statNum: { color: C.txt, fontSize: 15.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLbl: { color: C.txt3, fontSize: 10, textAlign: 'center' },

  verAct: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginTop: 11 },
  verActIc: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  verActTxt: { flex: 1, color: C.txt, fontSize: 13.5, fontWeight: '600' },
  verActSub: { color: C.txt3, fontSize: 11, marginTop: 2 },
  punto: { position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: C.up },

  saludo: { color: C.txt, fontSize: 22, fontWeight: '800' },
  bienvenido: { color: C.txt2, fontSize: 12.5, marginTop: 3, marginBottom: 14 },
  saldo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 14, marginTop: 14 },
  saldoIc: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  saldoLbl: { color: C.txt3, fontSize: 9.5, fontWeight: '700', letterSpacing: 1.6 },
  saldoVal: { color: C.txt, fontSize: 15, fontWeight: '700', marginTop: 3, fontVariant: ['tabular-nums'] },
  saldoUsd: { color: C.txt3, fontSize: 11.5, fontWeight: '400' },
  saldoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  saldoBtnTxt: { color: C.darkText, fontSize: 11.5, fontWeight: '700' },

  ultCab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10, paddingHorizontal: 2 },
  verTodo: { color: C.gold, fontSize: 12.5, fontWeight: '600' },
  vacio: { alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18, padding: 22 },
  vacioIc: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  vacioTxt: { color: C.txt3, fontSize: 12.5, lineHeight: 19, textAlign: 'center' },
  cobro: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginBottom: 9 },
  cobroIc: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(62,217,160,0.12)', alignItems: 'center', justifyContent: 'center' },
  cobroDe: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  cobroCuando: { color: C.txt3, fontSize: 11, marginTop: 2 },
  cobroMonto: { color: C.up, fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
