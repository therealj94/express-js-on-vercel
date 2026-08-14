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

// Etiquetas del original (sus mismas categorías, países y ciudades).
const CATS = {
  restaurantes: { es: 'Restaurantes', en: 'Restaurants' },
  cafeterias: { es: 'Cafeterías', en: 'Coffee shops' },
  hoteles: { es: 'Hoteles y hospedaje', en: 'Hotels & stays' },
  gimnasios: { es: 'Gimnasios y fitness', en: 'Gyms & fitness' },
  belleza: { es: 'Belleza y spa', en: 'Beauty & spa' },
  'vida-nocturna': { es: 'Vida nocturna', en: 'Nightlife' },
  conveniencia: { es: 'Tiendas de conveniencia', en: 'Convenience stores' },
  moda: { es: 'Moda y accesorios', en: 'Fashion & accessories' },
  tecnologia: { es: 'Electrónica y tecnología', en: 'Electronics & tech' },
  salud: { es: 'Salud y bienestar', en: 'Health & wellness' },
  educacion: { es: 'Educación', en: 'Education' },
  automotriz: { es: 'Automotriz', en: 'Automotive' },
  turismo: { es: 'Turismo y experiencias', en: 'Tourism & experiences' },
};

const PAISES = {
  honduras: { et: 'Honduras', bandera: '🇭🇳' },
  guatemala: { et: 'Guatemala', bandera: '🇬🇹' },
  'el-salvador': { et: 'El Salvador', bandera: '🇸🇻' },
  nicaragua: { et: 'Nicaragua', bandera: '🇳🇮' },
  'costa-rica': { et: 'Costa Rica', bandera: '🇨🇷' },
  panama: { et: 'Panamá', bandera: '🇵🇦' },
};

const CIUDADES = {
  tegucigalpa: 'Tegucigalpa', 'san-pedro-sula': 'San Pedro Sula', 'la-ceiba': 'La Ceiba', roatan: 'Roatán',
  'ciudad-de-guatemala': 'Ciudad de Guatemala', antigua: 'Antigua Guatemala', quetzaltenango: 'Quetzaltenango',
  'san-salvador': 'San Salvador', 'santa-ana': 'Santa Ana', 'la-libertad': 'La Libertad',
  managua: 'Managua', granada: 'Granada', leon: 'León',
  'san-jose': 'San José', tamarindo: 'Tamarindo', liberia: 'Liberia',
  'ciudad-de-panama': 'Ciudad de Panamá', 'bocas-del-toro': 'Bocas del Toro',
};

// El set de iconos de la casa es SVG propio y corto a propósito (ver
// src/icons.js: los iconos por fuente dejaban la pantalla en blanco cuando
// la fuente no cargaba). No hay un glifo por categoría, así que se reparte
// lo que hay y el resto cae en la tienda: la categoría se lee igual, escrita.
const ICONO = {
  turismo: 'airplane', tecnologia: 'construct', salud: 'heart',
  educacion: 'document-text', 'vida-nocturna': 'star', gimnasios: 'pulse',
  belleza: 'star', automotriz: 'construct',
};
const iconoDe = (cat) => ICONO[cat] || 'storefront';

