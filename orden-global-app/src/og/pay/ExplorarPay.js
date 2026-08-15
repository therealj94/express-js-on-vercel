// ExplorarPay — el directorio de comercios de MyTokenPay.
//
// Port de `(tabs)/explorar.tsx` de mytokenpay-app. Se conserva su estructura
// —buscador, categorías, contador de resultados, fichas, ficha ampliada con
// "Sobre este comercio / Servicios / Ubicación"— y sus textos.
//
// DE DÓNDE SALEN ESTOS COMERCIOS (y por qué se dice en pantalla):
// se revisó el código original antes de portar. `mobile/src/lib/api.ts` trae
// `export const USE_MOCK_API = true` y todo el directorio se sirve desde
// `mockData.ts` con el comentario "Simulated backend: lets the app run fully
// offline". O sea: MyTokenPay todavía NO tiene directorio real enchufado.
// Los treinta comercios de abajo son exactamente esos datos de ejemplo suyos,
// copiados tal cual (nombre, ciudad, descripción y servicios), y la pantalla
// lo dice arriba del todo y otra vez en la ficha: son de ejemplo. Presentarlos
// como comercios reales sería mentirle a quien busca dónde gastar su ORIGEN.
//
// Tampoco tienen dirección en la cadena, así que desde una ficha NO se puede
// prellenar un envío: el botón lleva a PagarPay a escanear el QR que el
// comercio enseñe. El monto y el destinatario salen siempre de ahí, nunca de
// esta lista.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Animated, BackHandler, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../../theme';
import { Header, Button3D, Card, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import {
  CATS, PAISES, CIUDADES, COMERCIOS, CATS_USADAS, PAISES_USADOS,
  iconoDe, pelado, etiquetaDe,
} from './comerciosDemo';

const TXT = {
  es: {
    titulo: 'Directorio', sub: 'MyTokenPay · comercios de ejemplo',
    avisoT: 'Comercios de ejemplo',
    avisoP: 'El directorio real de MyTokenPay todavía no está enchufado: su propia app corre con datos de demostración. Estos comercios vienen de ahí — sirven para ver cómo se busca y cómo se paga, pero no son negocios reales ni cobran todavía.',
    buscar: 'Busca por nombre, comida, servicio…',
    uno: '1 comercio', varios: '{n} comercios',
    sinResT: 'Sin resultados', sinResP: 'Prueba con otros términos, país o categoría.',
    limpiar: 'Limpiar filtros',
    verificado: 'Verificado en MyTokenPay', pendiente: 'Pendiente',
    sobre: 'Sobre este comercio', servicios: 'Servicios', ubicacion: 'Ubicación',
    pagarBtn: 'PAGAR EN ESTE COMERCIO',
    pagarNota: 'Este comercio de ejemplo no tiene dirección de cobro en la cadena. Al tocar, se abre la cámara: escanea el QR que te enseñe el negocio y el envío se prepara con SU dirección y SU monto.',
    volver: 'Directorio',
  },
  en: {
    titulo: 'Directory', sub: 'MyTokenPay · sample businesses',
    avisoT: 'Sample businesses',
    avisoP: 'The real MyTokenPay directory is not plugged in yet: their own app runs on demo data. These businesses come from there — they show how search and payment work, but they are not real businesses and they do not charge yet.',
    buscar: 'Search by name, food, service…',
    uno: '1 business', varios: '{n} businesses',
    sinResT: 'No results', sinResP: 'Try other terms, country or category.',
    limpiar: 'Clear filters',
    verificado: 'Verified in MyTokenPay', pendiente: 'Pending',
    sobre: 'About this business', servicios: 'Services', ubicacion: 'Location',
    pagarBtn: 'PAY AT THIS BUSINESS',
    pagarNota: 'This sample business has no charging address on chain. Tapping opens the camera: scan the QR the business shows you and the send is prepared with THEIR address and THEIR amount.',
    volver: 'Directory',
  },
};

// Los comercios, sus categorías, países y ciudades viven ahora en
// './comerciosDemo': la ficha pública (NegocioDetalle) enseña EXACTAMENTE
// los mismos negocios que este listado, y con dos copias del dato acabarían
// diciendo cosas distintas del mismo comercio. Esta pantalla se comporta
// igual que antes; solo dejó de ser la dueña de la lista.

const rellena = (s, vals) => Object.keys(vals).reduce((a, k) => a.replace('{' + k + '}', vals[k]), s);


// Entrada en cascada. Solo opacity/transform ⇒ useNativeDriver; el tope de
// retardo evita que las fichas de abajo lleguen tarde al hacer scroll.
function Entrada({ indice = 0, delay = null, style, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    const d = delay != null ? delay : Math.min(indice, 8) * 55;
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 380, delay: d, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, delay: d, speed: 12, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [op, y, indice, delay]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

// La portada (InicioPay) entra aquí ya con una búsqueda escrita o con una
// categoría tocada, igual que hacía el original con
// `router.push({ pathname: '/(tabs)/explorar', params: { q | category } })`.
// Los params solo SIEMBRAN el estado inicial: a partir de ahí la pantalla es
// dueña de sus filtros y "Limpiar" los borra como siempre.
export default function ExplorarPay({ nav, params }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const et = (dic, clave) => etiquetaDe(dic, clave, lang);

  const [busca, setBusca] = useState(() => String(params?.q || ''));
  const [cat, setCat] = useState(() => (CATS[params?.cat] ? params.cat : ''));
  const [pais, setPais] = useState('');
  const [ficha, setFicha] = useState(null);   // el detalle vive dentro de la pantalla

  const visibles = useMemo(() => {
    const q = pelado(busca.trim());
    return COMERCIOS.filter((c) => {
      if (cat && c.cat !== cat) return false;
      if (pais && c.pais !== pais) return false;
      if (!q) return true;
      // Se busca donde el original buscaba: nombre, descripción y servicios
      // (por eso "surf" encuentra la tienda y también las clases).
      const heno = pelado([c.nom, c.desc, c.serv.join(' '), et(CATS, c.cat), CIUDADES[c.ciudad] || ''].join(' '));
      return heno.includes(q);
    });
  }, [busca, cat, pais, lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  // La ficha ampliada es una etapa DENTRO de esta pantalla, no una ruta: el
  // botón físico de Android debe cerrarla y devolver al listado, no sacar al
  // usuario del directorio. El listener más reciente gana al global de App.js.
  useEffect(() => {
    if (Platform.OS !== 'android' || !ficha) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setFicha(null); return true; });
    return () => sub.remove();
  }, [ficha]);

  const hayFiltros = !!(busca || cat || pais);
  const limpiar = () => { hap(); setBusca(''); setCat(''); setPais(''); };

  // ── ficha ampliada ─────────────────────────────────────────────────────
  if (ficha) {
    return (
      <View style={st.screen}>
        <Header title={ficha.nom} sub={`${et(CATS, ficha.cat)} · ${CIUDADES[ficha.ciudad] || ''}`} onBack={() => setFicha(null)} />
        <ScrollView contentContainerStyle={st.dentro} showsVerticalScrollIndicator={false}>
          <Entrada delay={0}>
            <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.portada}>
              <View style={st.portadaIc}><Icon name={iconoDe(ficha.cat)} size={26} color={C.gold} /></View>
              <Text style={st.portadaNom}>{ficha.nom}</Text>
              <View style={st.pills}>
                <View style={[st.pill, ficha.ver ? st.pillOk : st.pillPend]}>
                  <Icon name={ficha.ver ? 'shield-checkmark' : 'time'} size={12} color={ficha.ver ? C.up : '#FBBF24'} />
                  <Text style={[st.pillTxt, { color: ficha.ver ? C.up : '#FBBF24' }]}>{ficha.ver ? t.verificado : t.pendiente}</Text>
                </View>
                <View style={st.pillPais}>
                  <Text style={st.pillTxt}>{PAISES[ficha.pais].bandera} {PAISES[ficha.pais].et}</Text>
                </View>
              </View>
            </LinearGradient>
          </Entrada>

          <Entrada delay={90}>
            <View style={st.aviso}>
              <Icon name="information-circle" size={16} color={C.gold} />
              <Text style={st.avisoP}>{t.avisoP}</Text>
            </View>
          </Entrada>

          <Entrada delay={160}>
            <Text style={st.grupo}>{t.sobre.toUpperCase()}</Text>
            <Card style={st.bloque}><Text style={st.cuerpo}>{ficha.desc}</Text></Card>
          </Entrada>

          <Entrada delay={220}>
            <Text style={st.grupo}>{t.servicios.toUpperCase()}</Text>
            <View style={st.servFila}>
              {ficha.serv.map((s) => (
                <View key={s} style={st.serv}><Text style={st.servTxt}>{s}</Text></View>
              ))}
            </View>
          </Entrada>

          <Entrada delay={280}>
            <Text style={st.grupo}>{t.ubicacion.toUpperCase()}</Text>
            <Card style={st.bloque}>
              <Text style={st.cuerpo}>{ficha.dir}</Text>
              <Text style={st.cuerpoTenue}>{CIUDADES[ficha.ciudad] || ''} · {PAISES[ficha.pais].et}</Text>
            </Card>
          </Entrada>

          <Entrada delay={340}>
            {/* No se prellena un envío desde aquí: no hay dirección que poner.
                El camino honesto es la cámara, donde el QR trae los datos. */}
            <Button3D title={t.pagarBtn} icon="qr-code" onPress={() => { hap(); nav.go('pay-pagar'); }} style={{ marginTop: 20 }} />
            <Text style={st.nota}>{t.pagarNota}</Text>
            <Pressable onPress={() => { hap(); setFicha(null); }} style={st.enlace}>
              <Icon name="chevron-back" size={15} color={C.txt2} />
              <Text style={st.enlaceTxt}>{t.volver}</Text>
            </Pressable>
          </Entrada>
        </ScrollView>
      </View>
    );
  }

  // ── listado ────────────────────────────────────────────────────────────
  return (
    <View style={st.screen}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <ScrollView contentContainerStyle={st.dentro} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* El aviso va arriba y no se puede cerrar: quien entra tiene que
            saber qué está mirando ANTES de ilusionarse con un comercio. */}
        <Entrada delay={0}>
          <View style={st.aviso}>
            <Icon name="information-circle" size={16} color={C.gold} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.avisoT}>{t.avisoT}</Text>
              <Text style={st.avisoP}>{t.avisoP}</Text>
            </View>
          </View>
        </Entrada>

        <Entrada delay={70}>
          <TextInput
            value={busca} onChangeText={setBusca}
            placeholder={t.buscar} placeholderTextColor={C.txt3}
            style={st.busca} autoCapitalize="none" returnKeyType="search"
            accessibilityLabel={t.buscar}
          />
        </Entrada>

        <Entrada delay={130}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipsFila}>
            {CATS_USADAS.map((c) => {
              const on = cat === c;
              return (
                <Pressable key={c} onPress={() => { hap(); setCat(on ? '' : c); }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[st.chip, on && st.chipOn]}>
                  <Icon name={iconoDe(c)} size={13} color={on ? C.darkText : C.txt2} />
                  <Text style={[st.chipTxt, on && st.chipTxtOn]}>{et(CATS, c)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Entrada>

        <Entrada delay={170}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipsFila}>
            {PAISES_USADOS.map((p) => {
              const on = pais === p;
              return (
                <Pressable key={p} onPress={() => { hap(); setPais(on ? '' : p); }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[st.chip, on && st.chipOn]}>
                  <Text style={[st.chipTxt, on && st.chipTxtOn]}>{PAISES[p].bandera} {PAISES[p].et}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Entrada>

        <Entrada delay={210}>
          <View style={st.cabecera}>
            <Text style={st.cuenta}>
              {visibles.length === 1 ? t.uno : rellena(t.varios, { n: visibles.length })}
            </Text>
            {hayFiltros ? (
              <Pressable onPress={limpiar} hitSlop={8}><Text style={st.limpiar}>{t.limpiar}</Text></Pressable>
            ) : null}
          </View>
        </Entrada>

        {visibles.length === 0 ? (
          <Entrada delay={0}>
            <View style={st.vacio}>
              <View style={st.vacioIc}><Icon name="storefront" size={26} color={C.txt3} /></View>
              <Text style={st.vacioT}>{t.sinResT}</Text>
              <Text style={st.vacioP}>{t.sinResP}</Text>
            </View>
          </Entrada>
        ) : (
          visibles.map((c, i) => (
            <Entrada key={c.id} indice={i}>
              <Pressable onPress={() => { hap(); setFicha(c); }}
                accessibilityRole="button" accessibilityLabel={c.nom}
                style={st.ficha}>
                <View style={st.fichaTop}>
                  <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.fichaIc}>
                    <Icon name={iconoDe(c.cat)} size={19} color={C.darkText} />
                  </LinearGradient>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.fichaNom} numberOfLines={1}>{c.nom}</Text>
                    <Text style={st.fichaMeta} numberOfLines={1}>
                      {et(CATS, c.cat)} · {CIUDADES[c.ciudad] || ''} {PAISES[c.pais].bandera}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={16} color={C.txt3} />
                </View>
                <Text style={st.fichaDesc} numberOfLines={2}>{c.desc}</Text>
                <View style={st.servFila}>
                  {c.serv.slice(0, 3).map((s) => (
                    <View key={s} style={st.serv}><Text style={st.servTxt}>{s}</Text></View>
                  ))}
                </View>
                {c.ver ? (
                  <View style={[st.pill, st.pillOk, { alignSelf: 'flex-start', marginTop: 10 }]}>
                    <Icon name="shield-checkmark" size={11} color={C.up} />
                    <Text style={[st.pillTxt, { color: C.up }]}>{t.verificado}</Text>
                  </View>
                ) : (
                  <View style={[st.pill, st.pillPend, { alignSelf: 'flex-start', marginTop: 10 }]}>
                    <Icon name="time" size={11} color="#FBBF24" />
                    <Text style={[st.pillTxt, { color: '#FBBF24' }]}>{t.pendiente}</Text>
                  </View>
                )}
              </Pressable>
            </Entrada>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },

  aviso: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(201,169,97,0.10)',
    borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginTop: 4, marginBottom: 16,
  },
  avisoT: { color: C.goldLt, fontSize: 12.5, fontWeight: '800', marginBottom: 4 },
  avisoP: { flex: 1, color: C.txt2, fontSize: 11.5, lineHeight: 17.5 },

  busca: {
    backgroundColor: C.input, borderWidth: 1, borderColor: C.inputBr, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, color: C.txt, fontSize: 14.5,
  },
  chipsFila: { gap: 8, paddingVertical: 12, paddingRight: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line2,
    backgroundColor: C.panel, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8,
  },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipTxt: { color: C.txt2, fontSize: 11.5, fontWeight: '600' },
  chipTxtOn: { color: C.darkText },

  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 12 },
  cuenta: { color: C.txt3, fontSize: 12.5 },
  limpiar: { color: C.gold, fontSize: 12.5, fontWeight: '600' },

  ficha: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 18,
    padding: 14, marginBottom: 12,
  },
  fichaTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fichaIc: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fichaNom: { color: C.txt, fontSize: 15, fontWeight: '700' },
  fichaMeta: { color: C.txt3, fontSize: 11.5, marginTop: 2 },
  fichaDesc: { color: C.txt2, fontSize: 12.5, lineHeight: 18.5, marginTop: 11 },

  servFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  serv: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  servTxt: { color: C.txt2, fontSize: 11 },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  pillOk: { backgroundColor: 'rgba(62,217,160,0.13)', borderColor: 'rgba(62,217,160,0.3)' },
  pillPend: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.35)' },
  pillPais: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.line2, backgroundColor: 'rgba(0,0,0,0.18)' },
  pillTxt: { color: C.txt2, fontSize: 10.5, fontWeight: '700' },

  portada: { borderRadius: 22, padding: 20, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  portadaIc: {
    width: 62, height: 62, borderRadius: 20, backgroundColor: 'rgba(201,169,97,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  portadaNom: { color: C.txt, fontSize: 19, fontWeight: '800', marginTop: 12, textAlign: 'center' },

  grupo: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginTop: 22, marginBottom: 10 },
  bloque: { padding: 15, borderWidth: 1, borderColor: C.line2 },
  cuerpo: { color: C.txt2, fontSize: 13, lineHeight: 20 },
  cuerpoTenue: { color: C.txt3, fontSize: 12, marginTop: 6 },
  nota: { color: C.txt3, fontSize: 11.5, lineHeight: 18, textAlign: 'center', marginTop: 12 },

  enlace: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center', paddingVertical: 14 },
  enlaceTxt: { color: C.txt2, fontSize: 13, fontWeight: '600' },

  vacio: {
    alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2,
    borderRadius: 18, padding: 26, marginTop: 8,
  },
  vacioIc: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.panel2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  vacioT: { color: C.txt, fontSize: 15.5, fontWeight: '700' },
  vacioP: { color: C.txt3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 6 },
});
