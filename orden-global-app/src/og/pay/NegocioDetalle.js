// NegocioDetalle — la ficha pública de un comercio. params: { id }.
//
// Port de `mobile/app/negocio/[id].tsx` del mytokenpay-app (Expo 51): su
// portada con el logo encima, el nombre con su sello de verificado, el
// "Sobre este comercio", el menú de lo que ofrece, la galería, el horario de
// los siete días, los enlaces a las redes, la ubicación, el corazón de
// favorito y la barra de acción abajo. Sus textos son suyos.
//
// DOS FICHAS, UNA PANTALLA
// · id === 'mio' → tu propio negocio, leído de la ficha cifrada del teléfono
//   (la que rellena MiNegocio). Sirve para ver exactamente lo que verá un
//   cliente, y desde el panel del negocio se llega con ese id.
// · cualquier otro id → uno de los comercios del directorio de MyTokenPay
//   (comerciosDemo.js), que son SUS datos de ejemplo porque su backend corre
//   con USE_MOCK_API = true. La ficha lo dice sin que haya que buscarlo.
//
// QUÉ NO SE PORTA, Y POR QUÉ
// · EL CARRITO Y LOS PRECIOS. El original ponía un menú con precio por ítem y
//   un botón de sumar al carrito que llevaba a cobro. Esos precios los INVENTA
//   su propio código: `getCatalog()` genera el importe con un hash del nombre
//   del comercio cuando no es uno de sus cuatro demos. Enseñar un café a 3,90
//   que nadie va a respetar es peor que no enseñar precio, así que lo que se
//   ofrece aparece como lista de productos y servicios, sin cifras.
// · EL MAPA. Pedía react-native-maps, que esta app no lleva (misma razón que
//   en MiNegocio). Se enseña la dirección escrita, que es el dato que sirve
//   para llegar.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, StyleSheet, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, G } from '../../theme';
import { Header, Button3D, Card, Skeleton, useAccount, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';
import {
  CATS as CATS_DEMO, PAISES as PAISES_DEMO, CIUDADES as CIUDADES_DEMO,
  comercioPorId, iconoDe, etiquetaDe,
} from './comerciosDemo';
import { leerFicha, PAISES as PAISES_FICHA, RUBROS, DIAS } from './MiNegocio';

const TXT = {
  es: {
    titulo: 'Comercio', mio: 'Tu ficha pública',
    leyendo: 'Abriendo la ficha…',
    noHayT: 'No encontramos este comercio',
    noHayP: 'Puede que ya no esté en el directorio. Vuelve y prueba con otro.',
    mioVacioT: 'Todavía no tienes ficha pública',
    mioVacioP: 'Registra tu negocio y aquí verás exactamente lo que ve un cliente cuando lo abre desde el directorio.',
    volver: 'Volver',
    verificado: 'Verificado en MyTokenPay', pendiente: 'Pendiente',
    avisoEjemplo: 'Este comercio es un ejemplo que trae MyTokenPay: su directorio real todavía no está enchufado a esta app. Sirve para ver cómo se busca y cómo se paga, pero no es un negocio real y no cobra todavía.',
    avisoMio: 'Así ve tu negocio quien lo abra desde el directorio. La ficha vive cifrada en este teléfono hasta que el servidor de MyTokenPay esté conectado.',
    sobre: 'SOBRE ESTE COMERCIO', ofrece: 'LO QUE OFRECE', horario: 'HORARIO',
    enlaces: 'ENLACES', ubicacion: 'UBICACIÓN',
    sinPrecios: 'Los precios los pone el comercio al cobrar: el monto viaja en su QR, no en esta lista.',
    cerrado: 'Cerrado', dias: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    web: 'Sitio web', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'Escribir por WhatsApp',
    contactar: 'CONTACTAR',
    pagarBtn: 'PAGAR EN ESTE COMERCIO',
    pagarNota: 'Este comercio de ejemplo no tiene dirección de cobro en la cadena. Al tocar, se abre la cámara: escanea el QR que te enseñe el negocio y el envío se prepara con SU dirección y SU monto.',
    cobrarBtn: 'COBRAR CON QR', editar: 'Editar mi ficha',
    sinDesc: 'Este comercio todavía no ha escrito su descripción.',
  },
  en: {
    titulo: 'Business', mio: 'Your public listing',
    leyendo: 'Opening the listing…',
    noHayT: 'We could not find this business',
    noHayP: 'It may no longer be in the directory. Go back and try another one.',
    mioVacioT: 'You have no public listing yet',
    mioVacioP: 'Register your business and here you will see exactly what a customer sees when they open it from the directory.',
    volver: 'Back',
    verificado: 'Verified in MyTokenPay', pendiente: 'Pending',
    avisoEjemplo: 'This business is a sample shipped with MyTokenPay: their real directory is not wired into this app yet. It shows how search and payment work, but it is not a real business and it does not charge yet.',
    avisoMio: 'This is how your business looks to anyone opening it from the directory. The listing lives encrypted on this phone until the MyTokenPay server is connected.',
    sobre: 'ABOUT THIS BUSINESS', ofrece: 'WHAT THEY OFFER', horario: 'OPENING HOURS',
    enlaces: 'LINKS', ubicacion: 'LOCATION',
    sinPrecios: 'Prices are set by the business when charging: the amount travels in their QR, not in this list.',
    cerrado: 'Closed', dias: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    web: 'Website', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'Message on WhatsApp',
    contactar: 'CONTACT',
    pagarBtn: 'PAY AT THIS BUSINESS',
    pagarNota: 'This sample business has no charging address on chain. Tapping opens the camera: scan the QR the business shows you and the send is prepared with THEIR address and THEIR amount.',
    cobrarBtn: 'CHARGE WITH QR', editar: 'Edit my listing',
    sinDesc: 'This business has not written its description yet.',
  },
};

// Los favoritos son una preferencia de lectura, no un secreto: AsyncStorage,
// no el almacén cifrado. Se guardan los ids del directorio; la ficha propia
// no entra (nadie marca como favorito su propio negocio).
const LLAVE_FAV = 'og.pay.favoritos';
async function leerFavoritos() {
  try {
    const crudo = await AsyncStorage.getItem(LLAVE_FAV);
    const l = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(l) ? l : [];
  } catch (e) { return []; }
}
async function guardarFavoritos(lista) {
  try { await AsyncStorage.setItem(LLAVE_FAV, JSON.stringify(lista)); } catch (e) {}
}

const abrirUrl = (url) => { if (url) Linking.openURL(url).catch(() => {}); };
// El original abría wa.me con el número limpio de todo lo que no es dígito.
const soloDigitos = (s) => String(s || '').replace(/[^\d]/g, '');
const conEsquema = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);