// Los treinta comercios de ejemplo de mytokenpay-app (mockData.ts), tal cual.
const COMERCIOS = [
  { id: 'mtp-hn-1', nom: 'Origen Coffee Lab', cat: 'cafeterias', pais: 'honduras', ciudad: 'tegucigalpa', ver: true,
    dir: 'Col. Palmira, Av. República de Chile',
    desc: 'Café de especialidad hondureño, tostado propio y ambiente para trabajar. Aceptamos ORIGEN en barra y para llevar.',
    serv: ['Café de especialidad', 'Repostería', 'Espacio de coworking'] },
  { id: 'mtp-hn-2', nom: 'Fuego Norte Parrilla', cat: 'restaurantes', pais: 'honduras', ciudad: 'san-pedro-sula', ver: true,
    dir: 'Blvd. Morazán, frente a Multiplaza',
    desc: 'Carnes a la parrilla y cocina hondureña contemporánea. Facturación automática en lempiras al pagar con ORIGEN.',
    serv: ['Carnes a la parrilla', 'Reservaciones', 'Eventos privados'] },
  { id: 'mtp-hn-3', nom: 'Roatán Dive & Stay', cat: 'hoteles', pais: 'honduras', ciudad: 'roatan', ver: true,
    dir: 'West Bay Beach Road',
    desc: 'Boutique hotel frente al mar con centro de buceo propio. Liquidación en ORIGEN o USDK disponible.',
    serv: ['Habitaciones frente al mar', 'Buceo certificado PADI', 'Traslados'] },
  { id: 'mtp-hn-4', nom: 'Catracho Fit Club', cat: 'gimnasios', pais: 'honduras', ciudad: 'tegucigalpa', ver: false,
    dir: 'Col. Lomas del Guijarro, Blvd. Suyapa',
    desc: 'Gimnasio funcional con clases de crossfit y entrenamiento personalizado.',
    serv: ['Membresías mensuales', 'Crossfit', 'Entrenamiento personal'] },
  { id: 'mtp-hn-5', nom: 'La Ceiba Beauty Studio', cat: 'belleza', pais: 'honduras', ciudad: 'la-ceiba', ver: true,
    dir: 'Av. San Isidro, Barrio El Iman',
    desc: 'Salón de belleza y spa con tratamientos capilares y faciales.',
    serv: ['Peinados y color', 'Tratamientos faciales', 'Uñas'] },
  { id: 'mtp-gt-1', nom: 'Pulso Fitness Club', cat: 'gimnasios', pais: 'guatemala', ciudad: 'ciudad-de-guatemala', ver: true,
    dir: 'Zona 10, Av. Las Américas',
    desc: 'Gimnasio full equipment con clases grupales todos los días. Membresías mensuales pagables en ORIGEN.',
    serv: ['Membresías', 'Entrenamiento personal', 'Clases grupales'] },
  { id: 'mtp-gt-2', nom: 'Antigua Colonial Suites', cat: 'hoteles', pais: 'guatemala', ciudad: 'antigua', ver: false,
    dir: '5a Avenida Norte, Casco Histórico',
    desc: 'Hotel boutique en una casona colonial restaurada, a media cuadra del parque central.',
    serv: ['Suites coloniales', 'Desayuno incluido', 'Tours culturales'] },
  { id: 'mtp-gt-3', nom: 'Xela Beauty Bar', cat: 'belleza', pais: 'guatemala', ciudad: 'quetzaltenango', ver: true,
    dir: 'Zona 1, Pasaje Enríquez',
    desc: 'Spa urbano y salón de belleza con tratamientos faciales y corporales.',
    serv: ['Manicure y pedicure', 'Tratamientos faciales', 'Masajes'] },
  { id: 'mtp-gt-4', nom: 'Chapín Tech Store', cat: 'tecnologia', pais: 'guatemala', ciudad: 'ciudad-de-guatemala', ver: true,
    dir: 'Zona 4, Cuatro Grados Norte',
    desc: 'Tienda de dispositivos electrónicos, accesorios y reparaciones express.',
    serv: ['Venta de celulares', 'Reparaciones', 'Accesorios'] },
  { id: 'mtp-gt-5', nom: 'Ruta Maya Tours', cat: 'turismo', pais: 'guatemala', ciudad: 'antigua', ver: true,
    dir: 'Calle del Arco, Antigua',
    desc: 'Tours guiados a volcanes, mercados locales y sitios arqueológicos mayas.',
    serv: ['Tour al volcán Acatenango', 'Tours culturales', 'Transporte privado'] },
  { id: 'mtp-sv-1', nom: 'Volcán Rooftop Lounge', cat: 'vida-nocturna', pais: 'el-salvador', ciudad: 'san-salvador', ver: true,
    dir: 'Zona Rosa, Torre Futura',
    desc: 'Rooftop bar con vista a la ciudad, coctelería de autor y DJ en vivo los fines de semana.',
    serv: ['Coctelería de autor', 'Música en vivo', 'Reservación de mesas VIP'] },
  { id: 'mtp-sv-2', nom: 'Mercadito Surf Shop', cat: 'moda', pais: 'el-salvador', ciudad: 'la-libertad', ver: false,
    dir: 'Calle Principal, El Tunco',
    desc: 'Tienda de ropa y tablas de surf de marcas locales, frente a la playa.',
    serv: ['Ropa de playa', 'Tablas de surf', 'Renta de equipo'] },
  { id: 'mtp-sv-3', nom: 'Nómada Coworking & Café', cat: 'cafeterias', pais: 'el-salvador', ciudad: 'santa-ana', ver: true,
    dir: 'Av. Independencia Sur',
    desc: 'Espacio de coworking con café de especialidad y salas de reunión por hora.',
    serv: ['Espacios de trabajo', 'Café y snacks', 'Salas de reunión'] },
  { id: 'mtp-sv-4', nom: 'Pupusería Doña Chayo', cat: 'restaurantes', pais: 'el-salvador', ciudad: 'san-salvador', ver: true,
    dir: 'Colonia Escalón, 71 Av. Norte',
    desc: 'Pupusas tradicionales salvadoreñas hechas al momento, con curtido casero.',
    serv: ['Pupusas revueltas', 'Curtido casero', 'Para llevar'] },
  { id: 'mtp-sv-5', nom: 'Clínica Bienestar SV', cat: 'salud', pais: 'el-salvador', ciudad: 'santa-ana', ver: true,
    dir: 'Av. Independencia Norte',
    desc: 'Clínica de medicina general y consultas de bienestar integral.',
    serv: ['Consulta general', 'Chequeos preventivos', 'Laboratorio clínico'] },
  { id: 'mtp-ni-1', nom: 'Granada Lakeside Hostal', cat: 'hoteles', pais: 'nicaragua', ciudad: 'granada', ver: true,
    dir: 'Calle La Calzada, frente al lago',
    desc: 'Hostal boutique junto al lago Cocibolca, con tours a las isletas incluidos.',
    serv: ['Habitaciones privadas y compartidas', 'Tours a isletas', 'Bar en terraza'] },
  { id: 'mtp-ni-2', nom: 'León Bike Rentals', cat: 'turismo', pais: 'nicaragua', ciudad: 'leon', ver: false,
    dir: 'Parque Central, costado sur',
    desc: 'Renta de bicicletas y tours guiados por el centro histórico de León.',
    serv: ['Renta de bicicletas', 'Tours guiados', 'Sandboard en el Cerro Negro'] },
  { id: 'mtp-ni-3', nom: 'Managua Tech Store', cat: 'tecnologia', pais: 'nicaragua', ciudad: 'managua', ver: true,
    dir: 'Metrocentro, Local 214',
    desc: 'Venta de accesorios y dispositivos electrónicos, con soporte técnico en tienda.',
    serv: ['Accesorios móviles', 'Reparaciones', 'Venta de dispositivos'] },
  { id: 'mtp-ni-4', nom: 'Café Colonial Granada', cat: 'cafeterias', pais: 'nicaragua', ciudad: 'granada', ver: true,
    dir: 'Calle Atravesada, Casco Colonial',
    desc: 'Café nicaragüense de origen, tostado local, en una casona colonial restaurada.',
    serv: ['Café de origen', 'Repostería local', 'Desayunos'] },
  { id: 'mtp-ni-5', nom: 'Academia Digital León', cat: 'educacion', pais: 'nicaragua', ciudad: 'leon', ver: true,
    dir: 'Barrio Sutiava, Calle Central',
    desc: 'Academia de cursos cortos en programación, diseño y marketing digital.',
    serv: ['Cursos de programación', 'Diseño digital', 'Marketing en redes'] },
  { id: 'mtp-cr-1', nom: 'Pura Vida Wellness Spa', cat: 'salud', pais: 'costa-rica', ciudad: 'san-jose', ver: true,
    dir: 'Escazú, Centro Comercial Momentum',
    desc: 'Centro de bienestar integral con yoga, masajes terapéuticos y nutrición.',
    serv: ['Yoga y meditación', 'Masajes terapéuticos', 'Consultas de nutrición'] },
  { id: 'mtp-cr-2', nom: 'Tamarindo Surf & Board', cat: 'turismo', pais: 'costa-rica', ciudad: 'tamarindo', ver: true,
    dir: 'Playa Tamarindo, frente al muelle',
    desc: 'Clases de surf, renta de equipo y tours de atardecer en catamarán.',
    serv: ['Clases de surf', 'Renta de tablas', 'Tours en catamarán'] },
  { id: 'mtp-cr-3', nom: 'Liberia AutoServicio Express', cat: 'automotriz', pais: 'costa-rica', ciudad: 'liberia', ver: false,
    dir: 'Carretera Interamericana Norte km 217',
    desc: 'Taller automotriz con servicio express de mantenimiento preventivo.',
    serv: ['Cambio de aceite', 'Diagnóstico computarizado', 'Llantas y frenos'] },
  { id: 'mtp-cr-4', nom: 'Soda Tica Central', cat: 'restaurantes', pais: 'costa-rica', ciudad: 'san-jose', ver: true,
    dir: 'Barrio Escalante, Calle 33',
    desc: 'Comida típica costarricense: casados, gallo pinto y batidos naturales.',
    serv: ['Casados', 'Gallo pinto', 'Batidos naturales'] },
  { id: 'mtp-cr-5', nom: 'Chepe Nightlife Bar', cat: 'vida-nocturna', pais: 'costa-rica', ciudad: 'san-jose', ver: true,
    dir: 'Barrio California, Calle 29',
    desc: 'Bar de cervezas artesanales costarricenses con música en vivo.',
    serv: ['Cervezas artesanales', 'Música en vivo', 'Tapas'] },
  { id: 'mtp-pa-1', nom: 'Casco Antiguo Rooftop', cat: 'vida-nocturna', pais: 'panama', ciudad: 'ciudad-de-panama', ver: true,
    dir: 'Casco Viejo, Calle 3ra',
    desc: 'Terraza con vista a la bahía, coctelería premium y música en vivo.',
    serv: ['Coctelería premium', 'Cenas privadas', 'Eventos corporativos'] },
  { id: 'mtp-pa-2', nom: 'Bocas Market & Convenience', cat: 'conveniencia', pais: 'panama', ciudad: 'bocas-del-toro', ver: true,
    dir: 'Calle 3ra, Isla Colón',
    desc: 'Minimarket con productos importados, snacks y esenciales para turistas y locales.',
    serv: ['Abarrotes', 'Snacks y bebidas', 'Productos importados'] },
  { id: 'mtp-pa-3', nom: 'Cevichería Casco Viejo', cat: 'restaurantes', pais: 'panama', ciudad: 'ciudad-de-panama', ver: false,
    dir: 'Casco Viejo, Av. Central',
    desc: 'Ceviches y mariscos frescos del Pacífico panameño, ambiente al aire libre.',
    serv: ['Ceviche mixto', 'Mariscos frescos', 'Reservaciones'] },
  { id: 'mtp-pa-4', nom: 'Panamá Digital Hub', cat: 'tecnologia', pais: 'panama', ciudad: 'ciudad-de-panama', ver: true,
    dir: 'Costa del Este, Torre Business Park',
    desc: 'Tienda y centro de soporte técnico para dispositivos móviles y laptops.',
    serv: ['Venta de laptops', 'Soporte técnico', 'Accesorios'] },
  { id: 'mtp-pa-5', nom: 'Bocas Beach Hostel', cat: 'hoteles', pais: 'panama', ciudad: 'bocas-del-toro', ver: true,
    dir: 'Playa Bluff, Isla Colón',
    desc: 'Hostal frente al mar con ambiente relajado, ideal para surfistas y mochileros.',
    serv: ['Dormitorios compartidos', 'Habitaciones privadas', 'Renta de tablas de surf'] },
];

// Categorías y países en el orden en que aparecen en los datos: así los
// filtros nunca ofrecen una casilla que no devuelve nada.
const CATS_USADAS = COMERCIOS.reduce((a, c) => (a.includes(c.cat) ? a : a.concat(c.cat)), []);
const PAISES_USADOS = COMERCIOS.reduce((a, c) => (a.includes(c.pais) ? a : a.concat(c.pais)), []);

const rellena = (s, vals) => Object.keys(vals).reduce((a, k) => a.replace('{' + k + '}', vals[k]), s);
// Sin tildes y en minúsculas: quien escribe "cafe" tiene que encontrar "Café".
// El rango \u0300-\u036f son las marcas diacriticas que deja NFD al separar
// la letra de su acento; escrito escapado para que el fichero no dependa de
// como guarde el editor esos combinantes sueltos.
const pelado = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

export default function ExplorarPay({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const et = (dic, clave) => (dic[clave] ? (dic[clave][lang] || dic[clave].es) : clave);

  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState('');
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
