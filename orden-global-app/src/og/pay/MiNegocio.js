// Mi negocio, en MyTokenPay: UNA pantalla con dos caras.
//
// Se fusionan aquí dos pantallas del mytokenpay-app (Expo 51):
// `registrar-empresa.tsx` (el alta en seis pasos) y `mi-empresa.tsx` (la
// ficha editable). Eran dos rutas distintas porque el router de allá lo
// permitía; aquí no hacen falta: quien NO tiene negocio ve el alta, quien SÍ
// lo tiene ve su ficha. Es la misma pregunta —"¿tiene ficha?"— resuelta una
// sola vez, y así nadie llega a un formulario de alta teniendo ya negocio.
//
// DÓNDE VIVE LA FICHA Y POR QUÉ AHÍ
// El original hablaba con su servidor (api.myCompany / api.createCompany /
// api.updateCompany). Ese backend de MyTokenPay NO está enchufado en esta
// app, así que la ficha se guarda en el TELÉFONO con expo-secure-store bajo
// la llave 'og.negocio' — cifrada por el sistema, igual que el resto de lo
// sensible de la casa. Es la única opción honesta: guardar en un servidor que
// no existe sería mentir, y pedir datos para tirarlos, peor. Cuando el
// backend llegue, lo que cambia son `leerFicha`/`guardarFicha`; la pantalla
// no se entera.
//
// QUÉ SE DEJÓ FUERA DEL ORIGINAL, Y POR QUÉ
// · El mapa (MapPicker): pedía react-native-maps, que esta app no lleva. La
//   ubicación se sigue capturando —país, ciudad y dirección— y las
//   coordenadas quedan guardadas desde la ciudad elegida, para que el día que
//   haya mapa el pin ya tenga dónde caer.
// · La subida de documentos KYC: allá viajaban al servidor de MyTokenPay.
//   Aquí la identidad del comercio ES el Genesis ID de la cuenta (PLAN-V3),
//   así que el paso de verificación lleva al KYC que ya existe en vez de
//   pedir papeles que nadie recibiría.
//
// El fondo morado-negro #0A0812 es la marca de MyTokenPay, no la nuestra: se
// conserva su CARÁCTER —superficies casi negras y un acento saturado que
// manda en las tarjetas grandes— traducido al verde profundo y el oro de
// Orden Global.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, Image,
  Animated, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { C, G } from '../../theme';
import { Header, Field, Button3D, Skeleton, useAccount, useToast, hap } from '../../ui';
import { Icon } from '../../icons';
import { useLang } from '../../i18n';

const TXT = {
  es: {
    titulo: 'Mi negocio', subAlta: 'Regístralo y cobra en ORIGEN', subFicha: 'Tu ficha en el ecosistema',
    leyendo: 'Buscando tu negocio…',
    pasos: ['Datos básicos', 'Ubicación', 'Rubro', 'Perfil público', 'Verificación', 'Revisión'],
    nombreLegal: 'Nombre legal de la empresa', nombreLegalPh: 'Ej. Fuego Norte Parrilla S.A. de C.V.',
    nombreCom: 'Nombre comercial', nombreComPh: 'Como lo conocen tus clientes',
    rtn: 'Identificación tributaria (RTN / NIT)', rtnPh: 'RTN-00000000000',
    pais: 'País', ciudad: 'Ciudad', elige: 'Elegir…', primeroPais: 'Elige primero el país',
    direccion: 'Dirección exacta', direccionPh: 'Calle, número, referencia',
    sinMapa: 'Guardamos las coordenadas de la ciudad que elijas. El mapa para mover el pin llega cuando la app lleve mapas.',
    rubro: 'Categoría del negocio',
    productos: 'Productos o servicios', productosPh: 'Escribe y toca +',
    logo: 'Logo', portada: 'Portada', subir: 'Subir imagen', cambiar: 'Cambiar imagen',
    descripcion: 'Descripción del negocio', descripcionPh: 'Cuéntale a tus clientes qué ofreces',
    web: 'Sitio web', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp',
    horario: 'Horario de atención', cerrado: 'Cerrado',
    dias: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    verifTit: 'La identidad del comercio es tu Genesis ID',
    verifTxt: 'En Orden Global no se piden papeles dos veces: tu negocio se verifica con el Genesis ID de tu cuenta (KYC/KYB). Si ya lo tienes aprobado, tu ficha nace verificada.',
    verifOk: 'Genesis ID aprobado', verifNo: 'Genesis ID pendiente',
    verifNoTxt: 'Puedes registrar tu negocio ahora: quedará SIN VERIFICAR hasta que tu Genesis ID sea aprobado.',
    verifBtn: 'COMPLETAR MI GENESIS ID',
    declara: 'Declaro que la información que doy es verídica y autorizo su verificación contra las listas AML, OFAC y ONU.',
    revision: 'REVISA ANTES DE GUARDAR', tuNegocio: 'Tu negocio',
    rUbicacion: 'Ubicación', rProductos: 'Productos / servicios', rIdentidad: 'Identidad',
    notaGuardar: 'La ficha se guarda cifrada en este teléfono. MyTokenPay todavía no tiene servidor enchufado en la app: cuando lo tenga, tu ficha viaja tal cual y aparece en el directorio público.',
    seguir: 'CONTINUAR', guardarAlta: 'GUARDAR MI NEGOCIO', guardar: 'GUARDAR CAMBIOS',
    guardando: 'Guardando…', guardado: 'Cambios guardados', creado: 'Tu negocio quedó registrado',
    noGuardo: 'No se pudo guardar la ficha en este teléfono. Intenta de nuevo.',
    noFoto: 'No se pudo usar esa imagen.',
    verificado: 'Verificado con Genesis', sinVerificar: 'Sin verificar',
    verPanel: 'Ver el panel del negocio', desde: 'En el ecosistema desde',
    editar: 'DATOS DEL NEGOCIO', vacio: '—',
  },
  en: {
    titulo: 'My business', subAlta: 'Register it and charge in ORIGEN', subFicha: 'Your listing in the ecosystem',
    leyendo: 'Looking for your business…',
    pasos: ['Basics', 'Location', 'Category', 'Public profile', 'Verification', 'Review'],
    nombreLegal: 'Legal company name', nombreLegalPh: 'e.g. Fuego Norte Parrilla S.A. de C.V.',
    nombreCom: 'Trade name', nombreComPh: 'How your customers know you',
    rtn: 'Tax ID (RTN / NIT)', rtnPh: 'RTN-00000000000',
    pais: 'Country', ciudad: 'City', elige: 'Choose…', primeroPais: 'Pick a country first',
    direccion: 'Exact address', direccionPh: 'Street, number, landmark',
    sinMapa: 'We store the coordinates of the city you pick. The map to drag the pin arrives when the app carries maps.',
    rubro: 'Business category',
    productos: 'Products or services', productosPh: 'Type and tap +',
    logo: 'Logo', portada: 'Cover', subir: 'Upload image', cambiar: 'Change image',
    descripcion: 'Business description', descripcionPh: 'Tell your customers what you offer',
    web: 'Website', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp',
    horario: 'Opening hours', cerrado: 'Closed',
    dias: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    verifTit: 'Your business identity is your Genesis ID',
    verifTxt: 'Orden Global never asks for the same papers twice: your business is verified with your account’s Genesis ID (KYC/KYB). If it is already approved, your listing is born verified.',
    verifOk: 'Genesis ID approved', verifNo: 'Genesis ID pending',
    verifNoTxt: 'You can register now: the listing stays UNVERIFIED until your Genesis ID is approved.',
    verifBtn: 'COMPLETE MY GENESIS ID',
    declara: 'I declare the information I provide is truthful and I authorise its screening against the AML, OFAC and UN lists.',
    revision: 'CHECK BEFORE SAVING', tuNegocio: 'Your business',
    rUbicacion: 'Location', rProductos: 'Products / services', rIdentidad: 'Identity',
    notaGuardar: 'The listing is stored encrypted on this phone. MyTokenPay has no server wired into the app yet: when it does, your listing travels as-is and shows in the public directory.',
    seguir: 'CONTINUE', guardarAlta: 'SAVE MY BUSINESS', guardar: 'SAVE CHANGES',
    guardando: 'Saving…', guardado: 'Changes saved', creado: 'Your business is registered',
    noGuardo: 'The listing could not be saved on this phone. Try again.',
    noFoto: 'That image could not be used.',
    verificado: 'Verified with Genesis', sinVerificar: 'Unverified',
    verPanel: 'Open the business panel', desde: 'In the ecosystem since',
    editar: 'BUSINESS DETAILS', vacio: '—',
  },
};

