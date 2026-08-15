// InicioPay — LA PORTADA de MyTokenPay dentro de Orden Global.
//
// Es el port de `mobile/app/(tabs)/index.tsx` del mytokenpay-app (Expo 51):
// su hero con el buscador, sus tres cifras, la tarjeta de beneficios, las
// categorías en carrusel, los comercios destacados, los cuatro pasos de
// "cómo funciona para tu negocio" y el cierre de "registra tu negocio". Sus
// textos son suyos y se conservan; lo que cambia es la piel (oro sobre verde)
// y tres cosas de fondo, cada una por su razón:
//
// 1. NO HAY LOGIN NI REGISTRO. El original partía la portada en dos: si había
//    sesión enseñaba los beneficios y si no, un "Crea tu cuenta gratis" hacia
//    /registro. Aquí se entra con Genesis ID —el login único del ecosistema—
//    así que esa rama no se porta: quien abre esta pantalla YA es alguien.
// 2. Los comercios de las cifras y de "destacados" son los datos de ejemplo
//    de su propia app (ver comerciosDemo.js: su api.ts corre con
//    USE_MOCK_API = true). La pantalla lo dice donde se enseñan, porque
//    presentarlos como negocios reales sería mentir.
// 3. La foto `hero-people.jpg` del original no está en esta app; en su lugar
//    va una tarjeta de degradado con el mismo mensaje. Copiar un JPG ajeno a
//    los assets de la casa por decoración no valía el peso.
//
// Los accesos rápidos son los que pidió el encargo y llevan a las pantallas
// que ya existen: cobro, pagar, explorar, panel, mi negocio, bonos y cobros.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Animated, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../../theme';
import { Header, Button3D, IconBtn, useAccount, useToast, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import { apiPortfolio } from '../../api';
import { upsertApiAccount } from '../../accounts';
import { COMERCIOS, CATS, CATS_USADAS, PAISES, CIUDADES, iconoDe, etiquetaDe } from './comerciosDemo';
import { avisosDe, leerVisto, noLeidos } from './avisos';

const TXT = {
  es: {
    titulo: 'MyTokenPay', sub: 'La capa de comercio del ecosistema',
    insignia: 'Capa de comercio del Sistema Financiero Social',
    h1: 'Encuentra dónde pagar con ORIGEN',
    p1: 'El directorio de comercios afiliados en toda Latinoamérica, de México a la Patagonia.',
    buscarPh: 'Restaurantes, hoteles, gimnasios…',
    comercios: 'Comercios', verificados: 'Verificados', paises: 'Países',
    cifrasNota: 'Estas cifras cuentan los comercios de ejemplo que trae MyTokenPay: su directorio real todavía no está enchufado a esta app.',
    accesos: 'QUÉ QUIERES HACER',
    aCobro: 'Cobrar', aCobroS: 'Genera tu QR',
    aPagar: 'Pagar', aPagarS: 'Escanea y firma',
    aExplorar: 'Explorar', aExplorarS: 'Directorio',
    aPanel: 'Mi panel', aPanelS: 'Tu resumen',
    aNegocio: 'Mi negocio', aNegocioS: 'Tu ficha',
    aBonos: 'Bonos', aBonosS: 'Puntos y premios',
    aActividad: 'Cobros', aActividadS: 'Lo que entró',
    ctaTit: 'Tus beneficios por comprar',
    ctaTxt: 'Gana puntos ORIGEN en cada compra en comercios afiliados y accede a promociones exclusivas para usuarios.',
    ctaP1: 'Descuentos', ctaP2: 'Promos exclusivas', ctaLink: 'Ver bonos y regalos',
    categorias: 'EXPLORA POR CATEGORÍA',
    destacados: 'COMERCIOS DESTACADOS', deEjemplo: 'de ejemplo',
    verificado: 'Verificado en MyTokenPay',
    comoTit: 'CÓMO FUNCIONA PARA TU NEGOCIO',
    pasos: [
      { n: '01', t: 'Regístrate y verifica', p: 'Tu Genesis ID es el KYC/KYB de tu empresa: en Orden Global no se piden papeles dos veces.' },
      { n: '02', t: 'Completa tu perfil', p: 'Logo, fotos, servicios, redes y tu ubicación exacta.' },
      { n: '03', t: 'Aparece en el directorio', p: 'Visible por país, ciudad y categoría al instante.' },
      { n: '04', t: 'Recibe nuevos clientes', p: 'Usuarios que buscan dónde gastar su ORIGEN te encuentran.' },
    ],
    heroTit: 'Tu negocio, visible para toda la comunidad',
    heroTxt: 'Regístrate gratis, completa tu perfil y verifica tu empresa. Trazabilidad pública y liquidación en minutos.',
    heroBtn: 'REGISTRAR MI NEGOCIO',
    panelNeg: 'Panel de administración del negocio', panelNegS: 'Saldo, cobros y retiros',
    refrescado: 'Datos actualizados',
  },
  en: {
    titulo: 'MyTokenPay', sub: 'The commerce layer of the ecosystem',
    insignia: 'Commerce layer of the Social Financial System',
    h1: 'Find where to pay with ORIGEN',
    p1: 'The directory of affiliated businesses across Latin America, from Mexico to Patagonia.',
    buscarPh: 'Restaurants, hotels, gyms…',
    comercios: 'Businesses', verificados: 'Verified', paises: 'Countries',
    cifrasNota: 'These figures count the sample businesses MyTokenPay ships with: their real directory is not wired into this app yet.',
    accesos: 'WHAT DO YOU WANT TO DO',
    aCobro: 'Charge', aCobroS: 'Make your QR',
    aPagar: 'Pay', aPagarS: 'Scan and sign',
    aExplorar: 'Explore', aExplorarS: 'Directory',
    aPanel: 'My panel', aPanelS: 'Your summary',
    aNegocio: 'My business', aNegocioS: 'Your listing',
    aBonos: 'Rewards', aBonosS: 'Points and prizes',
    aActividad: 'Payments', aActividadS: 'What came in',
    ctaTit: 'Your rewards for shopping',
    ctaTxt: 'Earn ORIGEN points on every purchase at affiliated businesses and unlock promotions exclusive to users.',
    ctaP1: 'Discounts', ctaP2: 'Exclusive promos', ctaLink: 'See rewards and gifts',
    categorias: 'EXPLORE BY CATEGORY',
    destacados: 'FEATURED BUSINESSES', deEjemplo: 'sample',
    verificado: 'Verified in MyTokenPay',
    comoTit: 'HOW IT WORKS FOR YOUR BUSINESS',
    pasos: [
      { n: '01', t: 'Sign up and verify', p: 'Your Genesis ID is your company KYC/KYB: Orden Global never asks for the same papers twice.' },
      { n: '02', t: 'Complete your profile', p: 'Logo, photos, services, socials and your exact location.' },
      { n: '03', t: 'Appear in the directory', p: 'Visible by country, city and category instantly.' },
      { n: '04', t: 'Get new customers', p: 'Users looking for where to spend their ORIGEN find you.' },
    ],
    heroTit: 'Your business, visible to the whole community',
    heroTxt: 'Register free, complete your profile and verify your company. Public traceability and settlement in minutes.',
    heroBtn: 'REGISTER MY BUSINESS',
    panelNeg: 'Business admin panel', panelNegS: 'Balance, payments and payouts',
    refrescado: 'Data refreshed',
  },
};

// Los siete accesos que pidió el encargo, en el orden en que se usan: primero
// mover dinero (cobrar y pagar), luego mirar (explorar, panel) y al final
// administrar. La ruta va escrita aquí y no en el JSX para que se vea de un
// golpe a dónde lleva cada casilla.
const ACCESOS = [
  { k: 'aCobro', ruta: 'pay-cobro', icono: 'qr-code' },
  { k: 'aPagar', ruta: 'pay-pagar', icono: 'card' },
  { k: 'aExplorar', ruta: 'pay-explorar', icono: 'earth' },
  { k: 'aPanel', ruta: 'pay-panel', icono: 'trending-up' },
  { k: 'aNegocio', ruta: 'pay-negocio', icono: 'storefront' },
  { k: 'aBonos', ruta: 'pay-bonos', icono: 'gift' },
  { k: 'aActividad', ruta: 'pay-actividad', icono: 'pulse' },
];

// Entrada en cascada: opacidad + subida, escalonadas. Solo se animan opacity
// y transform, así que useNativeDriver — la portada es larga y el hilo de JS
// tiene que quedar libre para el scroll.
function Entrada({ delay = 0, style, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay, speed: 12, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [op, y, delay]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

export default function InicioPay({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account, login } = useAccount();
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const [visto, setVisto] = useState(0);

  // El portafolio se refresca al entrar y al tirar hacia abajo: a la sección
  // pay se puede llegar sin pasar por Home, que era quien lo refrescaba, y de
  // ese dato dependen el globo de avisos y todo el panel.
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

  useEffect(() => { leerVisto(account?.email).then(setVisto); }, [account?.email]);
  const sinLeer = noLeidos(avisosDe(account), visto);

  // Las tres cifras del original, calculadas sobre el directorio de ejemplo:
  // comercios, cuántos están verificados y en cuántos países hay presencia.
  const cifras = useMemo(() => ({
    total: COMERCIOS.length,
    verificados: COMERCIOS.filter((c) => c.ver).length,
    paises: COMERCIOS.reduce((a, c) => (a.includes(c.pais) ? a : a.concat(c.pais)), []).length,
  }), []);
  // Los destacados del original: los cuatro primeros verificados.
  const destacados = useMemo(() => COMERCIOS.filter((c) => c.ver).slice(0, 4), []);

  const buscar = () => {
    hap();
    nav.go('pay-explorar', busca.trim() ? { q: busca.trim() } : undefined);
  };

  return (
    <View style={st.screen}>
      <Header
        title={t.titulo}
        sub={t.sub}
        right={<IconBtn icon="notifications" badge={sinLeer > 0} label={t.titulo}
          onPress={() => nav.go('pay-notificaciones')} />}
      />
      <ScrollView
        contentContainerStyle={st.dentro}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando} tintColor={C.gold} colors={[C.gold]}
            onRefresh={async () => { setRefrescando(true); await refrescar(true); setRefrescando(false); }}
          />
        }>

        {/* ── el hero: la promesa de la portada y su buscador ─────────── */}
        <Entrada delay={0}>
          <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
            <View style={st.insignia}>
              <Icon name="star" size={11} color={C.goldLt} />
              <Text style={st.insigniaTxt}>{t.insignia}</Text>
            </View>
            <Text style={st.h1}>{t.h1}</Text>
            <Text style={st.p1}>{t.p1}</Text>
            <View style={st.buscaFila}>
              <TextInput
                value={busca} onChangeText={setBusca}
                placeholder={t.buscarPh} placeholderTextColor={C.txt3}
                style={st.busca} autoCapitalize="none" returnKeyType="search"
                onSubmitEditing={buscar} accessibilityLabel={t.buscarPh}
              />
              <Pressable onPress={buscar} accessibilityRole="button" accessibilityLabel={t.buscarPh}>
                <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.buscaBtn}>
                  <Icon name="chevron-forward" size={18} color={C.darkText} />
                </LinearGradient>
              </Pressable>
            </View>
          </LinearGradient>
        </Entrada>

        {/* ── las tres cifras, con su verdad al lado ──────────────────── */}
        <Entrada delay={70}>
          <View style={st.cifras}>
            <View style={st.cifra}>
              <Icon name="storefront" size={17} color={C.gold} />
              <Text style={st.cifraNum}>{cifras.total}</Text>
              <Text style={st.cifraLbl}>{t.comercios}</Text>
            </View>
            <View style={[st.cifra, st.cifraMedio]}>
              <Icon name="shield-checkmark" size={17} color={C.up} />
              <Text style={st.cifraNum}>{cifras.verificados}</Text>
              <Text style={st.cifraLbl}>{t.verificados}</Text>
            </View>
            <View style={st.cifra}>
              <Icon name="earth" size={17} color={C.goldLt} />
              <Text style={st.cifraNum}>{cifras.paises}</Text>
              <Text style={st.cifraLbl}>{t.paises}</Text>
            </View>
          </View>
          <Text style={st.nota}>{t.cifrasNota}</Text>
        </Entrada>

        {/* ── accesos rápidos: el corazón de la portada aquí dentro ───── */}
        <Entrada delay={140}>
          <Text style={st.grupo}>{t.accesos}</Text>
          <View style={st.rejilla}>
            {ACCESOS.map((a) => (
              <Pressable
                key={a.k}
                onPress={() => { hap(); nav.go(a.ruta); }}
                accessibilityRole="button" accessibilityLabel={t[a.k]}
                style={st.casilla}>
                <View style={st.casillaIc}><Icon name={a.icono} size={19} color={C.gold} /></View>
                <Text style={st.casillaTit}>{t[a.k]}</Text>
                <Text style={st.casillaSub}>{t[a.k + 'S']}</Text>
              </Pressable>
            ))}
          </View>
        </Entrada>

        {/* ── beneficios por comprar (la tarjeta de bonos del original) ─ */}
        <Entrada delay={200}>
          <Pressable onPress={() => { hap(); nav.go('pay-bonos'); }}
            accessibilityRole="button" accessibilityLabel={t.ctaTit}>
            <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.cta}>
              <Icon name="gift" size={20} color={C.darkText} />
              <Text style={st.ctaTit}>{t.ctaTit}</Text>
              <Text style={st.ctaTxt}>{t.ctaTxt}</Text>
              <View style={st.ctaPills}>
                <View style={st.ctaPill}><Text style={st.ctaPillTxt}>{t.ctaP1}</Text></View>
                <View style={st.ctaPill}><Text style={st.ctaPillTxt}>{t.ctaP2}</Text></View>
              </View>
              <View style={st.ctaLinkFila}>
                <Text style={st.ctaLink}>{t.ctaLink}</Text>
                <Icon name="arrow-forward" size={14} color={C.darkText} />
              </View>
            </LinearGradient>
          </Pressable>
        </Entrada>

        {/* ── categorías: llevan al directorio ya filtrado ────────────── */}
        <Entrada delay={250}>
          <Text style={st.grupo}>{t.categorias}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catFila}>
            {CATS_USADAS.map((c) => (
              <Pressable
                key={c}
                onPress={() => { hap(); nav.go('pay-explorar', { cat: c }); }}
                accessibilityRole="button" accessibilityLabel={etiquetaDe(CATS, c, lang)}
                style={st.cat}>
                <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.catIc}>
                  <Icon name={iconoDe(c)} size={22} color={C.darkText} />
                </LinearGradient>
                <Text style={st.catTxt} numberOfLines={2}>{etiquetaDe(CATS, c, lang)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Entrada>

        {/* ── destacados: la ficha pública se abre con su id ──────────── */}
        <Entrada delay={300}>
          <View style={st.grupoFila}>
            <Text style={st.grupo}>{t.destacados}</Text>
            <View style={st.marca}><Text style={st.marcaTxt}>{t.deEjemplo}</Text></View>
          </View>
          {destacados.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => { hap(); nav.go('pay-negocio-detalle', { id: c.id }); }}
              accessibilityRole="button" accessibilityLabel={c.nom}
              style={st.ficha}>
              <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.fichaIc}>
                <Icon name={iconoDe(c.cat)} size={19} color={C.darkText} />
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.fichaNom} numberOfLines={1}>{c.nom}</Text>
                <Text style={st.fichaMeta} numberOfLines={1}>
                  {etiquetaDe(CATS, c.cat, lang)} · {CIUDADES[c.ciudad] || ''} {PAISES[c.pais].bandera}
                </Text>
              </View>
              <Icon name="chevron-forward" size={16} color={C.txt3} />
            </Pressable>
          ))}
        </Entrada>

        {/* ── cómo funciona para tu negocio (los cuatro pasos) ────────── */}
        <Entrada delay={350}>
          <Text style={st.grupo}>{t.comoTit}</Text>
          {t.pasos.map((p) => (
            <View key={p.n} style={st.paso}>
              <View style={st.pasoIc}><Text style={st.pasoN}>{p.n}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.pasoTit}>{p.t}</Text>
                <Text style={st.pasoTxt}>{p.p}</Text>
              </View>
            </View>
          ))}
        </Entrada>

        {/* ── cierre: registrar el negocio y su panel ─────────────────── */}
        <Entrada delay={400}>
          <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.cierre}>
            <View style={st.cierreIc}><Icon name="people" size={26} color={C.gold} /></View>
            <Text style={st.cierreTit}>{t.heroTit}</Text>
            <Text style={st.cierreTxt}>{t.heroTxt}</Text>
          </LinearGradient>
          <Button3D title={t.heroBtn} icon="storefront" onPress={() => nav.go('pay-negocio')} style={{ marginTop: 14 }} />
          <Pressable
            onPress={() => { hap(); nav.go('pay-negocio-panel'); }}
            accessibilityRole="button" accessibilityLabel={t.panelNeg}
            style={st.fila}>
            <View style={st.filaIc}><Icon name="cash" size={17} color={C.gold} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.filaTit}>{t.panelNeg}</Text>
              <Text style={st.filaSub}>{t.panelNegS}</Text>
            </View>
            <Icon name="chevron-forward" size={15} color={C.txt3} />
          </Pressable>
        </Entrada>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 6 },
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },

  hero: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line },
  insignia: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: C.line2, backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  insigniaTxt: { color: C.goldLt, fontSize: 10, fontWeight: '700' },
  h1: { color: C.txt, fontSize: 25, fontWeight: '800', lineHeight: 31, marginTop: 13 },
  p1: { color: C.txt2, fontSize: 13, lineHeight: 19.5, marginTop: 9 },
  buscaFila: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 },
  busca: {
    flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, color: C.txt, fontSize: 14,
  },
  buscaBtn: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  cifras: {
    flexDirection: 'row', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 20, paddingVertical: 15, marginTop: 14,
  },
  cifra: { flex: 1, alignItems: 'center', gap: 5 },
  cifraMedio: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cifraNum: { color: C.txt, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cifraLbl: { color: C.txt3, fontSize: 10.5 },
  nota: { color: C.txt3, fontSize: 11.5, lineHeight: 17.5, marginTop: 10 },

  grupo: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginTop: 24, marginBottom: 12 },
  grupoFila: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  marca: { backgroundColor: 'rgba(201,169,97,0.12)', borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 12 },
  marcaTxt: { color: C.goldLt, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },

  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  casilla: {
    width: '47%', flexGrow: 1, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2,
    borderRadius: 16, padding: 13, gap: 6,
  },
  casillaIc: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  casillaTit: { color: C.txt, fontSize: 13.5, fontWeight: '700', marginTop: 3 },
  casillaSub: { color: C.txt3, fontSize: 11 },

  cta: { borderRadius: 22, padding: 18, marginTop: 20 },
  ctaTit: { color: C.darkText, fontSize: 17, fontWeight: '800', marginTop: 10 },
  ctaTxt: { color: 'rgba(58,44,8,0.82)', fontSize: 12.5, lineHeight: 18.5, marginTop: 5 },
  ctaPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  ctaPill: { backgroundColor: 'rgba(58,44,8,0.14)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  ctaPillTxt: { color: C.darkText, fontSize: 10.5, fontWeight: '700' },
  ctaLinkFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  ctaLink: { color: C.darkText, fontSize: 13, fontWeight: '800' },

  catFila: { gap: 11, paddingRight: 8, paddingBottom: 4 },
  cat: {
    width: 108, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2,
    borderRadius: 16, padding: 13, gap: 11,
  },
  catIc: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  catTxt: { color: C.txt, fontSize: 11.5, fontWeight: '600', lineHeight: 15 },

  ficha: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginBottom: 10,
  },
  fichaIc: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fichaNom: { color: C.txt, fontSize: 14.5, fontWeight: '700' },
  fichaMeta: { color: C.txt3, fontSize: 11.5, marginTop: 2 },

  paso: {
    flexDirection: 'row', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2,
    borderRadius: 16, padding: 14, marginBottom: 10,
  },
  pasoIc: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  pasoN: { color: C.gold, fontSize: 12.5, fontWeight: '800' },
  pasoTit: { color: C.txt, fontSize: 13.5, fontWeight: '700' },
  pasoTxt: { color: C.txt2, fontSize: 12, lineHeight: 18, marginTop: 3 },

  cierre: { borderRadius: 22, padding: 20, borderWidth: 1, borderColor: C.line, alignItems: 'center', marginTop: 20 },
  cierreIc: { width: 60, height: 60, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.14)', alignItems: 'center', justifyContent: 'center' },
  cierreTit: { color: C.txt, fontSize: 17, fontWeight: '800', marginTop: 13, textAlign: 'center' },
  cierreTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 19, marginTop: 7, textAlign: 'center' },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginTop: 11,
  },
  filaIc: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  filaTit: { color: C.txt, fontSize: 13.5, fontWeight: '600' },
  filaSub: { color: C.txt3, fontSize: 11, marginTop: 2 },
});
