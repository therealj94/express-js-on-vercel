import type { Category, Company, CompanySocials, Country, KycStatus, Reward, WeekHours } from './types'

export const MOCK_CATEGORIES: Category[] = [
  { slug: 'restaurantes', label: 'Restaurantes', icon: 'UtensilsCrossed' },
  { slug: 'cafeterias', label: 'Cafeterías', icon: 'Coffee' },
  { slug: 'hoteles', label: 'Hoteles y hospedaje', icon: 'BedDouble' },
  { slug: 'gimnasios', label: 'Gimnasios y fitness', icon: 'Dumbbell' },
  { slug: 'belleza', label: 'Belleza y spa', icon: 'Sparkles' },
  { slug: 'vida-nocturna', label: 'Vida nocturna', icon: 'Martini' },
  { slug: 'conveniencia', label: 'Tiendas de conveniencia', icon: 'ShoppingBag' },
  { slug: 'supermercados', label: 'Supermercados', icon: 'ShoppingCart' },
  { slug: 'moda', label: 'Moda y accesorios', icon: 'Shirt' },
  { slug: 'tecnologia', label: 'Electrónica y tecnología', icon: 'Smartphone' },
  { slug: 'salud', label: 'Salud y bienestar', icon: 'HeartPulse' },
  { slug: 'educacion', label: 'Educación', icon: 'GraduationCap' },
  { slug: 'automotriz', label: 'Automotriz', icon: 'Car' },
  { slug: 'turismo', label: 'Turismo y experiencias', icon: 'Palmtree' },
  { slug: 'servicios', label: 'Servicios profesionales', icon: 'Briefcase' },
]