// Los rubros del MyTokenPay original. Allá cada uno traía un icono de lucide;
// nuestro set de iconos es SVG propio y no tiene esos quince dibujos, así que
// el rubro se distingue por su emoji — se lee igual de rápido y no depende de
// ninguna fuente que pueda no cargar.
// Se exportan (RUBROS, PAISES, DIAS, leerFicha) porque el panel del negocio y
// la ficha pública tienen que leer EXACTAMENTE la misma ficha con las mismas
// etiquetas. Duplicar la lista de países o el orden de los días haría que la
// ficha guardada aquí se enseñara allá con otro nombre de ciudad.
export const RUBROS = [
  { slug: 'restaurantes', es: 'Restaurantes', en: 'Restaurants', ico: '🍽' },
  { slug: 'cafeterias', es: 'Cafeterías', en: 'Coffee shops', ico: '☕️' },
  { slug: 'hoteles', es: 'Hoteles y hospedaje', en: 'Hotels & lodging', ico: '🛏' },
  { slug: 'gimnasios', es: 'Gimnasios y fitness', en: 'Gyms & fitness', ico: '🏋️' },
  { slug: 'belleza', es: 'Belleza y spa', en: 'Beauty & spa', ico: '💅' },
  { slug: 'vida-nocturna', es: 'Vida nocturna', en: 'Nightlife', ico: '🍸' },
  { slug: 'conveniencia', es: 'Tiendas de conveniencia', en: 'Convenience stores', ico: '🏪' },
  { slug: 'supermercados', es: 'Supermercados', en: 'Supermarkets', ico: '🛒' },
  { slug: 'moda', es: 'Moda y accesorios', en: 'Fashion & accessories', ico: '👕' },
  { slug: 'tecnologia', es: 'Electrónica y tecnología', en: 'Electronics & tech', ico: '📱' },
  { slug: 'salud', es: 'Salud y bienestar', en: 'Health & wellness', ico: '❤️' },
  { slug: 'educacion', es: 'Educación', en: 'Education', ico: '🎓' },
  { slug: 'automotriz', es: 'Automotriz', en: 'Automotive', ico: '🚗' },
  { slug: 'turismo', es: 'Turismo y experiencias', en: 'Tourism & experiences', ico: '🌴' },
  { slug: 'servicios', es: 'Servicios profesionales', en: 'Professional services', ico: '💼' },
];

