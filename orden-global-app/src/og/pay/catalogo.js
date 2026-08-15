// ═══ EL CATÁLOGO DE MYTOKENPAY: países, ciudades y rubros — UNA sola vez ══
//
// Antes había dos catálogos con el mismo nombre y forma distinta: MiNegocio
// tenía un PAISES array de 18 países con ciudades y 15 RUBROS, y
// comerciosDemo un PAISES objeto de 6 y 13 CATS casi iguales pero no iguales
// ('supermercados' y 'servicios' se podían elegir en el alta y no existían
// como categoría del directorio). Dos copias del mismo dato acaban diciendo
// cosas distintas del mismo comercio, así que ahora TODO deriva de aquí:
//   · MiNegocio re-exporta RUBROS/PAISES/DIAS tal cual (el alta no cambió);
//   · comerciosDemo construye sus CATS/PAISES/CIUDADES de estas listas, así
//     toda categoría del alta existe también en el directorio.
//
// Los rubros llevan su emoji porque el set de iconos de la casa es SVG corto
// a propósito y no tiene quince dibujos de rubro; el emoji del selector del
// alta se lee igual de rápido y no depende de ninguna fuente.

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

// Los países y ciudades donde el ecosistema opera o va a operar, con sus
// coordenadas: son las plazas del directorio. No se usa paises.js (los 249
// códigos ISO del KYC) porque aquel no trae ciudades, y una ficha de comercio
// sin ciudad no sirve para que la encuentren.
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

// El orden de la semana comercial; las claves del horario guardado.
export const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