export const MOCK_COUNTRIES: Country[] = [
  {
    slug: 'honduras', label: 'Honduras', flag: '🇭🇳', lat: 14.8, lng: -86.6, zoom: 7,
    cities: [
      { slug: 'tegucigalpa', label: 'Tegucigalpa', lat: 14.0723, lng: -87.1921 },
      { slug: 'san-pedro-sula', label: 'San Pedro Sula', lat: 15.5049, lng: -88.0253 },
      { slug: 'la-ceiba', label: 'La Ceiba', lat: 15.7597, lng: -86.7822 },
      { slug: 'roatan', label: 'Roatán', lat: 16.325, lng: -86.5335 },
    ],
  },
  {
    slug: 'guatemala', label: 'Guatemala', flag: '🇬🇹', lat: 15.6, lng: -90.3, zoom: 7,
    cities: [
      { slug: 'ciudad-de-guatemala', label: 'Ciudad de Guatemala', lat: 14.6349, lng: -90.5069 },
      { slug: 'antigua', label: 'Antigua Guatemala', lat: 14.5586, lng: -90.7295 },
      { slug: 'quetzaltenango', label: 'Quetzaltenango', lat: 14.8508, lng: -91.5186 },
    ],
  },
  {
    slug: 'el-salvador', label: 'El Salvador', flag: '🇸🇻', lat: 13.8, lng: -88.9, zoom: 8,
    cities: [
      { slug: 'san-salvador', label: 'San Salvador', lat: 13.6929, lng: -89.2182 },
      { slug: 'santa-ana', label: 'Santa Ana', lat: 13.994, lng: -89.5597 },
      { slug: 'la-libertad', label: 'La Libertad', lat: 13.4883, lng: -89.3223 },
    ],
  },
  {
    slug: 'nicaragua', label: 'Nicaragua', flag: '🇳🇮', lat: 12.8, lng: -85.6, zoom: 7,
    cities: [
      { slug: 'managua', label: 'Managua', lat: 12.1364, lng: -86.2514 },
      { slug: 'granada', label: 'Granada', lat: 11.9344, lng: -85.956 },
      { slug: 'leon', label: 'León', lat: 12.434, lng: -86.878 },
    ],
  },
  {
    slug: 'costa-rica', label: 'Costa Rica', flag: '🇨🇷', lat: 9.7, lng: -84.0, zoom: 8,
    cities: [
      { slug: 'san-jose', label: 'San José', lat: 9.9281, lng: -84.0907 },
      { slug: 'tamarindo', label: 'Tamarindo', lat: 10.2996, lng: -85.8372 },
      { slug: 'liberia', label: 'Liberia', lat: 10.6346, lng: -85.4406 },
    ],
  },
  {
    slug: 'panama', label: 'Panamá', flag: '🇵🇦', lat: 8.9, lng: -79.6, zoom: 8,
    cities: [
      { slug: 'ciudad-de-panama', label: 'Ciudad de Panamá', lat: 8.9824, lng: -79.5199 },
      { slug: 'bocas-del-toro', label: 'Bocas del Toro', lat: 9.34, lng: -82.24 },
    ],
  },
  {
    slug: 'mexico', label: 'México', flag: '🇲🇽', lat: 23.6345, lng: -102.5528, zoom: 5,
    cities: [
      { slug: 'ciudad-de-mexico', label: 'Ciudad de México', lat: 19.4326, lng: -99.1332 },
      { slug: 'guadalajara', label: 'Guadalajara', lat: 20.6597, lng: -103.3496 },
      { slug: 'cancun', label: 'Cancún', lat: 21.1619, lng: -86.8515 },
    ],
  },
  {
    slug: 'cuba', label: 'Cuba', flag: '🇨🇺', lat: 21.5218, lng: -77.7812, zoom: 7,
    cities: [
      { slug: 'la-habana', label: 'La Habana', lat: 23.1136, lng: -82.3666 },
      { slug: 'santiago-de-cuba', label: 'Santiago de Cuba', lat: 20.0247, lng: -75.8219 },
    ],
  },
  {
    slug: 'republica-dominicana', label: 'República Dominicana', flag: '🇩🇴', lat: 18.7357, lng: -70.1627, zoom: 8,
    cities: [
      { slug: 'santo-domingo', label: 'Santo Domingo', lat: 18.4861, lng: -69.9312 },
      { slug: 'punta-cana', label: 'Punta Cana', lat: 18.5601, lng: -68.3725 },
    ],
  },
  {
    slug: 'venezuela', label: 'Venezuela', flag: '🇻🇪', lat: 6.4238, lng: -66.5897, zoom: 6,
    cities: [
      { slug: 'caracas', label: 'Caracas', lat: 10.4806, lng: -66.9036 },
      { slug: 'maracaibo', label: 'Maracaibo', lat: 10.6427, lng: -71.6125 },
    ],
  },
  {
    slug: 'colombia', label: 'Colombia', flag: '🇨🇴', lat: 4.5709, lng: -74.2973, zoom: 6,
    cities: [
      { slug: 'bogota', label: 'Bogotá', lat: 4.711, lng: -74.0721 },
      { slug: 'medellin', label: 'Medellín', lat: 6.2442, lng: -75.5812 },
      { slug: 'cartagena', label: 'Cartagena', lat: 10.391, lng: -75.4794 },
    ],
  },
  {
    slug: 'ecuador', label: 'Ecuador', flag: '🇪🇨', lat: -1.8312, lng: -78.1834, zoom: 7,
    cities: [
      { slug: 'quito', label: 'Quito', lat: -0.1807, lng: -78.4678 },
      { slug: 'guayaquil', label: 'Guayaquil', lat: -2.1894, lng: -79.8891 },
    ],
  },
  {
    slug: 'peru', label: 'Perú', flag: '🇵🇪', lat: -9.19, lng: -75.0152, zoom: 6,
    cities: [
      { slug: 'lima', label: 'Lima', lat: -12.0464, lng: -77.0428 },
      { slug: 'cusco', label: 'Cusco', lat: -13.5319, lng: -71.9675 },
    ],
  },
  {
    slug: 'bolivia', label: 'Bolivia', flag: '🇧🇴', lat: -16.2902, lng: -63.5887, zoom: 6,
    cities: [
      { slug: 'la-paz', label: 'La Paz', lat: -16.5, lng: -68.15 },
      { slug: 'santa-cruz-de-la-sierra', label: 'Santa Cruz de la Sierra', lat: -17.7833, lng: -63.1821 },
    ],
  },
  {
    slug: 'brasil', label: 'Brasil', flag: '🇧🇷', lat: -14.235, lng: -51.9253, zoom: 4,
    cities: [
      { slug: 'sao-paulo', label: 'São Paulo', lat: -23.5505, lng: -46.6333 },
      { slug: 'rio-de-janeiro', label: 'Río de Janeiro', lat: -22.9068, lng: -43.1729 },
    ],
  },
  {
    slug: 'paraguay', label: 'Paraguay', flag: '🇵🇾', lat: -23.4425, lng: -58.4438, zoom: 6,
    cities: [
      { slug: 'asuncion', label: 'Asunción', lat: -25.2637, lng: -57.5759 },
      { slug: 'ciudad-del-este', label: 'Ciudad del Este', lat: -25.5095, lng: -54.6111 },
    ],
  },
  {
    slug: 'uruguay', label: 'Uruguay', flag: '🇺🇾', lat: -32.5228, lng: -55.7658, zoom: 7,
    cities: [
      { slug: 'montevideo', label: 'Montevideo', lat: -34.9011, lng: -56.1645 },
      { slug: 'punta-del-este', label: 'Punta del Este', lat: -34.9608, lng: -54.9515 },
    ],
  },
  {
    slug: 'argentina', label: 'Argentina', flag: '🇦🇷', lat: -38.4161, lng: -63.6167, zoom: 4,
    cities: [
      { slug: 'buenos-aires', label: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
      { slug: 'cordoba', label: 'Córdoba', lat: -31.4201, lng: -64.1888 },
      { slug: 'mendoza', label: 'Mendoza', lat: -32.8895, lng: -68.8458 },
    ],
  },
  {
    slug: 'chile', label: 'Chile', flag: '🇨🇱', lat: -35.6751, lng: -71.543, zoom: 4,
    cities: [
      { slug: 'santiago', label: 'Santiago', lat: -33.4489, lng: -70.6693 },
      { slug: 'valparaiso', label: 'Valparaíso', lat: -33.0472, lng: -71.6127 },
    ],
  },
]

const STANDARD_HOURS: WeekHours = {
  mon: { open: '08:00', close: '18:00', closed: false },
  tue: { open: '08:00', close: '18:00', closed: false },
  wed: { open: '08:00', close: '18:00', closed: false },
  thu: { open: '08:00', close: '18:00', closed: false },
  fri: { open: '08:00', close: '21:00', closed: false },
  sat: { open: '09:00', close: '21:00', closed: false },
  sun: { open: '00:00', close: '00:00', closed: true },
}

const HOTEL_HOURS: WeekHours = {
  mon: { open: '00:00', close: '23:59', closed: false },
  tue: { open: '00:00', close: '23:59', closed: false },
  wed: { open: '00:00', close: '23:59', closed: false },
  thu: { open: '00:00', close: '23:59', closed: false },
  fri: { open: '00:00', close: '23:59', closed: false },
  sat: { open: '00:00', close: '23:59', closed: false },
  sun: { open: '00:00', close: '23:59', closed: false },
}

const NIGHT_HOURS: WeekHours = {
  mon: { open: '00:00', close: '00:00', closed: true },
  tue: { open: '00:00', close: '00:00', closed: true },
  wed: { open: '18:00', close: '01:00', closed: false },
  thu: { open: '18:00', close: '01:00', closed: false },
  fri: { open: '18:00', close: '02:00', closed: false },
  sat: { open: '18:00', close: '02:00', closed: false },
  sun: { open: '00:00', close: '00:00', closed: true },
}

interface Seed {
  id: string
  tradeName: string
  legalName: string
  categorySlug: string
  countrySlug: string
  citySlug: string
  address: string
  lat: number
  lng: number
  description: string
  productsServices: string[]
  socials: CompanySocials
  status: KycStatus
  hours?: WeekHours
}

const SEEDS: Seed[] = [
  // Honduras
  {
    id: 'mtp-hn-1', tradeName: 'Origen Coffee Lab', legalName: 'Origen Coffee Lab S. de R.L.',
    categorySlug: 'cafeterias', countrySlug: 'honduras', citySlug: 'tegucigalpa',
    address: 'Col. Palmira, Av. República de Chile', lat: 14.0783, lng: -87.1961,
    description: 'Café de especialidad hondureño, tostado propio y ambiente para trabajar. Aceptamos ORIGEN en barra y para llevar.',
    productsServices: ['Café de especialidad', 'Repostería', 'Espacio de coworking'],
    socials: { instagram: 'https://instagram.com/origencoffeelab', website: 'https://origencoffeelab.example.com' },
    status: 'verified',
  },
  {
    id: 'mtp-hn-2', tradeName: 'Fuego Norte Parrilla', legalName: 'Fuego Norte Parrilla S.A. de C.V.',
    categorySlug: 'restaurantes', countrySlug: 'honduras', citySlug: 'san-pedro-sula',
    address: 'Blvd. Morazán, frente a Multiplaza', lat: 15.4969, lng: -88.0153,
    description: 'Carnes a la parrilla y cocina hondureña contemporánea. Facturación automática en lempiras al pagar con ORIGEN.',
    productsServices: ['Carnes a la parrilla', 'Reservaciones', 'Eventos privados'],
    socials: { instagram: 'https://instagram.com/fuegonorte', facebook: 'https://facebook.com/fuegonorte', whatsapp: '+50499001122' },
    status: 'verified',
  },
  {
    id: 'mtp-hn-3', tradeName: 'Roatán Dive & Stay', legalName: 'Roatán Dive & Stay Ltd.',
    categorySlug: 'hoteles', countrySlug: 'honduras', citySlug: 'roatan',
    address: 'West Bay Beach Road', lat: 16.329, lng: -86.5275,
    description: 'Boutique hotel frente al mar con centro de buceo propio. Liquidación en ORIGEN o USDK disponible.',
    productsServices: ['Habitaciones frente al mar', 'Buceo certificado PADI', 'Traslados'],
    socials: { website: 'https://roatandivestay.example.com', instagram: 'https://instagram.com/roatandivestay' },
    status: 'verified', hours: HOTEL_HOURS,
  },
  {
    id: 'mtp-hn-4', tradeName: 'Catracho Fit Club', legalName: 'Catracho Fit Club S. de R.L.',
    categorySlug: 'gimnasios', countrySlug: 'honduras', citySlug: 'tegucigalpa',
    address: 'Col. Lomas del Guijarro, Blvd. Suyapa', lat: 14.0862, lng: -87.1815,
    description: 'Gimnasio funcional con clases de crossfit y entrenamiento personalizado.',
    productsServices: ['Membresías mensuales', 'Crossfit', 'Entrenamiento personal'],
    socials: { instagram: 'https://instagram.com/catrachofit', whatsapp: '+50499334455' },
    status: 'pending',
  },
  {
    id: 'mtp-hn-5', tradeName: 'La Ceiba Beauty Studio', legalName: 'La Ceiba Beauty Studio S. de R.L.',
    categorySlug: 'belleza', countrySlug: 'honduras', citySlug: 'la-ceiba',
    address: 'Av. San Isidro, Barrio El Iman', lat: 15.7627, lng: -86.7862,
    description: 'Salón de belleza y spa con tratamientos capilares y faciales.',
    productsServices: ['Peinados y color', 'Tratamientos faciales', 'Uñas'],
    socials: { instagram: 'https://instagram.com/laceibabeauty' },
    status: 'verified',
  },

  // Guatemala
  {
    id: 'mtp-gt-1', tradeName: 'Pulso Fitness Club', legalName: 'Pulso Fitness Club S.A.',
    categorySlug: 'gimnasios', countrySlug: 'guatemala', citySlug: 'ciudad-de-guatemala',
    address: 'Zona 10, Av. Las Américas', lat: 14.6299, lng: -90.4999,
    description: 'Gimnasio full equipment con clases grupales todos los días. Membresías mensuales pagables en ORIGEN.',
    productsServices: ['Membresías', 'Entrenamiento personal', 'Clases grupales'],
    socials: { instagram: 'https://instagram.com/pulsofitness', tiktok: 'https://tiktok.com/@pulsofitness' },
    status: 'verified',
  },
  {
    id: 'mtp-gt-2', tradeName: 'Antigua Colonial Suites', legalName: 'Antigua Colonial Suites S.A.',
    categorySlug: 'hoteles', countrySlug: 'guatemala', citySlug: 'antigua',
    address: '5a Avenida Norte, Casco Histórico', lat: 14.5616, lng: -90.7275,
    description: 'Hotel boutique en una casona colonial restaurada, a media cuadra del parque central.',
    productsServices: ['Suites coloniales', 'Desayuno incluido', 'Tours culturales'],
    socials: { website: 'https://antiguacolonialsuites.example.com', facebook: 'https://facebook.com/antiguacolonial' },
    status: 'pending', hours: HOTEL_HOURS,
  },
  {
    id: 'mtp-gt-3', tradeName: 'Xela Beauty Bar', legalName: 'Xela Beauty Bar S.A.',
    categorySlug: 'belleza', countrySlug: 'guatemala', citySlug: 'quetzaltenango',
    address: 'Zona 1, Pasaje Enríquez', lat: 14.8478, lng: -91.5156,
    description: 'Spa urbano y salón de belleza con tratamientos faciales y corporales.',
    productsServices: ['Manicure y pedicure', 'Tratamientos faciales', 'Masajes'],
    socials: { instagram: 'https://instagram.com/xelabeautybar' },
    status: 'verified',
  },
  {
    id: 'mtp-gt-4', tradeName: 'Chapín Tech Store', legalName: 'Chapín Tech Store S.A.',
    categorySlug: 'tecnologia', countrySlug: 'guatemala', citySlug: 'ciudad-de-guatemala',
    address: 'Zona 4, Cuatro Grados Norte', lat: 14.6199, lng: -90.5169,
    description: 'Tienda de dispositivos electrónicos, accesorios y reparaciones express.',
    productsServices: ['Venta de celulares', 'Reparaciones', 'Accesorios'],
    socials: { instagram: 'https://instagram.com/chapintech', whatsapp: '+50255667788' },
    status: 'verified',
  },
  {
    id: 'mtp-gt-5', tradeName: 'Ruta Maya Tours', legalName: 'Ruta Maya Tours S.A.',
    categorySlug: 'turismo', countrySlug: 'guatemala', citySlug: 'antigua',
    address: 'Calle del Arco, Antigua', lat: 14.5566, lng: -90.7335,
    description: 'Tours guiados a volcanes, mercados locales y sitios arqueológicos mayas.',
    productsServices: ['Tour al volcán Acatenango', 'Tours culturales', 'Transporte privado'],
    socials: { website: 'https://rutamayatours.example.com', instagram: 'https://instagram.com/rutamayatours' },
    status: 'verified',
  },

  // El Salvador
  {
    id: 'mtp-sv-1', tradeName: 'Volcán Rooftop Lounge', legalName: 'Volcán Rooftop Lounge S.A. de C.V.',
    categorySlug: 'vida-nocturna', countrySlug: 'el-salvador', citySlug: 'san-salvador',
    address: 'Zona Rosa, Torre Futura', lat: 13.6989, lng: -89.2232,
    description: 'Rooftop bar con vista a la ciudad, coctelería de autor y DJ en vivo los fines de semana.',
    productsServices: ['Coctelería de autor', 'Música en vivo', 'Reservación de mesas VIP'],
    socials: { instagram: 'https://instagram.com/volcanrooftop', whatsapp: '+50378001122' },
    status: 'verified', hours: NIGHT_HOURS,
  },
  {
    id: 'mtp-sv-2', tradeName: 'Mercadito Surf Shop', legalName: 'Mercadito Surf Shop S.A.',
    categorySlug: 'moda', countrySlug: 'el-salvador', citySlug: 'la-libertad',
    address: 'Calle Principal, El Tunco', lat: 13.4913, lng: -89.3193,
    description: 'Tienda de ropa y tablas de surf de marcas locales, frente a la playa.',
    productsServices: ['Ropa de playa', 'Tablas de surf', 'Renta de equipo'],
    socials: { instagram: 'https://instagram.com/mercaditosurf' },
    status: 'pending',
  },
  {
    id: 'mtp-sv-3', tradeName: 'Nómada Coworking & Café', legalName: 'Nómada Coworking S.A. de C.V.',
    categorySlug: 'cafeterias', countrySlug: 'el-salvador', citySlug: 'santa-ana',
    address: 'Av. Independencia Sur', lat: 13.996, lng: -89.5567,
    description: 'Espacio de coworking con café de especialidad y salas de reunión por hora.',
    productsServices: ['Espacios de trabajo', 'Café y snacks', 'Salas de reunión'],
    socials: { website: 'https://nomadacowork.example.com', instagram: 'https://instagram.com/nomadacowork' },
    status: 'verified',
  },
  {
    id: 'mtp-sv-4', tradeName: 'Pupusería Doña Chayo', legalName: 'Pupusería Doña Chayo S.A. de C.V.',
    categorySlug: 'restaurantes', countrySlug: 'el-salvador', citySlug: 'san-salvador',
    address: 'Colonia Escalón, 71 Av. Norte', lat: 13.7009, lng: -89.2372,
    description: 'Pupusas tradicionales salvadoreñas hechas al momento, con curtido casero.',
    productsServices: ['Pupusas revueltas', 'Curtido casero', 'Para llevar'],
    socials: { facebook: 'https://facebook.com/donachayo', whatsapp: '+50378112233' },
    status: 'verified',
  },
  {
    id: 'mtp-sv-5', tradeName: 'Clínica Bienestar SV', legalName: 'Clínica Bienestar SV S.A. de C.V.',
    categorySlug: 'salud', countrySlug: 'el-salvador', citySlug: 'santa-ana',
    address: 'Av. Independencia Norte', lat: 13.999, lng: -89.5627,
    description: 'Clínica de medicina general y consultas de bienestar integral.',
    productsServices: ['Consulta general', 'Chequeos preventivos', 'Laboratorio clínico'],
    socials: { website: 'https://clinicabienestarsv.example.com' },
    status: 'verified',
  },

  // Nicaragua
  {
    id: 'mtp-ni-1', tradeName: 'Granada Lakeside Hostal', legalName: 'Granada Lakeside S.A.',
    categorySlug: 'hoteles', countrySlug: 'nicaragua', citySlug: 'granada',
    address: 'Calle La Calzada, frente al lago', lat: 11.9304, lng: -85.951,
    description: 'Hostal boutique junto al lago Cocibolca, con tours a las isletas incluidos.',
    productsServices: ['Habitaciones privadas y compartidas', 'Tours a isletas', 'Bar en terraza'],
    socials: { instagram: 'https://instagram.com/granadalakeside' },
    status: 'verified', hours: HOTEL_HOURS,
  },
  {
    id: 'mtp-ni-2', tradeName: 'León Bike Rentals', legalName: 'León Bike Rentals S.A.',
    categorySlug: 'turismo', countrySlug: 'nicaragua', citySlug: 'leon',
    address: 'Parque Central, costado sur', lat: 12.437, lng: -86.875,
    description: 'Renta de bicicletas y tours guiados por el centro histórico de León.',
    productsServices: ['Renta de bicicletas', 'Tours guiados', 'Sandboard en el Cerro Negro'],
    socials: { whatsapp: '+50588001122', facebook: 'https://facebook.com/leonbikerentals' },
    status: 'pending',
  },
  {
    id: 'mtp-ni-3', tradeName: 'Managua Tech Store', legalName: 'Managua Tech Store S.A.',
    categorySlug: 'tecnologia', countrySlug: 'nicaragua', citySlug: 'managua',
    address: 'Metrocentro, Local 214', lat: 12.1304, lng: -86.2554,
    description: 'Venta de accesorios y dispositivos electrónicos, con soporte técnico en tienda.',
    productsServices: ['Accesorios móviles', 'Reparaciones', 'Venta de dispositivos'],
    socials: { instagram: 'https://instagram.com/managuatech' },
    status: 'verified',
  },
  {
    id: 'mtp-ni-4', tradeName: 'Café Colonial Granada', legalName: 'Café Colonial Granada S.A.',
    categorySlug: 'cafeterias', countrySlug: 'nicaragua', citySlug: 'granada',
    address: 'Calle Atravesada, Casco Colonial', lat: 11.9314, lng: -85.9590,
    description: 'Café nicaragüense de origen, tostado local, en una casona colonial restaurada.',
    productsServices: ['Café de origen', 'Repostería local', 'Desayunos'],
    socials: { instagram: 'https://instagram.com/cafecolonialgranada' },
    status: 'verified',
  },
  {
    id: 'mtp-ni-5', tradeName: 'Academia Digital León', legalName: 'Academia Digital León S.A.',
    categorySlug: 'educacion', countrySlug: 'nicaragua', citySlug: 'leon',
    address: 'Barrio Sutiava, Calle Central', lat: 12.431, lng: -86.881,
    description: 'Academia de cursos cortos en programación, diseño y marketing digital.',
    productsServices: ['Cursos de programación', 'Diseño digital', 'Marketing en redes'],
    socials: { website: 'https://academiadigitalleon.example.com', instagram: 'https://instagram.com/academiadigitalleon' },
    status: 'verified',
  },

  // Costa Rica
  {
    id: 'mtp-cr-1', tradeName: 'Pura Vida Wellness Spa', legalName: 'Pura Vida Wellness S.A.',
    categorySlug: 'salud', countrySlug: 'costa-rica', citySlug: 'san-jose',
    address: 'Escazú, Centro Comercial Momentum', lat: 9.9231, lng: -84.0967,
    description: 'Centro de bienestar integral con yoga, masajes terapéuticos y nutrición.',
    productsServices: ['Yoga y meditación', 'Masajes terapéuticos', 'Consultas de nutrición'],
    socials: { website: 'https://puravidawellness.example.com', instagram: 'https://instagram.com/puravidawellness' },
    status: 'verified',
  },
  {
    id: 'mtp-cr-2', tradeName: 'Tamarindo Surf & Board', legalName: 'Tamarindo Surf & Board S.A.',
    categorySlug: 'turismo', countrySlug: 'costa-rica', citySlug: 'tamarindo',
    address: 'Playa Tamarindo, frente al muelle', lat: 10.2976, lng: -85.8402,
    description: 'Clases de surf, renta de equipo y tours de atardecer en catamarán.',
    productsServices: ['Clases de surf', 'Renta de tablas', 'Tours en catamarán'],
    socials: { instagram: 'https://instagram.com/tamarindosurfboard', whatsapp: '+50688001122' },
    status: 'verified',
  },
  {
    id: 'mtp-cr-3', tradeName: 'Liberia AutoServicio Express', legalName: 'Liberia AutoServicio S.A.',
    categorySlug: 'automotriz', countrySlug: 'costa-rica', citySlug: 'liberia',
    address: 'Carretera Interamericana Norte km 217', lat: 10.6386, lng: -85.4436,
    description: 'Taller automotriz con servicio express de mantenimiento preventivo.',
    productsServices: ['Cambio de aceite', 'Diagnóstico computarizado', 'Llantas y frenos'],
    socials: { facebook: 'https://facebook.com/liberiaautoservicio' },
    status: 'pending',
  },
  {
    id: 'mtp-cr-4', tradeName: 'Soda Tica Central', legalName: 'Soda Tica Central S.A.',
    categorySlug: 'restaurantes', countrySlug: 'costa-rica', citySlug: 'san-jose',
    address: 'Barrio Escalante, Calle 33', lat: 9.9351, lng: -84.0837,
    description: 'Comida típica costarricense: casados, gallo pinto y batidos naturales.',
    productsServices: ['Casados', 'Gallo pinto', 'Batidos naturales'],
    socials: { instagram: 'https://instagram.com/sodaticacentral' },
    status: 'verified',
  },
  {
    id: 'mtp-cr-5', tradeName: 'Chepe Nightlife Bar', legalName: 'Chepe Nightlife Bar S.A.',
    categorySlug: 'vida-nocturna', countrySlug: 'costa-rica', citySlug: 'san-jose',
    address: 'Barrio California, Calle 29', lat: 9.9311, lng: -84.0777,
    description: 'Bar de cervezas artesanales costarricenses con música en vivo.',
    productsServices: ['Cervezas artesanales', 'Música en vivo', 'Tapas'],
    socials: { instagram: 'https://instagram.com/chepenightlife', whatsapp: '+50688223344' },
    status: 'verified', hours: NIGHT_HOURS,
  },

  // Panamá
  {
    id: 'mtp-pa-1', tradeName: 'Casco Antiguo Rooftop', legalName: 'Casco Antiguo Rooftop S.A.',
    categorySlug: 'vida-nocturna', countrySlug: 'panama', citySlug: 'ciudad-de-panama',
    address: 'Casco Viejo, Calle 3ra', lat: 8.9534, lng: -79.5359,
    description: 'Terraza con vista a la bahía, coctelería premium y música en vivo.',
    productsServices: ['Coctelería premium', 'Cenas privadas', 'Eventos corporativos'],
    socials: { instagram: 'https://instagram.com/cascorooftop', website: 'https://cascorooftop.example.com' },
    status: 'verified', hours: NIGHT_HOURS,
  },
  {
    id: 'mtp-pa-2', tradeName: 'Bocas Market & Convenience', legalName: 'Bocas Market S.A.',
    categorySlug: 'conveniencia', countrySlug: 'panama', citySlug: 'bocas-del-toro',
    address: 'Calle 3ra, Isla Colón', lat: 9.342, lng: -82.2430,
    description: 'Minimarket con productos importados, snacks y esenciales para turistas y locales.',
    productsServices: ['Abarrotes', 'Snacks y bebidas', 'Productos importados'],
    socials: { whatsapp: '+50788001122' },
    status: 'verified',
  },
  {
    id: 'mtp-pa-3', tradeName: 'Cevichería Casco Viejo', legalName: 'Cevichería Casco Viejo S.A.',
    categorySlug: 'restaurantes', countrySlug: 'panama', citySlug: 'ciudad-de-panama',
    address: 'Casco Viejo, Av. Central', lat: 8.9514, lng: -79.5329,
    description: 'Ceviches y mariscos frescos del Pacífico panameño, ambiente al aire libre.',
    productsServices: ['Ceviche mixto', 'Mariscos frescos', 'Reservaciones'],
    socials: { instagram: 'https://instagram.com/cevicheriacv', facebook: 'https://facebook.com/cevicheriacv' },
    status: 'pending',
  },
  {
    id: 'mtp-pa-4', tradeName: 'Panamá Digital Hub', legalName: 'Panamá Digital Hub S.A.',
    categorySlug: 'tecnologia', countrySlug: 'panama', citySlug: 'ciudad-de-panama',
    address: 'Costa del Este, Torre Business Park', lat: 9.0154, lng: -79.4879,
    description: 'Tienda y centro de soporte técnico para dispositivos móviles y laptops.',
    productsServices: ['Venta de laptops', 'Soporte técnico', 'Accesorios'],
    socials: { website: 'https://panamadigitalhub.example.com', instagram: 'https://instagram.com/panamadigitalhub' },
    status: 'verified',
  },
  {
    id: 'mtp-pa-5', tradeName: 'Bocas Beach Hostel', legalName: 'Bocas Beach Hostel S.A.',
    categorySlug: 'hoteles', countrySlug: 'panama', citySlug: 'bocas-del-toro',
    address: 'Playa Bluff, Isla Colón', lat: 9.35, lng: -82.21,
    description: 'Hostal frente al mar con ambiente relajado, ideal para surfistas y mochileros.',
    productsServices: ['Dormitorios compartidos', 'Habitaciones privadas', 'Renta de tablas de surf'],
    socials: { instagram: 'https://instagram.com/bocasbeachhostel' },
    status: 'verified', hours: HOTEL_HOURS,
  },
]

function buildCompany(seed: Seed): Company {
  const now = new Date().toISOString()
  const verified = seed.status === 'verified'
  return {
    id: seed.id,
    ownerId: 'mock-seed-owner',
    legalName: seed.legalName,
    tradeName: seed.tradeName,
    taxId: `TAX-${seed.id.toUpperCase()}`,
    categorySlug: seed.categorySlug,
    productsServices: seed.productsServices,
    countrySlug: seed.countrySlug,
    citySlug: seed.citySlug,
    address: seed.address,
    lat: seed.lat,
    lng: seed.lng,
    description: seed.description,
    logoDataUrl: `https://picsum.photos/seed/${seed.id}-logo/300/300`,
    coverDataUrl: `https://picsum.photos/seed/${seed.id}-cover/900/560`,
    gallery: [
      `https://picsum.photos/seed/${seed.id}-g1/700/700`,
      `https://picsum.photos/seed/${seed.id}-g2/700/700`,
      `https://picsum.photos/seed/${seed.id}-g3/700/700`,
    ],
    socials: seed.socials,
    hours: seed.hours ?? STANDARD_HOURS,
    kyc: {
      status: seed.status,
      documents: [],
      submittedAt: now,
      reviewedAt: verified ? now : null,
      note: null,
    },
    verified,
    acceptsOrigen: true,
    createdAt: now,
    updatedAt: now,
  }
}

export function createMockCompanies(): Company[] {
  return SEEDS.map(buildCompany)
}

export const MOCK_REWARDS: Reward[] = [
  {
    id: 'rw-1', title: '10% de descuento en tu cuenta', description: 'Válido en una visita a Fuego Norte Parrilla, San Pedro Sula.',
    pointsCost: 80, category: 'descuento', imageUrl: 'https://picsum.photos/seed/rw-1/600/400',
    partnerCompanyId: 'mtp-hn-2', partnerName: 'Fuego Norte Parrilla',
  },
  {
    id: 'rw-2', title: 'Café de especialidad gratis', description: 'Canjea una bebida de tu elección en Origen Coffee Lab, Tegucigalpa.',
    pointsCost: 50, category: 'gratis', imageUrl: 'https://picsum.photos/seed/rw-2/600/400',
    partnerCompanyId: 'mtp-hn-1', partnerName: 'Origen Coffee Lab',
  },
  {
    id: 'rw-3', title: 'Noche gratis frente al mar', description: 'Una noche de hospedaje en Roatán Dive & Stay, sujeta a disponibilidad.',
    pointsCost: 600, category: 'experiencia', imageUrl: 'https://picsum.photos/seed/rw-3/600/400',
    partnerCompanyId: 'mtp-hn-3', partnerName: 'Roatán Dive & Stay',
  },
  {
    id: 'rw-4', title: 'Clase de surf gratis', description: 'Una clase individual de surf en Tamarindo Surf & Board, Costa Rica.',
    pointsCost: 150, category: 'experiencia', imageUrl: 'https://picsum.photos/seed/rw-4/600/400',
    partnerCompanyId: 'mtp-cr-2', partnerName: 'Tamarindo Surf & Board',
  },
  {
    id: 'rw-5', title: '2x1 en cócteles de autor', description: 'Válido de jueves a sábado en Volcán Rooftop Lounge, San Salvador.',
    pointsCost: 100, category: 'descuento', imageUrl: 'https://picsum.photos/seed/rw-5/600/400',
    partnerCompanyId: 'mtp-sv-1', partnerName: 'Volcán Rooftop Lounge',
  },
  {
    id: 'rw-6', title: 'Sesión de spa 60 minutos', description: 'Masaje o tratamiento facial en Xela Beauty Bar, Quetzaltenango.',
    pointsCost: 200, category: 'experiencia', imageUrl: 'https://picsum.photos/seed/rw-6/600/400',
    partnerCompanyId: 'mtp-gt-3', partnerName: 'Xela Beauty Bar',
  },
  {
    id: 'rw-7', title: '20% en reparaciones', description: 'Descuento en cualquier reparación de dispositivo en Managua Tech Store.',
    pointsCost: 90, category: 'descuento', imageUrl: 'https://picsum.photos/seed/rw-7/600/400',
    partnerCompanyId: 'mtp-ni-3', partnerName: 'Managua Tech Store',
  },
  {
    id: 'rw-8', title: 'Tour guiado gratis', description: 'Un cupo gratis en el tour al volcán Acatenango con Ruta Maya Tours.',
    pointsCost: 250, category: 'gratis', imageUrl: 'https://picsum.photos/seed/rw-8/600/400',
    partnerCompanyId: 'mtp-gt-5', partnerName: 'Ruta Maya Tours',
  },
  {
    id: 'rw-9', title: 'Un mes de membresía gratis', description: 'Un mes completo en Pulso Fitness Club, Ciudad de Guatemala.',
    pointsCost: 300, category: 'gratis', imageUrl: 'https://picsum.photos/seed/rw-9/600/400',
    partnerCompanyId: 'mtp-gt-1', partnerName: 'Pulso Fitness Club',
  },
]
