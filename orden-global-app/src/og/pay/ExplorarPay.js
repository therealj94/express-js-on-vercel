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
//
// LA FICHA ES UNA SOLA: tocar un comercio navega a pay-negocio-detalle
// (NegocioDetalle), la misma ficha que abre la portada. Antes este fichero
// tenía su propia ficha inline recortada —sin favorito, sin portada, sin
// aviso— y el mismo comercio se veía distinto según por dónde se entrara.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Animated,
} from 'react-native';
import { PantallaConTeclado, CuerpoDesplazable, useCampoAuto } from '../Teclado';
import { LinearGradient } from 'expo-linear-gradient';
import { C, G } from '../../theme';
import { Header, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import {
  CATS, PAISES, CIUDADES, COMERCIOS, CATS_USADAS, PAISES_USADOS,
  iconoDe, pelado, etiquetaDe,
} from './comerciosDemo';
import { leerFavoritos } from './NegocioDetalle';

const TXT = {
  es: {
    titulo: 'Directorio', sub: 'MyTokenPay · comercios de ejemplo',
    avisoT: 'Comercios de ejemplo',
    avisoP: 'El directorio real de MyTokenPay todavía no está enchufado: su propia app corre con datos de demostración. Estos comercios vienen de ahí — sirven para ver cómo se busca y cómo se paga, pero no son negocios reales ni cobran todavía.',
    buscar: 'Busca por nombre, comida, servicio…',
    uno: '1 comercio', varios: '{n} comercios',
    sinResT: 'Sin resultados', sinResP: 'Prueba con otros términos, país o categoría.',
    sinFavT: 'Sin favoritos todavía',
    sinFavP: 'Toca el corazón en la ficha de un comercio y aparecerá aquí.',
    limpiar: 'Limpiar filtros',
    favoritos: 'Favoritos',
    verificado: 'Verificado en MyTokenPay', pendiente: 'Pendiente',
  },
  en: {
    titulo: 'Directory', sub: 'MyTokenPay · sample businesses',
    avisoT: 'Sample businesses',
    avisoP: 'The real MyTokenPay directory is not plugged in yet: their own app runs on demo data. These businesses come from there — they show how search and payment work, but they are not real businesses and they do not charge yet.',
    buscar: 'Search by name, food, service…',
    uno: '1 business', varios: '{n} businesses',
    sinResT: 'No results', sinResP: 'Try other terms, country or category.',
    sinFavT: 'No favorites yet',
    sinFavP: 'Tap the heart on a business listing and it will show up here.',
    limpiar: 'Clear filters',
    favoritos: 'Favorites',
    verificado: 'Verified in MyTokenPay', pendiente: 'Pending',
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
  // Se sube por encima del teclado al enfocarlo (ver src/og/Teclado.js).
  const campoBusca = useCampoAuto();
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const et = (dic, clave) => etiquetaDe(dic, clave, lang);

  const [busca, setBusca] = useState(() => String(params?.q || ''));
  const [cat, setCat] = useState(() => (CATS[params?.cat] ? params.cat : ''));
  const [pais, setPais] = useState('');
  // Los favoritos que marcó el corazón de NegocioDetalle: se leen al montar
  // (volver de una ficha remonta esta pantalla, así que el chip siempre está
  // al día). Antes esos ids no los listaba NADIE: función muerta.
  const [favs, setFavs] = useState([]);
  const [soloFav, setSoloFav] = useState(false);
  useEffect(() => { leerFavoritos().then(setFavs).catch(() => {}); }, []);

  const visibles = useMemo(() => {
    const q = pelado(busca.trim());
    return COMERCIOS.filter((c) => {
      if (soloFav && !favs.includes(c.id)) return false;
      if (cat && c.cat !== cat) return false;
      if (pais && c.pais !== pais) return false;
      if (!q) return true;
      // Se busca donde el original buscaba: nombre, descripción y servicios
      // (por eso "surf" encuentra la tienda y también las clases).
      const heno = pelado([c.nom, c.desc, c.serv.join(' '), et(CATS, c.cat), CIUDADES[c.ciudad] || ''].join(' '));
      return heno.includes(q);
    });
  }, [busca, cat, pais, soloFav, favs, lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  const hayFiltros = !!(busca || cat || pais || soloFav);
  const limpiar = () => { hap(); setBusca(''); setCat(''); setPais(''); setSoloFav(false); };

  // ── listado ────────────────────────────────────────────────────────────
  // (la ficha ampliada vive en NegocioDetalle: una sola ficha por comercio)
  return (
    // Cabecera fija y cuerpo desplazable: al enfocar un campo la pantalla
    // lo sube por encima del teclado (ver src/og/Teclado.js).
    <PantallaConTeclado desplaza={false} style={st.screen}>
      <Header title={t.titulo} sub={t.sub} onBack={nav.back} />
      <CuerpoDesplazable contentContainerStyle={st.dentro}>

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
            ref={campoBusca.ref} onFocus={campoBusca.onFocus}
          />
        </Entrada>

        <Entrada delay={130}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipsFila}>
            {/* el chip de favoritos: la lista que el corazón de la ficha
                llevaba guardando sin que nadie la enseñara */}
            <Pressable onPress={() => { hap(); setSoloFav((x) => !x); }}
              accessibilityRole="button" accessibilityState={{ selected: soloFav }}
              style={[st.chip, soloFav && st.chipOn]}>
              <Icon name="heart" size={13} color={soloFav ? C.darkText : C.txt2} />
              <Text style={[st.chipTxt, soloFav && st.chipTxtOn]}>{t.favoritos}</Text>
            </Pressable>
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
              <View style={st.vacioIc}>
                <Icon name={soloFav ? 'heart' : 'storefront'} size={26} color={C.txt3} />
              </View>
              <Text style={st.vacioT}>{soloFav && favs.length === 0 ? t.sinFavT : t.sinResT}</Text>
              <Text style={st.vacioP}>{soloFav && favs.length === 0 ? t.sinFavP : t.sinResP}</Text>
            </View>
          </Entrada>
        ) : (
          visibles.map((c, i) => (
            <Entrada key={c.id} indice={i}>
              {/* a la MISMA ficha que abre la portada (pay-negocio-detalle):
                  el directorio ya no tiene una ficha propia recortada */}
              <Pressable onPress={() => { hap(); nav.go('pay-negocio-detalle', { id: c.id }); }}
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
      </CuerpoDesplazable>
    </PantallaConTeclado>
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

  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  pillOk: { backgroundColor: 'rgba(62,217,160,0.13)', borderColor: 'rgba(62,217,160,0.3)' },
  pillPend: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.35)' },
  pillTxt: { color: C.txt2, fontSize: 10.5, fontWeight: '700' },

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