export default function NegocioDetalle({ nav, params }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const id = String(params?.id || '');
  const esMio = id === 'mio';

  // undefined ⇒ todavía se está resolviendo; null ⇒ no existe.
  const [ficha, setFicha] = useState(esMio ? undefined : () => comercioPorId(id));
  const [favoritos, setFavoritos] = useState([]);

  useEffect(() => {
    if (!esMio) return undefined;
    let vivo = true;
    leerFicha().then((f) => { if (vivo) setFicha(f); });
    return () => { vivo = false; };
  }, [esMio]);

  useEffect(() => { leerFavoritos().then(setFavoritos); }, []);
  const esFavorito = favoritos.includes(id);
  const alternarFavorito = useCallback(() => {
    hap();
    setFavoritos((prev) => {
      const sig = prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat(id);
      guardarFavoritos(sig);
      return sig;
    });
  }, [id]);

  // Las dos fichas se normalizan a UNA sola forma: así el render de abajo se
  // escribe una vez y no se llena de "si es mío… si no…" repartidos.
  const v = useMemo(() => {
    if (!ficha) return null;
    if (esMio) {
      const pais = PAISES_FICHA.find((p) => p.slug === ficha.pais) || null;
      const ciudad = (pais?.ciudades || []).find((c) => c.slug === ficha.ciudad) || null;
      const rubro = RUBROS.find((r) => r.slug === ficha.rubro) || null;
      return {
        nombre: ficha.nombreComercial || ficha.nombreLegal || t.titulo,
        categoria: rubro ? (rubro[lang] || rubro.es) : '',
        icono: 'storefront',
        ciudad: ciudad?.label || '',
        pais: pais?.label || '',
        bandera: pais?.bandera || '',
        // La verificación se lee de la cuenta cada vez, nunca de la ficha
        // guardada: una ficha vieja no puede seguir diciendo "verificado".
        verificado: !!account?.genesisUid,
        descripcion: ficha.descripcion || '',
        ofrece: ficha.productos || [],
        direccion: ficha.direccion || '',
        logo: ficha.logo || null,
        portada: ficha.portada || null,
        horario: ficha.horario || null,
        redes: ficha.redes || {},
      };
    }
    return {
      nombre: ficha.nom,
      categoria: etiquetaDe(CATS_DEMO, ficha.cat, lang),
      icono: iconoDe(ficha.cat),
      ciudad: CIUDADES_DEMO[ficha.ciudad] || '',
      pais: PAISES_DEMO[ficha.pais]?.et || '',
      bandera: PAISES_DEMO[ficha.pais]?.bandera || '',
      verificado: !!ficha.ver,
      descripcion: ficha.desc,
      ofrece: ficha.serv || [],
      direccion: ficha.dir || '',
      logo: null,
      portada: null,
      horario: null,
      redes: {},
    };
  }, [ficha, esMio, lang, account?.genesisUid, t.titulo]);

  // ════ leyendo el teléfono ════════════════════════════════════════════
  if (ficha === undefined) {
    return (
      <View style={st.screen}>
        <Header title={t.titulo} onBack={nav.back} />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Skeleton width="100%" height={140} radius={22} />
          <Skeleton width="60%" height={22} radius={8} />
          <Skeleton width="40%" height={14} radius={7} />
          <Text style={st.nota}>{t.leyendo}</Text>
        </View>
      </View>
    );
  }

  // ════ no existe ══════════════════════════════════════════════════════
  if (!ficha || !v) {
    return (
      <View style={st.screen}>
        <Header title={t.titulo} onBack={nav.back} />
        <View style={st.vacioPantalla}>
          <View style={st.vacioIc}><Icon name="storefront" size={28} color={C.txt3} /></View>
          <Text style={st.vacioT}>{esMio ? t.mioVacioT : t.noHayT}</Text>
          <Text style={st.vacioP}>{esMio ? t.mioVacioP : t.noHayP}</Text>
          <Button3D
            title={esMio ? t.editar.toUpperCase() : t.volver.toUpperCase()}
            icon={esMio ? 'storefront' : 'chevron-back'}
            onPress={() => (esMio ? nav.go('pay-negocio') : nav.back())}
            style={{ marginTop: 18, alignSelf: 'stretch' }}
          />
        </View>
      </View>
    );
  }

  const redes = v.redes || {};
  const hayEnlaces = !!(redes.web || redes.instagram || redes.facebook);

  return (
    <View style={st.screen}>
      <Header
        title={esMio ? t.mio : v.nombre}
        sub={[v.categoria, v.ciudad].filter(Boolean).join(' · ')}
        onBack={nav.back}
        right={esMio ? undefined : (
          <Pressable onPress={alternarFavorito} accessibilityRole="button"
            accessibilityState={{ selected: esFavorito }} accessibilityLabel={v.nombre}
            style={st.corazon}>
            <Icon name="heart" size={19} color={esFavorito ? C.down : C.txt2} />
          </Pressable>
        )}
      />
      <ScrollView contentContainerStyle={st.dentro} showsVerticalScrollIndicator={false}>

        {/* ── portada + logo + sello, como en el original ─────────────── */}
        <View style={st.portadaCaja}>
          {v.portada ? (
            <Image source={{ uri: v.portada }} style={st.portadaImg} resizeMode="cover" />
          ) : (
            <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.portadaImg} />
          )}
          <View style={st.portadaVelo} />
          <View style={st.logoCaja}>
            {v.logo ? (
              <Image source={{ uri: v.logo }} style={st.logoImg} />
            ) : (
              <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.logoImg}>
                <Icon name={v.icono} size={28} color={C.darkText} />
              </LinearGradient>
            )}
          </View>
        </View>

        <Text style={st.nombre}>{v.nombre}</Text>
        <Text style={st.meta}>
          {[v.categoria, [v.ciudad, v.pais].filter(Boolean).join(', ')].filter(Boolean).join(' · ')} {v.bandera}
        </Text>
        <View style={st.pills}>
          <View style={[st.pill, v.verificado ? st.pillOk : st.pillPend]}>
            <Icon name={v.verificado ? 'shield-checkmark' : 'time'} size={12} color={v.verificado ? C.up : '#FBBF24'} />
            <Text style={[st.pillTxt, { color: v.verificado ? C.up : '#FBBF24' }]}>
              {v.verificado ? t.verificado : t.pendiente}
            </Text>
          </View>
        </View>

        {/* ── de qué ficha estamos hablando: siempre dicho ────────────── */}
        <View style={st.aviso}>
          <Icon name="information-circle" size={16} color={C.gold} />
          <Text style={st.avisoTxt}>{esMio ? t.avisoMio : t.avisoEjemplo}</Text>
        </View>

        {/* ── contacto directo por WhatsApp, si lo hay ────────────────── */}
        {redes.whatsapp ? (
          <Button3D
            title={t.contactar} icon="chatbubbles"
            onPress={() => abrirUrl('https://wa.me/' + soloDigitos(redes.whatsapp))}
            style={{ marginTop: 4 }}
          />
        ) : null}

        <Text style={st.grupo}>{t.sobre}</Text>
        <Card style={st.bloque}>
          <Text style={st.cuerpo}>{v.descripcion || t.sinDesc}</Text>
        </Card>

        {v.ofrece.length > 0 ? (
          <>
            <Text style={st.grupo}>{t.ofrece}</Text>
            <View style={st.chips}>
              {v.ofrece.map((s) => (
                <View key={s} style={st.chip}><Text style={st.chipTxt}>{s}</Text></View>
              ))}
            </View>
            <Text style={st.nota}>{t.sinPrecios}</Text>
          </>
        ) : null}

        {v.horario ? (
          <>
            <Text style={st.grupo}>{t.horario}</Text>
            <Card style={st.bloque}>
              {DIAS.map((dia, i) => {
                const d = v.horario[dia] || {};
                return (
                  <View key={dia} style={st.horaFila}>
                    <Text style={st.horaDia}>{t.dias[i]}</Text>
                    <Text style={[st.horaVal, d.cerrado && { color: C.txt3 }]}>
                      {d.cerrado ? t.cerrado : `${d.abre || '—'} – ${d.cierra || '—'}`}
                    </Text>
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        {hayEnlaces ? (
          <>
            <Text style={st.grupo}>{t.enlaces}</Text>
            <Card style={st.bloque}>
              {redes.web ? <Enlace icono="globe" texto={t.web} onPress={() => abrirUrl(conEsquema(redes.web))} /> : null}
              {redes.instagram ? <Enlace icono="image" texto={t.instagram} onPress={() => abrirUrl(conEsquema(redes.instagram))} /> : null}
              {redes.facebook ? <Enlace icono="link" texto={t.facebook} onPress={() => abrirUrl(conEsquema(redes.facebook))} /> : null}
            </Card>
          </>
        ) : null}

        <Text style={st.grupo}>{t.ubicacion}</Text>
        <Card style={st.bloque}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
            <Icon name="earth" size={15} color={C.txt3} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.cuerpo}>{v.direccion || '—'}</Text>
              <Text style={st.cuerpoTenue}>{[v.ciudad, v.pais].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
        </Card>

        {/* ── la acción: cobrar si es tuyo, pagar si es de otro ───────── */}
        {esMio ? (
          <>
            <Button3D title={t.cobrarBtn} icon="qr-code" onPress={() => nav.go('pay-cobro')} style={{ marginTop: 22 }} />
            <Pressable onPress={() => { hap(); nav.go('pay-negocio'); }}
              accessibilityRole="button" accessibilityLabel={t.editar} style={st.enlaceFila}>
              <Icon name="create" size={15} color={C.txt2} />
              <Text style={st.enlaceFilaTxt}>{t.editar}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Button3D title={t.pagarBtn} icon="qr-code" onPress={() => nav.go('pay-pagar')} style={{ marginTop: 22 }} />
            <Text style={st.nota}>{t.pagarNota}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Enlace({ icono, texto, onPress }) {
  return (
    <Pressable onPress={() => { hap(); onPress(); }}
      accessibilityRole="link" accessibilityLabel={texto} style={st.enlace}>
      <Icon name={icono} size={15} color={C.gold} />
      <Text style={st.enlaceTxt}>{texto}</Text>
      <Icon name="open-outline" size={14} color={C.txt3} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 6 },
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },

  corazon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center',
  },

  portadaCaja: { height: 150, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.line, justifyContent: 'flex-end' },
  portadaImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  portadaVelo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,27,28,0.28)' },
  logoCaja: { margin: 14 },
  logoImg: { width: 66, height: 66, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  nombre: { color: C.txt, fontSize: 21, fontWeight: '800', marginTop: 14 },
  meta: { color: C.txt2, fontSize: 12.5, marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  pillOk: { backgroundColor: 'rgba(62,217,160,0.13)', borderColor: 'rgba(62,217,160,0.3)' },
  pillPend: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.35)' },
  pillTxt: { fontSize: 10.5, fontWeight: '700' },

  aviso: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(201,169,97,0.10)',
    borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginTop: 16,
  },
  avisoTxt: { flex: 1, color: C.txt2, fontSize: 11.5, lineHeight: 17.5 },

  grupo: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6, marginTop: 24, marginBottom: 11 },
  bloque: { padding: 15, borderWidth: 1, borderColor: C.line2 },
  cuerpo: { color: C.txt2, fontSize: 13, lineHeight: 20 },
  cuerpoTenue: { color: C.txt3, fontSize: 12, marginTop: 6 },
  nota: { color: C.txt3, fontSize: 11.5, lineHeight: 17.5, marginTop: 11 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipTxt: { color: C.txt2, fontSize: 11.5 },

  horaFila: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  horaDia: { color: C.txt3, fontSize: 12.5 },
  horaVal: { color: C.txt, fontSize: 12.5, fontWeight: '600' },

  enlace: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  enlaceTxt: { flex: 1, color: C.txt2, fontSize: 13, fontWeight: '600' },
  enlaceFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  enlaceFilaTxt: { color: C.txt2, fontSize: 13, fontWeight: '600' },

  vacioPantalla: { paddingHorizontal: 20, marginTop: 40, alignItems: 'center' },
  vacioIc: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: C.panel2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  vacioT: { color: C.txt, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  vacioP: { color: C.txt3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 8 },
});