// Los mismos países y ciudades del directorio de MyTokenPay, con sus
// coordenadas: son las plazas donde el ecosistema ya opera. Se porta esta
// lista y no la de `paises.js` (los 249 códigos ISO del KYC) porque aquella
// no trae ciudades, y una ficha de comercio sin ciudad no sirve para que la
// encuentren.
export const PAISES = [
  { slug: 'honduras', label: 'Honduras', bandera: '🇭🇳', ciudades: [
    { slug: 'tegucigalpa', label: 'Tegucigalpa', lat: 14.0723, lng: -87.1921 },
    { slug: 'san-pedro-sula', label: 'San Pedro Sula', lat: 15.5049, lng: -88.0253 },
    { slug: 'la-ceiba', label: 'La Ceiba', lat: 15.7597, lng: -86.7822 },
    { slug: 'roatan', label: 'Roatán', lat: 16.325, lng: -86.5335 },
  ] },
  { slug: 'guatemala', label: 'Guatemala', bandera: '🇬🇹', ciudades: [
    { slug: 'ciudad-de-guatemala', label: 'Ciudad de Guatemala', lat: 14.6349, lng: -90.5069 },
    { slug: 'antigua', label: 'Antigua Guatemala', lat: 14.5586, lng: -90.7295 },
    { slug: 'quetzaltenango', label: 'Quetzaltenango', lat: 14.8508, lng: -91.5186 },
  ] },
  { slug: 'el-salvador', label: 'El Salvador', bandera: '🇸🇻', ciudades: [
    { slug: 'san-salvador', label: 'San Salvador', lat: 13.6929, lng: -89.2182 },
    { slug: 'santa-ana', label: 'Santa Ana', lat: 13.994, lng: -89.5597 },
    { slug: 'la-libertad', label: 'La Libertad', lat: 13.4883, lng: -89.3223 },
  ] },
  { slug: 'nicaragua', label: 'Nicaragua', bandera: '🇳🇮', ciudades: [
    { slug: 'managua', label: 'Managua', lat: 12.1364, lng: -86.2514 },
    { slug: 'granada', label: 'Granada', lat: 11.9344, lng: -85.956 },
    { slug: 'leon', label: 'León', lat: 12.434, lng: -86.878 },
  ] },
  { slug: 'costa-rica', label: 'Costa Rica', bandera: '🇨🇷', ciudades: [
    { slug: 'san-jose', label: 'San José', lat: 9.9281, lng: -84.0907 },
    { slug: 'tamarindo', label: 'Tamarindo', lat: 10.2996, lng: -85.8372 },
    { slug: 'liberia', label: 'Liberia', lat: 10.6346, lng: -85.4406 },
  ] },
  { slug: 'panama', label: 'Panamá', bandera: '🇵🇦', ciudades: [
    { slug: 'ciudad-de-panama', label: 'Ciudad de Panamá', lat: 8.9824, lng: -79.5199 },
    { slug: 'bocas-del-toro', label: 'Bocas del Toro', lat: 9.34, lng: -82.24 },
  ] },
  { slug: 'mexico', label: 'México', bandera: '🇲🇽', ciudades: [
    { slug: 'ciudad-de-mexico', label: 'Ciudad de México', lat: 19.4326, lng: -99.1332 },
    { slug: 'guadalajara', label: 'Guadalajara', lat: 20.6597, lng: -103.3496 },
    { slug: 'cancun', label: 'Cancún', lat: 21.1619, lng: -86.8515 },
  ] },
  { slug: 'cuba', label: 'Cuba', bandera: '🇨🇺', ciudades: [
    { slug: 'la-habana', label: 'La Habana', lat: 23.1136, lng: -82.3666 },
    { slug: 'santiago-de-cuba', label: 'Santiago de Cuba', lat: 20.0247, lng: -75.8219 },
  ] },
  { slug: 'republica-dominicana', label: 'República Dominicana', bandera: '🇩🇴', ciudades: [
    { slug: 'santo-domingo', label: 'Santo Domingo', lat: 18.4861, lng: -69.9312 },
    { slug: 'punta-cana', label: 'Punta Cana', lat: 18.5601, lng: -68.3725 },
  ] },
  { slug: 'venezuela', label: 'Venezuela', bandera: '🇻🇪', ciudades: [
    { slug: 'caracas', label: 'Caracas', lat: 10.4806, lng: -66.9036 },
    { slug: 'maracaibo', label: 'Maracaibo', lat: 10.6427, lng: -71.6125 },
  ] },
  { slug: 'colombia', label: 'Colombia', bandera: '🇨🇴', ciudades: [
    { slug: 'bogota', label: 'Bogotá', lat: 4.711, lng: -74.0721 },
    { slug: 'medellin', label: 'Medellín', lat: 6.2442, lng: -75.5812 },
    { slug: 'cartagena', label: 'Cartagena', lat: 10.391, lng: -75.4794 },
  ] },
  { slug: 'ecuador', label: 'Ecuador', bandera: '🇪🇨', ciudades: [
    { slug: 'quito', label: 'Quito', lat: -0.1807, lng: -78.4678 },
    { slug: 'guayaquil', label: 'Guayaquil', lat: -2.1894, lng: -79.8891 },
  ] },
  { slug: 'peru', label: 'Perú', bandera: '🇵🇪', ciudades: [
    { slug: 'lima', label: 'Lima', lat: -12.0464, lng: -77.0428 },
    { slug: 'cusco', label: 'Cusco', lat: -13.5319, lng: -71.9675 },
  ] },
  { slug: 'bolivia', label: 'Bolivia', bandera: '🇧🇴', ciudades: [
    { slug: 'la-paz', label: 'La Paz', lat: -16.5, lng: -68.15 },
    { slug: 'santa-cruz-de-la-sierra', label: 'Santa Cruz de la Sierra', lat: -17.7833, lng: -63.1821 },
  ] },
  { slug: 'brasil', label: 'Brasil', bandera: '🇧🇷', ciudades: [
    { slug: 'sao-paulo', label: 'São Paulo', lat: -23.5505, lng: -46.6333 },
    { slug: 'rio-de-janeiro', label: 'Río de Janeiro', lat: -22.9068, lng: -43.1729 },
  ] },
  { slug: 'paraguay', label: 'Paraguay', bandera: '🇵🇾', ciudades: [
    { slug: 'asuncion', label: 'Asunción', lat: -25.2637, lng: -57.5759 },
    { slug: 'ciudad-del-este', label: 'Ciudad del Este', lat: -25.5095, lng: -54.6111 },
  ] },
  { slug: 'uruguay', label: 'Uruguay', bandera: '🇺🇾', ciudades: [
    { slug: 'montevideo', label: 'Montevideo', lat: -34.9011, lng: -56.1645 },
    { slug: 'punta-del-este', label: 'Punta del Este', lat: -34.9608, lng: -54.9515 },
  ] },
  { slug: 'argentina', label: 'Argentina', bandera: '🇦🇷', ciudades: [
    { slug: 'buenos-aires', label: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
    { slug: 'cordoba', label: 'Córdoba', lat: -31.4201, lng: -64.1888 },
    { slug: 'mendoza', label: 'Mendoza', lat: -32.8895, lng: -68.8458 },
  ] },
  { slug: 'chile', label: 'Chile', bandera: '🇨🇱', ciudades: [
    { slug: 'santiago', label: 'Santiago', lat: -33.4489, lng: -70.6693 },
    { slug: 'valparaiso', label: 'Valparaíso', lat: -33.0472, lng: -71.6127 },
  ] },
];

export const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
// El horario que el original traía por defecto: la semana comercial de la
// región, con el domingo cerrado. Se rellena así para que nadie tenga que
// teclear catorce horas antes de poder registrarse.
const HORARIO_BASE = {
  lun: { abre: '08:00', cierra: '18:00', cerrado: false },
  mar: { abre: '08:00', cierra: '18:00', cerrado: false },
  mie: { abre: '08:00', cierra: '18:00', cerrado: false },
  jue: { abre: '08:00', cierra: '18:00', cerrado: false },
  vie: { abre: '08:00', cierra: '21:00', cerrado: false },
  sab: { abre: '09:00', cierra: '21:00', cerrado: false },
  dom: { abre: '00:00', cierra: '00:00', cerrado: true },
};

export const LLAVE = 'og.negocio';
// La descripción se corta a 400 caracteres: SecureStore avisa (y en Android
// puede fallar) cuando un valor pasa de unos 2 KB, y la ficha entera tiene
// que caber ahí. 400 alcanzan de sobra para contar a qué se dedica el
// negocio, y así el registro nunca se pierde por largo.
const TOPE_DESC = 400;

export async function leerFicha() {
  try {
    const crudo = await SecureStore.getItemAsync(LLAVE);
    return crudo ? JSON.parse(crudo) : null;
  } catch (e) { return null; }
}
async function guardarFicha(ficha) {
  await SecureStore.setItemAsync(LLAVE, JSON.stringify(ficha));
}

const CARPETA = `${FileSystem.documentDirectory}negocio/`;
// La ruta que devuelve el selector de imágenes es temporal: el sistema la
// borra y el logo desaparecía al reabrir la app. Se copia dentro de la app,
// igual que hace `passportFile.js` con la foto del pasaporte. Se guarda la
// RUTA y no la imagen en base64 porque un base64 no cabe en SecureStore.
async function copiarImagen(uri) {
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(CARPETA);
    if (!info.exists) await FileSystem.makeDirectoryAsync(CARPETA, { intermediates: true });
    const destino = `${CARPETA}neg_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: destino });
    return destino;
  } catch (e) {
    return uri;  // si la copia falla, al menos que se vea en esta sesión
  }
}

const FICHA_VACIA = () => ({
  nombreLegal: '', nombreComercial: '', rtn: '',
  pais: '', ciudad: '', direccion: '', lat: null, lng: null,
  rubro: '', productos: [],
  descripcion: '', logo: null, portada: null,
  redes: { web: '', instagram: '', facebook: '', whatsapp: '' },
  horario: HORARIO_BASE,
  creada: null, actualizada: null,
});

const paisDe = (slug) => PAISES.find((p) => p.slug === slug) || null;
const ciudadDe = (paisSlug, ciudadSlug) =>
  (paisDe(paisSlug)?.ciudades || []).find((c) => c.slug === ciudadSlug) || null;

// ── piezas del formulario ──────────────────────────────────────────────
// Son locales a propósito: solo esta pantalla las usa, y meterlas en `ui.js`
// obligaría a tocar un fichero compartido que no es de este encargo.

function Rotulo({ children }) {
  return <Text style={st.rotulo}>{children}</Text>;
}

// El SelectField del original: un campo que abre una lista a pantalla
// completa. Con quince rubros y diecinueve países, un desplegable nativo se
// queda corto y una rueda de iOS no existe en Android.
function Selector({ label, valor, texto, opciones, onElegir, deshabilitado, aviso }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <View style={{ marginBottom: 15 }}>
      <Rotulo>{label}</Rotulo>
      <Pressable
        onPress={() => { if (deshabilitado) return; hap(); setAbierto(true); }}
        accessibilityRole="button" accessibilityLabel={label}
        style={[st.select, deshabilitado && { opacity: 0.45 }]}>
        <Text style={[st.selectTxt, !valor && { color: C.txt3 }]} numberOfLines={1}>
          {valor ? texto : (deshabilitado ? aviso : texto)}
        </Text>
        <Icon name="chevron-down" size={16} color={C.gold} />
      </Pressable>
      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={st.velo} onPress={() => setAbierto(false)}>
          <View style={st.hoja}>
            <Text style={st.hojaTit}>{label}</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {opciones.map((o) => (
                <Pressable key={o.valor} style={st.opcion}
                  onPress={() => { hap(); onElegir(o.valor); setAbierto(false); }}>
                  <Text style={[st.opcionTxt, o.valor === valor && { color: C.goldLt, fontWeight: '700' }]}>
                    {o.texto}
                  </Text>
                  {o.valor === valor ? <Icon name="checkmark" size={16} color={C.gold} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// El TagInput: productos y servicios como etiquetas sueltas. Se escribe y se
// añade con el + o con la tecla de enviar del teclado.
function Etiquetas({ label, ph, valores, onCambiar }) {
  const [texto, setTexto] = useState('');
  const anadir = () => {
    const v = texto.trim();
    if (!v || valores.includes(v)) { setTexto(''); return; }
    hap(); onCambiar([...valores, v]); setTexto('');
  };
  return (
    <View style={{ marginBottom: 15 }}>
      <Rotulo>{label}</Rotulo>
      <View style={st.tagFila}>
        <TextInput value={texto} onChangeText={setTexto} placeholder={ph} placeholderTextColor={C.txt3}
          style={st.tagInput} onSubmitEditing={anadir} returnKeyType="done" />
        <Pressable onPress={anadir} style={st.tagMas} accessibilityRole="button" accessibilityLabel="+">
          <Icon name="add" size={18} color={C.darkText} />
        </Pressable>
      </View>
      {valores.length > 0 ? (
        <View style={st.tags}>
          {valores.map((v) => (
            <Pressable key={v} style={st.tag} onPress={() => { hap(); onCambiar(valores.filter((x) => x !== v)); }}>
              <Text style={st.tagTxt}>{v}</Text>
              <Icon name="close" size={12} color={C.txt3} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// El ImagePickerField: borde punteado mientras está vacío —el gesto de
// "suelta algo aquí"— y la miniatura en cuanto hay imagen.
function CampoFoto({ label, valor, onCambiar, redondo, t, toast }) {
  const elegir = async () => {
    hap();
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.6, allowsEditing: true,
      aspect: redondo ? [1, 1] : [16, 9],
    }).catch(() => null);
    const a = r?.assets?.[0];
    if (!a || r?.canceled) return;
    const ruta = await copiarImagen(a.uri);
    if (ruta) onCambiar(ruta); else toast(t.noFoto, 'error');
  };
  return (
    <View style={{ flex: 1 }}>
      <Rotulo>{label}</Rotulo>
      <Pressable onPress={elegir} style={st.foto} accessibilityRole="button" accessibilityLabel={label}>
        <View style={[st.fotoThumb, redondo && { borderRadius: 26 }]}>
          {valor ? <Image source={{ uri: valor }} style={st.fotoImg} resizeMode="cover" />
            : <Icon name="cloud-upload" size={17} color={C.txt3} />}
        </View>
        <Text style={st.fotoTxt} numberOfLines={2}>{valor ? t.cambiar : t.subir}</Text>
      </Pressable>
    </View>
  );
}

// El HoursEditor, tal cual: siete filas, dos horas y un "cerrado".
function Horario({ horario, onCambiar, t }) {
  const tocar = (dia, parche) => onCambiar({ ...horario, [dia]: { ...horario[dia], ...parche } });
  return (
    <View style={{ marginBottom: 15 }}>
      <Rotulo>{t.horario}</Rotulo>
      <View style={st.horario}>
        {DIAS.map((dia, i) => {
          const d = horario[dia];
          return (
            <View key={dia} style={st.horaFila}>
              <Text style={st.horaDia}>{t.dias[i]}</Text>
              <TextInput value={d.abre} editable={!d.cerrado} onChangeText={(v) => tocar(dia, { abre: v })}
                placeholder="08:00" placeholderTextColor={C.txt3}
                style={[st.horaInput, d.cerrado && { opacity: 0.35 }]} maxLength={5} />
              <TextInput value={d.cierra} editable={!d.cerrado} onChangeText={(v) => tocar(dia, { cierra: v })}
                placeholder="18:00" placeholderTextColor={C.txt3}
                style={[st.horaInput, d.cerrado && { opacity: 0.35 }]} maxLength={5} />
              <Pressable onPress={() => { hap(); tocar(dia, { cerrado: !d.cerrado }); }} style={st.horaCerrado}>
                <View style={[st.casilla, d.cerrado && st.casillaOn]}>
                  {d.cerrado ? <Icon name="checkmark" size={10} color={C.darkText} /> : null}
                </View>
                <Text style={st.horaCerradoTxt}>{t.cerrado}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FilaResumen({ k, v }) {
  return (
    <View style={st.resFila}>
      <Text style={st.resK}>{k}</Text>
      <Text style={st.resV}>{v}</Text>
    </View>
  );
}

// Entrada suave al cambiar de paso: la misma cascada de opacidad + subida que
// usa el panel, para que el formulario no salte de golpe.
function Entrada({ llave, children }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    op.setValue(0); y.setValue(12);
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, speed: 13, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [llave, op, y]);
  return <Animated.View style={{ opacity: op, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

// ── la pantalla ────────────────────────────────────────────────────────
export default function MiNegocio({ nav }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.es;
  const { account } = useAccount();
  const toast = useToast();

  // undefined ⇒ todavía no se ha leído el teléfono (esqueleto);
  // null ⇒ leído y no hay negocio (alta); objeto ⇒ hay ficha (edición).
  const [ficha, setFicha] = useState(undefined);
  const [form, setForm] = useState(FICHA_VACIA);
  const [paso, setPaso] = useState(0);
  const [declara, setDeclara] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerFicha().then((f) => {
      if (!vivo) return;
      setFicha(f);
      if (f) setForm({ ...FICHA_VACIA(), ...f, redes: { ...FICHA_VACIA().redes, ...(f.redes || {}) }, horario: { ...HORARIO_BASE, ...(f.horario || {}) } });
    });
    return () => { vivo = false; };
  }, []);

  const tocar = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const tocarRed = (k, v) => setForm((f) => ({ ...f, redes: { ...f.redes, [k]: v } }));

  const ciudades = useMemo(() => paisDe(form.pais)?.ciudades || [], [form.pais]);
  const rubroTxt = (slug) => { const r = RUBROS.find((x) => x.slug === slug); return r ? `${r.ico}  ${r[lang] || r.es}` : ''; };

  // La verificación del comercio NO es un campo que se guarde: se lee de la
  // cuenta cada vez. Guardarla haría que una ficha vieja siguiera diciendo
  // "verificado" después de que Genesis retirara la aprobación.
  const verificado = !!account?.genesisUid;

  const guardar = async (esAlta) => {
    setGuardando(true);
    try {
      const ahora = new Date().toISOString();
      const rec = { ...form, creada: form.creada || ahora, actualizada: ahora };
      await guardarFicha(rec);
      setFicha(rec); setForm(rec);
      hap(); toast(esAlta ? t.creado : t.guardado);
      if (esAlta) setPaso(0);
    } catch (e) {
      toast(t.noGuardo, 'error');
    } finally {
      setGuardando(false);
    }
  };

  // ════ leyendo el teléfono ═══════════════════════════════════════════
  if (ficha === undefined) {
    return (
      <View style={st.screen}>
        <Header title={t.titulo} onBack={nav.back} />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Skeleton width="100%" height={92} radius={20} />
          <Skeleton width="100%" height={52} radius={14} />
          <Skeleton width="100%" height={52} radius={14} />
          <Text style={st.nota}>{t.leyendo}</Text>
        </View>
      </View>
    );
  }

  // ── bloques que comparten el alta y la ficha ───────────────────────
  const bloqueDatos = (
    <>
      <Field label={t.nombreLegal} value={form.nombreLegal} onChangeText={(v) => tocar('nombreLegal', v)}
        placeholder={t.nombreLegalPh} />
      <Field label={t.nombreCom} value={form.nombreComercial} onChangeText={(v) => tocar('nombreComercial', v)}
        placeholder={t.nombreComPh} />
      <Field label={t.rtn} value={form.rtn} onChangeText={(v) => tocar('rtn', v)} placeholder={t.rtnPh} />
    </>
  );

  const bloqueUbicacion = (
    <>
      <Selector
        label={t.pais} valor={form.pais}
        texto={form.pais ? `${paisDe(form.pais)?.bandera || ''} ${paisDe(form.pais)?.label || ''}` : t.elige}
        opciones={PAISES.map((p) => ({ valor: p.slug, texto: `${p.bandera}  ${p.label}` }))}
        onElegir={(v) => setForm((f) => ({ ...f, pais: v, ciudad: '', lat: null, lng: null }))}
      />
      <Selector
        label={t.ciudad} valor={form.ciudad} deshabilitado={!form.pais} aviso={t.primeroPais}
        texto={form.ciudad ? (ciudadDe(form.pais, form.ciudad)?.label || '') : t.elige}
        opciones={ciudades.map((c) => ({ valor: c.slug, texto: c.label }))}
        onElegir={(v) => {
          // La ciudad arrastra sus coordenadas: la ficha queda ubicable el día
          // que haya mapa, sin volver a preguntar nada.
          const c = ciudadDe(form.pais, v);
          setForm((f) => ({ ...f, ciudad: v, lat: c?.lat ?? null, lng: c?.lng ?? null }));
        }}
      />
      <Field label={t.direccion} value={form.direccion} onChangeText={(v) => tocar('direccion', v)}
        placeholder={t.direccionPh} />
      <Text style={st.nota}>{t.sinMapa}</Text>
    </>
  );

  const bloqueRubro = (
    <>
      <Rotulo>{t.rubro}</Rotulo>
      <View style={st.rejilla}>
        {RUBROS.map((r) => {
          const activo = form.rubro === r.slug;
          return (
            <Pressable key={r.slug} onPress={() => { hap(); tocar('rubro', r.slug); }}
              accessibilityRole="button" accessibilityLabel={r[lang] || r.es}
              style={[st.rubro, activo && st.rubroOn]}>
              <Text style={st.rubroIco}>{r.ico}</Text>
              <Text style={[st.rubroTxt, activo && { color: C.goldLt }]} numberOfLines={2}>{r[lang] || r.es}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: 18 }} />
      <Etiquetas label={t.productos} ph={t.productosPh} valores={form.productos}
        onCambiar={(v) => tocar('productos', v)} />
    </>
  );

  const bloquePerfil = (
    <>
      <View style={st.dos}>
        <CampoFoto label={t.logo} valor={form.logo} onCambiar={(v) => tocar('logo', v)} redondo t={t} toast={toast} />
        <CampoFoto label={t.portada} valor={form.portada} onCambiar={(v) => tocar('portada', v)} t={t} toast={toast} />
      </View>
      <View style={{ height: 15 }} />
      <Field label={t.descripcion} value={form.descripcion} onChangeText={(v) => tocar('descripcion', v)}
        placeholder={t.descripcionPh} multiline maxLength={TOPE_DESC}
        style={{ minHeight: 92, textAlignVertical: 'top', backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: C.txt, fontSize: 15 }} />
      <Field label={t.web} value={form.redes.web} onChangeText={(v) => tocarRed('web', v)}
        placeholder="https://" autoCapitalize="none" keyboardType="url" />
      <Field label={t.instagram} value={form.redes.instagram} onChangeText={(v) => tocarRed('instagram', v)}
        placeholder="https://instagram.com/tunegocio" autoCapitalize="none" />
      <Field label={t.facebook} value={form.redes.facebook} onChangeText={(v) => tocarRed('facebook', v)}
        placeholder="https://facebook.com/tunegocio" autoCapitalize="none" />
      <Field label={t.whatsapp} value={form.redes.whatsapp} onChangeText={(v) => tocarRed('whatsapp', v)}
        placeholder="+504 9999-0000" keyboardType="phone-pad" />
      <Horario horario={form.horario} onCambiar={(h) => tocar('horario', h)} t={t} />
    </>
  );

  const bloqueVerificacion = (
    <>
      <View style={st.aviso}>
        <Icon name="shield-checkmark" size={19} color={C.gold} />
        <View style={{ flex: 1 }}>
          <Text style={st.avisoTit}>{t.verifTit}</Text>
          <Text style={st.avisoTxt}>{t.verifTxt}</Text>
        </View>
      </View>
      {verificado ? (
        <View style={st.gidOk}>
          <Icon name="checkmark-circle" size={17} color={C.up} />
          <View style={{ flex: 1 }}>
            <Text style={st.gidOkTxt}>{t.verifOk}</Text>
            <Text style={st.gidUid}>{account.genesisUid}</Text>
          </View>
        </View>
      ) : (
        <View style={st.gidNo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Icon name="time" size={15} color="#FBBF24" />
            <Text style={st.gidNoTit}>{t.verifNo}</Text>
          </View>
          <Text style={st.gidNoTxt}>{t.verifNoTxt}</Text>
          <Pressable onPress={() => { hap(); nav.go('kyc'); }}>
            <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.gidBtn}>
              <Text style={st.gidBtnTxt}>{t.verifBtn}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
      <Pressable style={st.declara} onPress={() => { hap(); setDeclara((d) => !d); }}>
        <View style={[st.casilla, declara && st.casillaOn]}>
          {declara ? <Icon name="checkmark" size={10} color={C.darkText} /> : null}
        </View>
        <Text style={st.declaraTxt}>{t.declara}</Text>
      </Pressable>
    </>
  );

  const bloqueRevision = (
    <>
      <View style={st.resCab}>
        <View style={st.resLogo}>
          {form.logo ? <Image source={{ uri: form.logo }} style={st.resLogoImg} />
            : <Icon name="storefront" size={22} color={C.gold} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.resNombre} numberOfLines={1}>{form.nombreComercial || t.tuNegocio}</Text>
          <Text style={st.resRubro}>{rubroTxt(form.rubro) || t.vacio}</Text>
        </View>
      </View>
      <Text style={st.grupo}>{t.revision}</Text>
      <FilaResumen k={t.nombreLegal} v={form.nombreLegal || t.vacio} />
      <FilaResumen k={t.rtn} v={form.rtn || t.vacio} />
      <FilaResumen k={t.rUbicacion} v={
        [form.direccion, ciudadDe(form.pais, form.ciudad)?.label, paisDe(form.pais)?.label]
          .filter(Boolean).join(', ') || t.vacio} />
      <FilaResumen k={t.rProductos} v={form.productos.join(' · ') || t.vacio} />
      <FilaResumen k={t.rIdentidad} v={verificado ? `${t.verifOk} · ${account.genesisUid}` : t.verifNo} />
      <Text style={st.nota}>{t.notaGuardar}</Text>
    </>
  );

  // ════ ALTA: el asistente de seis pasos ══════════════════════════════
  if (!ficha) {
    const puede = [
      !!(form.nombreLegal.trim() && form.nombreComercial.trim() && form.rtn.trim()),
      !!(form.pais && form.ciudad && form.direccion.trim()),
      !!form.rubro,
      form.descripcion.trim().length > 10,
      declara,
      true,
    ];
    const ultimo = paso === t.pasos.length - 1;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.screen}>
        <Header title={t.titulo} sub={t.subAlta} onBack={() => (paso === 0 ? nav.back() : setPaso((p) => p - 1))} />
        {/* el paso a paso: una barrita por tramo, las hechas en oro */}
        <View style={st.pasos}>
          {t.pasos.map((_, i) => (
            <View key={i} style={[st.pasoBarra, i <= paso && st.pasoBarraOn]} />
          ))}
        </View>
        <Text style={st.pasoTxt}>{t.pasos[paso]}</Text>
        <ScrollView contentContainerStyle={st.dentro} keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Entrada llave={paso}>
            {paso === 0 ? bloqueDatos : null}
            {paso === 1 ? bloqueUbicacion : null}
            {paso === 2 ? bloqueRubro : null}
            {paso === 3 ? bloquePerfil : null}
            {paso === 4 ? bloqueVerificacion : null}
            {paso === 5 ? bloqueRevision : null}
          </Entrada>
        </ScrollView>
        <View style={st.pie}>
          <Button3D
            title={guardando ? t.guardando : (ultimo ? t.guardarAlta : t.seguir)}
            icon={ultimo ? 'storefront' : 'arrow-forward'}
            disabled={!puede[paso] || guardando}
            onPress={() => { if (ultimo) guardar(true); else setPaso((p) => p + 1); }}
          />
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ════ FICHA: lo mismo, ya sin pasos, todo editable ══════════════════
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.screen}>
      <Header title={t.titulo} sub={t.subFicha} onBack={nav.back} />
      <ScrollView contentContainerStyle={st.dentro} keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* la portada con el logo encima: la tarjeta de comercio del original,
            que era su gesto más reconocible, en verde y oro */}
        <View style={st.hero}>
          {form.portada
            ? <Image source={{ uri: form.portada }} style={st.heroFondo} resizeMode="cover" />
            : <LinearGradient colors={G.greenCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.heroFondo} />}
          <View style={st.heroVelo} />
          <View style={st.heroFila}>
            <View style={st.heroLogo}>
              {form.logo ? <Image source={{ uri: form.logo }} style={st.heroLogoImg} />
                : <Icon name="storefront" size={20} color={C.gold} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.heroNombre} numberOfLines={1}>{form.nombreComercial || t.tuNegocio}</Text>
              <View style={verificado ? st.badgeOk : st.badgePend}>
                <Icon name={verificado ? 'shield-checkmark' : 'time'} size={11} color={verificado ? C.up : '#FBBF24'} />
                <Text style={verificado ? st.badgeOkTxt : st.badgePendTxt}>
                  {verificado ? t.verificado : t.sinVerificar}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Pressable onPress={() => { hap(); nav.go('pay-panel'); }} style={st.verPanel}
          accessibilityRole="button" accessibilityLabel={t.verPanel}>
          <View style={st.verPanelIc}><Icon name="trending-up" size={17} color={C.gold} /></View>
          <Text style={st.verPanelTxt}>{t.verPanel}</Text>
          <Icon name="chevron-forward" size={15} color={C.txt3} />
        </Pressable>

        {ficha.creada ? (
          <Text style={st.desde}>
            {t.desde} {new Date(ficha.creada).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-HN',
              { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        ) : null}

        <Text style={[st.grupo, { marginTop: 20, marginBottom: 12 }]}>{t.editar}</Text>
        {bloqueDatos}
        {bloqueUbicacion}
        <View style={{ height: 18 }} />
        {bloqueRubro}
        {bloquePerfil}

        <View style={st.gidPie}>
          {verificado ? (
            <View style={st.gidOk}>
              <Icon name="checkmark-circle" size={17} color={C.up} />
              <View style={{ flex: 1 }}>
                <Text style={st.gidOkTxt}>{t.verifOk}</Text>
                <Text style={st.gidUid}>{account.genesisUid}</Text>
              </View>
            </View>
          ) : (
            <View style={st.gidNo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Icon name="time" size={15} color="#FBBF24" />
                <Text style={st.gidNoTit}>{t.verifNo}</Text>
              </View>
              <Text style={st.gidNoTxt}>{t.verifNoTxt}</Text>
              <Pressable onPress={() => { hap(); nav.go('kyc'); }}>
                <LinearGradient colors={G.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.gidBtn}>
                  <Text style={st.gidBtnTxt}>{t.verifBtn}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </View>

        <Button3D title={guardando ? t.guardando : t.guardar} icon="checkmark"
          disabled={guardando} onPress={() => guardar(false)} style={{ marginTop: 18 }} />
        <Text style={st.nota}>{t.notaGuardar}</Text>
        {guardando ? <ActivityIndicator color={C.gold} style={{ marginTop: 12 }} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, paddingTop: 6 },
  dentro: { paddingHorizontal: 20, paddingBottom: 120 },
  nota: { color: C.txt3, fontSize: 12, lineHeight: 18, marginTop: 10, marginBottom: 6 },
  grupo: { color: C.txt3, fontSize: 10, fontWeight: '700', letterSpacing: 2.6 },
  rotulo: { fontSize: 12, color: C.txt2, marginBottom: 7, fontWeight: '500' },

  // el paso a paso
  pasos: { flexDirection: 'row', gap: 6, paddingHorizontal: 22 },
  pasoBarra: { flex: 1, height: 4, borderRadius: 999, backgroundColor: 'rgba(201,169,97,0.16)' },
  pasoBarraOn: { backgroundColor: C.gold },
  pasoTxt: { color: C.goldLt, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: 22, marginTop: 10, marginBottom: 4 },
  pie: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.line2 },

  // selector
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14 },
  selectTxt: { flex: 1, color: C.txt, fontSize: 15 },
  velo: { flex: 1, backgroundColor: 'rgba(1,10,11,0.88)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: '#0A3436', borderTopWidth: 1, borderColor: C.line2, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  hojaTit: { color: C.goldLt, fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  opcion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.10)' },
  opcionTxt: { color: C.txt, fontSize: 15, flexShrink: 1 },

  // etiquetas
  tagFila: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  tagInput: { flex: 1, backgroundColor: C.input, borderWidth: 1.5, borderColor: 'rgba(46,116,119,0.5)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, color: C.txt, fontSize: 15 },
  tagMas: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  tagTxt: { color: C.txt, fontSize: 12.5 },

  // fotos
  dos: { flexDirection: 'row', gap: 12 },
  foto: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: 14, padding: 10 },
  fotoThumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fotoImg: { width: '100%', height: '100%' },
  fotoTxt: { flex: 1, color: C.txt3, fontSize: 11.5 },

  // rubros
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rubro: { width: '31.5%', borderWidth: 1, borderColor: C.line2, borderRadius: 14, padding: 10, gap: 6, backgroundColor: C.panel },
  rubroOn: { borderColor: C.gold, backgroundColor: 'rgba(201,169,97,0.12)' },
  rubroIco: { fontSize: 19 },
  rubroTxt: { color: C.txt2, fontSize: 10.5, lineHeight: 14, fontWeight: '600' },

  // horario
  horario: { borderWidth: 1, borderColor: C.line2, borderRadius: 14, padding: 11, gap: 9 },
  horaFila: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  horaDia: { width: 30, color: C.txt2, fontSize: 11, fontWeight: '700' },
  horaInput: { flex: 1, borderWidth: 1, borderColor: C.inputBr, backgroundColor: C.input, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 7, color: C.txt, fontSize: 12.5, textAlign: 'center' },
  horaCerrado: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  horaCerradoTxt: { color: C.txt3, fontSize: 10.5 },
  casilla: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  casillaOn: { backgroundColor: C.gold, borderColor: C.gold },

  // verificación
  aviso: { flexDirection: 'row', gap: 11, borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(201,169,97,0.08)', borderRadius: 16, padding: 15 },
  avisoTit: { color: C.goldLt, fontSize: 14, fontWeight: '700', marginBottom: 5 },
  avisoTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 18 },
  gidOk: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(62,217,160,0.10)', borderWidth: 1, borderColor: 'rgba(62,217,160,0.3)', borderRadius: 16, padding: 14, marginTop: 14 },
  gidOkTxt: { color: C.up, fontSize: 13, fontWeight: '700' },
  gidUid: { color: C.txt2, fontSize: 11.5, marginTop: 2, letterSpacing: 0.5 },
  gidNo: { backgroundColor: 'rgba(251,191,36,0.08)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.32)', borderRadius: 16, padding: 14, marginTop: 14, gap: 9 },
  gidNoTit: { color: '#FBBF24', fontSize: 13, fontWeight: '700' },
  gidNoTxt: { color: C.txt2, fontSize: 12.5, lineHeight: 18 },
  gidBtn: { borderRadius: 13, paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  gidBtnTxt: { color: C.darkText, fontWeight: '800', fontSize: 11.5, letterSpacing: 1.4 },
  gidPie: { marginTop: 6 },
  declara: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginTop: 18 },
  declaraTxt: { flex: 1, color: C.txt2, fontSize: 12.5, lineHeight: 18 },

  // revisión
  resCab: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 20 },
  resLogo: { width: 54, height: 54, borderRadius: 16, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  resLogoImg: { width: '100%', height: '100%' },
  resNombre: { color: C.txt, fontSize: 17, fontWeight: '800' },
  resRubro: { color: C.txt2, fontSize: 12.5, marginTop: 3 },
  resFila: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(201,169,97,0.10)' },
  resK: { color: C.txt3, fontSize: 11 },
  resV: { color: C.txt, fontSize: 13.5, marginTop: 3 },

  // ficha
  hero: { height: 128, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.line, justifyContent: 'flex-end' },
  heroFondo: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroVelo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(1,12,13,0.52)' },
  heroFila: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16 },
  heroLogo: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroLogoImg: { width: '100%', height: '100%' },
  heroNombre: { color: '#fff', fontSize: 17, fontWeight: '800' },
  badgeOk: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(62,217,160,0.15)', borderWidth: 1, borderColor: 'rgba(62,217,160,0.32)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 5 },
  badgeOkTxt: { color: C.up, fontSize: 10, fontWeight: '700' },
  badgePend: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(251,191,36,0.14)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 5 },
  badgePendTxt: { color: '#FBBF24', fontSize: 10, fontWeight: '700' },
  verPanel: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line2, borderRadius: 16, padding: 13, marginTop: 12 },
  verPanelIc: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(201,169,97,0.12)', alignItems: 'center', justifyContent: 'center' },
  verPanelTxt: { flex: 1, color: C.txt, fontSize: 13.5, fontWeight: '600' },
  desde: { color: C.txt3, fontSize: 11.5, marginTop: 10, textAlign: 'center' },
});
